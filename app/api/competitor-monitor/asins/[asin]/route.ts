import { logRouteError, toErrorResponse } from "@/lib/ai-route-helpers";
import { getCompetitorMonitorAsinDetail } from "@/lib/competitor-monitor/service";

export const runtime = "nodejs";

interface AsinRouteContext {
  params: Promise<{
    asin: string;
  }>;
}

export async function GET(request: Request, context: AsinRouteContext) {
  try {
    const { asin } = await context.params;
    const { searchParams } = new URL(request.url);

    return Response.json(
      await getCompetitorMonitorAsinDetail({
        asin,
        marketplace: searchParams.get("marketplace"),
      })
    );
  } catch (error) {
    logRouteError("competitor-monitor-asin-detail", error);
    return toErrorResponse(error, "competitor-monitor asin detail lookup failed.");
  }
}
