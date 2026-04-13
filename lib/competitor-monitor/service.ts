import { RouteError } from "@/lib/ai-route-helpers";

import { getCompetitorMonitorRepository } from "./repository";
import type {
  CompetitorMonitorAlertListResponse,
  CompetitorMonitorAsinDetailResponse,
  CompetitorMonitorDashboardResponse,
  CompetitorMonitorMarketDetailResponse,
  CompetitorMonitorMarketInput,
  CompetitorMonitorMarketListResponse,
  CompetitorMonitorMarketMutationResponse,
} from "./types";

export function getCompetitorMonitorDefaultMarketplace(): string {
  return process.env.COMPETITOR_MONITOR_DEFAULT_MARKETPLACE?.trim().toUpperCase() || "US";
}

export function parseCompetitorMonitorMarketInput(
  value: Record<string, unknown>
): CompetitorMonitorMarketInput {
  const name = normalizeRequiredString(value.name, "name");
  const marketplace = normalizeMarketplace(value.marketplace);
  const description = normalizeOptionalString(value.description);
  const asins = normalizeAsins(value.asins);
  const id = normalizeOptionalString(value.id) || undefined;

  return {
    id,
    name,
    marketplace,
    description,
    asins,
    isActive: value.isActive === undefined ? true : Boolean(value.isActive),
  };
}

export async function saveCompetitorMonitorMarket(
  input: CompetitorMonitorMarketInput
): Promise<CompetitorMonitorMarketMutationResponse> {
  const repository = getCompetitorMonitorRepository();
  const normalizedInput = {
    id: input.id,
    name: normalizeRequiredString(input.name, "name"),
    marketplace: normalizeMarketplace(input.marketplace),
    description: normalizeOptionalString(input.description),
    asins: normalizeAsins(input.asins),
    isActive: input.isActive ?? true,
  };

  const saved = await repository.saveMarket(normalizedInput);
  const market = await repository.getMarketDetail(saved.marketId);
  if (!market) {
    throw new RouteError("competitor-monitor market could not be loaded after save.", {
      status: 500,
      code: "competitor_monitor_market_save_failed",
    });
  }

  return {
    market,
    created: saved.created,
  };
}

export async function getCompetitorMonitorDashboard(): Promise<CompetitorMonitorDashboardResponse> {
  const repository = getCompetitorMonitorRepository();
  return {
    summary: await repository.getDashboardSummary(
      getCompetitorMonitorDefaultMarketplace()
    ),
    markets: await repository.listMarkets(),
    alerts: await repository.listAlerts({
      status: "open",
      limit: 10,
    }),
  };
}

export async function listCompetitorMonitorMarkets(): Promise<CompetitorMonitorMarketListResponse> {
  return {
    markets: await getCompetitorMonitorRepository().listMarkets(),
  };
}

export async function getCompetitorMonitorMarketDetail(
  marketId: string
): Promise<CompetitorMonitorMarketDetailResponse> {
  const market = await getCompetitorMonitorRepository().getMarketDetail(
    normalizeRequiredString(marketId, "marketId")
  );
  if (!market) {
    throw new RouteError("competitor-monitor market was not found.", {
      status: 404,
      code: "competitor_monitor_market_not_found",
    });
  }

  return { market };
}

export async function getCompetitorMonitorAsinDetail(options: {
  asin: string;
  marketplace?: string | null;
}): Promise<CompetitorMonitorAsinDetailResponse> {
  const asin = normalizeAsin(options.asin, "asin");
  const marketplace = normalizeMarketplace(options.marketplace);
  const detail = await getCompetitorMonitorRepository().getAsinDetail(asin, marketplace);
  if (!detail) {
    throw new RouteError("competitor-monitor asin was not found.", {
      status: 404,
      code: "competitor_monitor_asin_not_found",
    });
  }

  return {
    asin: detail,
  };
}

export async function listCompetitorMonitorAlerts(options: {
  marketId?: string | null;
  marketplace?: string | null;
  asin?: string | null;
  status?: "open" | "resolved" | "all" | null;
  limit?: number | null;
}): Promise<CompetitorMonitorAlertListResponse> {
  return {
    alerts: await getCompetitorMonitorRepository().listAlerts({
      marketId: normalizeOptionalString(options.marketId) || undefined,
      marketplace: options.marketplace
        ? normalizeMarketplace(options.marketplace)
        : undefined,
      asin: options.asin ? normalizeAsin(options.asin, "asin") : undefined,
      status: normalizeAlertStatus(options.status),
      limit:
        typeof options.limit === "number" && Number.isFinite(options.limit)
          ? Math.max(1, Math.min(Math.trunc(options.limit), 200))
          : 50,
    }),
  };
}

function normalizeMarketplace(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim().toUpperCase();
  }

  return getCompetitorMonitorDefaultMarketplace();
}

function normalizeAsins(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new RouteError("asins must be an array.", {
      status: 400,
      code: "competitor_monitor_asins_invalid",
    });
  }

  const normalized = Array.from(
    new Set(
      value
        .filter((asin): asin is string => typeof asin === "string")
        .map((asin) => normalizeAsin(asin, "asin"))
    )
  );

  if (normalized.length === 0) {
    throw new RouteError("At least one ASIN is required.", {
      status: 400,
      code: "competitor_monitor_asins_required",
    });
  }

  return normalized;
}

function normalizeAsin(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new RouteError(`${fieldName} must be a string.`, {
      status: 400,
      code: "competitor_monitor_asin_invalid",
    });
  }

  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(normalized)) {
    throw new RouteError(`${fieldName} must be a valid 10-character ASIN.`, {
      status: 400,
      code: "competitor_monitor_asin_invalid",
    });
  }

  return normalized;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RouteError(`${fieldName} is required.`, {
      status: 400,
      code: `competitor_monitor_${fieldName}_required`,
    });
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAlertStatus(
  value: "open" | "resolved" | "all" | null | undefined
): "open" | "resolved" | "all" {
  if (value === undefined || value === null) {
    return "open";
  }

  if (value === "open" || value === "resolved" || value === "all") {
    return value;
  }

  throw new RouteError("status must be open, resolved, or all.", {
    status: 400,
    code: "competitor_monitor_alert_status_invalid",
  });
}
