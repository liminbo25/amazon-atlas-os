import { NextRequest, NextResponse } from "next/server";
import Replicate, { type FileOutput } from "replicate";

export const runtime = "nodejs";

type UpscaleMode = "target" | "factor";
type OutputFormat = "jpg" | "png" | "webp";

interface UpscaleSettingsRequest {
  upscaleMode?: string;
  target?: number;
  factor?: number;
  enhanceDetails?: boolean;
  enhanceRealism?: boolean;
  outputFormat?: string;
  outputQuality?: number;
}

interface UpscaleRequest {
  image?: string;
  settings?: UpscaleSettingsRequest;
}

const REPLICATE_MODEL = "prunaai/p-image-upscale";

function getReplicateToken() {
  return process.env.REPLICATE_API_TOKEN;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(clampNumber(value!, min, max));
}

function normalizeFloat(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return clampNumber(value!, min, max);
}

function normalizeSettings(settings: UpscaleSettingsRequest = {}) {
  const upscaleMode: UpscaleMode =
    settings.upscaleMode === "factor" ? "factor" : "target";
  const outputFormat: OutputFormat =
    settings.outputFormat === "png" ||
    settings.outputFormat === "webp" ||
    settings.outputFormat === "jpg"
      ? settings.outputFormat
      : "jpg";

  return {
    upscaleMode,
    target: normalizeInteger(settings.target, 4, 1, 8),
    factor: normalizeFloat(settings.factor, 2, 1, 8),
    enhanceDetails: Boolean(settings.enhanceDetails),
    enhanceRealism: Boolean(settings.enhanceRealism),
    outputFormat,
    outputQuality: normalizeInteger(settings.outputQuality, 80, 0, 100),
  };
}

function getFileExtension(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}

function toReplicateImageInput(image: string) {
  if (image.startsWith("http://") || image.startsWith("https://")) {
    return image;
  }

  const match = image.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/);

  if (!match) {
    throw new Error("增强输入必须是图片 URL 或 base64 data URL。");
  }

  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");

  return new File([buffer], `image-upscale.${getFileExtension(mimeType)}`, {
    type: mimeType,
  });
}

function getOutputUrl(output: FileOutput | FileOutput[] | string | string[]) {
  const firstOutput = Array.isArray(output) ? output[0] : output;

  if (!firstOutput) {
    return null;
  }

  if (typeof firstOutput === "string") {
    return firstOutput;
  }

  return firstOutput.url().toString();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpscaleRequest;

    if (!body.image) {
      return NextResponse.json(
        { success: false, error: "缺少待增强的图片。" },
        { status: 400 }
      );
    }

    const replicateToken = getReplicateToken();

    if (!replicateToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "缺少 REPLICATE_API_TOKEN，请先在环境变量中配置后再使用高清增强。",
        },
        { status: 500 }
      );
    }

    const settings = normalizeSettings(body.settings);

    const replicate = new Replicate({
      auth: replicateToken,
      fileEncodingStrategy: "upload",
      useFileOutput: true,
    });

    const output = (await replicate.run(REPLICATE_MODEL, {
      input: {
        image: toReplicateImageInput(body.image),
        upscale_mode: settings.upscaleMode,
        target: settings.target,
        factor: settings.factor,
        enhance_details: settings.enhanceDetails,
        enhance_realism: settings.enhanceRealism,
        output_format: settings.outputFormat,
        output_quality: settings.outputQuality,
        no_op: false,
      },
    })) as FileOutput | FileOutput[] | string | string[];

    const result = getOutputUrl(output);

    if (!result) {
      throw new Error("Replicate 没有返回可用的增强图片。");
    }

    return NextResponse.json({
      success: true,
      result,
      model: REPLICATE_MODEL,
      settings,
    });
  } catch (error) {
    console.error("Upscale route error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "图片增强失败，请稍后重试。",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const configured = Boolean(getReplicateToken());

  return NextResponse.json({
    success: true,
    configured,
    model: REPLICATE_MODEL,
    missingVariable: configured ? null : "REPLICATE_API_TOKEN",
  });
}
