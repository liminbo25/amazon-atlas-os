import {
  isRecord,
  logRouteError,
  readJsonBody,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import {
  getVideoLlmPublicStatus,
  saveVideoLlmConfig,
} from "@/lib/video-llm-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    llm: await getVideoLlmPublicStatus(),
  });
}

export async function PUT(request: Request) {
  try {
    const body = await readJsonBody(request);
    const payload =
      body.llm !== undefined && isRecord(body.llm) ? body.llm : body;
    const llm = await saveVideoLlmConfig(payload);

    return Response.json({ llm });
  } catch (error) {
    logRouteError("video-runtime-config", error);
    return toErrorResponse(error, "Video runtime config update failed.");
  }
}
