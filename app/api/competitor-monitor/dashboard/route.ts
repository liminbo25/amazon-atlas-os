import { logRouteError, toErrorResponse } from "@/lib/ai-route-helpers";
import { getCompetitorMonitorDashboard } from "@/lib/competitor-monitor/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(getCompetitorMonitorDashboard());
  } catch (error) {
    logRouteError("competitor-monitor-dashboard", error);
    return toErrorResponse(error, "competitor-monitor dashboard lookup failed.");
  }
}
