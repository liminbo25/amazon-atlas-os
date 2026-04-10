import {
  RouteError,
  logRouteError,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import { createVideoGenerationTask } from "@/lib/video-studio-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const payload = await createVideoGenerationTask(request, formData);

    return Response.json(payload);
  } catch (error) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("legacy-video-generation-task", error);
    }

    return toErrorResponse(error, "Video generation task failed.");
  }
}
