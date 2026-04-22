import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type GeminiRequestType = "virtual-tryon" | "white-background" | "model-swap";
type GeminiImageModel = "nano_banana_pro" | "image2";

export interface GeminiRequest {
  image?: string;
  clothingImage?: string;
  modelImage?: string;
  prompt?: string;
  garmentNote?: string;
  type?: GeminiRequestType;
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
const GEMINI_UPSTREAM_CONNECT_TIMEOUT_MS = 30_000;
const GEMINI_UPSTREAM_RESPONSE_TIMEOUT_MS = 180_000;
const GEMINI_UPSTREAM_MAX_ATTEMPTS = 3;
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

function usesChatCompletionsModel(imageModel: GeminiImageModel) {
  return imageModel === "image2";
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
  payload: Record<string, unknown>
) {
  let lastNetworkError: unknown;

  for (let attempt = 1; attempt <= GEMINI_UPSTREAM_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await sendProviderRequest(
        apiBaseUrl,
        endpointPath,
        geminiApiKey,
        payload
      );

      if (
        shouldRetryUpstreamStatus(response.status, response.responseText) &&
        attempt < GEMINI_UPSTREAM_MAX_ATTEMPTS
      ) {
        await sleep(500 * attempt);
        continue;
      }

      return response;
    } catch (error) {
      lastNetworkError = error;

      if (
        isRetryableNetworkError(error) &&
        attempt < GEMINI_UPSTREAM_MAX_ATTEMPTS
      ) {
        await sleep(500 * attempt);
        continue;
      }

      throw new Error(formatNetworkError(error));
    }
  }

  throw new Error(formatNetworkError(lastNetworkError));
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

function buildChatCompletionMessages(prompt: string, images: string[]) {
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: prompt,
        },
        ...images.map((image) => ({
          type: "image_url",
          image_url: {
            url: image,
          },
        })),
      ],
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
              }>;
        };
      }>;
      error?: { message?: string };
    };
  } catch {
    throw new Error(
      `Chat completions returned unreadable content: ${responseText.slice(0, 200)}`
    );
  }
}

function extractImageFromChatCompletion(data: {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
}) {
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    return null;
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

  const markdownMatch = text.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);

  if (markdownMatch?.[1]) {
    return markdownMatch[1];
  }

  const urlMatch = text.match(/https?:\/\/[^\s)]+/i);
  return urlMatch?.[0] || null;
}

