type UnknownRecord = Record<string, unknown>;

const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com";
const DEFAULT_AI_TIMEOUT_MS = parsePositiveIntegerEnv(
  process.env.AI_REQUEST_TIMEOUT_MS,
  120_000
);
const DEFAULT_RETRY_DELAY_MS = 350;
const ANTHROPIC_VERSION = "2023-06-01";

export type AiProvider = "anthropic" | "openai";

export interface AiRuntimeConfig {
  provider?: AiProvider;
  baseURL?: string;
  model?: string;
  apiKey?: string;
  authToken?: string;
}

export interface AiConfigOptions {
  runtimeConfig?: AiRuntimeConfig;
  defaultModel?: string;
}

export interface ResolvedAiConfig {
  provider: AiProvider;
  apiKey: string | null;
  authToken: string | null;
  authMode: "x-api-key" | "authorization";
  baseURL: string;
  model: string;
}

export interface AiImageInput {
  data: string;
  mediaType: string;
}

export interface StructuredJsonRequestOptions<T> {
  operationName: string;
  requestText: (attempt: number) => Promise<string>;
  parseResult: (value: unknown) => T;
  maxAttempts?: number;
}

export interface AiTextCompletionOptions {
  config: ResolvedAiConfig;
  operationName: string;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
}

export interface AiVisionCompletionOptions extends AiTextCompletionOptions {
  images: AiImageInput[];
}

class UpstreamHttpError extends Error {
  readonly status: number;
  readonly provider: AiProvider;
  readonly upstreamCode?: string;
  readonly upstreamType?: string;
  readonly responseText: string;

  constructor(
    message: string,
    options: {
      status: number;
      provider: AiProvider;
      responseText: string;
      upstreamCode?: string;
      upstreamType?: string;
    }
  ) {
    super(message);
    this.name = "UpstreamHttpError";
    this.status = options.status;
    this.provider = options.provider;
    this.responseText = options.responseText;
    this.upstreamCode = options.upstreamCode;
    this.upstreamType = options.upstreamType;
  }
}

export class RouteError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly logDetails?: UnknownRecord;

  constructor(
    message: string,
    options: {
      status: number;
      code: string;
      retryable?: boolean;
      logDetails?: UnknownRecord;
    }
  ) {
    super(message);
    this.name = "RouteError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.logDetails = options.logDetails;
  }
}

function parsePositiveIntegerEnv(
  rawValue: string | undefined,
  fallback: number
): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJsonBody(request: Request): Promise<UnknownRecord> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new RouteError("Request body must be valid JSON.", {
      status: 400,
      code: "invalid_json_body",
    });
  }

  if (!isRecord(body)) {
    throw new RouteError("Request body must be a JSON object.", {
      status: 400,
      code: "invalid_json_body",
    });
  }

  return body;
}

export function readAiRuntimeConfig(body: UnknownRecord): AiRuntimeConfig {
  const runtime = extractRuntimeFields(body.runtime, "runtime");
  const runtimeTask = readRuntimeTask(body.runtime);
  const runtimeConfig = extractRuntimeConfigFields(body.runtimeConfig, runtimeTask);

  return {
    provider: runtime.provider ?? runtimeConfig.provider,
    baseURL: runtime.baseURL ?? runtimeConfig.baseURL,
    model: runtime.model ?? runtimeConfig.model,
    apiKey: runtime.apiKey ?? runtimeConfig.apiKey,
    authToken: runtime.authToken ?? runtimeConfig.authToken,
  };
}

export function resolveAiConfig(
  options: AiConfigOptions = {}
): ResolvedAiConfig {
  const runtimeConfig = options.runtimeConfig ?? {};
  const provider = resolveAiProvider(runtimeConfig, options.defaultModel);

  if (provider === "openai") {
    return resolveOpenAiConfig(runtimeConfig, options.defaultModel);
  }

  return resolveAnthropicConfig(runtimeConfig, options.defaultModel);
}

export async function requestAiTextCompletion(
  options: AiTextCompletionOptions
): Promise<string> {
  try {
    if (options.config.provider === "openai") {
      return await requestOpenAiTextCompletion(options);
    }

    return await requestAnthropicTextCompletion(options);
  } catch (error) {
    throw enrichAiRouteError(error, options.config, options.operationName);
  }
}

