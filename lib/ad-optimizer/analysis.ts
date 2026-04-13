import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";
import {
  buildKeywordKey,
  buildNegativeKeywordKey,
  buildProductTargetKey,
  canonicalizeMatchType,
  canonicalizePlacementName,
  lookupBulkEntitiesForSearchTerm,
  lookupPlacementAdjustment,
  parseBulkIdentityWorkbookFile,
  resolveTargetingType,
} from "@/lib/ad-optimizer/bulk-identity";
import type {
  AdOptimizerAnalysisResult,
  AggregatedSearchTerm,
  AggregatedTarget,
  AnalysisControls,
  AnalysisSummary,
  BulkIdentityBundle,
  MetricBundle,
  ParsedPlacementReport,
  ParsedSearchTermReport,
  PlacementPerformance,
  PlacementRecord,
  Recommendation,
  RecommendationPriority,
  RecommendationType,
  SearchTermRecord,
  TargetingType,
} from "@/lib/ad-optimizer/types";

type SheetRow = Record<string, unknown>;

type WorkbookSelection = {
  sheetName: string;
  rows: SheetRow[];
};

type ColumnCandidate = string | ((normalizedHeader: string, rawHeader: string) => boolean);

type AnalysisFileArgs = {
  currentFile: File;
  previousFile?: File | null;
  placementFile?: File | null;
  bulkIdentityFile?: File | null;
  controls?: Partial<AnalysisControls>;
};

type SearchTermAggregate = {
  id: string;
  campaignName: string;
  adGroupName: string;
  targetingText: string;
  matchType: string;
  targetingType: TargetingType;
  customerSearchTerm: string;
  rows: SearchTermRecord[];
};

type TargetAggregate = {
  id: string;
  campaignName: string;
  adGroupName: string;
  targetingText: string;
  matchType: string;
  targetingType: TargetingType;
  rows: SearchTermRecord[];
};

type PlacementAggregate = {
  id: string;
  campaignName: string;
  placementName: string;
  rows: PlacementRecord[];
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const SEARCH_SHEET_HINTS = [
  "search term",
  "search terms",
  "customer search term",
  "搜索词",
  "搜索字词",
];

const PLACEMENT_SHEET_HINTS = ["placement", "placements", "广告位", "版位"];

const DEFAULT_CURRENCY = "USD";

const RECOMMENDATION_LABELS: Record<RecommendationType, string> = {
  harvest_exact: "新建精准词",
  harvest_product_target: "新建 ASIN 定向",
  negative_exact: "添加否定精准词",
  lower_bid: "降低出价",
  raise_bid: "提高出价",
  raise_placement_modifier: "提高广告位系数",
  lower_placement_modifier: "降低广告位系数",
};

export const DEFAULT_ANALYSIS_CONTROLS: AnalysisControls = {
  targetAcos: 0.3,
  minHarvestOrders: 2,
  minNegateClicks: 18,
  minBidClicks: 10,
  minRaiseOrders: 2,
};

export function formatCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return currencyFormatter.format(value);
}

export function formatRate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return percentFormatter.format(value);
}

export async function buildAdOptimizerAnalysisFromFiles(
  args: AnalysisFileArgs
): Promise<AdOptimizerAnalysisResult> {
  const controls = {
    ...DEFAULT_ANALYSIS_CONTROLS,
    ...(args.controls ?? {}),
  };

  const current = await parseSearchTermWorkbookFile(args.currentFile);
  if (current.rows.length === 0) {
    throw new Error("当前搜索词报表中没有可分析的数据，请检查文件内容后重试。");
  }

  const previous = args.previousFile
    ? await parseSearchTermWorkbookFile(args.previousFile)
    : null;
  const placement = args.placementFile
    ? await parsePlacementWorkbookFile(args.placementFile)
    : null;
  const bulkIdentity = args.bulkIdentityFile
    ? await parseBulkIdentityWorkbookFile(args.bulkIdentityFile)
    : null;

  const topSearchTerms = buildAggregatedSearchTerms(current, previous, bulkIdentity);
  const topTargets = buildAggregatedTargets(current, previous, bulkIdentity);
  const topPlacements = buildAggregatedPlacements(placement, bulkIdentity);
  const recommendations = buildRecommendations(
    topSearchTerms,
    topTargets,
    topPlacements,
    controls
  );
  const reviewItems = recommendations.filter((item) => !item.bulkExportable);

  return {
    generatedAt: new Date().toISOString(),
    controls,
    files: {
      current: current.meta,
      previous: previous?.meta ?? null,
      placement: placement?.meta ?? null,
      bulkIdentity: bulkIdentity?.meta ?? null,
    },
    notices: buildNotices(current, previous, placement, bulkIdentity, reviewItems.length),
    summary: buildAnalysisSummary(current, previous),
    bulkIdentitySummary: bulkIdentity?.summary ?? null,
    mappingCoverage: buildMappingCoverage(topSearchTerms, topTargets, recommendations, bulkIdentity),
    recommendationSummary: buildRecommendationSummary(recommendations),
    recommendations,
    topSearchTerms,
    topTargets,
    topPlacements,
    reviewItems,
  };
}