async function runImageGeneration(options: {
  geminiApiKey: string;
  imageModel: GeminiImageModel;
  prompt: string;
  images: string[];
  size: string;
  fallbackSize?: string;
}) {
  const { geminiApiKey, imageModel, prompt, images, size, fallbackSize } = options;
  const apiBaseUrl = resolveImageApiBaseUrl(imageModel);
  const normalizedImages = images.map((image) => normalizeImageForProvider(image));
  const normalizedSize = normalizeSizeForModel(imageModel, size, fallbackSize);

  if (usesChatCompletionsModel(imageModel)) {
    const apiResult = await requestProviderJson(
      apiBaseUrl,
      "/chat/completions",
      geminiApiKey,
      {
        model: imageModel,
        messages: buildChatCompletionMessages(prompt, normalizedImages),
        size: normalizedSize,
      }
    );

    if (!apiResult.ok) {
      throw new Error(
        `API request failed: ${apiResult.status} - ${apiResult.responseText}`
      );
    }

    const data = parseChatCompletionResponse(apiResult.responseText);
    const result = extractImageFromChatCompletion(data);

    if (result) {
      return result;
    }

    if (data.error?.message) {
      throw new Error(data.error.message);
    }

    throw new Error("Chat completions response did not include an image URL.");
  }

  const normalizedFallbackSize = fallbackSize
    ? normalizeSizeForModel(imageModel, fallbackSize, fallbackSize)
    : undefined;

  let apiResult = await requestProviderJson(
    apiBaseUrl,
    "/images/generations",
    geminiApiKey,
    {
      model: imageModel,
      prompt,
      image: normalizedImages,
      n: 1,
      size: normalizedSize,
      quality: "hd",
      style: "natural",
    }
  );

  if (
    !apiResult.ok &&
    normalizedFallbackSize &&
    normalizedSize !== normalizedFallbackSize &&
    shouldRetryWithFallbackSize(apiResult.responseText, apiResult.status)
  ) {
    apiResult = await requestProviderJson(
      apiBaseUrl,
      "/images/generations",
      geminiApiKey,
      {
        model: imageModel,
        prompt,
        image: normalizedImages,
        n: 1,
        size: normalizedFallbackSize,
        quality: "hd",
        style: "natural",
      }
    );
  }

  if (!apiResult.ok) {
    throw new Error(
      `API 请求失败：${apiResult.status} - ${apiResult.responseText}`
    );
  }

  const data = parseImageGenerationResponse(apiResult.responseText);
  const result = extractImageFromResponse(data);

  if (result) {
    return result;
  }

  if (data.error?.message) {
    throw new Error(data.error.message);
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

function buildVirtualTryOnPrompt(garmentNote?: string) {
  const noteText = garmentNote?.trim()
    ? `8. ADDITIONAL GARMENT NOTE: ${garmentNote.trim()}`
    : "";

  return `Virtual try-on task: transfer the exact clothing from image 1 onto the person in image 2.

CRITICAL REQUIREMENTS:
1. Preserve the exact garment from image 1 without redesigning it: pattern, color, texture, logo, trim, stitching, seams, lace motifs, mesh density, embroidery, beading, edges, and fabric appearance must remain unchanged.
2. If the garment contains mesh, lace, tulle, sheer panels, translucent fabric, crochet, openwork, cutwork, burnout texture, or layered transparency, keep those structures exactly. Do not simplify them into plain opaque fabric.
3. Preserve transparency and layer relationships exactly. If there is an outer sheer layer and an inner opaque lining, keep both layers visible and separate. Do not merge double-layer construction into a single flat fabric.
4. Preserve garment geometry exactly: neckline, straps, sleeve shape, hemline, length, fit silhouette, cut lines, panel placement, and openings must stay faithful to image 1.
5. Only replace the clothing area. Keep the person's face, body, pose, hands, legs, hair, skin tone, and scene from image 2 natural and coherent.
6. Fit the garment realistically to the person's pose and body shape while keeping the original drape, wrinkles, tension, and material behavior. If there is any conflict, prioritize preserving garment details over inventing smoother fabric.
7. Maintain crisp e-commerce-level detail. Do not blur, smooth out, over-beautify, overpaint, or erase fine textile detail. Do not convert lace, mesh, or net texture into chiffon, satin, silk, plastic, or generic soft fabric.
${noteText}

OUTPUT: one high-quality realistic image.`;
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GeminiRequest;
    const {
      image,
      prompt,
      clothingImage,
      modelImage,
      garmentNote,
      type = "model-swap",
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

      const result = await runImageGeneration({
        geminiApiKey,
        imageModel,
        prompt: buildVirtualTryOnPrompt(garmentNote),
        images: [clothingImage, modelImage],
        size: size || DEFAULT_GEMINI_TRYON_SIZE,
        fallbackSize: "1024x1024",
      });

      return NextResponse.json({
        success: true,
        result,
      });
    }

    if (type === "white-background") {
      if (!image) {
        return NextResponse.json(
          { success: false, error: "缺少待换白底的图片。" },
          { status: 400 }
        );
      }

      const result = await runImageGeneration({
        geminiApiKey,
        imageModel,
        prompt: buildWhiteBackgroundPrompt(),
        images: [image],
        size: size || "1024x1024",
        fallbackSize: "1024x1024",
      });

      return NextResponse.json({
        success: true,
        result,
      });
    }

    if (!image || !prompt) {
      return NextResponse.json(
        { success: false, error: "缺少图片或提示词。" },
        { status: 400 }
      );
    }

    const result = await runImageGeneration({
      geminiApiKey,
      imageModel,
      prompt: buildModelSwapPrompt(prompt),
      images: [image],
      size: size || "1024x1536",
      fallbackSize: "1024x1024",
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Gemini route error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "服务器内部错误。",
      },
      { status: 500 }
    );
  }
}
