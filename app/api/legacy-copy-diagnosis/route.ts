import {
  RouteError,
  logRouteError,
  readJsonBody,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import {
  normalizeLegacyCopyDiagnosisError,
  runLegacyCopyDiagnosisRequest,
} from "@/lib/legacy-copy-diagnosis/run";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const response = await runLegacyCopyDiagnosisRequest(body, request);

    return Response.json(response);
  } catch (error) {
    error = normalizeLegacyCopyDiagnosisError(error);

    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("legacy-copy-diagnosis", error);
    }

    return toErrorResponse(error, "老品文案诊断失败。");
  }
}