export async function requestAiVisionCompletion(
  options: AiVisionCompletionOptions
): Promise<string> {
  try {
    if (options.config.provider === "openai") {
      return await requestOpenAiVisionCompletion(options);
    }

    return await requestAnthropicVisionCompletion(options);
  } catch (error) {
    throw enrichAiRouteError(error, options.config, options.operationName);
  }
}

export function enrichAiRouteError(
  error: unknown,
  config: ResolvedAiConfig,
  operationName: string
): RouteError {
  const routeError = normalizeRouteError(error, `${operationName} failed.`);
  const details: UnknownRecord = {
    ...routeError.logDetails,
    provider: config.provider,
    baseURL: config.baseURL,
    model: config.model,
    authMode: config.authMode,
  };

  switch (routeError.code) {
    case "ai_auth_error":
      return new RouteError(
        `AI authentication failed while ${operationName}. Check whether ${config.baseURL} expects ${
          config.authMode === "authorization"
            ? "Authorization: Bearer"
            : "X-Api-Key"
        } for ${config.provider}.`,
        {
          status: routeError.status,
          code: routeError.code,
          retryable: routeError.retryable,
          logDetails: details,
        }
      );
    case "ai_bad_request":
      return new RouteError(
        `AI request was rejected while ${operationName}. Verify the provider, base URL, model, and request format.`,
        {
          status: routeError.status,
          code: routeError.code,
          retryable: routeError.retryable,
          logDetails: details,
        }
      );
    case "ai_connection_error":
      return new RouteError(
        `Could not reach the AI service at ${config.baseURL} while ${operationName}.`,
        {
          status: routeError.status,
          code: routeError.code,
          retryable: routeError.retryable,
          logDetails: details,
        }
      );
    case "ai_timeout":
      return new RouteError(
        `The AI service timed out while ${operationName}.`,
        {
          status: routeError.status,
          code: routeError.code,
          retryable: routeError.retryable,
          logDetails: details,
        }
      );
    default:
      return new RouteError(routeError.message, {
        status: routeError.status,
        code: routeError.code,
        retryable: routeError.retryable,
        logDetails: details,
      });
  }
}

export async function requestStructuredJson<T>({
  operationName,
  requestText,
  parseResult,
  maxAttempts = 2,
}: StructuredJsonRequestOptions<T>): Promise<T> {
  let lastError: RouteError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const rawText = await requestText(attempt);

      if (!rawText.trim()) {
        throw new RouteError(`${operationName} returned an empty text response.`, {
          status: 502,
          code: "ai_empty_response",
          retryable: true,
          logDetails: { operationName, attempt },
        });
      }

      const parsedJson = parseModelJson(rawText, operationName);
      return parseResult(parsedJson);
    } catch (error) {
      const routeError = normalizeRouteError(error, `${operationName} failed.`);
      lastError = routeError;

      if (!routeError.retryable || attempt >= maxAttempts) {
        throw routeError;
      }

      await sleep(DEFAULT_RETRY_DELAY_MS * attempt);
    }
  }

  throw (
    lastError ??
    new RouteError(`${operationName} failed. Please try again.`, {
      status: 502,
      code: "ai_request_failed",
    })
  );
}

export function toErrorResponse(
  error: unknown,
  fallbackMessage: string
): Response {
  const routeError = normalizeRouteError(error, fallbackMessage);

  return Response.json(
    {
      error: routeError.message,
      code: routeError.code,
      retryable: routeError.retryable,
      details: routeError.logDetails ?? undefined,
    },
    { status: routeError.status }
  );
}

export function logRouteError(routeName: string, error: unknown): void {
  const routeError = normalizeRouteError(error, routeName);

  console.error(`[${routeName}] ${routeError.code}`, {
    status: routeError.status,
    retryable: routeError.retryable,
    details: routeError.logDetails,
  });
}

export function getRetryPromptSuffix(attempt: number): string {
  if (attempt <= 1) {
    return "";
  }

  return [
    "",
    "IMPORTANT:",
    "The previous response was not valid enough to parse.",
    "Return exactly one complete JSON object.",
    "Do not include markdown code fences.",
    "Do not include any explanation before or after the JSON.",
    "Use double quotes for every key and string value.",
  ].join("\n");
}

