import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type GeminiRequestType = "virtual-tryon" | "white-background" | "model-swap";

export interface GeminiRequest {
  image?: string;
  clothingImage?: string;
  modelImage?: string;
  prompt?: string;
  garmentNote?: string;
  type?: GeminiRequestType;
  size?: string;
}

export interface GeminiResponse {
  success: boolean;
  result?: string;
  error?: string;
}

const DEFAULT_API_BASE_URL = "https://ai.yijiarj.cn/v1";
const DEFAULT_MODEL = "nano_banana_pro";

function resolveApiBaseUrl(rawBaseUrl?: string) {
  const trimmed = rawBaseUrl?.trim();

  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }

  const normalized = trimmed.replace(/\/+$/, "");

  if (/\/v\d+$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}/v1`;
}

function resolveImageModel() {
  return (
    process.env.GEMINI_IMAGE_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    DEFAULT_MODEL
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

async function requestImageGeneration(
  apiBaseUrl: string,
  geminiApiKey: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(`${apiBaseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${geminiApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  return {
    ok: response.ok,
    status: response.status,
    responseText: await response.text(),
  };
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

async function runImageGeneration(options: {
  apiBaseUrl: string;
  geminiApiKey: string;
  payload: Record<string, unknown>;
  fallbackSize?: string;
}) {
  const { apiBaseUrl, geminiApiKey, payload, fallbackSize } = options;

  let apiResult = await requestImageGeneration(apiBaseUrl, geminiApiKey, payload);

  if (
    !apiResult.ok &&
    fallbackSize &&
    payload.size !== fallbackSize &&
    shouldRetryWithFallbackSize(apiResult.responseText, apiResult.status)
  ) {
    apiResult = await requestImageGeneration(apiBaseUrl, geminiApiKey, {
      ...payload,
      size: fallbackSize,
    });
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
    } = body;

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const apiBaseUrl = resolveApiBaseUrl(process.env.GEMINI_API_BASE_URL);
    const imageModel = resolveImageModel();

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
        apiBaseUrl,
        geminiApiKey,
        payload: {
          model: imageModel,
          prompt: buildVirtualTryOnPrompt(garmentNote),
          image: [
            normalizeImageForProvider(clothingImage),
            normalizeImageForProvider(modelImage),
          ],
          n: 1,
          size: size || "1024x1536",
          quality: "hd",
          style: "natural",
        },
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
        apiBaseUrl,
        geminiApiKey,
        payload: {
          model: imageModel,
          prompt: buildWhiteBackgroundPrompt(),
          image: [normalizeImageForProvider(image)],
          n: 1,
          size: size || "1024x1024",
          quality: "hd",
          style: "natural",
        },
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
      apiBaseUrl,
      geminiApiKey,
      payload: {
        model: imageModel,
        prompt: buildModelSwapPrompt(prompt),
        image: [normalizeImageForProvider(image)],
        n: 1,
        size: size || "1024x1536",
        quality: "hd",
        style: "natural",
      },
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
