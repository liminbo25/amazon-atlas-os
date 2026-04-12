import {
  isRecord,
  logRouteError,
  readJsonBody,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import {
  listCompetitorMonitorMarkets,
  parseCompetitorMonitorMarketInput,
  saveCompetitorMonitorMarket,
} from "@/lib/competitor-monitor/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(listCompetitorMonitorMarkets());
  } catch (error) {
    logRouteError("competitor-monitor-markets-list", error);
    return toErrorResponse(error, "competitor-monitor market list lookup failed.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      throw new Error("Request body must be a JSON object.");
    }

    return Response.json(
      saveCompetitorMonitorMarket(parseCompetitorMonitorMarketInput(body))
    );
  } catch (error) {
    logRouteError("competitor-monitor-markets-save", error);
    return toErrorResponse(error, "competitor-monitor market save failed.");
  }
}
