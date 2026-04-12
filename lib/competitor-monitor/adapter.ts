import type {
  CompetitorMonitorAlert,
  CompetitorMonitorAlertListResponse,
  CompetitorMonitorAsinDetail,
  CompetitorMonitorDashboardResponse,
  CompetitorMonitorMarketDetail,
  CompetitorMonitorMarketListItem,
} from "./types";
import type {
  CompetitorMonitorHealth,
  CompetitorMonitorUiAlert,
  CompetitorMonitorUiAlertCenterData,
  CompetitorMonitorUiAsinDetail,
  CompetitorMonitorUiAsinSummary,
  CompetitorMonitorUiDashboardData,
  CompetitorMonitorUiMarketDetail,
  CompetitorMonitorUiMarketListData,
  CompetitorMonitorUiMarketSummary,
  CompetitorMonitorUiMeta,
  CompetitorMonitorUiMetric,
  CompetitorMonitorUiRecentChange,
} from "./view-model";

const MARKETPLACE_META: Record<
  string,
  {
    countryCode: string;
    region: string;
    currency: string;
  }
> = {
  US: { countryCode: "US", region: "North America", currency: "USD" },
  CA: { countryCode: "CA", region: "North America", currency: "CAD" },
  MX: { countryCode: "MX", region: "Latin America", currency: "MXN" },
  UK: { countryCode: "UK", region: "Europe", currency: "GBP" },
  DE: { countryCode: "DE", region: "Europe", currency: "EUR" },
  FR: { countryCode: "FR", region: "Europe", currency: "EUR" },
  IT: { countryCode: "IT", region: "Europe", currency: "EUR" },
  ES: { countryCode: "ES", region: "Europe", currency: "EUR" },
  JP: { countryCode: "JP", region: "Asia Pacific", currency: "JPY" },
  AU: { countryCode: "AU", region: "Asia Pacific", currency: "AUD" },
};

const ALERT_DIFF_LABELS: Record<string, string> = {
  previousPrice: "Previous price",
  currentPrice: "Current price",
  previousRating: "Previous rating",
  currentRating: "Current rating",
  previousReviews: "Previous reviews",
  currentReviews: "Current reviews",
  previousBsr: "Previous BSR",
  currentBsr: "Current BSR",
  changePercent: "Change",
  delta: "Delta",
};

export function buildCompetitorMonitorUiMeta(): CompetitorMonitorUiMeta {
  return {
    namespace: "competitor-monitor",
    source: "repository",
    generatedAt: isoNow(),
  };
}

export function adaptCompetitorMonitorDashboard(input: {
  dashboard: CompetitorMonitorDashboardResponse;
  marketDetails: CompetitorMonitorMarketDetail[];
}): CompetitorMonitorUiDashboardData {
  const marketDetailById = new Map(
    input.marketDetails.map((market) => [market.id, market] as const)
  );
  const markets = input.dashboard.markets.map((market) =>
    adaptMarketSummary(market, marketDetailById.get(market.id) ?? null)
  );
  const priorityAsins = input.marketDetails
    .flatMap((market) => market.asins.map((asin) => adaptAsinSummary(asin, market)))
    .sort((left, right) => {
      if (right.alertCount !== left.alertCount) {
        return right.alertCount - left.alertCount;
      }

      return (right.lastCapturedAt ?? "").localeCompare(left.lastCapturedAt ?? "");
    })
    .slice(0, 8);

  return {
    metrics: buildDashboardMetrics(input.dashboard),
    markets,
    priorityAsins,
    recentAlerts: input.dashboard.alerts.map(adaptAlert),
  };
}

export function adaptCompetitorMonitorMarketList(input: {
  markets: CompetitorMonitorMarketListItem[];
  marketDetails: CompetitorMonitorMarketDetail[];
  filters?: {
    query?: string;
    health?: string;
  };
}): CompetitorMonitorUiMarketListData {
  const query = input.filters?.query?.trim() ?? "";
  const health = input.filters?.health?.trim() ?? "";
  const marketDetailById = new Map(
    input.marketDetails.map((market) => [market.id, market] as const)
  );

  const items = input.markets
    .map((market) => adaptMarketSummary(market, marketDetailById.get(market.id) ?? null))
    .filter((market) => {
      const matchesQuery =
        query.length === 0 ||
        [
          market.marketName,
          market.marketplace,
          market.description,
          market.heroAsin ?? "",
          market.countryCode,
          market.region,
        ].some((value) => value.toLowerCase().includes(query.toLowerCase()));
      const matchesHealth =
        health.length === 0 || health === "all" || market.health === health;

      return matchesQuery && matchesHealth;
    });

  return {
    metrics: buildMarketListMetrics(items),
    items,
    filters: {
      query,
      health: health || "all",
    },
  };
}

