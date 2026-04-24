import { createHash } from "node:crypto";

import { RouteError } from "@/lib/ai-route-helpers";
import { fetchCompetitorData } from "@/lib/seller-sprite-client";
import type { ReviewData, TrafficKeyword } from "@/lib/types";

import { buildCompetitorMonitorAlerts } from "./alert-service";
import { getCompetitorMonitorRepository } from "./repository";
import type {
  CompetitorMonitorAsinObservation,
  CompetitorMonitorComparableSnapshot,
  CompetitorMonitorSyncAsinResult,
  CompetitorMonitorSyncMarketResult,
  CompetitorMonitorSyncSummary,
  CompetitorMonitorSyncTrigger,
} from "./types";

const DEFAULT_SYNC_MIN_INTERVAL_MS = 60_000;
const activeSyncKeys = new Set<string>();
const lastSyncStartedAtByKey = new Map<string, number>();

export function assertCompetitorMonitorCronSecret(request: Request): void {
  const expected =
    process.env.COMPETITOR_MONITOR_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();
  if (!expected) {
    throw new RouteError(
      "COMPETITOR_MONITOR_CRON_SECRET or CRON_SECRET is required for competitor-monitor sync.",
      {
        status: 500,
        code: "competitor_monitor_cron_secret_missing",
      }
    );
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const headerSecret =
    request.headers.get("x-competitor-monitor-secret")?.trim() ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : headerSecret;

  if (!token || token !== expected) {
    throw new RouteError("Invalid competitor-monitor cron secret.", {
      status: 401,
      code: "competitor_monitor_cron_secret_invalid",
    });
  }
}

export async function runCompetitorMonitorDailySync(options: {
  marketId?: string | null;
  trigger?: CompetitorMonitorSyncTrigger;
} = {}): Promise<CompetitorMonitorSyncSummary> {
  const lockKey = options.marketId?.trim() || "all-markets";
  const now = Date.now();
  const minIntervalMs = readPositiveIntegerEnv(
    "COMPETITOR_MONITOR_SYNC_MIN_INTERVAL_MS",
    DEFAULT_SYNC_MIN_INTERVAL_MS
  );
  const previousStart = lastSyncStartedAtByKey.get(lockKey) ?? 0;

  if (activeSyncKeys.has(lockKey)) {
    throw new RouteError("competitor-monitor sync is already running.", {
      status: 409,
      code: "competitor_monitor_sync_in_progress",
      retryable: true,
      logDetails: { lockKey },
    });
  }

  if (now - previousStart < minIntervalMs) {
    throw new RouteError("competitor-monitor sync was triggered too recently.", {
      status: 429,
      code: "competitor_monitor_sync_rate_limited",
      retryable: true,
      logDetails: {
        lockKey,
        retryAfterMs: minIntervalMs - (now - previousStart),
      },
    });
  }

  activeSyncKeys.add(lockKey);
  lastSyncStartedAtByKey.set(lockKey, now);

  try {
    return await runCompetitorMonitorDailySyncUnlocked(options);
  } finally {
    activeSyncKeys.delete(lockKey);
  }
}

async function runCompetitorMonitorDailySyncUnlocked(options: {
  marketId?: string | null;
  trigger?: CompetitorMonitorSyncTrigger;
} = {}): Promise<CompetitorMonitorSyncSummary> {
  const repository = getCompetitorMonitorRepository();
  const trigger = options.trigger ?? "cron";
  const run = await repository.createSyncRun({
    triggerType: trigger,
    requestedMarketId: options.marketId ?? null,
  });

  try {
    const markets = await repository.listMarketConfigs({
      activeOnly: !options.marketId,
      marketId: options.marketId ?? null,
    });

    if (options.marketId && markets.length === 0) {
      throw new RouteError("competitor-monitor market was not found.", {
        status: 404,
        code: "competitor_monitor_market_not_found",
      });
    }

    if (markets.length === 0) {
      const finishedAt = isoNow();
      const emptySummary: CompetitorMonitorSyncSummary = {
        runId: run.id,
        trigger,
        startedAt: run.startedAt,
        finishedAt,
        marketId: options.marketId ?? null,
        totalMarkets: 0,
        totalAsins: 0,
        syncedAsins: 0,
        unchangedAsins: 0,
        failedAsins: 0,
        alertsCreated: 0,
        marketResults: [],
        asinResults: [],
      };

      await repository.completeSyncRun(
        run.id,
        emptySummary as unknown as Record<string, unknown>
      );
      return emptySummary;
    }

    const marketUsageByMarketplace = new Map<
      string,
      {
        asins: Set<string>;
        marketIds: Set<string>;
      }
    >();

    markets.forEach((market) => {
      const current = marketUsageByMarketplace.get(market.marketplace) ?? {
        asins: new Set<string>(),
        marketIds: new Set<string>(),
      };

      market.asins.forEach((asin) => current.asins.add(asin));
      current.marketIds.add(market.id);
      marketUsageByMarketplace.set(market.marketplace, current);
    });

    const asinResults: CompetitorMonitorSyncAsinResult[] = [];

    for (const [marketplace, usage] of marketUsageByMarketplace.entries()) {
      const asins = Array.from(usage.asins.values());
      const settledResults = await Promise.allSettled(
        asins.map((asin) => syncSingleAsin(marketplace, asin))
      );

      for (const [index, settledResult] of settledResults.entries()) {
        if (settledResult.status === "fulfilled") {
          asinResults.push(settledResult.value);
          continue;
        }

        const asin = asins[index] ?? "";
        const observedAt = isoNow();
        const message = toErrorMessage(settledResult.reason);
        await repository.markAsinSyncFailure({
          marketplace,
          asin,
          observedAt,
          errorMessage: message,
        });

        asinResults.push({
          asin,
          marketplace,
          status: "failed",
          snapshotId: null,
          alertsCreated: 0,
          error: message,
        });
      }
    }

    const finishedAt = isoNow();
    await repository.markMarketsSynced(
      markets.map((market) => market.id),
      finishedAt
    );

    const asinResultMap = new Map(
      asinResults.map((result) => [`${result.marketplace}:${result.asin}`, result] as const)
    );

    const marketResults: CompetitorMonitorSyncMarketResult[] = markets.map((market) => {
      const results = market.asins
        .map((asin) => asinResultMap.get(`${market.marketplace}:${asin}`))
        .filter(
          (result): result is CompetitorMonitorSyncAsinResult => result !== undefined
        );

      return {
        marketId: market.id,
        name: market.name,
        marketplace: market.marketplace,
        totalAsins: market.asins.length,
        syncedAsins: results.filter((result) => result.status === "synced").length,
        unchangedAsins: results.filter((result) => result.status === "unchanged").length,
        failedAsins: results.filter((result) => result.status === "failed").length,
      };
    });

    const summary: CompetitorMonitorSyncSummary = {
      runId: run.id,
      trigger,
      startedAt: run.startedAt,
      finishedAt,
      marketId: options.marketId ?? null,
      totalMarkets: marketResults.length,
      totalAsins: asinResults.length,
      syncedAsins: asinResults.filter((result) => result.status === "synced").length,
      unchangedAsins: asinResults.filter((result) => result.status === "unchanged").length,
      failedAsins: asinResults.filter((result) => result.status === "failed").length,
      alertsCreated: asinResults.reduce(
        (total, result) => total + result.alertsCreated,
        0
      ),
      marketResults,
      asinResults,
    };

    await repository.completeSyncRun(run.id, summary as unknown as Record<string, unknown>);
    return summary;
  } catch (error) {
    await repository.failSyncRun(run.id, toErrorMessage(error));
    throw error;
  }
}

async function syncSingleAsin(
  marketplace: string,
  asin: string
): Promise<CompetitorMonitorSyncAsinResult> {
  const repository = getCompetitorMonitorRepository();
  const observedAt = isoNow();

  try {
    const payload = await fetchCompetitorData([asin], marketplace);
    const listing = payload.listings[0];
    if (!listing) {
      throw new RouteError(`No competitor-monitor listing data returned for ${asin}.`, {
        status: 502,
        code: "competitor_monitor_listing_missing",
      });
    }

    const observation: CompetitorMonitorAsinObservation = {
      marketplace,
      asin,
      listing,
      negativeReviews: payload.reviews[asin] ?? [],
      positiveReviews: payload.positiveReviews[asin] ?? [],
      keywords: payload.keywords[asin] ?? [],
      fingerprint: buildObservationFingerprint({
        marketplace,
        asin,
        listing,
        negativeReviews: payload.reviews[asin] ?? [],
        positiveReviews: payload.positiveReviews[asin] ?? [],
        keywords: payload.keywords[asin] ?? [],
      }),
      observedAt,
    };

    const previousSnapshot = await repository.getCurrentComparableSnapshot(
      marketplace,
      asin
    );
    const currentSnapshot = toComparableSnapshot(observation);
    const alertCandidates = buildCompetitorMonitorAlerts({
      previousSnapshot,
      currentSnapshot,
    });
    const persisted = await repository.persistObservation({
      observation,
      alertCandidates,
    });

    return {
      asin,
      marketplace,
      status: persisted.changed ? "synced" : "unchanged",
      snapshotId: persisted.snapshotId,
      alertsCreated: persisted.alertsCreated,
      error: null,
    };
  } catch (error) {
    const message = toErrorMessage(error);
    await repository.markAsinSyncFailure({
      marketplace,
      asin,
      observedAt,
      errorMessage: message,
    });

    return {
      asin,
      marketplace,
      status: "failed",
      snapshotId: null,
      alertsCreated: 0,
      error: message,
    };
  }
}

function toComparableSnapshot(
  observation: CompetitorMonitorAsinObservation
): CompetitorMonitorComparableSnapshot {
  return {
    id: "pending",
    marketplace: observation.marketplace,
    asin: observation.asin,
    capturedAt: observation.observedAt,
    title: observation.listing.title,
    price: observation.listing.price,
    rating: observation.listing.rating,
    reviews: observation.listing.reviews,
    monthlySales: observation.listing.monthlySales,
    bsr: observation.listing.bsr,
    mainImage: observation.listing.mainImage,
  };
}

function buildObservationFingerprint(input: {
  marketplace: string;
  asin: string;
  listing: CompetitorMonitorAsinObservation["listing"];
  negativeReviews: ReviewData[];
  positiveReviews: ReviewData[];
  keywords: TrafficKeyword[];
}): string {
  const normalizedKeywords = [...input.keywords]
    .sort((left, right) => left.keyword.localeCompare(right.keyword, "en"))
    .map((keyword) => ({
      keyword: keyword.keyword,
      searchVolume: keyword.searchVolume,
      organicRank: keyword.organicRank,
      sponsoredRank: keyword.sponsoredRank,
      conversionShare: keyword.conversionShare,
    }));

  const normalizedReviews = [...input.negativeReviews, ...input.positiveReviews]
    .map((review) => ({
      rating: review.rating,
      title: review.title.trim(),
      content: review.content.trim(),
      date: review.date,
      helpfulVotes: review.helpfulVotes,
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right), "en")
    );

  return createHash("sha256")
    .update(
      JSON.stringify({
        marketplace: input.marketplace,
        asin: input.asin,
        listing: {
          title: input.listing.title,
          bulletPoints: input.listing.bulletPoints,
          attributes: input.listing.attributes,
          price: input.listing.price,
          rating: input.listing.rating,
          reviews: input.listing.reviews,
          monthlySales: input.listing.monthlySales,
          bsr: input.listing.bsr,
          mainImage: input.listing.mainImage,
        },
        keywords: normalizedKeywords,
        reviews: normalizedReviews,
      })
    )
    .digest("hex");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "Unknown competitor-monitor sync error.";
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
