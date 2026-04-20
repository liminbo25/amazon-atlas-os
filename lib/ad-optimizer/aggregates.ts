import {
  buildKeywordKey,
  buildNegativeKeywordKey,
  buildProductTargetKey,
  lookupBulkEntitiesForSearchTerm,
  lookupPlacementAdjustment,
} from "@/lib/ad-optimizer/bulk-identity";
import { buildProfitView, calculateDeltaPct, compareMetricHeavyItems, sumMetricBundles } from "@/lib/ad-optimizer/metrics";
import {
  buildAdGroupKey,
  buildAsinTargetExpression,
  buildCampaignKey,
  dedupeStrings,
  normalizeLooseText,
} from "@/lib/ad-optimizer/shared";
import type {
  AdGroupPerformance,
  AggregatedSearchTerm,
  AggregatedTarget,
  AnalysisControls,
  BulkIdentityBundle,
  CampaignPerformance,
  ParsedPlacementReport,
  ParsedSearchTermReport,
  PlacementPerformance,
  PlacementRecord,
  SearchTermRecord,
} from "@/lib/ad-optimizer/types";

type SearchTermAggregateState = {
  id: string;
  rows: SearchTermRecord[];
};

type TargetAggregateState = {
  id: string;
  rows: SearchTermRecord[];
};

type CampaignAggregateState = {
  id: string;
  rows: SearchTermRecord[];
};

type AdGroupAggregateState = {
  id: string;
  rows: SearchTermRecord[];
};

type PlacementAggregateState = {
  id: string;
  campaignName: string;
  placementName: string;
  rows: PlacementRecord[];
};

export function buildAggregatedSearchTerms(
  current: ParsedSearchTermReport,
  previous: ParsedSearchTermReport | null,
  bulkIdentity: BulkIdentityBundle | null
): AggregatedSearchTerm[] {
  const currentMap = aggregateSearchTerms(current.rows);
  const previousMap = previous ? aggregateSearchTerms(previous.rows) : new Map<string, SearchTermAggregateState>();

  return [...currentMap.values()]
    .map((aggregate) => {
      const previousAggregate = previousMap.get(aggregate.id);
      const currentMetrics = sumMetricBundles(aggregate.rows.map((row) => row.metrics));
      const previousMetrics = previousAggregate
        ? sumMetricBundles(previousAggregate.rows.map((row) => row.metrics))
        : null;
      const primaryRow = pickPrimarySearchTermRow(aggregate.rows);
      const identity = lookupBulkEntitiesForSearchTerm(bulkIdentity, {
        campaignName: primaryRow.campaignName,
        adGroupName: primaryRow.adGroupName,
        targetingText: primaryRow.targetingText,
        matchType: primaryRow.matchType,
      });
      const productTargetExpression = buildAsinTargetExpression(primaryRow.customerSearchTerm);

      return {
        id: aggregate.id,
        campaignName: primaryRow.campaignName,
        adGroupName: primaryRow.adGroupName,
        portfolioName: primaryRow.portfolioName,
        targetingText: primaryRow.targetingText,
        sourceTargets: dedupeStrings(aggregate.rows.map((row) => row.targetingText)),
        sourceMatchTypes: dedupeStrings(aggregate.rows.map((row) => row.matchType)),
        matchType: primaryRow.matchType,
        targetingType: primaryRow.targetingType,
        customerSearchTerm: primaryRow.customerSearchTerm,
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
        hasExactKeywordAlready:
          bulkIdentity?.exactKeywordsByKey.has(
            buildKeywordKey(
              primaryRow.campaignName,
              primaryRow.adGroupName,
              primaryRow.customerSearchTerm,
              "exact"
            )
          ) ?? false,
        hasNegativeExactAlready:
          (bulkIdentity?.negativeKeywordsByKey.has(
            buildNegativeKeywordKey(
              primaryRow.campaignName,
              primaryRow.adGroupName,
              primaryRow.customerSearchTerm,
              "negative-exact"
            )
          ) ??
            false) ||
          (bulkIdentity?.negativeKeywordsByKey.has(
            buildNegativeKeywordKey(
              primaryRow.campaignName,
              "",
              primaryRow.customerSearchTerm,
              "negative-exact"
            )
          ) ??
            false),
        hasNegativePhraseAlready:
          (bulkIdentity?.negativeKeywordsByKey.has(
            buildNegativeKeywordKey(
              primaryRow.campaignName,
              primaryRow.adGroupName,
              primaryRow.customerSearchTerm,
              "negative-phrase"
            )
          ) ??
            false) ||
          (bulkIdentity?.negativeKeywordsByKey.has(
            buildNegativeKeywordKey(
              primaryRow.campaignName,
              "",
              primaryRow.customerSearchTerm,
              "negative-phrase"
            )
          ) ??
            false),
        hasProductTargetAlready:
          productTargetExpression !== null &&
          (bulkIdentity?.productTargetsByKey.has(
            buildProductTargetKey(
              primaryRow.campaignName,
              primaryRow.adGroupName,
              productTargetExpression
            )
          ) ??
            false),
      };
    })
    .sort(compareMetricHeavyItems);
}

