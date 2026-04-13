import {
  RouteError,
  isRecord,
  readAiRuntimeConfig,
  readJsonBody,
  requestAiTextCompletion,
  resolveAiConfig,
  toErrorResponse,
} from "@/lib/ai-route-helpers";

const DEFAULT_MODEL_BY_SERVICE = {
  imageAnalysis: "vision-model",
  vocAnalysis: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
  listingGeneration: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
} as const;

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const runtimeConfig = readAiRuntimeConfig(body);
    const service = readServiceName(body);
    const config = resolveAiConfig({
      runtimeConfig,
      defaultModel: service ? DEFAULT_MODEL_BY_SERVICE[service] : undefined,
    });

    const output = await requestAiTextCompletion({
      config,
      operationName: "runtime connectivity test",
      systemPrompt:
        "You are validating AI connectivity for an internal tool. Reply with a very short plain-text acknowledgement.",
      userPrompt:
        "Return a very short plain-text response that confirms the model is reachable. Do not use markdown or JSON.",
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
    return toErrorResponse(error, "AI runtime test failed.");
  }
}

function readServiceName(
  body: Record<string, unknown>
): keyof typeof DEFAULT_MODEL_BY_SERVICE | null {
  const runtime = body.runtime;
  if (!isRecord(runtime)) {
    return null;
  }

  const task = runtime.task;
  if (task === "imageAnalysis" || task === "vocAnalysis" || task === "listingGeneration") {
    return task;
  }

  throw new RouteError(
    'runtime.task must be one of "imageAnalysis", "vocAnalysis", or "listingGeneration".',
    {
      status: 400,
      code: "runtime_task_invalid",
    }
  );
}
