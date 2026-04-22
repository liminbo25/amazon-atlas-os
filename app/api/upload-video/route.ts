import {
  RouteError,
  readAiRuntimeConfig,
  logRouteError,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import { analyzeVideoUpload } from "@/lib/video-studio-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const runtimeConfig = readAiRuntimeConfig(readRuntimeBody(formData), request);
    const payload = await analyzeVideoUpload({ request, formData, runtimeConfig });

    return Response.json(payload);
  } catch (error) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("legacy-video-upload", error);
    }

    return toErrorResponse(error, "Video upload analysis failed.");
  }
}

function readRuntimeBody(formData: FormData): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const runtime = parseJsonField(formData.get("runtime"), "runtime");
  const runtimeConfig = parseJsonField(formData.get("runtimeConfig"), "runtimeConfig");

  if (runtime !== undefined) {
    body.runtime = runtime;
  }

  if (runtimeConfig !== undefined) {
    body.runtimeConfig = runtimeConfig;
  }

  return body;
}

function parseJsonField(
  value: FormDataEntryValue | null,
  fieldName: string
): Record<string, unknown> | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new RouteError(`${fieldName} must be a JSON string.`, {
      status: 400,
      code: "video_runtime_invalid",
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RouteError(`${fieldName} must be valid JSON.`, {
      status: 400,
      code: "video_runtime_invalid",
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RouteError(`${fieldName} must be a JSON object.`, {
      status: 400,
      code: "video_runtime_invalid",
    });
  }

  return parsed as Record<string, unknown>;
}