export function adaptCompetitorMonitorMarketDetail(
  market: CompetitorMonitorMarketDetail
): CompetitorMonitorUiMarketDetail {
  const meta = getMarketplaceMeta(market.marketplace);
  const trackedAsins = market.asins.map((asin) => adaptAsinSummary(asin, market));
  const syncedAsinCount = trackedAsins.filter((asin) => asin.lastCapturedAt).length;
  const coverageRate = percentage(
    syncedAsinCount,
    Math.max(market.asinCount, 1)
  );
  const averagePrice = average(
    trackedAsins
      .map((asin) => asin.price)
      .filter((value): value is number => value !== null)
  );
  const averageRating = average(
    trackedAsins
      .map((asin) => asin.rating)
      .filter((value): value is number => value !== null)
  );
  const activityTimeline = buildMarketActivityTimeline(market);
  const criticalAlertCount = market.recentAlerts.filter(
    (alert) => alert.severity === "critical" && alert.status === "open"
  ).length;

  return {
    marketId: market.id,
    marketName: market.name,
    marketplace: market.marketplace,
    countryCode: meta.countryCode,
    region: meta.region,
    currency: meta.currency,
    description:
      market.description ||
      `Tracking ${market.asinCount} ASINs for Amazon ${market.marketplace}.`,
    health: deriveHealth({
      activeAlertCount: market.activeAlertCount,
      lastSyncedAt: market.lastSyncedAt,
      coverageRate,
      isActive: market.isActive,
    }),
    asinCount: market.asinCount,
    syncedAsinCount,
    coverageRate,
    activeAlertCount: market.activeAlertCount,
    criticalAlertCount,
    lastSyncedAt: market.lastSyncedAt,
    heroAsin: market.asins[0]?.asin ?? null,
    averagePrice,
    averageRating,
    activityTimeline,
    trackedAsins,
    recentAlerts: market.recentAlerts.map(adaptAlert),
    notes: buildMarketNotes({
      market,
      syncedAsinCount,
      coverageRate,
      averagePrice,
    }),
  };
}

