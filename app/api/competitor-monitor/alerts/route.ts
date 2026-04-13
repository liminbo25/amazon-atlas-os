import { logRouteError, toErrorResponse } from "@/lib/ai-route-helpers";
import { listCompetitorMonitorAlerts } from "@/lib/competitor-monitor/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitValue = searchParams.get("limit");
    const parsedLimit =
      typeof limitValue === "string" && limitValue.trim()
        ? Number.parseInt(limitValue, 10)
        : null;

    return Response.json(
      await listCompetitorMonitorAlerts({
        marketId: searchParams.get("marketId"),
        marketplace: searchParams.get("marketplace"),
        asin: searchParams.get("asin"),
        status: (searchParams.get("status") as "open" | "resolved" | "all" | null) ?? "open",
        limit: Number.isFinite(parsedLimit) ? parsedLimit : null,
      })
    );
  } catch (error) {
    logRouteError("competitor-monitor-alerts", error);
    return toErrorResponse(error, "competitor-monitor alerts lookup failed.");
  }
}