export function normalizeTextList(
  value: unknown,
  options: {
    maxItems?: number;
    minItems?: number;
    unique?: boolean;
  } = {}
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  const deduped = options.unique ? Array.from(new Set(items)) : items;
  const limited =
    typeof options.maxItems === "number"
      ? deduped.slice(0, options.maxItems)
      : deduped;

  if (
    typeof options.minItems === "number" &&
    limited.length < options.minItems
  ) {
    return [];
  }

  return limited;
}

export function normalizeStringValue(
  value: unknown,
  options: {
    fallback?: string;
    allowEmpty?: boolean;
  } = {}
): string {
  if (typeof value !== "string") {
    return options.fallback ?? "";
  }

  const text = value.trim();

  if (!text && options.allowEmpty !== true) {
    return options.fallback ?? "";
  }

  return text;
}

export function normalizeNumberValue(
  value: unknown,
  options: {
    min?: number;
    max?: number;
    integer?: boolean;
    fallback?: number;
  } = {}
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return options.fallback ?? 0;
  }

  let normalized = parsed;

  if (options.integer) {
    normalized = Math.round(normalized);
  }

  if (typeof options.min === "number") {
    normalized = Math.max(options.min, normalized);
  }

  if (typeof options.max === "number") {
    normalized = Math.min(options.max, normalized);
  }

  return normalized;
}

export function ensureRecord(
  value: unknown,
  message: string,
  code = "invalid_request"
): UnknownRecord {
  if (!isRecord(value)) {
    throw new RouteError(message, {
      status: 400,
      code,
    });
  }

  return value;
}

export function assertNonEmptyList(
  value: unknown[],
  message: string,
  code = "invalid_request"
): void {
  if (value.length === 0) {
    throw new RouteError(message, {
      status: 400,
      code,
    });
  }
}

async function requestAnthropicTextCompletion(
  options: AiTextCompletionOptions
): Promise<string> {
  const payload = await postJson(
    buildEndpointUrl(options.config.baseURL, "/v1/messages"),
    {
      method: "POST",
      headers: createAnthropicHeaders(options.config),
      body: JSON.stringify({
        model: options.config.model,
        system: options.systemPrompt,
        max_tokens: options.maxTokens,
        temperature: options.temperature ?? 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: options.userPrompt,
              },
            ],
          },
        ],
      }),
    },
    options.config.provider
  );

  return extractAnthropicMessageText(payload);
}

async function requestAnthropicVisionCompletion(
  options: AiVisionCompletionOptions
): Promise<string> {
  const payload = await postJson(
    buildEndpointUrl(options.config.baseURL, "/v1/messages"),
    {
      method: "POST",
      headers: createAnthropicHeaders(options.config),
      body: JSON.stringify({
        model: options.config.model,
        system: options.systemPrompt,
        max_tokens: options.maxTokens,
        temperature: options.temperature ?? 0,
        messages: [
          {
            role: "user",
            content: [
              ...options.images.map((image) => ({
                type: "image",
                source: {
                  type: "base64",
                  media_type: image.mediaType,
                  data: image.data,
                },
              })),
              {
                type: "text",
                text: options.userPrompt,
              },
            ],
          },
        ],
      }),
    },
    options.config.provider
  );

  return extractAnthropicMessageText(payload);
}

async function requestOpenAiTextCompletion(
  options: AiTextCompletionOptions
): Promise<string> {
  const messages: unknown[] = [];

  if (options.systemPrompt?.trim()) {
    messages.push({
      role: "system",
      content: options.systemPrompt,
    });
  }

  messages.push({
    role: "user",
    content: options.userPrompt,
  });

  const payload = await postJson(
    buildEndpointUrl(options.config.baseURL, "/v1/chat/completions"),
    {
      method: "POST",
      headers: createOpenAiHeaders(options.config),
      body: JSON.stringify({
        model: options.config.model,
        messages,
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens,
      }),
    },
    options.config.provider
  );

  return extractOpenAiMessageText(payload);
}

