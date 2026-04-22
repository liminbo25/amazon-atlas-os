import {
  RouteError,
  logRouteError,
  normalizeNumberValue,
  normalizeStringValue,
  readAiRuntimeConfig,
  readJsonBody,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import { analyzeVideoPath } from "@/lib/video-studio-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const runtimeConfig = readAiRuntimeConfig(body, request);
    const videoPath = normalizeStringValue(body.video_path ?? body.videoPath);

    if (!videoPath) {
      throw new RouteError("video_path is required.", {
        status: 400,
        code: "video_path_required",
      });
    }

    const intervalSeconds = normalizeNumberValue(
      body.interval_seconds ?? body.intervalSeconds,
      {
        min: 1,
        max: 600,
        fallback: 110,
      }
    );
    const maxFrames = normalizeNumberValue(body.max_frames ?? body.maxFrames, {
      min: 1,
      max: 48,
      integer: true,
      fallback: 6,
    });

    const payload = await analyzeVideoPath({
      request,
      videoPath,
      intervalSeconds,
      maxFrames,
      runtimeConfig,
    });

    return Response.json(payload);
  } catch (error) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("video-analyze", error);
    }

    return toErrorResponse(error, "Video analysis failed.");
  }
}
