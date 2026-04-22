import {
  RouteError,
  isRecord,
  readAiRuntimeConfig,
  readJsonBody,
  requestAiTextCompletion,
  resolveAiConfig,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import { getListingDefaultModel } from "@/lib/listing-ai-runtime";

const DEFAULT_MODEL_BY_SERVICE = {
  imageAnalysis: getListingDefaultModel("imageAnalysis"),
  vocAnalysis: getListingDefaultModel("vocAnalysis"),
  listingGeneration: getListingDefaultModel("listingGeneration"),
  legacyCopyDiagnosis: getListingDefaultModel("legacyCopyDiagnosis"),
} as const;

const FALLBACK_RUNTIME_TEST_SERVICE: keyof typeof DEFAULT_MODEL_BY_SERVICE =
  "vocAnalysis";

export async function GET(request: Request) {
  try {
    const service = readServiceNameFromSearchParams(request.url);
    const config = resolveAiConfig({
      defaultModel: service
        ? DEFAULT_MODEL_BY_SERVICE[service]
        : DEFAULT_MODEL_BY_SERVICE[FALLBACK_RUNTIME_TEST_SERVICE],
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

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const runtimeConfig = readAiRuntimeConfig(body);
    const service = readServiceName(body);
    const config = resolveAiConfig({
      runtimeConfig,
      defaultModel: service
        ? DEFAULT_MODEL_BY_SERVICE[service]
        : DEFAULT_MODEL_BY_SERVICE[FALLBACK_RUNTIME_TEST_SERVICE],
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
  if (
    task === "imageAnalysis" ||
    task === "vocAnalysis" ||
    task === "listingGeneration" ||
    task === "legacyCopyDiagnosis"
  ) {
    return task;
  }

  throw new RouteError(
    'runtime.task must be one of "imageAnalysis", "vocAnalysis", "listingGeneration", or "legacyCopyDiagnosis".',
    {
      status: 400,
      code: "runtime_task_invalid",
    }
  );
}

function readServiceNameFromSearchParams(
  url: string
): keyof typeof DEFAULT_MODEL_BY_SERVICE | null {
  const task = new URL(url).searchParams.get("task");

  if (!task) {
    return null;
  }

  if (
    task === "imageAnalysis" ||
    task === "vocAnalysis" ||
    task === "listingGeneration" ||
    task === "legacyCopyDiagnosis"
  ) {
    return task;
  }

  throw new RouteError(
    'task must be one of "imageAnalysis", "vocAnalysis", "listingGeneration", or "legacyCopyDiagnosis".',
    {
      status: 400,
      code: "runtime_task_invalid",
    }
  );
}
