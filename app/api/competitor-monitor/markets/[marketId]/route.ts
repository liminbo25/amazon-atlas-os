import { logRouteError, toErrorResponse } from "@/lib/ai-route-helpers";
import { getCompetitorMonitorMarketDetail } from "@/lib/competitor-monitor/service";

export const runtime = "nodejs";

interface MarketRouteContext {
  params: Promise<{
    marketId: string;
  }>;
}

export async function GET(_request: Request, context: MarketRouteContext) {
  try {
    const { marketId } = await context.params;
    return Response.json(await getCompetitorMonitorMarketDetail(marketId));
  } catch (error) {
    logRouteError("competitor-monitor-market-detail", error);
    return toErrorResponse(error, "competitor-monitor market detail lookup failed.");
  }
}