async function parseSearchTermWorkbookFile(file: File): Promise<ParsedSearchTermReport> {
  const workbook = await readWorkbook(file);
  const selection = selectBestSheet(workbook, SEARCH_SHEET_HINTS, [
    isCampaignHeader,
    isSearchTermHeader,
    isClicksHeader,
    isSpendHeader,
  ]);

  const headers = collectHeaders(selection.rows);
  const columnMap = {
    campaignName: resolveHeader(headers, [isCampaignHeader]),
    adGroupName: resolveHeader(headers, [isAdGroupHeader]),
    portfolioName: resolveHeader(headers, ["portfolio", "广告组合", "组合名称"]),
    currency: resolveHeader(headers, ["currency", "货币"]),
    country: resolveHeader(headers, ["country", "countrycode", "国家", "站点"]),
    targetingText: resolveHeader(headers, [isTargetingHeader]),
    customerSearchTerm: resolveHeader(headers, [isSearchTermHeader]),
    matchType: resolveHeader(headers, [isMatchTypeHeader]),
    startDate: resolveHeader(headers, ["startdate", "开始日期"]),
    endDate: resolveHeader(headers, ["enddate", "结束日期"]),
    impressions: resolveHeader(headers, [isImpressionsHeader]),
    clicks: resolveHeader(headers, [isClicksHeader]),
    cost: resolveHeader(headers, [isSpendHeader]),
    sales: resolveHeader(headers, [isSalesHeader]),
    orders: resolveHeader(headers, [isOrdersHeader]),
    units: resolveHeader(headers, [isUnitsHeader]),
    ctr: resolveHeader(headers, [isCtrHeader]),
    cpc: resolveHeader(headers, [isCpcHeader]),
    cvr: resolveHeader(headers, [isCvrHeader]),
    acos: resolveHeader(headers, [isAcosHeader]),
    roas: resolveHeader(headers, [isRoasHeader]),
  };

  const warnings: string[] = [];
  if (!columnMap.campaignName) {
    warnings.push("未识别到 Campaign 列，部分行可能会被跳过。");
  }
  if (!columnMap.customerSearchTerm) {
    warnings.push("未识别到 Customer Search Term 列。");
  }
  if (!columnMap.clicks || !columnMap.cost) {
    warnings.push("未完整识别点击或花费列，分析结果可能不完整。");
  }

  const rows: SearchTermRecord[] = [];

  for (const row of selection.rows) {
    const campaignName = readStringByHeader(row, columnMap.campaignName);
    const adGroupName = readStringByHeader(row, columnMap.adGroupName);
    const targetingText =
      readStringByHeader(row, columnMap.targetingText) ||
      readStringByHeader(row, columnMap.customerSearchTerm);
    const customerSearchTerm = readStringByHeader(row, columnMap.customerSearchTerm);

    if (
      !campaignName &&
      !adGroupName &&
      !targetingText &&
      !customerSearchTerm &&
      isRowEmpty(row)
    ) {
      continue;
    }

    const matchType = canonicalizeMatchType(readStringByHeader(row, columnMap.matchType));
    const targetingType = resolveTargetingType(targetingText, matchType);
    const metrics = buildMetricBundle({
      impressions: readNumberByHeader(row, columnMap.impressions),
      clicks: readNumberByHeader(row, columnMap.clicks),
      cost: readNumberByHeader(row, columnMap.cost),
      sales: readNumberByHeader(row, columnMap.sales),
      orders: readNumberByHeader(row, columnMap.orders),
      units: readNumberByHeader(row, columnMap.units),
      ctr: readRateByHeader(row, columnMap.ctr) ?? 0,
      cpc: readNumberByHeader(row, columnMap.cpc),
      cvr: readRateByHeader(row, columnMap.cvr) ?? 0,
      acos: readRateByHeader(row, columnMap.acos, true),
      roas: readNumberByHeader(row, columnMap.roas),
    });

    if (
      !campaignName &&
      !customerSearchTerm &&
      !targetingText &&
      metrics.clicks === 0 &&
      metrics.cost === 0 &&
      metrics.sales === 0
    ) {
      continue;
    }

    rows.push({
      campaignName: campaignName || "Unknown Campaign",
      adGroupName: adGroupName || "Unknown Ad Group",
      portfolioName: readStringByHeader(row, columnMap.portfolioName),
      currency: readStringByHeader(row, columnMap.currency) || DEFAULT_CURRENCY,
      country: readStringByHeader(row, columnMap.country),
      targetingText: targetingText || customerSearchTerm || "-",
      customerSearchTerm: customerSearchTerm || targetingText || "-",
      matchType,
      targetingType,
      startDate: readStringByHeader(row, columnMap.startDate),
      endDate: readStringByHeader(row, columnMap.endDate),
      metrics,
    });
  }

  const summary = sumMetricBundles(rows.map((row) => row.metrics));

  return {
    meta: {
      kind: "search-term",
      fileName: file.name,
      sheetName: selection.sheetName,
      rowCount: rows.length,
      warnings,
    },
    rows,
    summary,
    uniqueCampaigns: uniqueCount(rows.map((row) => row.campaignName)),
    uniqueAdGroups: uniqueCount(rows.map((row) => `${row.campaignName}::${row.adGroupName}`)),
    uniqueTargets: uniqueCount(
      rows.map((row) => `${row.campaignName}::${row.adGroupName}::${row.targetingText}::${row.matchType}`)
    ),
    uniqueSearchTerms: uniqueCount(
      rows.map(
        (row) =>
          `${row.campaignName}::${row.adGroupName}::${row.customerSearchTerm}::${row.targetingText}`
      )
    ),
  };
}

async function parsePlacementWorkbookFile(file: File): Promise<ParsedPlacementReport> {
  const workbook = await readWorkbook(file);
  const selection = selectBestSheet(workbook, PLACEMENT_SHEET_HINTS, [
    isCampaignHeader,
    isPlacementHeader,
    isClicksHeader,
    isSpendHeader,
  ]);
  const headers = collectHeaders(selection.rows);
  const columnMap = {
    campaignName: resolveHeader(headers, [isCampaignHeader]),
    adGroupName: resolveHeader(headers, [isAdGroupHeader]),
    placementName: resolveHeader(headers, [isPlacementHeader]),
    impressions: resolveHeader(headers, [isImpressionsHeader]),
    clicks: resolveHeader(headers, [isClicksHeader]),
    cost: resolveHeader(headers, [isSpendHeader]),
    sales: resolveHeader(headers, [isSalesHeader]),
    orders: resolveHeader(headers, [isOrdersHeader]),
    units: resolveHeader(headers, [isUnitsHeader]),
    ctr: resolveHeader(headers, [isCtrHeader]),
    cpc: resolveHeader(headers, [isCpcHeader]),
    cvr: resolveHeader(headers, [isCvrHeader]),
    acos: resolveHeader(headers, [isAcosHeader, "totalacos"]),
    roas: resolveHeader(headers, [isRoasHeader]),
  };

  const warnings: string[] = [];
  if (!columnMap.placementName) {
    warnings.push("未识别到 Placement 列。");
  }

  const rows: PlacementRecord[] = [];

  for (const row of selection.rows) {
    const campaignName = readStringByHeader(row, columnMap.campaignName);
    const placementName = canonicalizePlacementName(
      readStringByHeader(row, columnMap.placementName)
    );
    const metrics = buildMetricBundle({
      impressions: readNumberByHeader(row, columnMap.impressions),
      clicks: readNumberByHeader(row, columnMap.clicks),
      cost: readNumberByHeader(row, columnMap.cost),
      sales: readNumberByHeader(row, columnMap.sales),
      orders: readNumberByHeader(row, columnMap.orders),
      units: readNumberByHeader(row, columnMap.units),
      ctr: readRateByHeader(row, columnMap.ctr) ?? 0,
      cpc: readNumberByHeader(row, columnMap.cpc),
      cvr: readRateByHeader(row, columnMap.cvr) ?? 0,
      acos: readRateByHeader(row, columnMap.acos, true),
      roas: readNumberByHeader(row, columnMap.roas),
    });

    if (
      !campaignName &&
      !placementName &&
      metrics.clicks === 0 &&
      metrics.cost === 0 &&
      metrics.sales === 0
    ) {
      continue;
    }

    if (!placementName) {
      continue;
    }

    rows.push({
      campaignName: campaignName || "Unknown Campaign",
      adGroupName: readStringByHeader(row, columnMap.adGroupName),
      placementName,
      metrics,
    });
  }

  return {
    meta: {
      kind: "placement",
      fileName: file.name,
      sheetName: selection.sheetName,
      rowCount: rows.length,
      warnings,
    },
    rows,
    usable: rows.length > 0,
  };
}

