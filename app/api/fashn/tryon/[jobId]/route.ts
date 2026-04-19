import { NextRequest, NextResponse } from "next/server";
import {
  buildFashnAuthHeaders,
  getFashnErrorMessage,
  resolveFashnConfig,
  type FashnStatusResponse,
} from "@/lib/fashn";
import { uploadImageSourceToBlob } from "@/lib/image-blob";

export const runtime = "nodejs";
export const maxDuration = 60;

interface TryOnStatusRouteContext {
  params: Promise<{
    jobId: string;
  }>;
}

async function readFashnStatusError(response: Response) {
  const responseText = await response.text();

  if (!responseText) {
    return `FASHN status lookup failed with HTTP ${response.status}.`;
  }

  try {
    const data = JSON.parse(responseText) as { error?: unknown; detail?: string };
    return (
      getFashnErrorMessage(data.error, "") ||
      data.detail ||
      `FASHN status lookup failed with HTTP ${response.status}.`
    );
  } catch {
    return responseText;
  }
}

export async function GET(
  _request: NextRequest,
  context: TryOnStatusRouteContext
) {
  try {
    const { jobId } = await context.params;
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

    const response = await fetch(
      `${config.baseUrl}/v1/status/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        headers: buildFashnAuthHeaders(config.apiKey),
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: await readFashnStatusError(response),
        },
        { status: response.status }
      );
    }

    const creditsUsed = response.headers.get("x-fashn-credits-used");
    const data = (await response.json()) as FashnStatusResponse;
    const providerStatus = data.status || "processing";

    if (providerStatus === "completed") {
      const sourceUrl = data.output?.[0];

      if (!sourceUrl) {
        return NextResponse.json(
          {
            success: false,
            error: "FASHN 任务已完成，但没有返回图片结果。",
          },
          { status: 502 }
        );
      }

      const uploadedResult = await uploadImageSourceToBlob(
        sourceUrl,
        "image-studio/generated/try-on"
      );

      return NextResponse.json({
        success: true,
        provider: "fashn",
        jobId,
        status: providerStatus,
        result: uploadedResult.url,
        sourceUrl,
        outputFormat: config.outputFormat,
        creditsUsed,
      });
    }

    if (providerStatus === "failed") {
      return NextResponse.json({
        success: true,
        provider: "fashn",
        jobId,
        status: providerStatus,
        error: getFashnErrorMessage(data.error, "FASHN 换装任务失败。"),
        creditsUsed,
      });
    }

    return NextResponse.json({
      success: true,
      provider: "fashn",
      jobId,
      status: providerStatus,
      creditsUsed,
    });
  } catch (error) {
    console.error("FASHN try-on status route error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "读取 FASHN 换装任务状态失败。",
      },
      { status: 500 }
    );
  }
}