async function requestOpenAiVisionCompletion(
  options: AiVisionCompletionOptions
): Promise<string> {
  const messages: unknown[] = [];

  if (options.systemPrompt?.trim()) {
    messages.push({
      role: "system",
      content: options.systemPrompt,
    });
  }

  messages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: options.userPrompt,
      },
      ...options.images.map((image) => ({
        type: "image_url",
        image_url: {
          url: `data:${image.mediaType};base64,${image.data}`,
        },
      })),
    ],
  });

  const payload = await postJson(
    buildEndpointUrl(options.config.baseURL, "/v1/chat/completions"),
    {
      method: "POST",
      headers: createOpenAiHeaders(options.config),
      body: JSON.stringify({
        model: options.config.model,
        messages,
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens,
      }),
    },
    options.config.provider
  );

  return extractOpenAiMessageText(payload);
}

async function postJson(
  url: string,
  init: RequestInit,
  provider: AiProvider
): Promise<UnknownRecord> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_AI_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const rawText = await response.text();
    const payload = parseJsonValue(rawText);

    if (!response.ok) {
      throw createUpstreamHttpError(provider, response.status, rawText, payload);
    }

    if (!isRecord(payload)) {
      throw new RouteError("AI response was not valid JSON.", {
        status: 502,
        code: "ai_invalid_json",
        retryable: true,
        logDetails: {
          provider,
          url,
          responseLength: rawText.length,
        },
      });
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function createAnthropicHeaders(config: ResolvedAiConfig): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": ANTHROPIC_VERSION,
  };

  if (config.authMode === "authorization" && config.authToken) {
    headers.Authorization = `Bearer ${config.authToken}`;
  } else if (config.apiKey) {
    headers["x-api-key"] = config.apiKey;
  }

  return headers;
}

function createOpenAiHeaders(config: ResolvedAiConfig): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (config.authToken) {
    headers.Authorization = `Bearer ${config.authToken}`;
  } else if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  return headers;
}

function resolveAnthropicConfig(
  runtimeConfig: AiRuntimeConfig,
  defaultModel?: string
): ResolvedAiConfig {
  const runtimeApiKey = runtimeConfig.apiKey?.trim() || null;
  const runtimeAuthToken = runtimeConfig.authToken?.trim() || null;
  const envApiKey = readNonEmptyEnv("ANTHROPIC_API_KEY");
  const envAuthToken = readNonEmptyEnv("ANTHROPIC_AUTH_TOKEN");

  const apiKey = runtimeApiKey || envApiKey;
  const authToken = runtimeAuthToken || envAuthToken;

  if (!apiKey && !authToken) {
    throw new RouteError(
      "AI credentials are missing. Set ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or provide a runtime API key.",
      {
        status: 500,
        code: "anthropic_credentials_missing",
      }
    );
  }

  const baseURLSource = runtimeConfig.baseURL
    ? "runtimeConfig.ai.baseURL"
    : "ANTHROPIC_BASE_URL";
  const rawBaseURL =
    runtimeConfig.baseURL?.trim() ||
    readNonEmptyEnv("ANTHROPIC_BASE_URL") ||
    DEFAULT_ANTHROPIC_BASE_URL;
  const baseURL = normalizeAiBaseURL(rawBaseURL, baseURLSource, "anthropic");

  const model =
    runtimeConfig.model?.trim() ||
    readNonEmptyEnv("ANTHROPIC_MODEL") ||
    defaultModel?.trim() ||
    "";

  if (!model) {
    throw new RouteError(
      "No Anthropic model is configured. Set ANTHROPIC_MODEL or provide runtimeConfig.ai.model.",
      {
        status: 500,
        code: "anthropic_model_missing",
      }
    );
  }

  return {
    provider: "anthropic",
    apiKey,
    authToken,
    authMode: authToken ? "authorization" : "x-api-key",
    baseURL,
    model,
  };
}