function buildAggregatedSearchTerms(
  current: ParsedSearchTermReport,
  previous: ParsedSearchTermReport | null,
  bulkIdentity: BulkIdentityBundle | null
): AggregatedSearchTerm[] {
  const previousMap = previous ? aggregateSearchTerms(previous.rows) : new Map<string, SearchTermAggregate>();
  const currentMap = aggregateSearchTerms(current.rows);
  const items: AggregatedSearchTerm[] = [];

  for (const aggregate of currentMap.values()) {
    const previousAggregate = previousMap.get(aggregate.id);
    const currentMetrics = sumMetricBundles(aggregate.rows.map((row) => row.metrics));
    const previousMetrics = previousAggregate
      ? sumMetricBundles(previousAggregate.rows.map((row) => row.metrics))
      : null;

    const identity = lookupBulkEntitiesForSearchTerm(bulkIdentity, {
      campaignName: aggregate.campaignName,
      adGroupName: aggregate.adGroupName,
      targetingText: aggregate.targetingText,
      matchType: aggregate.matchType,
    });

    const exactKeywordKey = buildKeywordKey(
      aggregate.campaignName,
      aggregate.adGroupName,
      aggregate.customerSearchTerm,
      "exact"
    );
    const negativeKeywordKey = buildNegativeKeywordKey(
      aggregate.campaignName,
      aggregate.adGroupName,
      aggregate.customerSearchTerm,
      "negative-exact"
    );
    const productTargetExpression = buildAsinTargetExpression(aggregate.customerSearchTerm);
    const productTargetKey = productTargetExpression
      ? buildProductTargetKey(
          aggregate.campaignName,
          aggregate.adGroupName,
          productTargetExpression
        )
      : "";

    items.push({
      id: aggregate.id,
      campaignName: aggregate.campaignName,
      adGroupName: aggregate.adGroupName,
      targetingText: aggregate.targetingText,
      matchType: aggregate.matchType,
      targetingType: aggregate.targetingType,
      customerSearchTerm: aggregate.customerSearchTerm,
      current: currentMetrics,
      previous: previousMetrics,
      deltaCostPct: calculateDeltaPct(currentMetrics.cost, previousMetrics?.cost ?? null),
      deltaSalesPct: calculateDeltaPct(currentMetrics.sales, previousMetrics?.sales ?? null),
      deltaOrders: currentMetrics.orders - (previousMetrics?.orders ?? 0),
      currentBid: identity.currentBid,
      campaignId: identity.campaignId,
      adGroupId: identity.adGroupId,
      sourceKeywordId: identity.keywordId,
      sourceProductTargetId: identity.productTargetId,
      hasExactKeywordAlready: bulkIdentity?.exactKeywordsByKey.has(exactKeywordKey) ?? false,
      hasNegativeExactAlready:
        (bulkIdentity?.negativeKeywordsByKey.has(negativeKeywordKey) ?? false) ||
        (bulkIdentity?.negativeKeywordsByKey.has(
          buildNegativeKeywordKey(
            aggregate.campaignName,
            "",
            aggregate.customerSearchTerm,
            "negative-exact"
          )
        ) ?? false),
      hasProductTargetAlready:
        productTargetKey !== "" && (bulkIdentity?.productTargetsByKey.has(productTargetKey) ?? false),
    });
  }

  return items.sort(compareMetricHeavyItems);
}

function buildAggregatedTargets(
  current: ParsedSearchTermReport,
  previous: ParsedSearchTermReport | null,
  bulkIdentity: BulkIdentityBundle | null
): AggregatedTarget[] {
  const previousMap = previous ? aggregateTargets(previous.rows) : new Map<string, TargetAggregate>();
  const currentMap = aggregateTargets(current.rows);
  const items: AggregatedTarget[] = [];

  for (const aggregate of currentMap.values()) {
    const previousAggregate = previousMap.get(aggregate.id);
    const currentMetrics = sumMetricBundles(aggregate.rows.map((row) => row.metrics));
    const previousMetrics = previousAggregate
      ? sumMetricBundles(previousAggregate.rows.map((row) => row.metrics))
      : null;

    const identity = lookupBulkEntitiesForSearchTerm(bulkIdentity, {
      campaignName: aggregate.campaignName,
      adGroupName: aggregate.adGroupName,
      targetingText: aggregate.targetingText,
      matchType: aggregate.matchType,
    });

    items.push({
      id: aggregate.id,
      campaignName: aggregate.campaignName,
      adGroupName: aggregate.adGroupName,
      targetingText: aggregate.targetingText,
      matchType: aggregate.matchType,
      targetingType: aggregate.targetingType,
      current: currentMetrics,
      previous: previousMetrics,
      deltaCostPct: calculateDeltaPct(currentMetrics.cost, previousMetrics?.cost ?? null),
      deltaSalesPct: calculateDeltaPct(currentMetrics.sales, previousMetrics?.sales ?? null),
      currentBid: identity.currentBid,
      campaignId: identity.campaignId,
      adGroupId: identity.adGroupId,
      keywordId: identity.keywordId,
      productTargetId: identity.productTargetId,
    });
  }

  return items.sort(compareMetricHeavyItems);
}

