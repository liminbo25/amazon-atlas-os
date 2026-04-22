import { NextRequest, NextResponse } from "next/server";
import {
  buildFashnAuthHeaders,
  getFashnErrorMessage,
  resolveFashnConfig,
  type FashnRunResponse,
} from "@/lib/fashn";
import { isSupportedImageUrl } from "@/lib/image-blob";
import { buildStrictTryOnPrompt } from "@/lib/tryon-prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

interface FashnTryOnRequest {
  clothingImage?: string;
  modelImage?: string;
  garmentNote?: string;
}

async function readFashnRunError(response: Response) {
  const responseText = await response.text();

  if (!responseText) {
    return `FASHN task creation failed with HTTP ${response.status}.`;
  }

  try {
    const data = JSON.parse(responseText) as { error?: unknown; detail?: string };
    return (
      getFashnErrorMessage(data.error, "") ||
      data.detail ||
      `FASHN task creation failed with HTTP ${response.status}.`
    );
  } catch {
    return responseText;
  }
}

export async function GET() {
  const config = resolveFashnConfig();
  const configured = Boolean(config.apiKey);

  return NextResponse.json({
    success: true,
    configured,
    provider: "fashn",
    fallbackProvider: "gemini",
    model: config.model,
    generationMode: config.generationMode,
    resolution: config.resolution,
    outputFormat: config.outputFormat,
    missingVariable: configured ? null : "FASHN_API_KEY",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FashnTryOnRequest;
    const config = resolveFashnConfig();

    if (!config.apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "缺少 FASHN_API_KEY，请先配置后再启用 FASHN Try-On Max。",
        },
        { status: 500 }
      );
    }

    if (!body.clothingImage || !body.modelImage) {
      return NextResponse.json(
        { success: false, error: "缺少服装图或模特图。" },
        { status: 400 }
      );
    }

    if (
      !isSupportedImageUrl(body.clothingImage) ||
      !isSupportedImageUrl(body.modelImage)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "FASHN 输入必须是公开图片 URL 或 data URL。",
        },
        { status: 400 }
      );
    }

    const prompt = buildStrictTryOnPrompt(body.garmentNote);
    const response = await fetch(`${config.baseUrl}/v1/run`, {
      method: "POST",
      headers: buildFashnAuthHeaders(config.apiKey),
      body: JSON.stringify({
        model_name: config.model,
        inputs: {
          model_image: body.modelImage,
          product_image: body.clothingImage,
          generation_mode: config.generationMode,
          resolution: config.resolution,
          output_format: config.outputFormat,
          num_images: 1,
          prompt,
        },
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: await readFashnRunError(response),
        },
        { status: response.status }
      );
    }

    const data = (await response.json()) as FashnRunResponse;

    if (!data.id) {
      return NextResponse.json(
        {
          success: false,
          error: "FASHN 已接受请求，但没有返回任务 ID。",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      provider: "fashn",
      jobId: data.id,
      status: "starting",
      model: config.model,
      generationMode: config.generationMode,
      resolution: config.resolution,
      outputFormat: config.outputFormat,
    });
  } catch (error) {
    console.error("FASHN try-on route error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "FASHN 换装任务创建失败。",
      },
      { status: 500 }
    );
  }
}
