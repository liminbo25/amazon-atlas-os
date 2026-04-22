import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  RouteError,
  normalizeNumberValue,
  requestAiTextCompletion,
  resolveAiConfig,
  type AiProvider,
  type AiRuntimeConfig,
} from "./ai-route-helpers";

const DEFAULT_VIDEO_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_VIDEO_OPENAI_MODEL = "gpt-5.4";
const DEFAULT_TIMEOUT_SECONDS = 120;
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com";

interface StoredVideoLlmConfig {
  provider?: AiProvider;
  base_url: string;
  api_key: string;
  model: string;
  timeout_seconds: number;
}

interface LoadedVideoLlmConfig {
  exists: boolean;
  config: StoredVideoLlmConfig | null;
  configError?: string;
}

export interface VideoLlmPublicStatus {
  configured: boolean;
  provider: AiProvider | null;
  base_url: string;
  model: string;
  timeout_seconds: number;
  has_api_key: boolean;
  api_key_masked: string;
  source: "file" | "env" | "none";
  storage: "local-file" | "vercel-tmp";
  config_error: string | null;
}

export interface VideoLlmConfigUpdateInput {
  provider?: unknown;
  base_url?: unknown;
  api_key?: unknown;
  model?: unknown;
  timeout_seconds?: unknown;
  preserve_api_key?: unknown;
}

export async function resolveVideoAiRuntimeConfig(
  runtimeConfig: AiRuntimeConfig = {}
): Promise<AiRuntimeConfig> {
  const loaded = await loadStoredVideoLlmConfig();
  const storedRuntimeConfig = loaded.config
    ? toAiRuntimeConfig(loaded.config)
    : undefined;

  return {
    provider: runtimeConfig.provider ?? storedRuntimeConfig?.provider,
    baseURL: runtimeConfig.baseURL ?? storedRuntimeConfig?.baseURL,
    model: runtimeConfig.model ?? storedRuntimeConfig?.model,
    apiKey: runtimeConfig.apiKey ?? storedRuntimeConfig?.apiKey,
    authToken: runtimeConfig.authToken,
  };
}

export async function getVideoLlmPublicStatus(): Promise<VideoLlmPublicStatus> {
  const loaded = await loadStoredVideoLlmConfig();
  if (loaded.config) {
    return buildPublicStatus({
      source: "file",
      storage: runtimeStorage(),
      rawConfig: loaded.config,
      runtimeConfig: toAiRuntimeConfig(loaded.config),
    });
  }

  const envState = readEnvSnapshot();
  if (!envState.exists) {
    if (loaded.exists) {
      return {
        configured: false,
        provider: null,
        base_url: "",
        model: "",
        timeout_seconds: DEFAULT_TIMEOUT_SECONDS,
        has_api_key: false,
        api_key_masked: "",
        source: "file",
        storage: runtimeStorage(),
        config_error: loaded.configError ?? "Video runtime config is not available.",
      };
    }

    return {
      configured: false,
      provider: null,
      base_url: "",
      model: "",
      timeout_seconds: DEFAULT_TIMEOUT_SECONDS,
      has_api_key: false,
      api_key_masked: "",
      source: "none",
      storage: runtimeStorage(),
      config_error: null,
    };
  }

  const status = buildPublicStatus({
    source: "env",
    storage: runtimeStorage(),
    rawConfig: {
      provider: envState.provider ?? undefined,
      base_url: envState.baseURL,
      api_key: envState.secret,
      model: envState.model,
      timeout_seconds: DEFAULT_TIMEOUT_SECONDS,
    },
    runtimeConfig: envState.runtimeConfig,
  });

  if (!status.config_error && loaded.configError) {
    status.config_error = loaded.configError;
  }

  return status;
}

