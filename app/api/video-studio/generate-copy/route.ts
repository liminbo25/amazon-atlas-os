import {
  RouteError,
  ensureRecord,
  logRouteError,
  readAiRuntimeConfig,
  readJsonBody,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import { generateVideoCopyPlan } from "@/lib/video-studio-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const runtimeConfig = readAiRuntimeConfig(body);
    const form = ensureRecord(body.form, "form must be an object.", "video_copy_form_invalid");
    const manifest = ensureRecord(
      body.manifest,
      "manifest must be an object.",
      "video_copy_manifest_invalid"
    );
    const payload = await generateVideoCopyPlan({
      form,
      manifest,
      runtimeConfig,
    });

    return Response.json(payload);
  } catch (error) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("video-copy", error);
    }

    return toErrorResponse(error, "Video copy generation failed.");
  }
}
