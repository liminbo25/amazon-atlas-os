import {
  RouteError,
  ensureRecord,
  readAiRuntimeConfig,
  readJsonBody,
  requestAiTextCompletion,
  resolveAiConfig,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import { resolveVideoAiRuntimeConfig } from "@/lib/video-llm-config";

const DEFAULT_MODEL_BY_SERVICE = {
  frameAnalysis: "claude-sonnet-4-20250514",
  copyGeneration: "claude-sonnet-4-20250514",
} as const;

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const runtimeConfig = readAiRuntimeConfig(body, request);
    const service = readServiceName(body);
    const effectiveRuntimeConfig = await resolveVideoAiRuntimeConfig(runtimeConfig);
    const config = resolveAiConfig({
      runtimeConfig: effectiveRuntimeConfig,
      defaultModel: DEFAULT_MODEL_BY_SERVICE[service],
    });

    const output = await requestAiTextCompletion({
      config,
      operationName: "video runtime connectivity test",
      systemPrompt:
        "You are validating AI connectivity for an internal commerce video tool. Reply with a very short plain-text acknowledgement.",
      userPrompt:
        service === "frameAnalysis"
          ? "Return one short plain-text response confirming that the model is reachable for frame analysis."
          : "Return one short plain-text response confirming that the model is reachable for script generation.",
      maxTokens: 32,
      temperature: 0,
    });

    return Response.json({
      ok: true,
      provider: config.provider,
      baseURL: config.baseURL,
      model: config.model,
      outputPreview: output.trim().slice(0, 160),
    });
  } catch (error) {
    return toErrorResponse(error, "Video runtime test failed.");
  }
}

function readServiceName(
  body: Record<string, unknown>
): keyof typeof DEFAULT_MODEL_BY_SERVICE {
  const runtime = ensureRecord(
    body.runtime,
    "runtime must be an object.",
    "video_runtime_invalid"
  );
  const task = runtime.task;

  if (task === "frameAnalysis" || task === "copyGeneration") {
    return task;
  }

  throw new RouteError(
    'runtime.task must be "frameAnalysis" or "copyGeneration".',
    {
      status: 400,
      code: "video_runtime_task_invalid",
    }
  );
}