export async function saveVideoLlmConfig(
  input: VideoLlmConfigUpdateInput
): Promise<VideoLlmPublicStatus> {
  const loaded = await loadStoredVideoLlmConfig();
  const current = loaded.config ?? {
    base_url: "",
    api_key: "",
    model: "",
    timeout_seconds: DEFAULT_TIMEOUT_SECONDS,
  };

  const preserveApiKey = input.preserve_api_key !== false;
  const nextApiKey =
    preserveApiKey && input.api_key !== null && input.api_key !== undefined && input.api_key === ""
      ? current.api_key
      : preserveApiKey && (input.api_key === null || input.api_key === undefined)
        ? current.api_key
        : normalizeSecret(input.api_key);

  const nextConfig = normalizeStoredConfig({
    provider:
      input.provider === undefined
        ? current.provider
        : normalizeProvider(input.provider, "provider"),
    base_url:
      input.base_url === undefined ? current.base_url : normalizeBaseUrl(input.base_url),
    api_key: nextApiKey,
    model: input.model === undefined ? current.model : normalizeModel(input.model),
    timeout_seconds:
      input.timeout_seconds === undefined
        ? current.timeout_seconds
        : normalizeTimeoutSeconds(input.timeout_seconds),
  });

  const configPath = getVideoLlmConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(
    configPath,
    JSON.stringify(nextConfig, null, 2),
    "utf8"
  );

  return getVideoLlmPublicStatus();
}

export async function testVideoLlmConnection(): Promise<{
  ok: true;
  detail: string;
  llm: VideoLlmPublicStatus;
}> {
  const runtimeConfig = await resolveVideoAiRuntimeConfig();
  const config = resolveAiConfig({
    runtimeConfig,
    defaultModel: getVideoDefaultModel(runtimeConfig),
  });

  const output = await requestAiTextCompletion({
    config,
    operationName: "video shared runtime connectivity test",
    systemPrompt:
      "You are validating AI connectivity for an internal commerce video tool. Reply with a very short plain-text acknowledgement.",
    userPrompt:
      "Return one short plain-text response confirming that the model is reachable. Do not use markdown or JSON.",
    maxTokens: 32,
    temperature: 0,
  });

  return {
    ok: true,
    detail: output.trim().slice(0, 160) || "Runtime check completed.",
    llm: await getVideoLlmPublicStatus(),
  };
}

function runtimeStorage(): "local-file" | "vercel-tmp" {
  return process.env.VERCEL ? "vercel-tmp" : "local-file";
}

function getVideoLlmConfigPath(): string {
  const configured = process.env.VIDEO_RUNTIME_CONFIG_FILE?.trim();
  if (configured) {
    return path.resolve(/*turbopackIgnore: true*/ configured);
  }

  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "amazon-atlas-video-runtime", "llm-config.json");
  }

  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    ".video-output",
    "runtime",
    "llm-config.json"
  );
}

async function loadStoredVideoLlmConfig(): Promise<LoadedVideoLlmConfig> {
  const configPath = getVideoLlmConfigPath();

  try {
    const raw = await fs.readFile(configPath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Invalid JSON";
      return {
        exists: true,
        config: null,
        configError: `Saved video runtime config is not valid JSON: ${detail}`,
      };
    }

    try {
      return {
        exists: true,
        config: normalizeStoredConfig(parsed),
      };
    } catch (error) {
      return {
        exists: true,
        config: null,
        configError:
          error instanceof Error
            ? error.message
            : "Saved video runtime config is invalid.",
      };
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        exists: false,
        config: null,
      };
    }

    return {
      exists: true,
      config: null,
      configError:
        error instanceof Error
          ? `Unable to read saved video runtime config: ${error.message}`
          : "Unable to read saved video runtime config.",
    };
  }
}

function normalizeStoredConfig(value: unknown): StoredVideoLlmConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RouteError("Video runtime config must be a JSON object.", {
      status: 400,
      code: "video_llm_config_invalid",
    });
  }

  const record = value as Record<string, unknown>;

  return {
    provider: normalizeProvider(record.provider, "provider"),
    base_url: normalizeBaseUrl(record.base_url),
    api_key: normalizeSecret(record.api_key),
    model: normalizeModel(record.model),
    timeout_seconds: normalizeTimeoutSeconds(record.timeout_seconds),
  };
}

