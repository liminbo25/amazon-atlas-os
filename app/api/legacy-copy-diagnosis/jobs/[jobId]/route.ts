import { RouteError, toErrorResponse } from "@/lib/ai-route-helpers";
import { readLegacyCopyDiagnosisJob } from "@/lib/legacy-copy-diagnosis/jobs";

export const runtime = "nodejs";

interface JobRouteContext {
  params: Promise<{
    jobId: string;
  }>;
}

export async function GET(_request: Request, context: JobRouteContext) {
  try {
    const { jobId } = await context.params;
    const normalizedJobId = jobId.trim();

    if (!normalizedJobId) {
      throw new RouteError("Job id is required.", {
        status: 400,
        code: "legacy_copy_diagnosis_job_id_required",
      });
    }

    const job = await readLegacyCopyDiagnosisJob(normalizedJobId);

    if (!job) {
      throw new RouteError("Legacy copy diagnosis job was not found.", {
        status: 404,
        code: "legacy_copy_diagnosis_job_not_found",
      });
    }

    return Response.json({ job });
  } catch (error) {
    return toErrorResponse(error, "Unable to read legacy copy diagnosis job.");
  }
}