function resolveOpenAiConfig(
  runtimeConfig: AiRuntimeConfig,
  defaultModel?: string
): ResolvedAiConfig {
  const requestedModel =
    runtimeConfig.model?.trim() ||
    readNonEmptyEnv("OPENAI_MODEL") ||
    readNonEmptyEnv("GEMINI_MODEL") ||
    (defaultModel?.trim().toLowerCase().startsWith("claude")
      ? "gemini-2.5-flash"
      : defaultModel?.trim()) ||
    "";
  const preferGeminiGateway =
    !runtimeConfig.baseURL?.trim() && shouldPreferGeminiGateway(requestedModel);
  const apiKey =
    runtimeConfig.apiKey?.trim() ||
    (preferGeminiGateway
      ? readNonEmptyEnv("GEMINI_API_KEY") || readNonEmptyEnv("OPENAI_API_KEY")
      : readNonEmptyEnv("OPENAI_API_KEY") || readNonEmptyEnv("GEMINI_API_KEY"));

  if (!apiKey) {
    throw new RouteError(
      "AI credentials are missing. Set OPENAI_API_KEY, GEMINI_API_KEY, or provide a runtime API key.",
      {
        status: 500,
        code: "openai_credentials_missing",
      }
    );
  }

  const baseURLSource = runtimeConfig.baseURL
    ? "runtimeConfig.ai.baseURL"
    : "OPENAI_BASE_URL";
  const rawBaseURL =
    runtimeConfig.baseURL?.trim() ||
    (preferGeminiGateway
      ? readNonEmptyEnv("GEMINI_API_BASE_URL") || readNonEmptyEnv("OPENAI_BASE_URL")
      : readNonEmptyEnv("OPENAI_BASE_URL") || readNonEmptyEnv("GEMINI_API_BASE_URL")) ||
    DEFAULT_OPENAI_BASE_URL;
  const baseURL = normalizeAiBaseURL(rawBaseURL, baseURLSource, "openai");

  const model = requestedModel;

  if (!model) {
    throw new RouteError(
      "No OpenAI-compatible model is configured. Set OPENAI_MODEL or provide runtimeConfig.ai.model.",
      {
        status: 500,
        code: "openai_model_missing",
      }
    );
  }

  return {
    provider: "openai",
    apiKey,
    authToken: null,
    authMode: "authorization",
    baseURL,
    model,
  };
}

function resolveAiProvider(
  runtimeConfig: AiRuntimeConfig,
  defaultModel?: string
): AiProvider {
  const explicitProvider = runtimeConfig.provider;

  if (explicitProvider) {
    return explicitProvider;
  }

  const envProvider = readOptionalProvider(
    readNonEmptyEnv("AI_PROVIDER"),
    "AI_PROVIDER",
    "ai_provider_invalid",
    false
  );

  if (envProvider) {
    return envProvider;
  }

  const inferred = inferProvider({
    baseURL: runtimeConfig.baseURL,
    model: runtimeConfig.model || defaultModel,
  });

  if (inferred) {
    return inferred;
  }

  const hasAnthropicEnv = Boolean(
    readNonEmptyEnv("ANTHROPIC_API_KEY") ||
      readNonEmptyEnv("ANTHROPIC_AUTH_TOKEN") ||
      readNonEmptyEnv("ANTHROPIC_BASE_URL") ||
      readNonEmptyEnv("ANTHROPIC_MODEL")
  );
  const hasOpenAiLikeEnv = Boolean(
    readNonEmptyEnv("OPENAI_API_KEY") ||
      readNonEmptyEnv("OPENAI_BASE_URL") ||
      readNonEmptyEnv("OPENAI_MODEL") ||
      readNonEmptyEnv("GEMINI_API_KEY") ||
      readNonEmptyEnv("GEMINI_API_BASE_URL") ||
      readNonEmptyEnv("GEMINI_MODEL")
  );

  if (hasOpenAiLikeEnv && !hasAnthropicEnv) {
    return "openai";
  }

  return inferred ?? "anthropic";
}

function inferProvider(options: {
  baseURL?: string;
  model?: string;
}): AiProvider | null {
  const model = options.model?.trim().toLowerCase() || "";
  const baseURL = options.baseURL?.trim().toLowerCase() || "";

  if (model.startsWith("claude")) {
    return "anthropic";
  }

  if (
    model.startsWith("gpt") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4") ||
    model.startsWith("gemini") ||
    model.startsWith("deepseek") ||
    model.startsWith("qwen") ||
    model === "vision-model" ||
    model === "coder-model" ||
    model.includes("/")
  ) {
    return "openai";
  }

  if (baseURL.includes("anthropic")) {
    return "anthropic";
  }

  if (
    baseURL.includes("openai") ||
    baseURL.includes("/chat/completions") ||
    baseURL.includes("/responses")
  ) {
    return "openai";
  }

  return null;
}