function buildAggregatedPlacements(
  placement: ParsedPlacementReport | null,
  bulkIdentity: BulkIdentityBundle | null
): PlacementPerformance[] {
  if (!placement || !placement.usable) {
    return [];
  }

  const map = new Map<string, PlacementAggregate>();
  for (const row of placement.rows) {
    const id = `${normalizeLooseText(row.campaignName)}::${normalizeLooseText(row.placementName)}`;
    const existing = map.get(id);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    map.set(id, {
      id,
      campaignName: row.campaignName,
      placementName: row.placementName,
      rows: [row],
    });
  }

  return [...map.values()]
    .map((aggregate) => {
      const current = sumMetricBundles(aggregate.rows.map((row) => row.metrics));
      const identity = lookupPlacementAdjustment(
        bulkIdentity,
        aggregate.campaignName,
        aggregate.placementName
      );

      return {
        id: aggregate.id,
        campaignName: aggregate.campaignName,
        placementName: aggregate.placementName,
        current,
        previous: null,
        deltaCostPct: null,
        deltaSalesPct: null,
        campaignId: identity.campaignId,
        currentAdjustment: identity.currentAdjustment,
      };
    })
    .sort(compareMetricHeavyItems);
}

function buildRecommendations(
  searchTerms: AggregatedSearchTerm[],
  targets: AggregatedTarget[],
  placements: PlacementPerformance[],
  controls: AnalysisControls
) {
  const recommendations: Recommendation[] = [];

  for (const item of searchTerms) {
    if (shouldHarvestExact(item, controls)) {
      recommendations.push(
        buildRecommendation(
          "harvest_exact",
          item,
          {
            actionLabel: RECOMMENDATION_LABELS.harvest_exact,
            title: `将 "${item.customerSearchTerm}" 收敛为精准词`,
            reason: `该搜索词已带来 ${item.current.orders} 单，ACOS ${formatRate(item.current.acos)}，适合独立承接流量。`,
            entityLevel: "keyword",
            suggestedBid: roundCurrency(
              deriveSuggestedBid(item.currentBid, item.current.cpc, 0.95)
            ),
            suggestedMatchType: "exact",
            confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.82),
            estimatedIncrementalSales: roundCurrency(item.current.sales * 0.2),
          },
          controls
        )
      );
    }

    if (shouldHarvestProductTarget(item, controls)) {
      recommendations.push(
        buildRecommendation(
          "harvest_product_target",
          item,
          {
            actionLabel: RECOMMENDATION_LABELS.harvest_product_target,
            title: `将 "${item.customerSearchTerm}" 新建为商品定向`,
            reason: `搜索词看起来像 ASIN，且已累计 ${item.current.orders} 单，可单独建立商品定向测试。`,
            entityLevel: "product targeting",
            suggestedBid: roundCurrency(
              deriveSuggestedBid(item.currentBid, item.current.cpc, 0.98)
            ),
            suggestedTargetExpression: buildAsinTargetExpression(item.customerSearchTerm),
            confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.78),
            estimatedIncrementalSales: roundCurrency(item.current.sales * 0.16),
          },
          controls
        )
      );
    }

    if (shouldNegateExact(item, controls)) {
      recommendations.push(
        buildRecommendation(
          "negative_exact",
          item,
          {
            actionLabel: RECOMMENDATION_LABELS.negative_exact,
            title: `把 "${item.customerSearchTerm}" 加为否定精准词`,
            reason: `该搜索词已消耗 ${formatCurrency(item.current.cost)} 且无订单，建议先做流量止损。`,
            entityLevel: "negative keyword",
            suggestedMatchType: "negative-exact",
            confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.8),
            estimatedSavedSpend: roundCurrency(item.current.cost * 0.65),
          },
          controls
        )
      );
    }
  }

  for (const item of targets) {
    if (shouldLowerBid(item, controls)) {
      recommendations.push(
        buildRecommendation(
          "lower_bid",
          item,
          {
            actionLabel: RECOMMENDATION_LABELS.lower_bid,
            title: `下调 "${item.targetingText}" 出价`,
            reason: `该投放对象 ACOS ${formatRate(item.current.acos)}，已高于目标 ACOS ${formatRate(
              controls.targetAcos
            )}。`,
            entityLevel: targetEntityLevel(item.targetingType),
            suggestedBid: roundCurrency(
              deriveBidFromAcos(item.currentBid, item.current.acos, controls.targetAcos, 0.82)
            ),
            confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.76),
            estimatedSavedSpend: roundCurrency(item.current.cost * 0.18),
          },
          controls
        )
      );
    }

    if (shouldRaiseBid(item, controls)) {
      recommendations.push(
        buildRecommendation(
          "raise_bid",
          item,
          {
            actionLabel: RECOMMENDATION_LABELS.raise_bid,
            title: `提高 "${item.targetingText}" 出价`,
            reason: "该投放对象表现优于目标 ACOS，当前可适度加价放大。",
            entityLevel: targetEntityLevel(item.targetingType),
            suggestedBid: roundCurrency(
              deriveBidFromAcos(item.currentBid, item.current.acos, controls.targetAcos, 1.12)
            ),
            confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.74),
            estimatedIncrementalSales: roundCurrency(item.current.sales * 0.14),
          },
          controls
        )
      );
    }
  }

  for (const item of placements) {
    if (shouldRaisePlacement(item, controls)) {
      recommendations.push(
        buildRecommendation(
          "raise_placement_modifier",
          item,
          {
            actionLabel: RECOMMENDATION_LABELS.raise_placement_modifier,
            title: `提高 ${item.placementName} 系数`,
            reason: `${item.placementName} 当前 ACOS ${formatRate(
              item.current.acos
            )}，明显优于目标，可增加抢量。`,
            entityLevel: "placement adjustment",
            placementName: item.placementName,
            currentPlacementAdjustment: item.currentAdjustment,
            suggestedPlacementAdjustment: clampInt((item.currentAdjustment ?? 0) + 20, 0, 900),
            confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.73),
            estimatedIncrementalSales: roundCurrency(item.current.sales * 0.12),
          },
          controls
        )
      );
    }

    if (shouldLowerPlacement(item, controls)) {
      recommendations.push(
        buildRecommendation(
          "lower_placement_modifier",
          item,
          {
            actionLabel: RECOMMENDATION_LABELS.lower_placement_modifier,
            title: `降低 ${item.placementName} 系数`,
            reason: `${item.placementName} 当前 ACOS ${formatRate(
              item.current.acos
            )}，建议先收缩广告位系数。`,
            entityLevel: "placement adjustment",
            placementName: item.placementName,
            currentPlacementAdjustment: item.currentAdjustment,
            suggestedPlacementAdjustment: clampInt((item.currentAdjustment ?? 0) - 15, 0, 900),
            confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.72),
            estimatedSavedSpend: roundCurrency(item.current.cost * 0.14),
          },
          controls
        )
      );
    }
  }

  return recommendations
    .filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index)
    .sort(compareRecommendations);
}