export function adaptCompetitorMonitorAsinDetail(input: {
  asin: CompetitorMonitorAsinDetail;
  relatedMarkets: CompetitorMonitorMarketDetail[];
}): CompetitorMonitorUiAsinDetail {
  const primaryMarket =
    input.relatedMarkets.find((market) =>
      market.asins.some((row) => row.asin === input.asin.asin)
    ) ?? input.relatedMarkets[0] ?? null;
  const primaryMarketRef = input.asin.markets[0] ?? null;
  const meta = getMarketplaceMeta(input.asin.marketplace);
  const detailedSnapshot = input.asin.latestSnapshot;
  const latestSnapshot =
    input.asin.latestSnapshot ?? input.asin.snapshotHistory[0] ?? null;
  const previousSnapshot = input.asin.snapshotHistory[1] ?? null;
  const currentPrice = latestSnapshot?.price ?? null;
  const currentReviews = latestSnapshot?.reviews ?? 0;
  const recentChanges = buildRecentChanges(input.asin);
  const comparableAsins = buildComparableAsins(
    input.asin.asin,
    input.relatedMarkets,
    meta.currency
  );
  const attributes = detailedSnapshot?.attributes ?? {};
  const brand =
    findAttribute(attributes, ["brand", "Brand", "品牌"]) ??
    inferBrandFromTitle(latestSnapshot?.title ?? input.asin.asin);

  return {
    marketId: primaryMarketRef?.id ?? primaryMarket?.id ?? null,
    marketName: primaryMarketRef?.name ?? primaryMarket?.name ?? "Tracked market",
    marketplace: input.asin.marketplace,
    countryCode: meta.countryCode,
    region: meta.region,
    currency: meta.currency,
    asin: input.asin.asin,
    title: latestSnapshot?.title ?? input.asin.asin,
    brand,
    health: deriveHealth({
      activeAlertCount: input.asin.alerts.filter((alert) => alert.status === "open").length,
      lastSyncedAt: input.asin.lastSyncedAt,
      coverageRate: latestSnapshot ? 100 : 0,
    }),
    alertCount: input.asin.alerts.filter((alert) => alert.status === "open").length,
    price: currentPrice,
    rating: latestSnapshot?.rating ?? null,
    reviewCount: currentReviews,
    monthlySales: latestSnapshot?.monthlySales ?? null,
    bsr: latestSnapshot?.bsr ?? null,
    priceChange:
      currentPrice !== null && previousSnapshot
        ? roundNumber(currentPrice - previousSnapshot.price, 2)
        : null,
    reviewChange: previousSnapshot
      ? currentReviews - previousSnapshot.reviews
      : null,
    lastCapturedAt: latestSnapshot?.capturedAt ?? null,
    lastSyncedAt: input.asin.lastSyncedAt,
    bulletHighlights: detailedSnapshot?.bulletPoints ?? [],
    attributeItems: Object.entries(attributes).map(([label, value]) => ({
      label,
      value,
    })),
    timeline: [...input.asin.snapshotHistory]
      .reverse()
      .map((snapshot) => ({
        date: snapshot.capturedAt,
        price: snapshot.price,
        reviews: snapshot.reviews,
        monthlySales: snapshot.monthlySales,
      })),
    keywordSnapshots: input.asin.keywords.map((keyword) => ({
      keyword: keyword.keyword,
      organicRank: keyword.organicRank,
      sponsoredRank: keyword.sponsoredRank,
      searchVolume: keyword.searchVolume,
      conversionShare: keyword.conversionShare,
    })),
    recentChanges,
    comparableAsins,
    alerts: input.asin.alerts.map(adaptAlert),
    markets: input.asin.markets.map((market) => ({
      id: market.id,
      name: market.name,
      marketplace: market.marketplace,
    })),
  };
}

export function adaptCompetitorMonitorAlertCenter(input: {
  alerts: CompetitorMonitorAlertListResponse;
  markets: CompetitorMonitorUiMarketSummary[];
  filters?: {
    query?: string;
    marketId?: string;
    severity?: string;
    status?: string;
  };
}): CompetitorMonitorUiAlertCenterData {
  const query = input.filters?.query?.trim() ?? "";
  const marketId = input.filters?.marketId?.trim() ?? "";
  const severity = input.filters?.severity?.trim() ?? "";
  const status = input.filters?.status?.trim() ?? "";

  const items = input.alerts.alerts
    .map(adaptAlert)
    .filter((alert) => {
      const matchesQuery =
        query.length === 0 ||
        [
          alert.title,
          alert.message,
          alert.asin,
          ...alert.markets.map((market) => market.name),
          alert.typeLabel,
        ].some((value) => value.toLowerCase().includes(query.toLowerCase()));
      const matchesMarket =
        marketId.length === 0 ||
        marketId === "all" ||
        alert.markets.some((market) => market.id === marketId);
      const matchesSeverity =
        severity.length === 0 ||
        severity === "all" ||
        alert.severity === severity;
      const matchesStatus =
        status.length === 0 || status === "all" || alert.status === status;

      return matchesQuery && matchesMarket && matchesSeverity && matchesStatus;
    });

  return {
    metrics: buildAlertMetrics(items, input.markets),
    items,
    filters: {
      query,
      marketId: marketId || "all",
      severity: severity || "all",
      status: status || "open",
    },
  };
}