function shouldPreferGeminiGateway(model: string): boolean {
  const normalizedModel = model.trim().toLowerCase();

  if (!normalizedModel) {
    return false;
  }

  if (
    normalizedModel.startsWith("gemini") ||
    normalizedModel.startsWith("deepseek") ||
    normalizedModel.startsWith("qwen") ||
    normalizedModel === "vision-model" ||
    normalizedModel === "coder-model" ||
    normalizedModel.includes("/")
  ) {
    return true;
  }

  return false;
}

function normalizeRouteError(
  error: unknown,
  fallbackMessage: string
): RouteError {
  if (error instanceof RouteError) {
    return error;
  }

  if (error instanceof UpstreamHttpError) {
    const details = {
      upstreamStatus: error.status,
      upstreamType: error.upstreamType,
      upstreamCode: error.upstreamCode,
      upstreamMessage: error.message,
      provider: error.provider,
    };

    if (error.status === 401 || error.status === 403) {
      return new RouteError("AI authentication failed.", {
        status: 502,
        code: "ai_auth_error",
        logDetails: details,
      });
    }

    if (error.status === 429) {
      return new RouteError("AI rate limit reached.", {
        status: 503,
        code: "ai_rate_limited",
        retryable: true,
        logDetails: details,
      });
    }

    if (error.status >= 500) {
      return new RouteError("AI upstream service is unavailable.", {
        status: 503,
        code: "ai_upstream_error",
        retryable: true,
        logDetails: details,
      });
    }

    return new RouteError("AI request was rejected by the upstream service.", {
      status: 502,
      code: "ai_bad_request",
      logDetails: details,
    });
  }

  if (error instanceof SyntaxError) {
    return new RouteError("AI response JSON could not be parsed.", {
      status: 502,
      code: "ai_invalid_json",
      retryable: true,
    });
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return new RouteError("AI request timed out.", {
        status: 504,
        code: "ai_timeout",
        retryable: true,
      });
    }

    if (/fetch|network|socket|econn|enotfound|timed out/i.test(error.message)) {
      return new RouteError("AI connection failed.", {
        status: 503,
        code: "ai_connection_error",
        retryable: true,
      });
    }
  }

  return new RouteError(fallbackMessage, {
    status: 500,
    code: "internal_error",
    logDetails: {
      originalErrorType: error instanceof Error ? error.name : typeof error,
    },
  });
}

function parseModelJson(text: string, operationName: string): unknown {
  const candidates = collectJsonCandidates(text);

  for (const candidate of candidates) {
    try {
      return parseJsonCandidate(candidate);
    } catch {
      continue;
    }
  }

  throw new RouteError(`${operationName} returned invalid JSON.`, {
    status: 502,
    code: "ai_invalid_json",
    retryable: true,
    logDetails: {
      operationName,
      textLength: text.length,
    },
  });
}

function collectJsonCandidates(text: string): string[] {
  const cleaned = stripCodeFences(text).trim();
  const candidates: string[] = [];

  addCandidate(candidates, cleaned);
  addCandidate(candidates, extractBalancedJson(cleaned));

  return candidates;
}

function parseJsonCandidate(candidate: string): unknown {
  const parsed = JSON.parse(candidate);

  if (typeof parsed === "string") {
    const nested = parsed.trim();

    if (looksLikeJson(nested)) {
      return JSON.parse(nested);
    }
  }

  return parsed;
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

function extractBalancedJson(text: string): string | null {
  for (let start = 0; start < text.length; start += 1) {
    const firstChar = text[start];

    if (firstChar !== "{" && firstChar !== "[") {
      continue;
    }

    const end = findBalancedJsonEnd(text, start);

    if (end !== null) {
      return text.slice(start, end + 1).trim();
    }
  }

  return null;
}

function findBalancedJsonEnd(text: string, start: number): number | null {
  const stack: string[] = [text[start]];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char !== "}" && char !== "]") {
      continue;
    }

    const open = stack.pop();

    if (!open || !isMatchingBracket(open, char)) {
      return null;
    }

    if (stack.length === 0) {
      return index;
    }
  }

  return null;
}

