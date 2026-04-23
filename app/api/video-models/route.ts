import { listVideoModels } from "@/lib/video-studio-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ models: listVideoModels() });
}
