import "server-only";

import { RouteError } from "@/lib/ai-route-helpers";

import {
  adaptCompetitorMonitorAlertCenter,
  adaptCompetitorMonitorAsinDetail,
  adaptCompetitorMonitorDashboard,
  adaptCompetitorMonitorMarketDetail,
  adaptCompetitorMonitorMarketList,
  buildCompetitorMonitorUiMeta,
} from "./adapter";
import {
  getCompetitorMonitorAsinDetail,
  getCompetitorMonitorDashboard,
  getCompetitorMonitorMarketDetail,
  listCompetitorMonitorAlerts,
  listCompetitorMonitorMarkets,
} from "./service";
import type {
  CompetitorMonitorUiAlertCenterData,
  CompetitorMonitorUiAsinDetailData,
  CompetitorMonitorUiDashboardData,
  CompetitorMonitorUiMarketDetailData,
  CompetitorMonitorUiMarketListData,
  CompetitorMonitorUiResponse,
} from "./view-model";

type MarketFilters = {
  query?: string;
  health?: string;
};

type AlertFilters = {
  query?: string;
  marketId?: string;
  severity?: string;
  status?: string;
};

export const competitorMonitorClient = {
  async getDashboard(): Promise<
    CompetitorMonitorUiResponse<CompetitorMonitorUiDashboardData>
  > {
    const dashboard = await getCompetitorMonitorDashboard();
    const marketDetails = await loadMarketDetails(dashboard.markets.map((market) => market.id));

    return {
      data: adaptCompetitorMonitorDashboard({
        dashboard,
        marketDetails,
      }),
      meta: buildCompetitorMonitorUiMeta(),
    };
  },

  async listMarkets(
    filters: MarketFilters = {}
  ): Promise<CompetitorMonitorUiResponse<CompetitorMonitorUiMarketListData>> {
    const marketList = await listCompetitorMonitorMarkets();
    const marketDetails = await loadMarketDetails(marketList.markets.map((market) => market.id));

    return {
      data: adaptCompetitorMonitorMarketList({
        markets: marketList.markets,
        marketDetails,
        filters,
      }),
      meta: buildCompetitorMonitorUiMeta(),
    };
  },

  async getMarket(
    marketId: string
  ): Promise<CompetitorMonitorUiResponse<CompetitorMonitorUiMarketDetailData> | null> {
    try {
      const response = await getCompetitorMonitorMarketDetail(marketId);

      return {
        data: {
          market: adaptCompetitorMonitorMarketDetail(response.market),
        },
        meta: buildCompetitorMonitorUiMeta(),
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  },

  async getAsin(
    asin: string
  ): Promise<CompetitorMonitorUiResponse<CompetitorMonitorUiAsinDetailData> | null> {
    const relatedMarkets = await findMarketsContainingAsin(asin);
    if (relatedMarkets.length === 0) {
      return null;
    }

    try {
      const response = await getCompetitorMonitorAsinDetail({
        asin,
        marketplace: relatedMarkets[0].marketplace,
      });

      return {
        data: {
          asin: adaptCompetitorMonitorAsinDetail({
            asin: response.asin,
            relatedMarkets,
          }),
        },
        meta: buildCompetitorMonitorUiMeta(),
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  },

  async listAlerts(
    filters: AlertFilters = {}
  ): Promise<CompetitorMonitorUiResponse<CompetitorMonitorUiAlertCenterData>> {
    const marketList = await listCompetitorMonitorMarkets();
    const marketDetails = await loadMarketDetails(marketList.markets.map((market) => market.id));
    const marketData = adaptCompetitorMonitorMarketList({
      markets: marketList.markets,
      marketDetails,
    });
    const alerts = await listCompetitorMonitorAlerts({
      marketId: filters.marketId ?? null,
      status: normalizeAlertStatus(filters.status),
      limit: 200,
    });

    return {
      data: adaptCompetitorMonitorAlertCenter({
        alerts,
        markets: marketData.items,
        filters,
      }),
      meta: buildCompetitorMonitorUiMeta(),
    };
  },
};

async function findMarketsContainingAsin(asin: string) {
  const marketList = await listCompetitorMonitorMarkets();
  const marketDetails = await loadMarketDetails(marketList.markets.map((market) => market.id));

  return marketDetails.filter((market) =>
    market.asins.some((row) => row.asin === asin.toUpperCase())
  );
}

async function loadMarketDetails(marketIds: string[]) {
  return Promise.all(
    marketIds.map(async (marketId) => (await getCompetitorMonitorMarketDetail(marketId)).market)
  );
}

function normalizeAlertStatus(
  value: string | undefined
): "open" | "resolved" | "all" | null {
  if (!value || value === "open") {
    return "open";
  }

  if (value === "resolved" || value === "all") {
    return value;
  }

  return "open";
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof RouteError && error.status === 404;
}