function isMatchingBracket(open: string, close: string): boolean {
  return (open === "{" && close === "}") || (open === "[" && close === "]");
}

function looksLikeJson(value: string): boolean {
  return value.startsWith("{") || value.startsWith("[");
}

function addCandidate(candidates: string[], candidate: string | null): void {
  if (!candidate) {
    return;
  }

  if (!candidates.includes(candidate)) {
    candidates.push(candidate);
  }
}

function extractRuntimeFields(
  value: unknown,
  source: string
): AiRuntimeConfig {
  if (value === undefined) {
    return {};
  }

  const record = ensureRecord(value, `${source} must be an object.`, `${source}_invalid`);

  return readRuntimeFieldsFromRecord(record, source);
}

function extractRuntimeConfigFields(
  value: unknown,
  task: string | null
): AiRuntimeConfig {
  if (value === undefined) {
    return {};
  }

  const runtimeConfig = ensureRecord(
    value,
    "runtimeConfig must be an object.",
    "runtime_config_invalid"
  );

  let aiConfigValue: unknown = runtimeConfig;

  if (runtimeConfig.ai !== undefined) {
    aiConfigValue = runtimeConfig.ai;
  } else if (task && runtimeConfig[task] !== undefined) {
    aiConfigValue = runtimeConfig[task];
  }

  const aiConfig = ensureRecord(
    aiConfigValue,
    "runtimeConfig.ai must be an object.",
    "runtime_ai_invalid"
  );

  return readRuntimeFieldsFromRecord(aiConfig, "runtimeConfig.ai");
}

function readRuntimeFieldsFromRecord(
  record: UnknownRecord,
  source: string
): AiRuntimeConfig {
  return {
    provider: readOptionalProvider(
      record.provider ?? record.protocol,
      `${source}.provider`,
      "runtime_ai_provider_invalid",
      source.startsWith("runtime")
    ),
    baseURL: readOptionalString(
      record.baseURL ?? record.baseUrl,
      `${source}.baseURL`,
      "runtime_ai_base_url_invalid"
    ),
    model: readOptionalString(
      record.model,
      `${source}.model`,
      "runtime_ai_model_invalid"
    ),
    apiKey: readOptionalString(
      record.apiKey ?? record.api_key,
      `${source}.apiKey`,
      "runtime_ai_api_key_invalid"
    ),
    authToken: readOptionalString(
      record.authToken ?? record.auth_token,
      `${source}.authToken`,
      "runtime_ai_auth_token_invalid"
    ),
  };
}

function readRuntimeTask(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const task = value.task;
  return typeof task === "string" && task.trim() ? task.trim() : null;
}

function readOptionalProvider(
  value: unknown,
  fieldName: string,
  code: string,
  runtimeScoped: boolean
): AiProvider | undefined {
  const normalized = readOptionalString(value, fieldName, code);

  if (!normalized) {
    return undefined;
  }

  const lowerValue = normalized.toLowerCase();

  if (lowerValue === "anthropic" || lowerValue === "openai") {
    return lowerValue;
  }

  throw new RouteError(`${fieldName} must be "anthropic" or "openai".`, {
    status: runtimeScoped ? 400 : 500,
    code,
  });
}