function buildRecommendation(
  type: RecommendationType,
  item: AggregatedSearchTerm | AggregatedTarget | PlacementPerformance,
  config: {
    actionLabel: string;
    title: string;
    reason: string;
    entityLevel: string;
    suggestedBid?: number | null;
    suggestedMatchType?: string | null;
    suggestedTargetExpression?: string | null;
    placementName?: string | null;
    currentPlacementAdjustment?: number | null;
    suggestedPlacementAdjustment?: number | null;
    confidence: number;
    estimatedSavedSpend?: number;
    estimatedIncrementalSales?: number;
  },
  controls: AnalysisControls
): Recommendation {
  const reviewReasons = collectReviewReasons(type, item, config);
  const bulkExportable = reviewReasons.length === 0;
  const status = bulkExportable ? "ready" : "needs_review";
  const priority = resolvePriority(type, item.current, controls.targetAcos);

  return {
    id: `${type}::${item.id}`,
    type,
    actionLabel: config.actionLabel,
    title: config.title,
    reason: config.reason,
    priority,
    status,
    campaignName: item.campaignName,
    adGroupName: "adGroupName" in item ? item.adGroupName : "",
    campaignId: "campaignId" in item ? item.campaignId : null,
    adGroupId: "adGroupId" in item ? item.adGroupId : null,
    targetingText: "targetingText" in item ? item.targetingText : item.placementName,
    customerSearchTerm: "customerSearchTerm" in item ? item.customerSearchTerm : "",
    matchType: "matchType" in item ? item.matchType : "",
    targetingType: "targetingType" in item ? item.targetingType : "unknown",
    entityLevel: config.entityLevel,
    keywordId: "sourceKeywordId" in item ? item.sourceKeywordId : "keywordId" in item ? item.keywordId : null,
    productTargetId:
      "sourceProductTargetId" in item
        ? item.sourceProductTargetId
        : "productTargetId" in item
          ? item.productTargetId
          : null,
    currentBid: "currentBid" in item ? item.currentBid : null,
    suggestedBid: config.suggestedBid ?? null,
    suggestedMatchType: config.suggestedMatchType ?? null,
    suggestedTargetExpression: config.suggestedTargetExpression ?? null,
    placementName: config.placementName ?? ("placementName" in item ? item.placementName : null),
    currentPlacementAdjustment:
      config.currentPlacementAdjustment ??
      ("currentAdjustment" in item ? item.currentAdjustment : null),
    suggestedPlacementAdjustment: config.suggestedPlacementAdjustment ?? null,
    current: item.current,
    previous: item.previous,
    deltaCostPct: "deltaCostPct" in item ? item.deltaCostPct : null,
    deltaSalesPct: "deltaSalesPct" in item ? item.deltaSalesPct : null,
    deltaOrders: "deltaOrders" in item ? item.deltaOrders : 0,
    confidence: clampNumber(config.confidence, 0.4, 0.99),
    estimatedSavedSpend: config.estimatedSavedSpend ?? 0,
    estimatedIncrementalSales: config.estimatedIncrementalSales ?? 0,
    bulkExportable,
    reviewReasons,
  };
}

function buildAnalysisSummary(
  current: ParsedSearchTermReport,
  previous: ParsedSearchTermReport | null
): AnalysisSummary {
  return {
    current: current.summary,
    previous: previous?.summary ?? null,
    deltaCostPct: calculateDeltaPct(current.summary.cost, previous?.summary.cost ?? null),
    deltaSalesPct: calculateDeltaPct(current.summary.sales, previous?.summary.sales ?? null),
    deltaOrders: current.summary.orders - (previous?.summary.orders ?? 0),
    uniqueCampaigns: current.uniqueCampaigns,
    uniqueAdGroups: current.uniqueAdGroups,
    uniqueTargets: current.uniqueTargets,
    uniqueSearchTerms: current.uniqueSearchTerms,
  };
}

function buildRecommendationSummary(recommendations: Recommendation[]) {
  return (Object.keys(RECOMMENDATION_LABELS) as RecommendationType[]).map((type) => {
    const items = recommendations.filter((item) => item.type === type);
    return {
      type,
      label: RECOMMENDATION_LABELS[type],
      count: items.length,
      readyCount: items.filter((item) => item.bulkExportable).length,
      reviewCount: items.filter((item) => !item.bulkExportable).length,
      estimatedSavedSpend: roundCurrency(sumNumbers(items.map((item) => item.estimatedSavedSpend))),
      estimatedIncrementalSales: roundCurrency(
        sumNumbers(items.map((item) => item.estimatedIncrementalSales))
      ),
    };
  });
}

function buildMappingCoverage(
  searchTerms: AggregatedSearchTerm[],
  targets: AggregatedTarget[],
  recommendations: Recommendation[],
  bulkIdentity: BulkIdentityBundle | null
) {
  if (!bulkIdentity) {
    return null;
  }

  const campaignCoverage = ratio(
    searchTerms.filter((item) => item.campaignId !== null).length,
    searchTerms.length
  );
  const adGroupCoverage = ratio(
    searchTerms.filter((item) => item.adGroupId !== null).length,
    searchTerms.length
  );
  const actionableTargets = targets.filter(
    (item) => item.targetingType === "keyword" || item.targetingType === "product"
  );
  const mappedTargets = actionableTargets.filter(
    (item) => item.keywordId !== null || item.productTargetId !== null
  );

  return {
    campaignCoverage,
    adGroupCoverage,
    targetCoverage: ratio(mappedTargets.length, actionableTargets.length),
    readyRecommendations: recommendations.filter((item) => item.bulkExportable).length,
    reviewRecommendations: recommendations.filter((item) => !item.bulkExportable).length,
  };
}