function adaptMarketSummary(
  market: CompetitorMonitorMarketListItem,
  detail: CompetitorMonitorMarketDetail | null
): CompetitorMonitorUiMarketSummary {
  const meta = getMarketplaceMeta(market.marketplace);
  const trackedAsins = detail?.asins.map((asin) => adaptAsinSummary(asin, detail)) ?? [];
  const syncedAsinCount = trackedAsins.filter((asin) => asin.lastCapturedAt).length;
  const coverageRate = percentage(
    syncedAsinCount,
    Math.max(market.asinCount, 1)
  );
  const averagePrice = average(
    trackedAsins
      .map((asin) => asin.price)
      .filter((value): value is number => value !== null)
  );
  const averageRating = average(
    trackedAsins
      .map((asin) => asin.rating)
      .filter((value): value is number => value !== null)
  );
  const criticalAlertCount =
    detail?.recentAlerts.filter(
      (alert) => alert.severity === "critical" && alert.status === "open"
    ).length ?? 0;

  return {
    marketId: market.id,
    marketName: market.name,
    marketplace: market.marketplace,
    countryCode: meta.countryCode,
    region: meta.region,
    currency: meta.currency,
    description:
      market.description ||
      `Tracking ${market.asinCount} ASINs for Amazon ${market.marketplace}.`,
    health: deriveHealth({
      activeAlertCount: market.activeAlertCount,
      lastSyncedAt: market.lastSyncedAt,
      coverageRate,
      isActive: market.isActive,
    }),
    asinCount: market.asinCount,
    syncedAsinCount,
    coverageRate,
    activeAlertCount: market.activeAlertCount,
    criticalAlertCount,
    lastSyncedAt: market.lastSyncedAt,
    heroAsin: detail?.asins[0]?.asin ?? null,
    averagePrice,
    averageRating,
  };
}

function adaptAsinSummary(
  asin: CompetitorMonitorMarketDetail["asins"][number],
  market: Pick<CompetitorMonitorMarketDetail, "id" | "name" | "marketplace">
): CompetitorMonitorUiAsinSummary {
  const meta = getMarketplaceMeta(market.marketplace);
  const snapshot = asin.latestSnapshot;

  return {
    marketId: market.id,
    marketName: market.name,
    marketplace: market.marketplace,
    currency: meta.currency,
    asin: asin.asin,
    title: snapshot?.title ?? `ASIN ${asin.asin}`,
    health: deriveHealth({
      activeAlertCount: asin.activeAlertCount,
      lastSyncedAt: asin.lastSyncedAt,
      coverageRate: snapshot ? 100 : 0,
    }),
    price: snapshot?.price ?? null,
    rating: snapshot?.rating ?? null,
    reviewCount: snapshot?.reviews ?? 0,
    monthlySales: snapshot?.monthlySales ?? null,
    bsr: snapshot?.bsr ?? null,
    alertCount: asin.activeAlertCount,
    lastCapturedAt: snapshot?.capturedAt ?? asin.lastSyncedAt,
  };
}

function adaptAlert(alert: CompetitorMonitorAlert): CompetitorMonitorUiAlert {
  return {
    id: alert.id,
    asin: alert.asin,
    severity: alert.severity,
    status: alert.status,
    typeLabel: humanizeToken(alert.type),
    title: alert.title,
    message: alert.message,
    createdAt: alert.createdAt,
    markets: alert.markets.map((market) => ({
      id: market.id,
      name: market.name,
      marketplace: market.marketplace,
    })),
    detailItems: buildAlertDetailItems(alert),
  };
}

function buildDashboardMetrics(
  dashboard: CompetitorMonitorDashboardResponse
): CompetitorMonitorUiMetric[] {
  return [
    {
      key: "markets",
      label: "Markets",
      value: String(dashboard.summary.totalMarkets),
      delta: `${dashboard.summary.activeMarkets} active`,
      tone:
        dashboard.summary.activeMarkets === dashboard.summary.totalMarkets
          ? "positive"
          : "neutral",
      description: "Configured market watchlists in the real competitor-monitor repository.",
    },
    {
      key: "tracked-asins",
      label: "Tracked ASINs",
      value: String(dashboard.summary.trackedAsins),
      delta: `${dashboard.summary.uniqueAsins} unique marketplace ASINs`,
      tone: "neutral",
      description: "ASIN rows currently attached to all monitored market lists.",
    },
    {
      key: "alerts",
      label: "Open alerts",
      value: String(dashboard.summary.activeAlerts),
      delta:
        dashboard.summary.lastSyncedAt !== null
          ? describeSyncState(dashboard.summary.lastSyncedAt)
          : "No sync completed yet",
      tone:
        dashboard.summary.activeAlerts === 0
          ? "positive"
          : dashboard.summary.activeAlerts >= 5
            ? "negative"
            : "neutral",
      description: "Live alerts created from snapshot-to-snapshot competitor changes.",
    },
    {
      key: "default-marketplace",
      label: "Default marketplace",
      value: dashboard.summary.defaultMarketplace,
      delta:
        dashboard.summary.lastSyncedAt !== null
          ? `Last synced ${shortDate(dashboard.summary.lastSyncedAt)}`
          : "Waiting for first sync",
      tone: "neutral",
      description: "Fallback marketplace applied when requests omit a market code.",
    },
  ];
}