export function buildAggregatedTargets(
  current: ParsedSearchTermReport,
  previous: ParsedSearchTermReport | null,
  bulkIdentity: BulkIdentityBundle | null
): AggregatedTarget[] {
  const currentMap = aggregateTargets(current.rows);
  const previousMap = previous ? aggregateTargets(previous.rows) : new Map<string, TargetAggregateState>();

  return [...currentMap.values()]
    .map((aggregate) => {
      const previousAggregate = previousMap.get(aggregate.id);
      const currentMetrics = sumMetricBundles(aggregate.rows.map((row) => row.metrics));
      const previousMetrics = previousAggregate
        ? sumMetricBundles(previousAggregate.rows.map((row) => row.metrics))
        : null;
      const primaryRow = pickPrimaryTargetRow(aggregate.rows);
      const identity = lookupBulkEntitiesForSearchTerm(bulkIdentity, {
        campaignName: primaryRow.campaignName,
        adGroupName: primaryRow.adGroupName,
        targetingText: primaryRow.targetingText,
        matchType: primaryRow.matchType,
      });

      return {
        id: aggregate.id,
        campaignName: primaryRow.campaignName,
        adGroupName: primaryRow.adGroupName,
        portfolioName: primaryRow.portfolioName,
        targetingText: primaryRow.targetingText,
        matchType: primaryRow.matchType,
        targetingType: primaryRow.targetingType,
        current: currentMetrics,
        previous: previousMetrics,
        deltaCostPct: calculateDeltaPct(currentMetrics.cost, previousMetrics?.cost ?? null),
        deltaSalesPct: calculateDeltaPct(currentMetrics.sales, previousMetrics?.sales ?? null),
        currentBid: identity.currentBid,
        campaignId: identity.campaignId,
        adGroupId: identity.adGroupId,
        keywordId: identity.keywordId,
        productTargetId: identity.productTargetId,
      };
    })
    .sort(compareMetricHeavyItems);
}

export function buildAggregatedPlacements(
  placement: ParsedPlacementReport | null,
  bulkIdentity: BulkIdentityBundle | null
): PlacementPerformance[] {
  if (!placement || !placement.usable) {
    return [];
  }

  const map = new Map<string, PlacementAggregateState>();
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
        sourceAdGroupCount: dedupeStrings(
          aggregate.rows.map((row) => row.adGroupName).filter(Boolean)
        ).length,
      };
    })
    .sort(compareMetricHeavyItems);
}

export function buildCampaignRows(
  current: ParsedSearchTermReport,
  previous: ParsedSearchTermReport | null,
  bulkIdentity: BulkIdentityBundle | null,
  controls: AnalysisControls
): CampaignPerformance[] {
  const currentMap = aggregateCampaigns(current.rows);
  const previousMap = previous ? aggregateCampaigns(previous.rows) : new Map<string, CampaignAggregateState>();

  return [...currentMap.values()]
    .map((aggregate) => {
      const previousAggregate = previousMap.get(aggregate.id);
      const currentMetrics = sumMetricBundles(aggregate.rows.map((row) => row.metrics));
      const previousMetrics = previousAggregate
        ? sumMetricBundles(previousAggregate.rows.map((row) => row.metrics))
        : null;
      const primaryRow = pickPrimarySearchTermRow(aggregate.rows);
      const campaignIdentity =
        bulkIdentity?.campaignsByName.get(buildCampaignKey(primaryRow.campaignName)) ?? null;
      const dailyBudget = campaignIdentity?.dailyBudget ?? null;

      return {
        id: aggregate.id,
        campaignName: primaryRow.campaignName,
        portfolioName: primaryRow.portfolioName,
        campaignId: campaignIdentity?.campaignId ?? null,
        current: currentMetrics,
        previous: previousMetrics,
        deltaCostPct: calculateDeltaPct(currentMetrics.cost, previousMetrics?.cost ?? null),
        deltaSalesPct: calculateDeltaPct(currentMetrics.sales, previousMetrics?.sales ?? null),
        deltaOrders: currentMetrics.orders - (previousMetrics?.orders ?? 0),
        profitView: buildProfitView(currentMetrics, controls),
        dailyBudget,
        budgetUtilization: dailyBudget && dailyBudget > 0 ? currentMetrics.cost / dailyBudget : null,
        budgetGuidance: {
          type: null,
          currentBudget: dailyBudget,
          suggestedBudget: null,
          utilization: dailyBudget && dailyBudget > 0 ? currentMetrics.cost / dailyBudget : null,
          reason: null,
        },
        placementSuggestionCount: 0,
        governanceRiskCount: 0,
        budgetSuggestionCount: 0,
        recommendationCount: 0,
      };
    })
    .sort(compareMetricHeavyItems);
}

