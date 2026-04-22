import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { NextRequest, NextResponse } from "next/server";
import { uploadImageSourceToBlob } from "@/lib/image-blob";
import {
  buildStrictTryOnPrompt,
  TRY_ON_CHAT_IMAGE_LABELS,
} from "@/lib/tryon-prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

type GeminiRequestType =
  | "virtual-tryon"
  | "white-background"
  | "model-swap"
  | "free-generation";
type GeminiImageModel = "nano_banana_pro" | "image2";
type GeminiFreeGenerationMode = "text-to-image" | "image-to-image";
type GeminiRouteError = Error & {
  code?: string;
  status?: number;
  retryable?: boolean;
  model?: GeminiImageModel;
};

export interface GeminiRequest {
  image?: string;
  clothingImage?: string;
  modelImage?: string;
  referenceImages?: string[];
  prompt?: string;
  garmentNote?: string;
  type?: GeminiRequestType;
  freeGenerationMode?: GeminiFreeGenerationMode;
  size?: string;
  model?: GeminiImageModel;
}

export interface GeminiResponse {
  success: boolean;
  result?: string;
  error?: string;
}

const DEFAULT_IMAGE_GENERATIONS_API_BASE_URL = "https://ai.yijiarj.cn/v1";
const DEFAULT_CHAT_COMPLETIONS_API_BASE_URL = "https://api.yijiarj.cn/v1";
const DEFAULT_MODEL: GeminiImageModel = "nano_banana_pro";
const DEFAULT_GEMINI_TRYON_SIZE = "1024x1024";
const IMAGE2_GEMINI_TRYON_SIZE = "1024x1792";
const GEMINI_UPSTREAM_CONNECT_TIMEOUT_MS = 30_000;
const GEMINI_UPSTREAM_RESPONSE_TIMEOUT_MS = 90_000;
const GEMINI_UPSTREAM_MAX_ATTEMPTS = 2;
const GEMINI_UPSTREAM_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const IMAGE2_SUPPORTED_SIZES = new Set([
  "1024x1024",
  "1024x1792",
  "1792x1024",
  "1920x822",
  "822x1920",
]);
const GEMINI_UPSTREAM_RETRYABLE_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UPSTREAM_CONNECT_TIMEOUT",
  "UPSTREAM_RESPONSE_TIMEOUT",
]);
const MAX_INLINE_RESULT_BYTES = 2 * 1024 * 1024;

