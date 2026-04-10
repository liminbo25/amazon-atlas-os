import {
  RouteError,
  logRouteError,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import { readVideoGenerationTask } from "@/lib/video-studio-service";

export const runtime = "nodejs";

interface TaskRouteContext {
  params: Promise<{
    taskId: string;
  }>;
}

export async function GET(request: Request, context: TaskRouteContext) {
  try {
    const { taskId } = await context.params;
    const payload = await readVideoGenerationTask(request, taskId);

    return Response.json(payload);
  } catch (error) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("video-generation-task-read", error);
    }

    return toErrorResponse(error, "Video generation task lookup failed.");
  }
}
