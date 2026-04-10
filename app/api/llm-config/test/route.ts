import { logRouteError, toErrorResponse } from "@/lib/ai-route-helpers";
import { testVideoLlmConnection } from "@/lib/video-llm-config";

export const runtime = "nodejs";

export async function POST() {
  try {
    return Response.json(await testVideoLlmConnection());
  } catch (error) {
    logRouteError("video-llm-config-test", error);
    return toErrorResponse(error, "Video LLM config test failed.");
  }
}