function normalizeProvider(
  value: unknown,
  fieldName: string
): AiProvider | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "anthropic" || value === "openai") {
    return value;
  }

  throw new RouteError(`${fieldName} must be "anthropic" or "openai".`, {
    status: 400,
    code: "video_llm_provider_invalid",
  });
}

function normalizeBaseUrl(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return "";
  }

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new RouteError("base_url must be a valid http/https URL.", {
      status: 400,
      code: "video_llm_base_url_invalid",
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new RouteError("base_url must use http or https.", {
      status: 400,
      code: "video_llm_base_url_invalid",
    });
  }

  return text.replace(/\/+$/, "");
}

function normalizeSecret(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeModel(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimeoutSeconds(value: unknown): number {
  return normalizeNumberValue(value, {
    min: 1,
    max: 600,
    fallback: DEFAULT_TIMEOUT_SECONDS,
  });
}

function toAiRuntimeConfig(config: StoredVideoLlmConfig): AiRuntimeConfig {
  return {
    provider: config.provider,
    baseURL: config.base_url || undefined,
    model: config.model || undefined,
    apiKey: config.api_key || undefined,
  };
}

function buildPublicStatus(options: {
  source: "file" | "env";
  storage: "local-file" | "vercel-tmp";
  rawConfig: StoredVideoLlmConfig;
  runtimeConfig: AiRuntimeConfig;
}): VideoLlmPublicStatus {
  try {
    const resolved = resolveAiConfig({
      runtimeConfig: options.runtimeConfig,
      defaultModel: getVideoDefaultModel(options.runtimeConfig),
    });

    return {
      configured: true,
      provider: resolved.provider,
      base_url: resolved.baseURL,
      model: resolved.model,
      timeout_seconds: options.rawConfig.timeout_seconds,
      has_api_key: Boolean(resolved.apiKey || resolved.authToken),
      api_key_masked: maskSecret(options.rawConfig.api_key),
      source: options.source,
      storage: options.storage,
      config_error: null,
    };
  } catch (error) {
    return {
      configured: false,
      provider: options.rawConfig.provider ?? null,
      base_url: options.rawConfig.base_url,
      model: options.rawConfig.model,
      timeout_seconds: options.rawConfig.timeout_seconds,
      has_api_key: Boolean(options.rawConfig.api_key),
      api_key_masked: maskSecret(options.rawConfig.api_key),
      source: options.source,
      storage: options.storage,
      config_error:
        error instanceof Error ? error.message : "Video runtime config is invalid.",
    };
  }
}

function maskSecret(value: string): string {
  if (!value) {
    return "";
  }

  if (value.length <= 8) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 4)}${"*".repeat(value.length - 8)}${value.slice(-4)}`;
}

function readEnvSnapshot(): {
  exists: boolean;
  provider: AiProvider | null;
  baseURL: string;
  model: string;
  secret: string;
  runtimeConfig: AiRuntimeConfig;
} {
  const explicitProvider = readProviderEnv(process.env.AI_PROVIDER);
  const openAiApiKey = readNonEmptyEnv("OPENAI_API_KEY");
  const openAiBaseURL = readNonEmptyEnv("OPENAI_BASE_URL");
  const openAiModel = readNonEmptyEnv("OPENAI_MODEL");
  const anthropicApiKey = readNonEmptyEnv("ANTHROPIC_API_KEY");
  const anthropicAuthToken = readNonEmptyEnv("ANTHROPIC_AUTH_TOKEN");
  const anthropicBaseURL = readNonEmptyEnv("ANTHROPIC_BASE_URL");
  const anthropicModel = readNonEmptyEnv("ANTHROPIC_MODEL");

  const hasOpenAiEnv = Boolean(openAiApiKey || openAiBaseURL || openAiModel);
  const hasAnthropicEnv = Boolean(
    anthropicApiKey ||
      anthropicAuthToken ||
      anthropicBaseURL ||
      anthropicModel
  );

  if (explicitProvider === "openai" || (!explicitProvider && hasOpenAiEnv && !hasAnthropicEnv)) {
    return {
      exists: true,
      provider: "openai",
      baseURL: openAiBaseURL || DEFAULT_OPENAI_BASE_URL,
      model: openAiModel || DEFAULT_VIDEO_OPENAI_MODEL,
      secret: openAiApiKey || "",
      runtimeConfig: {
        provider: "openai",
        baseURL: openAiBaseURL || undefined,
        model: openAiModel || undefined,
        apiKey: openAiApiKey || undefined,
      },
    };
  }

  if (
    explicitProvider === "anthropic" ||
    (!explicitProvider && hasAnthropicEnv) ||
    (!explicitProvider && !hasOpenAiEnv && !hasAnthropicEnv && Boolean(process.env.AI_PROVIDER))
  ) {
    return {
      exists: hasAnthropicEnv || explicitProvider === "anthropic",
      provider: "anthropic",
      baseURL: anthropicBaseURL || DEFAULT_ANTHROPIC_BASE_URL,
      model: anthropicModel || DEFAULT_VIDEO_ANTHROPIC_MODEL,
      secret: anthropicApiKey || anthropicAuthToken || "",
      runtimeConfig: {
        provider: "anthropic",
        baseURL: anthropicBaseURL || undefined,
        model: anthropicModel || undefined,
        apiKey: anthropicApiKey || undefined,
        authToken: anthropicAuthToken || undefined,
      },
    };
  }

  return {
    exists: false,
    provider: null,
    baseURL: "",
    model: "",
    secret: "",
    runtimeConfig: {},
  };
}

function readProviderEnv(value: string | undefined): AiProvider | null {
  if (value === "openai" || value === "anthropic") {
    return value;
  }

  return null;
}

function readNonEmptyEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getVideoDefaultModel(
  runtimeConfig: AiRuntimeConfig = {}
): string {
  const provider = inferVideoProvider(runtimeConfig);
  return provider === "openai"
    ? readNonEmptyEnv("OPENAI_MODEL") || DEFAULT_VIDEO_OPENAI_MODEL
    : readNonEmptyEnv("ANTHROPIC_MODEL") || DEFAULT_VIDEO_ANTHROPIC_MODEL;
}

function inferVideoProvider(runtimeConfig: AiRuntimeConfig): AiProvider {
  if (runtimeConfig.provider === "openai" || runtimeConfig.provider === "anthropic") {
    return runtimeConfig.provider;
  }

  const explicitProvider = readProviderEnv(process.env.AI_PROVIDER);
  if (explicitProvider) {
    return explicitProvider;
  }

  const model = runtimeConfig.model?.trim().toLowerCase() || "";
  const baseURL = runtimeConfig.baseURL?.trim().toLowerCase() || "";

  if (model.startsWith("claude") || baseURL.includes("anthropic")) {
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
    model.includes("/") ||
    baseURL.includes("openai") ||
    baseURL.includes("/chat/completions") ||
    baseURL.includes("/responses")
  ) {
    return "openai";
  }

  const hasAnthropicEnv = Boolean(
    readNonEmptyEnv("ANTHROPIC_API_KEY") ||
      readNonEmptyEnv("ANTHROPIC_AUTH_TOKEN") ||
      readNonEmptyEnv("ANTHROPIC_BASE_URL") ||
      readNonEmptyEnv("ANTHROPIC_MODEL")
  );
  const hasOpenAiEnv = Boolean(
    readNonEmptyEnv("OPENAI_API_KEY") ||
      readNonEmptyEnv("OPENAI_BASE_URL") ||
      readNonEmptyEnv("OPENAI_MODEL")
  );

  if (hasOpenAiEnv && !hasAnthropicEnv) {
    return "openai";
  }

  return "anthropic";
}
