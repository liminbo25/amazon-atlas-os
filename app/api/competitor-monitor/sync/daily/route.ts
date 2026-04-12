import { RouteError, logRouteError, toErrorResponse } from "@/lib/ai-route-helpers";
import {
  assertCompetitorMonitorCronSecret,
  runCompetitorMonitorDailySync,
} from "@/lib/competitor-monitor/sync-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertCompetitorMonitorCronSecret(request);
    const body = await readOptionalJsonBody(request);
    const marketId =
      typeof body.marketId === "string" && body.marketId.trim()
        ? body.marketId.trim()
        : null;

    return Response.json({
      sync: await runCompetitorMonitorDailySync({
        marketId,
        trigger: "cron",
      }),
    });
  } catch (error) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("competitor-monitor-sync-daily", error);
    }

    return toErrorResponse(error, "competitor-monitor daily sync failed.");
  }
}

async function readOptionalJsonBody(
  request: Request
): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (!raw.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new RouteError("Request body must be a JSON object.", {
        status: 400,
        code: "invalid_json_body",
      });
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RouteError) {
      throw error;
    }

    throw new RouteError("Request body must be valid JSON.", {
      status: 400,
      code: "invalid_json_body",
    });
  }
}