function buildNotices(
  current: ParsedSearchTermReport,
  previous: ParsedSearchTermReport | null,
  placement: ParsedPlacementReport | null,
  bulkIdentity: BulkIdentityBundle | null,
  reviewItemCount: number
) {
  const notices = [
    ...current.meta.warnings,
    ...(previous?.meta.warnings ?? []),
    ...(placement?.meta.warnings ?? []),
    ...(bulkIdentity?.meta.warnings ?? []),
  ];

  if (!previous) {
    notices.push("未上传上一周期搜索词报表，本次无法展示周期环比。");
  }
  if (!placement) {
    notices.push("未上传 Placement 报表，广告位系数建议已跳过。");
  }
  if (!bulkIdentity) {
    notices.push("未上传 Bulk 身份表，建议仍可生成，但无法直接导出可上传 Bulk。");
  } else if (reviewItemCount > 0) {
    notices.push(`当前仍有 ${reviewItemCount} 条建议缺少映射字段，需要先在 Review 中复核。`);
  }

  return dedupeStrings(notices);
}

function shouldHarvestExact(item: AggregatedSearchTerm, controls: AnalysisControls) {
  return (
    item.customerSearchTerm !== "-" &&
    !looksLikeAsin(item.customerSearchTerm) &&
    item.current.orders >= controls.minHarvestOrders &&
    !item.hasExactKeywordAlready &&
    (item.current.acos === null || item.current.acos <= controls.targetAcos * 1.15)
  );
}

function shouldHarvestProductTarget(item: AggregatedSearchTerm, controls: AnalysisControls) {
  return (
    looksLikeAsin(item.customerSearchTerm) &&
    item.current.orders >= controls.minHarvestOrders &&
    !item.hasProductTargetAlready
  );
}

function shouldNegateExact(item: AggregatedSearchTerm, controls: AnalysisControls) {
  return (
    item.customerSearchTerm !== "-" &&
    item.current.clicks >= controls.minNegateClicks &&
    item.current.orders === 0 &&
    item.current.cost > 0 &&
    !item.hasNegativeExactAlready
  );
}

function shouldLowerBid(item: AggregatedTarget, controls: AnalysisControls) {
  return (
    item.currentBid !== null &&
    item.current.clicks >= controls.minBidClicks &&
    item.current.cost > 0 &&
    item.current.acos !== null &&
    item.current.acos > controls.targetAcos * 1.15
  );
}

function shouldRaiseBid(item: AggregatedTarget, controls: AnalysisControls) {
  return (
    item.currentBid !== null &&
    item.current.orders >= controls.minRaiseOrders &&
    item.current.clicks >= Math.max(3, controls.minRaiseOrders * 2) &&
    item.current.acos !== null &&
    item.current.acos < controls.targetAcos * 0.78
  );
}

function shouldRaisePlacement(item: PlacementPerformance, controls: AnalysisControls) {
  return (
    item.current.orders >= controls.minRaiseOrders &&
    item.current.acos !== null &&
    item.current.acos < controls.targetAcos * 0.8
  );
}

function shouldLowerPlacement(item: PlacementPerformance, controls: AnalysisControls) {
  return (
    item.current.cost > 0 &&
    item.current.acos !== null &&
    item.current.acos > controls.targetAcos * 1.18 &&
    (item.currentAdjustment ?? 0) > 0
  );
}

function collectReviewReasons(
  type: RecommendationType,
  item: AggregatedSearchTerm | AggregatedTarget | PlacementPerformance,
  config: {
    suggestedBid?: number | null;
    suggestedTargetExpression?: string | null;
  }
) {
  const reasons: string[] = [];

  if ("campaignId" in item && item.campaignId === null) {
    reasons.push("缺少 Campaign ID");
  }

  if (
    (type === "harvest_exact" ||
      type === "harvest_product_target" ||
      type === "negative_exact") &&
    "adGroupId" in item &&
    item.adGroupId === null
  ) {
    reasons.push("缺少 Ad Group ID");
  }

  if ((type === "lower_bid" || type === "raise_bid") && "targetingType" in item) {
    if (item.targetingType === "keyword" && "keywordId" in item && item.keywordId === null) {
      reasons.push("缺少 Keyword ID");
    }
    if (
      item.targetingType === "product" &&
      "productTargetId" in item &&
      item.productTargetId === null
    ) {
      reasons.push("缺少 Product Target ID");
    }
    if (item.targetingType === "auto") {
      reasons.push("自动投放对象无法稳定映射到 Bulk 行");
    }
  }

  if (type === "harvest_product_target" && !config.suggestedTargetExpression) {
    reasons.push("未识别出可用的 ASIN 定向表达式");
  }

  if ((type === "lower_bid" || type === "raise_bid") && config.suggestedBid === null) {
    reasons.push("无法计算建议出价");
  }

  return reasons;
}

function resolvePriority(
  type: RecommendationType,
  current: MetricBundle,
  targetAcos: number
): RecommendationPriority {
  if (type === "negative_exact") {
    return current.cost >= 20 || current.clicks >= 30 ? "high" : "medium";
  }
  if (type === "lower_bid" || type === "lower_placement_modifier") {
    return current.acos !== null && current.acos > targetAcos * 1.5 ? "high" : "medium";
  }
  if (type === "harvest_exact" || type === "harvest_product_target") {
    return current.orders >= 4 ? "high" : "medium";
  }
  if (type === "raise_bid" || type === "raise_placement_modifier") {
    return current.orders >= 3 ? "medium" : "low";
  }
  return "low";
}

function targetEntityLevel(targetingType: TargetingType) {
  if (targetingType === "keyword") {
    return "keyword";
  }
  if (targetingType === "product") {
    return "product targeting";
  }
  if (targetingType === "auto") {
    return "auto targeting";
  }
  return "target";
}

function deriveSuggestedBid(
  currentBid: number | null,
  currentCpc: number,
  multiplier: number
) {
  const base = currentBid ?? (currentCpc > 0 ? currentCpc : 0.75);
  return clampNumber(base * multiplier, 0.02, 50);
}

function deriveBidFromAcos(
  currentBid: number | null,
  currentAcos: number | null,
  targetAcos: number,
  fallbackMultiplier: number
) {
  if (currentBid === null) {
    return null;
  }
  if (currentAcos === null || currentAcos <= 0 || targetAcos <= 0) {
    return clampNumber(currentBid * fallbackMultiplier, 0.02, 50);
  }
  const ratioValue = clampNumber(Math.sqrt(targetAcos / currentAcos), 0.75, 1.25);
  return clampNumber(currentBid * ratioValue, 0.02, 50);
}

function calculateConfidence(orders: number, clicks: number, floor: number) {
  const orderBoost = Math.min(0.12, orders * 0.02);
  const clickBoost = Math.min(0.08, clicks / 500);
  return floor + orderBoost + clickBoost;
}