function buildMarketListMetrics(
  items: CompetitorMonitorUiMarketSummary[]
): CompetitorMonitorUiMetric[] {
  const averageCoverage = average(items.map((item) => item.coverageRate));
  const totalTrackedAsins = items.reduce((sum, item) => sum + item.asinCount, 0);
  const totalAlerts = items.reduce((sum, item) => sum + item.activeAlertCount, 0);
  const riskyMarkets = items.filter((item) => item.health === "risk").length;

  return [
    {
      key: "market-count",
      label: "Markets in view",
      value: String(items.length),
      delta: `${riskyMarkets} at risk`,
      tone: riskyMarkets === 0 ? "positive" : "negative",
      description: "Markets remaining after applying the current frontend filters.",
    },
    {
      key: "tracked-asins",
      label: "Tracked ASINs",
      value: String(totalTrackedAsins),
      delta: `${totalAlerts} open alerts`,
      tone: totalAlerts === 0 ? "positive" : "neutral",
      description: "Total ASINs attached to the currently visible markets.",
    },
    {
      key: "coverage",
      label: "Sync coverage",
      value: `${(averageCoverage ?? 0).toFixed(0)}%`,
      delta: `${items.filter((item) => item.coverageRate >= 80).length} healthy coverage`,
      tone:
        averageCoverage !== null && averageCoverage >= 80
          ? "positive"
          : averageCoverage !== null && averageCoverage < 50
            ? "negative"
            : "neutral",
      description: "Share of tracked ASIN rows that already have a stored snapshot.",
    },
    {
      key: "critical-alerts",
      label: "Critical alerts",
      value: String(
        items.reduce((sum, item) => sum + item.criticalAlertCount, 0)
      ),
      delta: `${items.filter((item) => item.criticalAlertCount > 0).length} markets impacted`,
      tone:
        items.some((item) => item.criticalAlertCount > 0)
          ? "negative"
          : "positive",
      description: "Critical alert volume surfaced from the real alert stream.",
    },
  ];
}

function buildAlertMetrics(
  items: CompetitorMonitorUiAlert[],
  markets: CompetitorMonitorUiMarketSummary[]
): CompetitorMonitorUiMetric[] {
  const criticalCount = items.filter((alert) => alert.severity === "critical").length;
  const openCount = items.filter((alert) => alert.status === "open").length;
  const impactedMarkets = new Set(
    items.flatMap((alert) => alert.markets.map((market) => market.id))
  ).size;

  return [
    {
      key: "alert-count",
      label: "Alerts in view",
      value: String(items.length),
      delta: `${openCount} open`,
      tone: openCount === 0 ? "positive" : "neutral",
      description: "Alert rows remaining after applying the current frontend filters.",
    },
    {
      key: "critical-alerts",
      label: "Critical alerts",
      value: String(criticalCount),
      delta: `${impactedMarkets} markets impacted`,
      tone: criticalCount > 0 ? "negative" : "positive",
      description: "Critical events that should be triaged before the next sync cycle.",
    },
    {
      key: "resolved-alerts",
      label: "Resolved alerts",
      value: String(items.filter((alert) => alert.status === "resolved").length),
      delta: `${items.length - openCount} closed in view`,
      tone: "positive",
      description: "Resolved items visible inside the current alert-center filter scope.",
    },
    {
      key: "market-coverage",
      label: "Tracked markets",
      value: String(markets.length),
      delta: `${impactedMarkets} with alert activity`,
      tone: "neutral",
      description: "Market list used to populate alert filters and breadcrumb links.",
    },
  ];
}

