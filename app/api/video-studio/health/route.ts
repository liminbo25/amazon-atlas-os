import { getVideoLlmPublicStatus } from "@/lib/video-llm-config";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    status: "ok",
    llm: await getVideoLlmPublicStatus(),
  });
}