function compareRecommendations(left: Recommendation, right: Recommendation) {
  const priorityWeight = { high: 3, medium: 2, low: 1 };
  return (
    priorityWeight[right.priority] - priorityWeight[left.priority] ||
    right.current.cost - left.current.cost ||
    right.current.sales - left.current.sales
  );
}

function compareMetricHeavyItems<
  T extends { current: MetricBundle } | { metrics: MetricBundle } | { rows: Array<{ metrics: MetricBundle }> }
>(left: T, right: T) {
  const leftMetrics =
    "current" in left
      ? left.current
      : "metrics" in left
        ? left.metrics
        : sumMetricBundles(left.rows.map((row) => row.metrics));
  const rightMetrics =
    "current" in right
      ? right.current
      : "metrics" in right
        ? right.metrics
        : sumMetricBundles(right.rows.map((row) => row.metrics));
  return (
    rightMetrics.cost - leftMetrics.cost ||
    rightMetrics.orders - leftMetrics.orders ||
    rightMetrics.sales - leftMetrics.sales ||
    rightMetrics.clicks - leftMetrics.clicks
  );
}

function aggregateSearchTerms(rows: SearchTermRecord[]) {
  const map = new Map<string, SearchTermAggregate>();
  for (const row of rows) {
    const id = [
      normalizeLooseText(row.campaignName),
      normalizeLooseText(row.adGroupName),
      normalizeLooseText(row.targetingText),
      normalizeLooseText(row.matchType),
      normalizeLooseText(row.customerSearchTerm),
    ].join("::");
    const existing = map.get(id);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    map.set(id, {
      id,
      campaignName: row.campaignName,
      adGroupName: row.adGroupName,
      targetingText: row.targetingText,
      matchType: row.matchType,
      targetingType: row.targetingType,
      customerSearchTerm: row.customerSearchTerm,
      rows: [row],
    });
  }
  return map;
}

function aggregateTargets(rows: SearchTermRecord[]) {
  const map = new Map<string, TargetAggregate>();
  for (const row of rows) {
    const id = [
      normalizeLooseText(row.campaignName),
      normalizeLooseText(row.adGroupName),
      normalizeLooseText(row.targetingText),
      normalizeLooseText(row.matchType),
      normalizeLooseText(row.targetingType),
    ].join("::");
    const existing = map.get(id);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    map.set(id, {
      id,
      campaignName: row.campaignName,
      adGroupName: row.adGroupName,
      targetingText: row.targetingText,
      matchType: row.matchType,
      targetingType: row.targetingType,
      rows: [row],
    });
  }
  return map;
}

async function readWorkbook(file: File) {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    raw: false,
  });
}

function selectBestSheet(
  workbook: WorkBook,
  nameHints: string[],
  scoreChecks: ColumnCandidate[]
): WorkbookSelection {
  let best: WorkbookSelection & { score: number } | null = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, {
      defval: "",
      raw: false,
    });
    const headers = collectHeaders(rows);
    const score =
      headers.reduce((total, header) => {
        const normalizedHeader = normalizeHeader(header);
        return (
          total +
          scoreChecks.reduce((inner, candidate) => {
            return inner + (matchesCandidate(normalizedHeader, header, candidate) ? 1 : 0);
          }, 0)
        );
      }, 0) +
      nameHints.reduce((total, hint) => {
        return total + (normalizeLooseText(sheetName).includes(normalizeLooseText(hint)) ? 2 : 0);
      }, 0) +
      (rows.length > 0 ? 1 : 0);

    if (!best || score > best.score) {
      best = { sheetName, rows, score };
    }
  }

  if (best) {
    return best;
  }

  const fallbackName = workbook.SheetNames[0];
  const fallbackSheet = workbook.Sheets[fallbackName];
  return {
    sheetName: fallbackName,
    rows: fallbackSheet
      ? XLSX.utils.sheet_to_json<SheetRow>(fallbackSheet, {
          defval: "",
          raw: false,
        })
      : [],
  };
}

function collectHeaders(rows: SheetRow[]) {
  const headers = new Set<string>();
  for (const row of rows.slice(0, Math.min(rows.length, 10))) {
    for (const key of Object.keys(row)) {
      if (key) {
        headers.add(key);
      }
    }
  }
  return [...headers];
}

function resolveHeader(headers: string[], candidates: ColumnCandidate[]) {
  for (const candidate of candidates) {
    for (const header of headers) {
      const normalizedHeader = normalizeHeader(header);
      if (matchesCandidate(normalizedHeader, header, candidate)) {
        return header;
      }
    }
  }
  return null;
}

function matchesCandidate(
  normalizedHeader: string,
  rawHeader: string,
  candidate: ColumnCandidate
) {
  if (typeof candidate === "function") {
    return candidate(normalizedHeader, rawHeader);
  }
  const normalizedCandidate = normalizeLooseText(candidate);
  return (
    normalizedHeader.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedHeader)
  );
}

function readStringByHeader(row: SheetRow, header: string | null) {
  if (!header) {
    return "";
  }
  return String(row[header] ?? "").trim();
}

function readNumberByHeader(row: SheetRow, header: string | null) {
  if (!header) {
    return 0;
  }
  return parseNumberLike(row[header]) ?? 0;
}

function readRateByHeader(row: SheetRow, header: string | null, nullable = false) {
  if (!header) {
    return nullable ? null : 0;
  }
  const parsed = parseRateLike(row[header]);
  if (parsed === null) {
    return nullable ? null : 0;
  }
  return parsed;
}

function buildMetricBundle(input: {
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
  units: number;
  ctr: number;
  cpc: number;
  cvr: number;
  acos: number | null;
  roas: number;
}): MetricBundle {
  const impressions = sanitizeNumber(input.impressions);
  const clicks = sanitizeNumber(input.clicks);
  const cost = sanitizeNumber(input.cost);
  const sales = sanitizeNumber(input.sales);
  const orders = sanitizeNumber(input.orders);
  const units = sanitizeNumber(input.units || orders);
  const ctr = impressions > 0 ? clicks / impressions : sanitizeNumber(input.ctr);
  const cpc = clicks > 0 ? cost / clicks : sanitizeNumber(input.cpc);
  const cvr = clicks > 0 ? orders / clicks : sanitizeNumber(input.cvr);
  const acos = sales > 0 ? cost / sales : input.acos;
  const roas = cost > 0 ? sales / cost : sanitizeNumber(input.roas);

  return {
    impressions,
    clicks,
    cost,
    sales,
    orders,
    units,
    ctr,
    cpc,
    cvr,
    acos: typeof acos === "number" && Number.isFinite(acos) ? acos : null,
    roas,
  };
}