function resolveApiBaseUrl(
  rawBaseUrl: string | undefined,
  defaultBaseUrl: string
) {
  const trimmed = rawBaseUrl?.trim();

  if (!trimmed) {
    return defaultBaseUrl;
  }

  const normalized = trimmed.replace(/\/+$/, "");

  if (/\/v\d+$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}/v1`;
}

function isSupportedGeminiImageModel(value?: string): value is GeminiImageModel {
  return value === "nano_banana_pro" || value === "image2";
}

function createGeminiRouteError(
  message: string,
  overrides: Partial<GeminiRouteError> = {}
) {
  const error = new Error(message) as GeminiRouteError;
  Object.assign(error, overrides);
  return error;
}

function usesChatCompletionsModel(imageModel: GeminiImageModel) {
  return imageModel === "image2";
}

function getDefaultTryOnSize(imageModel: GeminiImageModel) {
  return usesChatCompletionsModel(imageModel)
    ? IMAGE2_GEMINI_TRYON_SIZE
    : DEFAULT_GEMINI_TRYON_SIZE;
}

function resolveImageModel(requestedModel?: string): GeminiImageModel {
  const normalizedRequestedModel = requestedModel?.trim();

  if (isSupportedGeminiImageModel(normalizedRequestedModel)) {
    return normalizedRequestedModel;
  }

  const configuredModel =
    process.env.GEMINI_IMAGE_MODEL?.trim() || process.env.GEMINI_MODEL?.trim();

  if (isSupportedGeminiImageModel(configuredModel)) {
    return configuredModel;
  }

  return DEFAULT_MODEL;
}

function resolveImageApiBaseUrl(imageModel: GeminiImageModel) {
  const configuredBaseUrl =
    imageModel === "image2"
      ? process.env.GEMINI_IMAGE2_API_BASE_URL?.trim()
      : process.env.GEMINI_API_BASE_URL?.trim();

  return resolveApiBaseUrl(
    configuredBaseUrl,
    usesChatCompletionsModel(imageModel)
      ? DEFAULT_CHAT_COMPLETIONS_API_BASE_URL
      : DEFAULT_IMAGE_GENERATIONS_API_BASE_URL
  );
}

function normalizeImageForProvider(image: string) {
  const trimmed = image.trim();

  if (
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }

  const base64Data = trimmed.includes(",") ? trimmed.split(",")[1] : trimmed;
  return `data:image/png;base64,${base64Data}`;
}

function normalizeSizeForModel(
  imageModel: GeminiImageModel,
  requestedSize: string | undefined,
  fallbackSize?: string
) {
  const normalizedRequested = requestedSize?.trim().toLowerCase();
  const normalizedFallback = fallbackSize?.trim().toLowerCase();

  if (!usesChatCompletionsModel(imageModel)) {
    return normalizedRequested || normalizedFallback || "1024x1024";
  }

  if (normalizedRequested && IMAGE2_SUPPORTED_SIZES.has(normalizedRequested)) {
    return normalizedRequested;
  }

  if (normalizedRequested === "1024x1536") {
    return "1024x1792";
  }

  if (normalizedRequested === "1536x1024") {
    return "1792x1024";
  }

  if (normalizedFallback && IMAGE2_SUPPORTED_SIZES.has(normalizedFallback)) {
    return normalizedFallback;
  }

  return "1024x1024";
}

async function persistGeneratedImageResult(source: string, folder: string) {
  try {
    const uploadedResult = await uploadImageSourceToBlob(source, folder);
    return uploadedResult.url;
  } catch (error) {
    console.warn("Failed to persist generated image result to Blob:", error);

    if (source.startsWith("data:image/")) {
      const base64Payload = source.split(",")[1] || "";
      const estimatedBytes = Math.ceil((base64Payload.length * 3) / 4);

      if (estimatedBytes > MAX_INLINE_RESULT_BYTES) {
        throw createGeminiRouteError(
          "Generated image was created, but storing the result failed before a browser-safe URL could be returned. Please retry.",
          {
            code: "RESULT_PERSIST_FAILED",
            status: 502,
            retryable: true,
          }
        );
      }
    }

    return source;
  }
}

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function createErrorWithCode(message: string, code: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

function extractErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const maybeError = error as {
    code?: string;
    cause?: { code?: string };
  };

  return maybeError.code ?? maybeError.cause?.code;
}

function containsModerationSignal(responseText: string) {
  const normalized = responseText.toLowerCase();

  return (
    normalized.includes("invalid_request_error") ||
    normalized.includes("nudity") ||
    normalized.includes("sexual") ||
    normalized.includes("裸露") ||
    normalized.includes("性暗示")
  );
}

function shouldRetryUpstreamStatus(status: number, responseText: string) {
  if (!GEMINI_UPSTREAM_RETRYABLE_STATUS.has(status)) {
    return false;
  }

  if (containsModerationSignal(responseText)) {
    return false;
  }

  return true;
}

function isRetryableNetworkError(error: unknown) {
  const code = extractErrorCode(error);

  if (code && GEMINI_UPSTREAM_RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }

  return error instanceof Error && error.message.trim().toLowerCase() === "fetch failed";
}

function formatNetworkError(error: unknown) {
  const code = extractErrorCode(error);

  if (code === "UPSTREAM_CONNECT_TIMEOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return "Gemini upstream connection timed out while contacting the image provider. Please retry.";
  }

  if (code === "UPSTREAM_RESPONSE_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") {
    return "Gemini upstream took too long to return an image result. Please retry.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Gemini upstream request failed before a complete response was received.";
}

async function sendProviderRequest(
  apiBaseUrl: string,
  endpointPath: string,
  geminiApiKey: string,
  payload: Record<string, unknown>
) {
  const requestUrl = new URL(`${apiBaseUrl}${endpointPath}`);
  const requestBody = JSON.stringify(payload);
  const requestImpl =
    requestUrl.protocol === "http:" ? httpRequest : httpsRequest;

  return new Promise<{
    ok: boolean;
    status: number;
    responseText: string;
  }>((resolve, reject) => {
    const request = requestImpl(
      requestUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody).toString(),
          Authorization: `Bearer ${geminiApiKey}`,
        },
      },
      (response) => {
        clearTimeout(connectTimer);

        let responseText = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseText += chunk;
        });
        response.on("end", () => {
          const status = response.statusCode ?? 500;

          resolve({
            ok: status >= 200 && status < 300,
            status,
            responseText,
          });
        });
        response.on("error", (error) => {
          reject(error);
        });
      }
    );

    const connectTimer = setTimeout(() => {
      request.destroy(
        createErrorWithCode(
          `Gemini upstream connect timeout after ${GEMINI_UPSTREAM_CONNECT_TIMEOUT_MS}ms`,
          "UPSTREAM_CONNECT_TIMEOUT"
        )
      );
    }, GEMINI_UPSTREAM_CONNECT_TIMEOUT_MS);

    request.setTimeout(GEMINI_UPSTREAM_RESPONSE_TIMEOUT_MS, () => {
      request.destroy(
        createErrorWithCode(
          `Gemini upstream response timeout after ${GEMINI_UPSTREAM_RESPONSE_TIMEOUT_MS}ms`,
          "UPSTREAM_RESPONSE_TIMEOUT"
        )
      );
    });

    request.on("socket", (socket) => {
      if ((socket as { connecting?: boolean }).connecting) {
        socket.once("connect", () => clearTimeout(connectTimer));
        socket.once("secureConnect", () => clearTimeout(connectTimer));
      } else {
        clearTimeout(connectTimer);
      }

      socket.once("close", () => clearTimeout(connectTimer));
      socket.once("error", () => clearTimeout(connectTimer));
    });

    request.on("error", (error) => {
      clearTimeout(connectTimer);
      reject(error);
    });

    request.write(requestBody);
    request.end();
  });
}

async function requestProviderJson(
  apiBaseUrl: string,
  endpointPath: string,
  geminiApiKey: string,
  payload: Record<string, unknown>,
  maxAttempts = GEMINI_UPSTREAM_MAX_ATTEMPTS
) {
  let lastNetworkError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await sendProviderRequest(
        apiBaseUrl,
        endpointPath,
        geminiApiKey,
        payload
      );

      if (
        shouldRetryUpstreamStatus(response.status, response.responseText) &&
        attempt < maxAttempts
      ) {
        await sleep(500 * attempt);
        continue;
      }

      return response;
    } catch (error) {
      lastNetworkError = error;
      const retryable = isRetryableNetworkError(error);

      if (retryable && attempt < maxAttempts) {
        await sleep(500 * attempt);
        continue;
      }

      throw createGeminiRouteError(formatNetworkError(error), {
        code: extractErrorCode(error),
        retryable,
      });
    }
  }

  throw createGeminiRouteError(formatNetworkError(lastNetworkError), {
    code: extractErrorCode(lastNetworkError),
    retryable: isRetryableNetworkError(lastNetworkError),
  });
}

function parseImageGenerationResponse(responseText: string) {
  try {
    return JSON.parse(responseText) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      error?: { message?: string };
    };
  } catch {
    throw new Error(
      `图片接口返回了无法解析的内容：${responseText.slice(0, 200)}`
    );
  }
}

function extractImageFromResponse(data: {
  data?: Array<{ b64_json?: string; url?: string }>;
}) {
  const firstItem = data.data?.[0];

  if (!firstItem) {
    return null;
  }

  if (firstItem.b64_json) {
    if (
      firstItem.b64_json.startsWith("http://") ||
      firstItem.b64_json.startsWith("https://")
    ) {
      return firstItem.b64_json;
    }

    return `data:image/png;base64,${firstItem.b64_json}`;
  }

  if (firstItem.url) {
    return firstItem.url;
  }

  return null;
}

function buildChatCompletionMessages(
  prompt: string,
  images: string[],
  imageLabels?: string[]
) {
  const content: Array<
    | {
        type: "text";
        text: string;
      }
    | {
        type: "image_url";
        image_url: {
          url: string;
        };
      }
  > = [
    {
      type: "text",
      text: prompt,
    },
  ];

  images.forEach((image, index) => {
    const label = imageLabels?.[index]?.trim();

    if (label) {
      content.push({
        type: "text",
        text: label,
      });
    }

    content.push({
      type: "image_url",
      image_url: {
        url: image,
      },
    });
  });

  return [
    {
      role: "user",
      content,
    },
  ];
}

function parseChatCompletionResponse(responseText: string) {
  try {
    return JSON.parse(responseText) as {
      choices?: Array<{
        message?: {
          content?:
            | string
            | Array<{
                type?: string;
                text?: string;
                url?: string;
                b64_json?: string;
                image_base64?: string;
                image_url?: {
                  url?: string;
                };
              }>;
          images?: Array<{
            url?: string;
            b64_json?: string;
            image_base64?: string;
            image_url?: {
              url?: string;
            };
          }>;
        };
      }>;
      data?: Array<{
        b64_json?: string;
        url?: string;
      }>;
      output?: Array<{
        type?: string;
        url?: string;
        b64_json?: string;
        image_base64?: string;
        result?: string;
        image_url?: string;
      }>;
      error?: { message?: string };
    };
  } catch {
    throw new Error(
      `Chat completions returned unreadable content: ${responseText.slice(0, 200)}`
    );
  }
}

function normalizeExtractedImageValue(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }

  if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && trimmed.length > 128) {
    return `data:image/png;base64,${trimmed.replace(/\s+/g, "")}`;
  }

  return null;
}

function extractImageFromText(text: string): string | null {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return null;
  }

  const directImage = normalizeExtractedImageValue(normalizedText);

  if (directImage) {
    return directImage;
  }

  const markdownMatch = normalizedText.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);

  if (markdownMatch?.[1]) {
    return markdownMatch[1];
  }

  const urlMatch = normalizedText.match(/https?:\/\/[^\s)]+/i);

  if (urlMatch?.[0]) {
    return urlMatch[0];
  }

  if (
    (normalizedText.startsWith("{") && normalizedText.endsWith("}")) ||
    (normalizedText.startsWith("[") && normalizedText.endsWith("]"))
  ) {
    try {
      return extractImageFromChatCompletion(
        JSON.parse(normalizedText) as Parameters<typeof extractImageFromChatCompletion>[0]
      );
    } catch {
      return null;
    }
  }

  return null;
}

function extractImageFromChatCompletion(data: {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
            url?: string;
            b64_json?: string;
            image_base64?: string;
            image_url?: {
              url?: string;
            };
          }>;
      images?: Array<{
        url?: string;
        b64_json?: string;
        image_base64?: string;
        image_url?: {
          url?: string;
        };
      }>;
    };
  }>;
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
  output?: Array<{
    type?: string;
    url?: string;
    b64_json?: string;
    image_base64?: string;
    result?: string;
    image_url?: string;
  }>;
}): string | null {
  const imageGenerationStyleResult = extractImageFromResponse(data);

  if (imageGenerationStyleResult) {
    return imageGenerationStyleResult;
  }

  const message = data.choices?.[0]?.message;
  const messageImage = message?.images?.find(
    (item) =>
      item.url ||
      item.image_url?.url ||
      item.b64_json ||
      item.image_base64
  );

  if (messageImage) {
    return (
      normalizeExtractedImageValue(messageImage.url) ||
      normalizeExtractedImageValue(messageImage.image_url?.url) ||
      normalizeExtractedImageValue(messageImage.b64_json) ||
      normalizeExtractedImageValue(messageImage.image_base64)
    );
  }

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    const outputImage = data.output?.find(
      (item) =>
        item.type?.includes("image") ||
        item.url ||
        item.image_url ||
        item.b64_json ||
        item.image_base64 ||
        item.result
    );

    if (!outputImage) {
      return null;
    }

    return (
      normalizeExtractedImageValue(outputImage.url) ||
      normalizeExtractedImageValue(outputImage.image_url) ||
      normalizeExtractedImageValue(outputImage.b64_json) ||
      normalizeExtractedImageValue(outputImage.image_base64) ||
      normalizeExtractedImageValue(outputImage.result)
    );
  }

  if (typeof content !== "string") {
    for (const item of content) {
      const directImage =
        normalizeExtractedImageValue(item.url) ||
        normalizeExtractedImageValue(item.image_url?.url) ||
        normalizeExtractedImageValue(item.b64_json) ||
        normalizeExtractedImageValue(item.image_base64);

      if (directImage) {
        return directImage;
      }
    }
  }

  const text =
    typeof content === "string"
      ? content
      : content
          .filter(
            (item): item is { type?: string; text: string } =>
              typeof item?.text === "string"
          )
          .map((item) => item.text)
          .join("\n");

  if (!text) {
    return null;
  }

  return extractImageFromText(text);
}

function createProviderResponseError(
  imageModel: GeminiImageModel,
  status: number,
  responseText: string
) {
  return createGeminiRouteError(`API request failed: ${status} - ${responseText}`, {
    status,
    retryable: shouldRetryUpstreamStatus(status, responseText),
    model: imageModel,
  });
}

function getAlternateGeminiImageModel(
  imageModel: GeminiImageModel
): GeminiImageModel | null {
  return imageModel === "image2" ? "nano_banana_pro" : null;
}

function shouldFallbackToAlternateGeminiModel(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  const maybeGeminiError = error as GeminiRouteError;

  if (maybeGeminiError.retryable) {
    return true;
  }

  return (
    normalizedMessage.includes("did not include an image url") ||
    normalizedMessage.includes("did not include an image result") ||
    normalizedMessage.includes("returned unreadable content") ||
    normalizedMessage.includes("upstream took too long") ||
    normalizedMessage.includes("upstream connection timed out") ||
    normalizedMessage.includes("upstream request failed")
  );
}

function getGeminiErrorStatus(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  const code = extractErrorCode(error);

  if (code === "UPSTREAM_RESPONSE_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") {
    return 504;
  }

  if (code === "UPSTREAM_CONNECT_TIMEOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return 504;
  }

  if (error instanceof Error && error.message.toLowerCase().includes("upstream")) {
    return 502;
  }

  if (
    error instanceof Error &&
    /api request failed:\s*(429|500|502|503|504)\b/i.test(error.message)
  ) {
    return 502;
  }

  return 500;
}

interface RunImageGenerationOptions {
  geminiApiKey: string;
  imageModel: GeminiImageModel;
  prompt: string;
  images: string[];
  imageLabels?: string[];
  size: string;
  fallbackSize?: string;
  maxAttempts?: number;
}

async function runImageGeneration(options: RunImageGenerationOptions) {
  const {
    geminiApiKey,
    imageModel,
    prompt,
    images,
    imageLabels,
    size,
    fallbackSize,
    maxAttempts = GEMINI_UPSTREAM_MAX_ATTEMPTS,
  } = options;
  const apiBaseUrl = resolveImageApiBaseUrl(imageModel);
  const normalizedImages = images.map((image) => normalizeImageForProvider(image));
  const normalizedSize = normalizeSizeForModel(imageModel, size, fallbackSize);

  if (usesChatCompletionsModel(imageModel)) {
    const normalizedFallbackSize = fallbackSize
      ? normalizeSizeForModel(imageModel, fallbackSize, fallbackSize)
      : undefined;
    let apiResult = await requestProviderJson(
      apiBaseUrl,
      "/chat/completions",
      geminiApiKey,
      {
        model: imageModel,
        messages: buildChatCompletionMessages(
          prompt,
          normalizedImages,
          imageLabels
        ),
        size: normalizedSize,
      },
      maxAttempts
    );

    if (
      !apiResult.ok &&
      normalizedFallbackSize &&
      normalizedSize !== normalizedFallbackSize &&
      shouldRetryWithFallbackSize(apiResult.responseText, apiResult.status)
    ) {
      apiResult = await requestProviderJson(
        apiBaseUrl,
        "/chat/completions",
        geminiApiKey,
        {
          model: imageModel,
          messages: buildChatCompletionMessages(
            prompt,
            normalizedImages,
            imageLabels
          ),
          size: normalizedFallbackSize,
        },
        maxAttempts
      );
    }

    if (!apiResult.ok) {
      throw createProviderResponseError(
        imageModel,
        apiResult.status,
        apiResult.responseText
      );
    }

    let data: ReturnType<typeof parseChatCompletionResponse>;

    try {
      data = parseChatCompletionResponse(apiResult.responseText);
    } catch (error) {
      throw createGeminiRouteError(
        error instanceof Error
          ? error.message
          : "Chat completions returned unreadable content.",
        {
          code: "UPSTREAM_INVALID_RESPONSE",
          retryable: true,
          model: imageModel,
        }
      );
    }

    const result = extractImageFromChatCompletion(data);

    if (result) {
      return result;
    }

    if (data.error?.message) {
      throw createGeminiRouteError(data.error.message, {
        model: imageModel,
      });
    }

    throw createGeminiRouteError(
      "Chat completions response did not include an image URL.",
      {
        code: "UPSTREAM_MISSING_IMAGE",
        retryable: true,
        model: imageModel,
      }
    );
  }

  const normalizedFallbackSize = fallbackSize
    ? normalizeSizeForModel(imageModel, fallbackSize, fallbackSize)
    : undefined;
  const imageGenerationPayload: Record<string, unknown> = {
    model: imageModel,
    prompt,
    n: 1,
    size: normalizedSize,
    quality: "hd",
    style: "natural",
  };

  if (normalizedImages.length > 0) {
    imageGenerationPayload.image = normalizedImages;
  }

  let apiResult = await requestProviderJson(
    apiBaseUrl,
    "/images/generations",
    geminiApiKey,
    imageGenerationPayload,
    maxAttempts
  );

  if (
    !apiResult.ok &&
    normalizedFallbackSize &&
    normalizedSize !== normalizedFallbackSize &&
    shouldRetryWithFallbackSize(apiResult.responseText, apiResult.status)
  ) {
    const fallbackPayload = {
      ...imageGenerationPayload,
      size: normalizedFallbackSize,
    };

    apiResult = await requestProviderJson(
      apiBaseUrl,
      "/images/generations",
      geminiApiKey,
      fallbackPayload,
      maxAttempts
    );
  }

  if (!apiResult.ok) {
    throw new Error(
      `API 请求失败：${apiResult.status} - ${apiResult.responseText}`
    );
  }

  let data: ReturnType<typeof parseImageGenerationResponse>;

  try {
    data = parseImageGenerationResponse(apiResult.responseText);
  } catch (error) {
    throw createGeminiRouteError(
      error instanceof Error
        ? error.message
        : "Image generation returned unreadable content.",
      {
        code: "UPSTREAM_INVALID_RESPONSE",
        retryable: true,
        model: imageModel,
      }
    );
  }

  const result = extractImageFromResponse(data);

  if (result) {
    return result;
  }

  if (data.error?.message) {
    throw createGeminiRouteError(data.error.message, {
      model: imageModel,
    });
  }

  throw new Error("接口返回中没有找到图片结果。");
}

function shouldRetryWithFallbackSize(
  responseText: string,
  status: number
) {
  if (status !== 400 && status !== 413 && status !== 422) {
    return false;
  }

  const normalized = responseText.toLowerCase();
  const sizeSignals = [
    "size",
    "resolution",
    "dimension",
    "dimensions",
    "aspect ratio",
    "unsupported_size",
    "invalid_size",
    "invalid size",
    "unsupported size",
    "image size",
    "1024x1536",
    "1536",
  ];

  return sizeSignals.some((signal) => normalized.includes(signal));
}

function buildVirtualTryOnPrompt(
  _imageModel: GeminiImageModel,
  garmentNote?: string
) {
  return buildStrictTryOnPrompt(garmentNote);
}

function buildWhiteBackgroundPrompt() {
  return `Replace the existing background with a clean pure white background (#FFFFFF).

CRITICAL REQUIREMENTS:
1. Keep the main subject unchanged, including face, body, clothing, product details, color, and texture.
2. Preserve natural edges and fine details such as hair, sleeves, hems, and accessories.
3. Remove the original scene/background only. Do not redesign the subject.
4. The final image should look neat, realistic, and suitable for e-commerce presentation.`;
}

function buildModelSwapPrompt(prompt: string) {
  return `请将这张服装图片中的模特替换为：${prompt}。

要求：
1. 保持服装本身完全不变，包括颜色、花纹、版型和材质质感。
2. 只替换人物模特，不要破坏服装细节。
3. 生成自然、清晰、适合展示的成图。`;
}

function normalizeReferenceImages(referenceImages?: string[]) {
  return (referenceImages || []).filter(
    (image): image is string => typeof image === "string" && image.trim().length > 0
  );
}

async function runImageGenerationWithFallback(options: RunImageGenerationOptions) {
  try {
    const result = await runImageGeneration(options);
    return {
      result,
      modelUsed: options.imageModel,
      fallbackModelUsed: false,
    };
  } catch (error) {
    const alternateModel = getAlternateGeminiImageModel(options.imageModel);

    if (!alternateModel || !shouldFallbackToAlternateGeminiModel(error)) {
      throw error;
    }

    console.warn("Primary Gemini image model failed, falling back.", {
      requestedModel: options.imageModel,
      alternateModel,
      error: error instanceof Error ? error.message : String(error),
    });

    const alternateSize = options.fallbackSize || getDefaultTryOnSize(alternateModel);
    const result = await runImageGeneration({
      ...options,
      imageModel: alternateModel,
      size: alternateSize,
      fallbackSize: alternateSize,
      maxAttempts: 1,
    });

    return {
      result,
      modelUsed: alternateModel,
      fallbackModelUsed: true,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GeminiRequest;
    const {
      image,
      prompt,
      clothingImage,
      modelImage,
      referenceImages,
      garmentNote,
      type = "model-swap",
      freeGenerationMode,
      size,
      model,
    } = body;

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const imageModel = resolveImageModel(model);

    if (!geminiApiKey) {
      return NextResponse.json(
        { success: false, error: "未配置 GEMINI_API_KEY 环境变量。" },
        { status: 500 }
      );
    }

    if (type === "virtual-tryon") {
      if (!clothingImage || !modelImage) {
        return NextResponse.json(
          { success: false, error: "缺少服装图或模特参考图。" },
          { status: 400 }
        );
      }

      const generation = await runImageGenerationWithFallback({
        geminiApiKey,
        imageModel,
        prompt: buildVirtualTryOnPrompt(imageModel, garmentNote),
        images: [clothingImage, modelImage],
        imageLabels: TRY_ON_CHAT_IMAGE_LABELS,
        size: size || getDefaultTryOnSize(imageModel),
        fallbackSize: "1024x1024",
      });
      const persistedResult = await persistGeneratedImageResult(
        generation.result,
        "image-studio/generated/try-on"
      );

      return NextResponse.json({
        success: true,
        result: persistedResult,
        modelUsed: generation.modelUsed,
        fallbackModelUsed: generation.fallbackModelUsed || undefined,
      });
    }

    if (type === "white-background") {
      if (!image) {
        return NextResponse.json(
          { success: false, error: "缺少待换白底的图片。" },
          { status: 400 }
        );
      }

      const generation = await runImageGenerationWithFallback({
        geminiApiKey,
        imageModel,
        prompt: buildWhiteBackgroundPrompt(),
        images: [image],
        size: size || "1024x1024",
        fallbackSize: "1024x1024",
      });
      const persistedResult = await persistGeneratedImageResult(
        generation.result,
        "image-studio/generated/white-background"
      );

      return NextResponse.json({
        success: true,
        result: persistedResult,
        modelUsed: generation.modelUsed,
        fallbackModelUsed: generation.fallbackModelUsed || undefined,
      });
    }

    if (type === "free-generation") {
      if (!prompt?.trim()) {
        return NextResponse.json(
          { success: false, error: "Free generation requires a prompt." },
          { status: 400 }
        );
      }

      if (
        freeGenerationMode !== "text-to-image" &&
        freeGenerationMode !== "image-to-image"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Free generation requires freeGenerationMode to be text-to-image or image-to-image.",
          },
          { status: 400 }
        );
      }

      const normalizedReferenceImages = normalizeReferenceImages(
        referenceImages?.length ? referenceImages : image ? [image] : []
      );
      const generationImages =
        freeGenerationMode === "image-to-image" ? normalizedReferenceImages : [];

      if (
        freeGenerationMode === "image-to-image" &&
        generationImages.length === 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Image-to-image free generation requires at least one reference image.",
          },
          { status: 400 }
        );
      }

      const generation = await runImageGenerationWithFallback({
        geminiApiKey,
        imageModel,
        prompt: prompt.trim(),
        images: generationImages,
        size: size || "1024x1024",
        fallbackSize: "1024x1024",
      });
      const persistedResult = await persistGeneratedImageResult(
        generation.result,
        "image-studio/generated/free-generation"
      );

      return NextResponse.json({
        success: true,
        result: persistedResult,
        modelUsed: generation.modelUsed,
        fallbackModelUsed: generation.fallbackModelUsed || undefined,
      });
    }

    if (!image || !prompt) {
      return NextResponse.json(
        { success: false, error: "缺少图片或提示词。" },
        { status: 400 }
      );
    }

    const generation = await runImageGenerationWithFallback({
      geminiApiKey,
      imageModel,
      prompt: buildModelSwapPrompt(prompt),
      images: [image],
      size: size || "1024x1536",
      fallbackSize: "1024x1024",
    });
    const persistedResult = await persistGeneratedImageResult(
      generation.result,
      "image-studio/generated/model-swap"
    );

    return NextResponse.json({
      success: true,
      result: persistedResult,
      modelUsed: generation.modelUsed,
      fallbackModelUsed: generation.fallbackModelUsed || undefined,
    });
  } catch (error) {
    console.error("Gemini route error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "服务器内部错误。",
      },
      { status: getGeminiErrorStatus(error) }
    );
  }
}