function readOptionalString(
  value: unknown,
  fieldName: string,
  code: string
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new RouteError(`${fieldName} must be a string.`, {
      status: fieldName.startsWith("runtime") ? 400 : 500,
      code,
    });
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function readNonEmptyEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function normalizeAiBaseURL(
  rawValue: string,
  source: string,
  provider: AiProvider
): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawValue);
  } catch {
    throw new RouteError(`${source} must be an absolute http(s) URL.`, {
      status: source.startsWith("runtimeConfig") ? 400 : 500,
      code:
        source.startsWith("runtimeConfig")
          ? "runtime_ai_base_url_invalid"
          : `${provider}_base_url_invalid`,
      logDetails: { source, rawValue, provider },
    });
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new RouteError(`${source} must start with http:// or https://.`, {
      status: source.startsWith("runtimeConfig") ? 400 : 500,
      code:
        source.startsWith("runtimeConfig")
          ? "runtime_ai_base_url_invalid"
          : `${provider}_base_url_invalid`,
      logDetails: { source, rawValue, provider },
    });
  }

  parsedUrl.hash = "";
  parsedUrl.search = "";

  let pathname = parsedUrl.pathname.replace(/\/+$/, "");

  if (provider === "anthropic") {
    pathname = pathname.replace(/\/v1\/messages$/i, "");
    pathname = pathname.replace(/\/messages$/i, "");
    pathname = pathname.replace(/\/v1$/i, "");
  } else {
    pathname = pathname.replace(/\/v1\/chat\/completions$/i, "");
    pathname = pathname.replace(/\/chat\/completions$/i, "");
    pathname = pathname.replace(/\/v1\/responses$/i, "");
    pathname = pathname.replace(/\/responses$/i, "");
    pathname = pathname.replace(/\/v1$/i, "");
  }

  parsedUrl.pathname = pathname || "/";
  return parsedUrl.toString().replace(/\/+$/, "");
}

function buildEndpointUrl(baseURL: string, path: string): string {
  return `${baseURL}${path}`;
}

function parseJsonValue(value: string): unknown {
  if (!value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function createUpstreamHttpError(
  provider: AiProvider,
  status: number,
  rawText: string,
  payload: unknown
): UpstreamHttpError {
  const { message, code, type } = extractUpstreamErrorDetails(payload, rawText);

  return new UpstreamHttpError(
    message || `Upstream ${provider} request failed with status ${status}.`,
    {
      status,
      provider,
      responseText: rawText,
      upstreamCode: code,
      upstreamType: type,
    }
  );
}

function extractUpstreamErrorDetails(
  payload: unknown,
  rawText: string
): {
  message: string;
  code?: string;
  type?: string;
} {
  if (!isRecord(payload)) {
    return {
      message: rawText.trim(),
    };
  }

  if (typeof payload.error === "string") {
    return {
      message: payload.error,
      code: typeof payload.code === "string" ? payload.code : undefined,
      type: typeof payload.type === "string" ? payload.type : undefined,
    };
  }

  if (isRecord(payload.error)) {
    return {
      message:
        normalizeStringValue(payload.error.message, { allowEmpty: true }) ||
        rawText.trim(),
      code: normalizeStringValue(payload.error.code, { allowEmpty: true }) || undefined,
      type: normalizeStringValue(payload.error.type, { allowEmpty: true }) || undefined,
    };
  }

  return {
    message:
      normalizeStringValue(payload.message, { allowEmpty: true }) || rawText.trim(),
    code: normalizeStringValue(payload.code, { allowEmpty: true }) || undefined,
    type: normalizeStringValue(payload.type, { allowEmpty: true }) || undefined,
  };
}

function extractAnthropicMessageText(payload: UnknownRecord): string {
  const content = Array.isArray(payload.content) ? payload.content : [];

  const text = content
    .map((block) => {
      if (!isRecord(block)) {
        return "";
      }

      return block.type === "text" && typeof block.text === "string"
        ? block.text.trim()
        : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    throw new RouteError("AI response did not include any text content.", {
      status: 502,
      code: "ai_empty_response",
      retryable: true,
    });
  }

  return text;
}

function extractOpenAiMessageText(payload: UnknownRecord): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0];

  if (isRecord(firstChoice) && isRecord(firstChoice.message)) {
    const content = firstChoice.message.content;
    const text = extractOpenAiContentText(content);

    if (text) {
      return text;
    }
  }

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  throw new RouteError("AI response did not include any text content.", {
    status: 502,
    code: "ai_empty_response",
    retryable: true,
  });
}

function extractOpenAiContentText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!isRecord(item)) {
        return "";
      }

      if (typeof item.text === "string") {
        return item.text.trim();
      }

      if (item.type === "output_text" && typeof item.text === "string") {
        return item.text.trim();
      }

      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