function buildMarketActivityTimeline(
  market: CompetitorMonitorMarketDetail
): CompetitorMonitorUiMarketDetail["activityTimeline"] {
  const buckets = new Map<
    string,
    {
      prices: number[];
      syncedAsins: number;
      openAlerts: number;
    }
  >();

  market.asins.forEach((asin) => {
    if (!asin.latestSnapshot) {
      return;
    }

    const bucketKey = asin.latestSnapshot.capturedAt.slice(0, 10);
    const current = buckets.get(bucketKey) ?? {
      prices: [],
      syncedAsins: 0,
      openAlerts: 0,
    };

    current.prices.push(asin.latestSnapshot.price);
    current.syncedAsins += 1;
    current.openAlerts += asin.activeAlertCount;
    buckets.set(bucketKey, current);
  });

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-6)
    .map(([date, bucket]) => ({
      date,
      averagePrice: roundNumber(average(bucket.prices) ?? 0, 2),
      syncedAsins: bucket.syncedAsins,
      openAlerts: bucket.openAlerts,
    }));
}

function buildMarketNotes(input: {
  market: CompetitorMonitorMarketDetail;
  syncedAsinCount: number;
  coverageRate: number;
  averagePrice: number | null;
}): string[] {
  const notes = [
    input.market.description ||
      `This market is configured with ${input.market.asinCount} tracked ASINs.`,
    `${input.syncedAsinCount} of ${input.market.asinCount} tracked ASINs currently have a stored snapshot.`,
    input.market.lastSyncedAt
      ? `The latest market sync finished at ${input.market.lastSyncedAt}.`
      : "No successful sync has been recorded for this market yet.",
    input.market.activeAlertCount > 0
      ? `${input.market.activeAlertCount} open alerts are still attached to this market.`
      : "There are no open alerts attached to this market right now.",
  ];

  if (input.averagePrice !== null) {
    notes.push(
      `Average tracked price across synced ASINs is ${formatCurrencyValue(
        input.averagePrice
      )}.`
    );
  }

  if (input.coverageRate < 100) {
    notes.push("Some configured ASINs still need their first stored snapshot.");
  }

  return notes;
}

function buildComparableAsins(
  currentAsin: string,
  relatedMarkets: CompetitorMonitorMarketDetail[],
  currency: string
): CompetitorMonitorUiAsinDetail["comparableAsins"] {
  const comparableMap = new Map<string, CompetitorMonitorUiAsinDetail["comparableAsins"][number]>();

  relatedMarkets.forEach((market) => {
    market.asins.forEach((asin) => {
      if (asin.asin === currentAsin) {
        return;
      }

      const snapshot = asin.latestSnapshot;
      const key = `${market.id}:${asin.asin}`;

      comparableMap.set(key, {
        asin: asin.asin,
        marketId: market.id,
        marketName: market.name,
        title: snapshot?.title ?? `ASIN ${asin.asin}`,
        brand: inferBrandFromTitle(snapshot?.title ?? asin.asin),
        price: snapshot?.price ?? null,
        rating: snapshot?.rating ?? null,
        monthlySales: snapshot?.monthlySales ?? null,
        alertCount: asin.activeAlertCount,
      });
    });
  });

  return Array.from(comparableMap.values())
    .sort((left, right) => {
      if (right.alertCount !== left.alertCount) {
        return right.alertCount - left.alertCount;
      }

      return (right.monthlySales ?? 0) - (left.monthlySales ?? 0);
    })
    .slice(0, 8)
    .map((item) => ({
      ...item,
      price:
        item.price !== null
          ? roundNumber(convertDisplayCurrency(item.price, currency), 2)
          : null,
    }));
}

