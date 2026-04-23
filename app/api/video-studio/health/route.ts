import { getVideoLlmPublicStatus } from "@/lib/video-llm-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    llm: await getVideoLlmPublicStatus(),
  });
}