function sumMetricBundles(metrics: MetricBundle[]) {
  return buildMetricBundle({
    impressions: sumNumbers(metrics.map((item) => item.impressions)),
    clicks: sumNumbers(metrics.map((item) => item.clicks)),
    cost: sumNumbers(metrics.map((item) => item.cost)),
    sales: sumNumbers(metrics.map((item) => item.sales)),
    orders: sumNumbers(metrics.map((item) => item.orders)),
    units: sumNumbers(metrics.map((item) => item.units)),
    ctr: 0,
    cpc: 0,
    cvr: 0,
    acos: null,
    roas: 0,
  });
}

function calculateDeltaPct(current: number, previous: number | null) {
  if (previous === null || previous === 0) {
    return null;
  }
  return (current - previous) / previous;
}

function parseNumberLike(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || raw === "--") {
    return null;
  }
  const negative = raw.startsWith("(") && raw.endsWith(")");
  const normalized = raw.replace(/[(),￥¥$€£,%\s]/g, "");
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return negative ? -parsed : parsed;
}

function parseRateLike(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || raw === "--") {
    return null;
  }
  const parsed = parseNumberLike(raw);
  if (parsed === null) {
    return null;
  }
  if (raw.includes("%")) {
    return parsed / 100;
  }
  if (Math.abs(parsed) > 1 && Math.abs(parsed) <= 1000) {
    return parsed / 100;
  }
  return parsed;
}

function isRowEmpty(row: SheetRow) {
  return Object.values(row).every((value) => String(value ?? "").trim() === "");
}

function uniqueCount(values: string[]) {
  return new Set(values.filter(Boolean)).size;
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function sumNumbers(values: number[]) {
  return values.reduce((total, value) => total + sanitizeNumber(value), 0);
}

function sanitizeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number) {
  return Math.round(clampNumber(value, min, max));
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim() !== ""))];
}

function buildAsinTargetExpression(value: string) {
  const asin = extractAsin(value);
  return asin ? `asin="${asin}"` : null;
}

function looksLikeAsin(value: string) {
  return extractAsin(value) !== null;
}

function extractAsin(value: string) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  const quotedMatch = normalized.match(/ASIN="?([A-Z0-9]{10})"?/);
  if (quotedMatch) {
    return quotedMatch[1];
  }
  const plainMatch = normalized.match(/\b([A-Z0-9]{10})\b/);
  if (plainMatch) {
    return plainMatch[1];
  }
  return null;
}

function normalizeHeader(value: string) {
  return normalizeLooseText(value).replace(/[():[\]{}%/\\-]/g, "");
}

function normalizeLooseText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。,；：、“”‘’（）【】《》]/g, "");
}

function isCampaignHeader(normalizedHeader: string) {
  return (
    (normalizedHeader.includes("campaignname") || normalizedHeader === "campaign") &&
    !normalizedHeader.includes("id") &&
    !normalizedHeader.includes("status")
  );
}

function isAdGroupHeader(normalizedHeader: string) {
  return (
    (normalizedHeader.includes("adgroupname") || normalizedHeader === "adgroup") &&
    !normalizedHeader.includes("id") &&
    !normalizedHeader.includes("status")
  );
}

function isTargetingHeader(normalizedHeader: string) {
  return (
    (normalizedHeader.includes("targeting") ||
      normalizedHeader.includes("keywordtext") ||
      normalizedHeader === "keyword" ||
      normalizedHeader.includes("投放对象") ||
      normalizedHeader.includes("关键词文本")) &&
    !normalizedHeader.includes("id")
  );
}

function isSearchTermHeader(normalizedHeader: string) {
  return (
    (normalizedHeader.includes("customersearchterm") ||
      normalizedHeader === "searchterm" ||
      normalizedHeader.includes("搜索词")) &&
    !normalizedHeader.includes("share")
  );
}

function isMatchTypeHeader(normalizedHeader: string) {
  return normalizedHeader.includes("matchtype") || normalizedHeader.includes("匹配类型");
}

function isPlacementHeader(normalizedHeader: string) {
  return normalizedHeader.includes("placement") || normalizedHeader.includes("广告位");
}

function isImpressionsHeader(normalizedHeader: string) {
  return normalizedHeader === "impressions" || normalizedHeader.includes("展示量");
}

function isClicksHeader(normalizedHeader: string) {
  return normalizedHeader === "clicks" || normalizedHeader.includes("点击量");
}

function isSpendHeader(normalizedHeader: string) {
  return (
    normalizedHeader === "spend" ||
    normalizedHeader === "cost" ||
    normalizedHeader.includes("花费")
  );
}

function isSalesHeader(normalizedHeader: string) {
  return (
    (normalizedHeader === "sales" ||
      normalizedHeader.includes("totalsales") ||
      normalizedHeader.includes("销售额")) &&
    !normalizedHeader.includes("quantity")
  );
}

function isOrdersHeader(normalizedHeader: string) {
  return (
    normalizedHeader === "orders" ||
    normalizedHeader.includes("totalorders") ||
    normalizedHeader.includes("purchases") ||
    normalizedHeader.includes("订单")
  );
}

function isUnitsHeader(normalizedHeader: string) {
  return (
    normalizedHeader === "units" ||
    normalizedHeader.includes("totalunits") ||
    normalizedHeader.includes("salesquantity") ||
    normalizedHeader.includes("商品数量")
  );
}

function isCtrHeader(normalizedHeader: string) {
  return normalizedHeader === "ctr" || normalizedHeader.includes("点击率");
}

function isCpcHeader(normalizedHeader: string) {
  return normalizedHeader === "cpc" || normalizedHeader.includes("单次点击成本");
}

function isCvrHeader(normalizedHeader: string) {
  return normalizedHeader === "cvr" || normalizedHeader.includes("转化率");
}

function isAcosHeader(normalizedHeader: string) {
  return normalizedHeader === "acos" || normalizedHeader.includes("广告销售成本");
}

function isRoasHeader(normalizedHeader: string) {
  return normalizedHeader === "roas" || normalizedHeader.includes("广告支出回报");
}