function buildRecentChanges(
  detail: CompetitorMonitorAsinDetail
): CompetitorMonitorUiRecentChange[] {
  const changes: CompetitorMonitorUiRecentChange[] = detail.alerts
    .slice(0, 4)
    .map((alert) => ({
      id: alert.id,
      happenedAt: alert.createdAt,
      type: humanizeToken(alert.type),
      summary: alert.message,
    }));

  const latest = detail.snapshotHistory[0] ?? null;
  const previous = detail.snapshotHistory[1] ?? null;

  if (latest && previous) {
    if (latest.price !== previous.price) {
      changes.push({
        id: `${detail.asin}-price-change`,
        happenedAt: latest.capturedAt,
        type: "Price change",
        summary: `Price moved from ${formatCurrencyValue(previous.price)} to ${formatCurrencyValue(
          latest.price
        )}.`,
      });
    }

    if (latest.reviews !== previous.reviews) {
      changes.push({
        id: `${detail.asin}-review-change`,
        happenedAt: latest.capturedAt,
        type: "Review count change",
        summary: `Review count changed from ${previous.reviews} to ${latest.reviews}.`,
      });
    }

    if (latest.bsr !== previous.bsr) {
      changes.push({
        id: `${detail.asin}-bsr-change`,
        happenedAt: latest.capturedAt,
        type: "BSR change",
        summary: `BSR moved from ${previous.bsr} to ${latest.bsr}.`,
      });
    }
  }

  return changes
    .sort((left, right) => right.happenedAt.localeCompare(left.happenedAt))
    .slice(0, 6);
}

function buildAlertDetailItems(
  alert: CompetitorMonitorAlert
): CompetitorMonitorUiAlert["detailItems"] {
  const items = Object.entries(alert.diff)
    .filter(([, value]) => value !== null && value !== "")
    .slice(0, 3)
    .map(([key, value]) => ({
      label: ALERT_DIFF_LABELS[key] ?? humanizeToken(key),
      value: formatAlertDiffValue(key, value),
    }));

  if (items.length > 0) {
    return items;
  }

  return [
    {
      label: "Snapshot",
      value: shortId(alert.snapshotId),
    },
    {
      label: "Markets",
      value: alert.markets.map((market) => market.name).join(", ") || "None",
    },
  ];
}

function deriveHealth(input: {
  activeAlertCount: number;
  lastSyncedAt: string | null;
  coverageRate: number;
  isActive?: boolean;
}): CompetitorMonitorHealth {
  if (input.isActive === false) {
    return "watch";
  }

  const syncAgeDays =
    input.lastSyncedAt === null ? Number.POSITIVE_INFINITY : ageInDays(input.lastSyncedAt);

  if (
    input.activeAlertCount >= 5 ||
    syncAgeDays > 7 ||
    input.coverageRate < 50
  ) {
    return "risk";
  }

  if (
    input.activeAlertCount > 0 ||
    syncAgeDays > 2 ||
    input.coverageRate < 100
  ) {
    return "watch";
  }

  return "healthy";
}

function getMarketplaceMeta(code: string) {
  return MARKETPLACE_META[code.toUpperCase()] ?? {
    countryCode: code.toUpperCase(),
    region: "Global",
    currency: "USD",
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentage(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return roundNumber((part / total) * 100, 1);
}

function roundNumber(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function ageInDays(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.floor((Date.now() - timestamp) / 86_400_000);
}

function describeSyncState(value: string): string {
  const days = ageInDays(value);

  if (days <= 0) {
    return "Synced within 24h";
  }

  if (days === 1) {
    return "Synced 1 day ago";
  }

  return `Synced ${days} days ago`;
}

function shortDate(value: string): string {
  return value.slice(0, 10);
}

function humanizeToken(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAlertDiffValue(
  key: string,
  value: number | string | null
): string {
  if (value === null) {
    return "n/a";
  }

  if (typeof value === "number") {
    if (key.toLowerCase().includes("price")) {
      return formatCurrencyValue(value);
    }

    if (key.toLowerCase().includes("percent")) {
      return `${value.toFixed(1)}%`;
    }

    if (key.toLowerCase().includes("rating")) {
      return value.toFixed(1);
    }

    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  return value;
}

function formatCurrencyValue(value: number): string {
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function inferBrandFromTitle(title: string): string {
  const firstToken = title.trim().split(/\s+/)[0] ?? "";
  return firstToken || "Unknown brand";
}

function findAttribute(
  attributes: Record<string, string>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = attributes[key];
    if (value) {
      return value;
    }
  }

  return null;
}

function convertDisplayCurrency(value: number, _currency: string): number {
  return value;
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