export function buildAdGroupRows(
  current: ParsedSearchTermReport,
  previous: ParsedSearchTermReport | null,
  bulkIdentity: BulkIdentityBundle | null,
  controls: AnalysisControls
): AdGroupPerformance[] {
  const currentMap = aggregateAdGroups(current.rows);
  const previousMap = previous ? aggregateAdGroups(previous.rows) : new Map<string, AdGroupAggregateState>();

  return [...currentMap.values()]
    .map((aggregate) => {
      const previousAggregate = previousMap.get(aggregate.id);
      const currentMetrics = sumMetricBundles(aggregate.rows.map((row) => row.metrics));
      const previousMetrics = previousAggregate
        ? sumMetricBundles(previousAggregate.rows.map((row) => row.metrics))
        : null;
      const primaryRow = pickPrimarySearchTermRow(aggregate.rows);
      const campaignIdentity =
        bulkIdentity?.campaignsByName.get(buildCampaignKey(primaryRow.campaignName)) ?? null;
      const adGroupIdentity =
        bulkIdentity?.adGroupsByKey.get(
          buildAdGroupKey(primaryRow.campaignName, primaryRow.adGroupName)
        ) ?? null;

      return {
        id: aggregate.id,
        campaignName: primaryRow.campaignName,
        adGroupName: primaryRow.adGroupName,
        portfolioName: primaryRow.portfolioName,
        campaignId: campaignIdentity?.campaignId ?? null,
        adGroupId: adGroupIdentity?.adGroupId ?? null,
        current: currentMetrics,
        previous: previousMetrics,
        deltaCostPct: calculateDeltaPct(currentMetrics.cost, previousMetrics?.cost ?? null),
        deltaSalesPct: calculateDeltaPct(currentMetrics.sales, previousMetrics?.sales ?? null),
        deltaOrders: currentMetrics.orders - (previousMetrics?.orders ?? 0),
        profitView: buildProfitView(currentMetrics, controls),
        parentBudgetGuidance: {
          type: null,
          currentBudget: campaignIdentity?.dailyBudget ?? null,
          suggestedBudget: null,
          utilization:
            campaignIdentity?.dailyBudget && campaignIdentity.dailyBudget > 0
              ? currentMetrics.cost / campaignIdentity.dailyBudget
              : null,
          reason: null,
        },
        placementSuggestionCount: 0,
        governanceRiskCount: 0,
        recommendationCount: 0,
      };
    })
    .sort(compareMetricHeavyItems);
}

function aggregateSearchTerms(rows: SearchTermRecord[]) {
  const map = new Map<string, SearchTermAggregateState>();
  for (const row of rows) {
    const id = [
      normalizeLooseText(row.campaignName),
      normalizeLooseText(row.adGroupName),
      normalizeLooseText(row.customerSearchTerm),
    ].join("::");
    const existing = map.get(id);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    map.set(id, { id, rows: [row] });
  }
  return map;
}

function aggregateTargets(rows: SearchTermRecord[]) {
  const map = new Map<string, TargetAggregateState>();
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
    map.set(id, { id, rows: [row] });
  }
  return map;
}

function aggregateCampaigns(rows: SearchTermRecord[]) {
  const map = new Map<string, CampaignAggregateState>();
  for (const row of rows) {
    const id = normalizeLooseText(row.campaignName);
    const existing = map.get(id);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    map.set(id, { id, rows: [row] });
  }
  return map;
}

function aggregateAdGroups(rows: SearchTermRecord[]) {
  const map = new Map<string, AdGroupAggregateState>();
  for (const row of rows) {
    const id = [
      normalizeLooseText(row.campaignName),
      normalizeLooseText(row.adGroupName),
    ].join("::");
    const existing = map.get(id);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    map.set(id, { id, rows: [row] });
  }
  return map;
}

function pickPrimarySearchTermRow(rows: SearchTermRecord[]) {
  return [...rows].sort((left, right) => compareRows(right, left))[0];
}

function pickPrimaryTargetRow(rows: SearchTermRecord[]) {
  return [...rows].sort((left, right) => compareRows(right, left))[0];
}

function compareRows(left: SearchTermRecord, right: SearchTermRecord) {
  return (
    left.metrics.cost - right.metrics.cost ||
    left.metrics.orders - right.metrics.orders ||
    left.metrics.sales - right.metrics.sales ||
    left.metrics.clicks - right.metrics.clicks
  );
}
