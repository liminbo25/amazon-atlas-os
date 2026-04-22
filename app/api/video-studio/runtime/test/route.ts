import {
  RouteError,
  ensureRecord,
  readAiRuntimeConfig,
  readJsonBody,
  requestAiTextCompletion,
  resolveAiConfig,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import {
  getVideoDefaultModel,
  resolveVideoAiRuntimeConfig,
} from "@/lib/video-llm-config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const service = readServiceNameFromSearchParams(request.url) ?? "copyGeneration";
    const effectiveRuntimeConfig = await resolveVideoAiRuntimeConfig();
    const config = resolveAiConfig({
      runtimeConfig: effectiveRuntimeConfig,
      defaultModel: getVideoDefaultModel(effectiveRuntimeConfig),
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

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const runtimeConfig = readAiRuntimeConfig(body);
    const service = readServiceName(body);
    const effectiveRuntimeConfig = await resolveVideoAiRuntimeConfig(runtimeConfig);
    const config = resolveAiConfig({
      runtimeConfig: effectiveRuntimeConfig,
      defaultModel: getVideoDefaultModel(effectiveRuntimeConfig),
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
): "frameAnalysis" | "copyGeneration" {
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

function readServiceNameFromSearchParams(
  url: string
): "frameAnalysis" | "copyGeneration" | null {
  const task = new URL(url).searchParams.get("task");

  if (!task) {
    return null;
  }

  if (task === "frameAnalysis" || task === "copyGeneration") {
    return task;
  }

  throw new RouteError('task must be "frameAnalysis" or "copyGeneration".', {
    status: 400,
    code: "video_runtime_task_invalid",
  });
}
