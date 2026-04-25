import { after } from "next/server";

import {
  RouteError,
  isRecord,
  logRouteError,
  readJsonBody,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import {
  normalizeLegacyCopyDiagnosisError,
  runLegacyCopyDiagnosisRequest,
} from "@/lib/legacy-copy-diagnosis/run";
import {
  createLegacyCopyDiagnosisJob,
  updateLegacyCopyDiagnosisJob,
  type LegacyCopyDiagnosisJob,
} from "@/lib/legacy-copy-diagnosis/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const metadata = readJobMetadata(body);
    const job = await createLegacyCopyDiagnosisJob(metadata);
    const runtimeRequest = new Request(request.url, {
      headers: request.headers,
    });

    after(async () => {
      await runJob(job.id, body, runtimeRequest);
    });

    return Response.json(
      {
        job,
        jobId: job.id,
      },
      {
        status: 202,
      }
    );
  } catch (error) {
    return toErrorResponse(error, "Unable to start legacy copy diagnosis job.");
  }
}

async function runJob(
  jobId: string,
  body: Record<string, unknown>,
  request: Request
): Promise<void> {
  const startedAt = new Date().toISOString();

  await updateLegacyCopyDiagnosisJob(jobId, {
    status: "running",
    phase: "collecting_seller_sprite",
    phaseLabel: "Collecting SellerSprite listing, keyword, and review signals",
    progress: 10,
    startedAt,
  });

  try {
    const result = await runLegacyCopyDiagnosisRequest(
      body,
      request,
      async (progress) => {
        await updateLegacyCopyDiagnosisJob(jobId, {
          status: "running",
          phase: progress.phase,
          phaseLabel: progress.phaseLabel,
          progress: progress.progress,
        });
      }
    );

    await updateLegacyCopyDiagnosisJob(jobId, {
      status: "succeeded",
      phase: "complete",
      phaseLabel: "Diagnosis report complete",
      progress: 100,
      completedAt: new Date().toISOString(),
      result,
      error: null,
      code: null,
    });
  } catch (error) {
    const normalizedError = normalizeLegacyCopyDiagnosisError(error);

    if (!(normalizedError instanceof RouteError) || normalizedError.status >= 500) {
      logRouteError("legacy-copy-diagnosis-job", normalizedError);
    }

    await updateLegacyCopyDiagnosisJob(jobId, {
      status: "failed",
      phase: "failed",
      phaseLabel: "Diagnosis failed",
      progress: 100,
      completedAt: new Date().toISOString(),
      error:
        normalizedError instanceof Error
          ? normalizedError.message
          : "Legacy copy diagnosis failed.",
      code: normalizedError instanceof RouteError ? normalizedError.code : "unexpected_error",
    });
  }
}

function readJobMetadata(body: Record<string, unknown>): Pick<
  LegacyCopyDiagnosisJob,
  "marketplace" | "targetAsin" | "competitorCount"
> {
  const marketplace =
    typeof body.marketplace === "string" && body.marketplace.trim()
      ? body.marketplace.trim().toUpperCase()
      : "US";
  const targetAsin =
    typeof body.targetAsin === "string" ? body.targetAsin.trim().toUpperCase() : "";

  if (!/^[A-Z0-9]{10}$/.test(targetAsin)) {
    throw new RouteError("Please provide a valid target ASIN.", {
      status: 400,
      code: "target_asin_required",
    });
  }

  return {
    marketplace,
    targetAsin,
    competitorCount: readCompetitorCount(body.competitorAsins),
  };
}

function readCompetitorCount(value: unknown): number {
  if (Array.isArray(value)) {
    return value.filter(
      (item) => typeof item === "string" && /^[A-Z0-9]{10}$/.test(item.trim().toUpperCase())
    ).length;
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[\s,，;；]+/)
      .map((item) => item.trim().toUpperCase())
      .filter((item) => /^[A-Z0-9]{10}$/.test(item)).length;
  }

  if (isRecord(value)) {
    return 0;
  }

  return 0;
}
