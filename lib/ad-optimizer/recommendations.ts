import {
  clampInt,
  clampNumber,
  ratio,
  roundCurrency,
  sumNumbers,
} from "@/lib/ad-optimizer/metrics";
import {
  buildAdGroupKey,
  buildAsinTargetExpression,
  countWords,
  looksLikeAsin,
  normalizeLooseText,
} from "@/lib/ad-optimizer/shared";
import type {
  AdGroupPerformance,
  AggregatedSearchTerm,
  AggregatedTarget,
  AnalysisControls,
  BulkIdentityBundle,
  CampaignPerformance,
  GovernanceRisk,
  PlacementPerformance,
  Recommendation,
  RecommendationBucketSummary,
  RecommendationPriority,
  RecommendationStatus,
  RecommendationSurface,
  RecommendationType,
} from "@/lib/ad-optimizer/types";

type RecommendationPlanArgs = {
  searchTerms: AggregatedSearchTerm[];
  targets: AggregatedTarget[];
  placements: PlacementPerformance[];
  campaignRows: CampaignPerformance[];
  adGroupRows: AdGroupPerformance[];
  bulkIdentity: BulkIdentityBundle | null;
  controls: AnalysisControls;
};

type RecommendationPlanResult = {
  recommendations: Recommendation[];
  reviewItems: Recommendation[];
  governanceRisks: GovernanceRisk[];
  campaignRows: CampaignPerformance[];
  adGroupRows: AdGroupPerformance[];
  recommendationSummary: RecommendationBucketSummary[];
  mappingCoverage: {
    campaignCoverage: number;
    adGroupCoverage: number;
    targetCoverage: number;
    readyRecommendations: number;
    reviewRecommendations: number;
  } | null;
};

type RecommendationConfig = {
  actionLabel: string;
  title: string;
  reason: string;
  entityLevel: string;
  negativeScope?: Recommendation["negativeScope"];
  suggestedBid?: number | null;
  suggestedBudget?: number | null;
  suggestedMatchType?: string | null;
  suggestedTargetExpression?: string | null;
  placementName?: string | null;
  currentPlacementAdjustment?: number | null;
  suggestedPlacementAdjustment?: number | null;
  confidence: number;
  estimatedSavedSpend?: number;
  estimatedIncrementalSales?: number;
};

const RECOMMENDATION_LABELS: Record<RecommendationType, string> = {
  harvest_exact: "新增精准词",
  harvest_product_target: "新增商品定向",
  negative_exact: "否定精准",
  negative_phrase: "否定词组",
  governance_negative_exact: "防内耗否定精准",
  governance_negative_phrase: "防内耗否定词组",
  lower_bid: "降低竞价",
  raise_bid: "提高竞价",
  raise_placement_modifier: "提高广告位系数",
  lower_placement_modifier: "降低广告位系数",
  watch_placement_modifier: "观察广告位系数",
  increase_budget: "预算放量",
  decrease_budget: "预算收缩",
};

const RECOMMENDATION_SURFACES: Record<RecommendationType, RecommendationSurface> = {
  harvest_exact: "harvest",
  harvest_product_target: "harvest",
  negative_exact: "governance",
  negative_phrase: "governance",
  governance_negative_exact: "governance",
  governance_negative_phrase: "governance",
  lower_bid: "bid",
  raise_bid: "bid",
  raise_placement_modifier: "placement",
  lower_placement_modifier: "placement",
  watch_placement_modifier: "placement",
  increase_budget: "budget",
  decrease_budget: "budget",
};

export function buildRecommendationPlan(
  args: RecommendationPlanArgs
): RecommendationPlanResult {
  const recommendations: Recommendation[] = [];
  const negativeDedupe = new Set<string>();

  const governance = buildGovernanceRecommendations(args.searchTerms, args.controls, negativeDedupe);
  recommendations.push(...governance.recommendations);

  for (const item of args.searchTerms) {
    const harvestExact = buildHarvestExactRecommendation(item, args.controls);
    if (harvestExact) {
      recommendations.push(harvestExact);
    }

    const harvestProductTarget = buildHarvestProductTargetRecommendation(item, args.controls);
    if (harvestProductTarget) {
      recommendations.push(harvestProductTarget);
    }

    const wasteNegative = buildWasteNegativeRecommendation(item, args.controls, negativeDedupe);
    if (wasteNegative) {
      recommendations.push(wasteNegative);
    }
  }

  for (const item of args.targets) {
    const lowerBid = buildLowerBidRecommendation(item, args.controls);
    if (lowerBid) {
      recommendations.push(lowerBid);
    }

    const raiseBid = buildRaiseBidRecommendation(item, args.controls);
    if (raiseBid) {
      recommendations.push(raiseBid);
    }
  }

  for (const item of args.placements) {
    const lowerPlacement = buildLowerPlacementRecommendation(item, args.controls);
    if (lowerPlacement) {
      recommendations.push(lowerPlacement);
      continue;
    }

    const raisePlacement = buildRaisePlacementRecommendation(item, args.controls);
    if (raisePlacement) {
      recommendations.push(raisePlacement);
      continue;
    }

    const watchPlacement = buildWatchPlacementRecommendation(item, args.controls);
    if (watchPlacement) {
      recommendations.push(watchPlacement);
    }
  }

  const budgetRecommendations = buildBudgetRecommendations(args.campaignRows, args.controls);
  recommendations.push(...budgetRecommendations.recommendations);

  const dedupedRecommendations = dedupeRecommendations(recommendations).sort(compareRecommendations);
  const reviewItems = dedupedRecommendations.filter((item) => !item.bulkExportable);
  const campaignRows = annotateCampaignRows(
    args.campaignRows,
    dedupedRecommendations,
    governance.risks,
    budgetRecommendations.guidance
  );
  const adGroupRows = annotateAdGroupRows(
    args.adGroupRows,
    campaignRows,
    dedupedRecommendations,
    governance.risks
  );

  return {
    recommendations: dedupedRecommendations,
    reviewItems,
    governanceRisks: governance.risks,
    campaignRows,
    adGroupRows,
    recommendationSummary: buildRecommendationSummary(dedupedRecommendations),
    mappingCoverage: buildMappingCoverage(
      args.searchTerms,
      args.targets,
      dedupedRecommendations,
      args.bulkIdentity
    ),
  };
}

function buildHarvestExactRecommendation(
  item: AggregatedSearchTerm,
  controls: AnalysisControls
) {
  const safeAcos = resolveSafeAcos(controls);
  if (
    item.customerSearchTerm === "-" ||
    looksLikeAsin(item.customerSearchTerm) ||
    item.current.orders < controls.minHarvestOrders ||
    item.hasExactKeywordAlready ||
    (item.current.acos !== null && item.current.acos > safeAcos * 1.15)
  ) {
    return null;
  }

  return buildRecommendation(
    "harvest_exact",
    item,
    {
      actionLabel: RECOMMENDATION_LABELS.harvest_exact,
      title: `把“${item.customerSearchTerm}”收词为精准词`,
      reason: `该搜索词已贡献 ${item.current.orders} 单，ACOS ${formatMaybeRate(
        item.current.acos
      )}，适合拆出来单独控量和控价。`,
      entityLevel: "keyword",
      suggestedBid: roundCurrency(deriveSuggestedBid(item.currentBid, item.current.cpc, 0.96)),
      suggestedMatchType: "exact",
      confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.82),
      estimatedIncrementalSales: roundCurrency(item.current.sales * 0.2),
    },
    controls
  );
}

function buildHarvestProductTargetRecommendation(
  item: AggregatedSearchTerm,
  controls: AnalysisControls
) {
  if (
    !looksLikeAsin(item.customerSearchTerm) ||
    item.current.orders < controls.minHarvestOrders ||
    item.hasProductTargetAlready
  ) {
    return null;
  }

  return buildRecommendation(
    "harvest_product_target",
    item,
    {
      actionLabel: RECOMMENDATION_LABELS.harvest_product_target,
      title: `把“${item.customerSearchTerm}”转成商品定向`,
      reason: `该搜索词看起来是 ASIN，且已产生 ${item.current.orders} 单，建议转成商品定向独立承接。`,
      entityLevel: "product targeting",
      suggestedBid: roundCurrency(deriveSuggestedBid(item.currentBid, item.current.cpc, 0.98)),
      suggestedTargetExpression: buildAsinTargetExpression(item.customerSearchTerm),
      confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.79),
      estimatedIncrementalSales: roundCurrency(item.current.sales * 0.16),
    },
    controls
  );
}

function buildWasteNegativeRecommendation(
  item: AggregatedSearchTerm,
  controls: AnalysisControls,
  negativeDedupe: Set<string>
) {
  if (
    item.customerSearchTerm === "-" ||
    item.current.clicks < controls.minNegateClicks ||
    item.current.orders > 0 ||
    item.current.cost <= 0
  ) {
    return null;
  }

  const usePhrase =
    countWords(item.customerSearchTerm) >= 3 &&
    item.current.clicks >= controls.minNegateClicks * 1.35 &&
    !item.hasNegativePhraseAlready;
  const suggestedMatchType = usePhrase ? "negative-phrase" : "negative-exact";
  const dedupeKey = buildNegativeRecommendationKey(
    item.campaignName,
    item.adGroupName,
    item.customerSearchTerm,
    "ad_group",
    suggestedMatchType
  );

  if (negativeDedupe.has(dedupeKey)) {
    return null;
  }
  if ((usePhrase && item.hasNegativePhraseAlready) || (!usePhrase && item.hasNegativeExactAlready)) {
    return null;
  }

  negativeDedupe.add(dedupeKey);

  const type = usePhrase ? "negative_phrase" : "negative_exact";
  return buildRecommendation(
    type,
    item,
    {
      actionLabel: RECOMMENDATION_LABELS[type],
      title: `为“${item.customerSearchTerm}”补充${usePhrase ? "否定词组" : "否定精准"}`,
      reason: `该词已消耗 ${formatMaybeCurrency(item.current.cost)} 且 0 单，建议先在广告组层做止损。`,
      entityLevel: "negative keyword",
      negativeScope: "ad_group",
      suggestedMatchType,
      confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.78),
      estimatedSavedSpend: roundCurrency(item.current.cost * 0.65),
    },
    controls
  );
}

function buildLowerBidRecommendation(item: AggregatedTarget, controls: AnalysisControls) {
  const safeAcos = resolveSafeAcos(controls);
  if (
    item.currentBid === null ||
    item.current.clicks < controls.minBidClicks ||
    item.current.cost <= 0 ||
    item.current.acos === null ||
    item.current.acos <= safeAcos * 1.12
  ) {
    return null;
  }

  return buildRecommendation(
    "lower_bid",
    item,
    {
      actionLabel: RECOMMENDATION_LABELS.lower_bid,
      title: `下调“${item.targetingText}”竞价`,
      reason: `该投放对象 ACOS ${formatMaybeRate(item.current.acos)}，高于当前策略安全线 ${formatMaybeRate(
        safeAcos
      )}。`,
      entityLevel: targetEntityLevel(item.targetingType),
      suggestedBid: roundCurrency(
        deriveBidFromAcos(item.currentBid, item.current.acos, safeAcos, 0.84)
      ),
      confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.76),
      estimatedSavedSpend: roundCurrency(item.current.cost * 0.18),
    },
    controls
  );
}

function buildRaiseBidRecommendation(item: AggregatedTarget, controls: AnalysisControls) {
  const safeAcos = resolveSafeAcos(controls);
  if (
    item.currentBid === null ||
    item.current.orders < controls.minRaiseOrders ||
    item.current.clicks < Math.max(3, controls.minRaiseOrders * 2) ||
    item.current.acos === null ||
    item.current.acos >= safeAcos * 0.76
  ) {
    return null;
  }

  return buildRecommendation(
    "raise_bid",
    item,
    {
      actionLabel: RECOMMENDATION_LABELS.raise_bid,
      title: `提高“${item.targetingText}”竞价`,
      reason: "该投放对象在当前策略下表现明显优于目标 ACOS，适合适度提价扩量。",
      entityLevel: targetEntityLevel(item.targetingType),
      suggestedBid: roundCurrency(
        deriveBidFromAcos(item.currentBid, item.current.acos, safeAcos, 1.12)
      ),
      confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.74),
      estimatedIncrementalSales: roundCurrency(item.current.sales * 0.14),
    },
    controls
  );
}

function buildRaisePlacementRecommendation(
  item: PlacementPerformance,
  controls: AnalysisControls
) {
  const safeAcos = resolveSafeAcos(controls);
  if (
    item.current.clicks < controls.minPlacementClicks &&
    item.current.orders < controls.minRaiseOrders
  ) {
    return null;
  }
  if (item.current.acos === null || item.current.acos >= safeAcos * 0.82) {
    return null;
  }

  return buildRecommendation(
    "raise_placement_modifier",
    item,
    {
      actionLabel: RECOMMENDATION_LABELS.raise_placement_modifier,
      title: `提高 ${item.placementName} 系数`,
      reason: `${item.placementName} 当前 ACOS ${formatMaybeRate(
        item.current.acos
      )}，优于策略安全线，可尝试继续抢量。`,
      entityLevel: "placement adjustment",
      placementName: item.placementName,
      currentPlacementAdjustment: item.currentAdjustment,
      suggestedPlacementAdjustment: clampInt((item.currentAdjustment ?? 0) + 20, 0, 900),
      confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.73),
      estimatedIncrementalSales: roundCurrency(item.current.sales * 0.12),
    },
    controls
  );
}

function buildLowerPlacementRecommendation(
  item: PlacementPerformance,
  controls: AnalysisControls
) {
  const safeAcos = resolveSafeAcos(controls);
  if (
    item.current.cost <= 0 ||
    item.current.acos === null ||
    item.current.acos <= safeAcos * 1.18 ||
    (item.currentAdjustment ?? 0) <= 0
  ) {
    return null;
  }

  return buildRecommendation(
    "lower_placement_modifier",
    item,
    {
      actionLabel: RECOMMENDATION_LABELS.lower_placement_modifier,
      title: `降低 ${item.placementName} 系数`,
      reason: `${item.placementName} 当前 ACOS ${formatMaybeRate(
        item.current.acos
      )}，已明显高于策略安全线，建议先回收曝光。`,
      entityLevel: "placement adjustment",
      placementName: item.placementName,
      currentPlacementAdjustment: item.currentAdjustment,
      suggestedPlacementAdjustment: clampInt((item.currentAdjustment ?? 0) - 15, 0, 900),
      confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.72),
      estimatedSavedSpend: roundCurrency(item.current.cost * 0.14),
    },
    controls
  );
}

function buildWatchPlacementRecommendation(
  item: PlacementPerformance,
  controls: AnalysisControls
) {
  const safeAcos = resolveSafeAcos(controls);
  if (
    item.current.cost < controls.minCampaignSpend / 2 ||
    item.current.acos === null ||
    item.current.orders === 0
  ) {
    return null;
  }
  if (Math.abs(item.current.acos - safeAcos) > safeAcos * 0.12) {
    return null;
  }

  return buildRecommendation(
    "watch_placement_modifier",
    item,
    {
      actionLabel: RECOMMENDATION_LABELS.watch_placement_modifier,
      title: `观察 ${item.placementName} 系数`,
      reason: `${item.placementName} 当前 ACOS ${formatMaybeRate(
        item.current.acos
      )} 接近策略安全线，建议先观察 1 个周期再做大改。`,
      entityLevel: "placement adjustment",
      placementName: item.placementName,
      currentPlacementAdjustment: item.currentAdjustment,
      suggestedPlacementAdjustment: item.currentAdjustment ?? 0,
      confidence: calculateConfidence(item.current.orders, item.current.clicks, 0.66),
    },
    controls
  );
}

function buildBudgetRecommendations(
  campaignRows: CampaignPerformance[],
  controls: AnalysisControls
) {
  const guidance = new Map<string, CampaignPerformance["budgetGuidance"]>();
  const recommendations: Recommendation[] = [];
  const safeAcos = resolveSafeAcos(controls);

  for (const row of campaignRows) {
    if (row.dailyBudget === null || row.current.cost < controls.minCampaignSpend) {
      guidance.set(row.id, row.budgetGuidance);
      continue;
    }

    const utilization = row.budgetUtilization;
    const profitable = isProfitable(row, controls);
    if (
      utilization !== null &&
      utilization >= controls.minBudgetUsagePct &&
      row.current.orders >= controls.minRaiseOrders &&
      profitable
    ) {
      const suggestedBudget = roundCurrency(row.dailyBudget * (1 + controls.budgetIncreasePct));
      const recommendation = buildRecommendation(
        "increase_budget",
        row,
        {
          actionLabel: RECOMMENDATION_LABELS.increase_budget,
          title: `提高 ${row.campaignName} 预算`,
          reason: `该 campaign 已用掉 ${Math.round(utilization * 100)}% 日预算，且 ACOS ${formatMaybeRate(
            row.current.acos
          )} 仍在安全线 ${formatMaybeRate(safeAcos)} 内。`,
          entityLevel: "campaign",
          suggestedBudget,
          confidence: calculateConfidence(row.current.orders, row.current.clicks, 0.78),
          estimatedIncrementalSales: roundCurrency(row.current.sales * 0.12),
        },
        controls
      );
      recommendations.push(recommendation);
      guidance.set(row.id, {
        type: "increase_budget",
        currentBudget: row.dailyBudget,
        suggestedBudget,
        utilization,
        reason: recommendation.reason,
      });
      continue;
    }

    if (
      utilization !== null &&
      utilization >= 0.4 &&
      row.current.acos !== null &&
      row.current.acos > safeAcos * 1.18
    ) {
      const suggestedBudget = roundCurrency(
        Math.max(row.current.cost * 1.1, row.dailyBudget * (1 - controls.budgetDecreasePct))
      );
      const recommendation = buildRecommendation(
        "decrease_budget",
        row,
        {
          actionLabel: RECOMMENDATION_LABELS.decrease_budget,
          title: `收缩 ${row.campaignName} 预算`,
          reason: `该 campaign 已用掉 ${Math.round(utilization * 100)}% 日预算，但 ACOS ${formatMaybeRate(
            row.current.acos
          )} 高于安全线 ${formatMaybeRate(safeAcos)}，建议先缩预算控损。`,
          entityLevel: "campaign",
          suggestedBudget,
          confidence: calculateConfidence(row.current.orders, row.current.clicks, 0.74),
          estimatedSavedSpend: roundCurrency(Math.max(0, row.dailyBudget - suggestedBudget)),
        },
        controls
      );
      recommendations.push(recommendation);
      guidance.set(row.id, {
        type: "decrease_budget",
        currentBudget: row.dailyBudget,
        suggestedBudget,
        utilization,
        reason: recommendation.reason,
      });
      continue;
    }

    guidance.set(row.id, row.budgetGuidance);
  }

  return {
    recommendations,
    guidance,
  };
}

function buildGovernanceRecommendations(
  searchTerms: AggregatedSearchTerm[],
  controls: AnalysisControls,
  negativeDedupe: Set<string>
) {
  const grouped = new Map<string, AggregatedSearchTerm[]>();
  for (const item of searchTerms) {
    const key = normalizeLooseText(item.customerSearchTerm);
    if (!key || item.customerSearchTerm === "-") {
      continue;
    }
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  const risks: GovernanceRisk[] = [];
  const recommendations: Recommendation[] = [];

  for (const [normalizedTerm, bucket] of grouped.entries()) {
    if (bucket.length < 2) {
      continue;
    }

    const ranked = [...bucket].sort(compareGovernanceCandidates);
    const winner = ranked[0];
    if (winner.current.orders <= 0 && winner.current.sales <= 0) {
      continue;
    }

    const losers = ranked.filter((candidate, index) => {
      if (index === 0 || candidate.current.cost <= 0) {
        return false;
      }
      if (candidate.current.orders > 0 && winner.current.orders <= candidate.current.orders) {
        return false;
      }
      if (
        candidate.current.orders > 0 &&
        candidate.current.acos !== null &&
        winner.current.acos !== null &&
        candidate.current.acos <= winner.current.acos * 1.12
      ) {
        return false;
      }
      return true;
    });

    if (losers.length === 0) {
      continue;
    }

    const overlapType = losers.some((loser) => loser.campaignName !== winner.campaignName)
      ? "cross_campaign"
      : "cross_ad_group";
    const suggestedScope = overlapType === "cross_campaign" ? "campaign" : "ad_group";
    const suggestedMatchType =
      countWords(winner.customerSearchTerm) >= 3 &&
      (overlapType === "cross_campaign" || losers.length > 1)
        ? "negative-phrase"
        : "negative-exact";

    const recommendationIds: string[] = [];
    const actionableLosers: GovernanceRisk["losers"] = [];

    for (const loser of losers) {
      const dedupeKey = buildNegativeRecommendationKey(
        loser.campaignName,
        loser.adGroupName,
        loser.customerSearchTerm,
        suggestedScope,
        suggestedMatchType
      );
      if (negativeDedupe.has(dedupeKey) || hasExistingNegative(loser, suggestedMatchType)) {
        continue;
      }

      negativeDedupe.add(dedupeKey);
      const recommendationType =
        suggestedMatchType === "negative-phrase"
          ? "governance_negative_phrase"
          : "governance_negative_exact";
      const recommendation = buildRecommendation(
        recommendationType,
        loser,
        {
          actionLabel: RECOMMENDATION_LABELS[recommendationType],
          title: `为“${loser.customerSearchTerm}”补充防内耗否词`,
          reason: `同词已在 ${winner.campaignName} / ${winner.adGroupName} 的“${winner.targetingText}”里拿到更优订单表现，建议在低效结构上补否词，避免重复抢词。`,
          entityLevel: "negative keyword",
          negativeScope: suggestedScope,
          suggestedMatchType,
          confidence: calculateConfidence(loser.current.orders, loser.current.clicks, 0.83),
          estimatedSavedSpend: roundCurrency(loser.current.cost * 0.55),
        },
        controls
      );
      recommendations.push(recommendation);
      recommendationIds.push(recommendation.id);
      actionableLosers.push({
        campaignName: loser.campaignName,
        adGroupName: loser.adGroupName,
        targetingText: loser.targetingText,
        spend: loser.current.cost,
        sales: loser.current.sales,
        orders: loser.current.orders,
        acos: loser.current.acos,
      });
    }

    if (recommendationIds.length === 0) {
      continue;
    }

    risks.push({
      id: `risk::${normalizedTerm}`,
      searchTerm: winner.customerSearchTerm,
      overlapType,
      severity: resolveGovernanceSeverity(actionableLosers, overlapType),
      winningCampaignName: winner.campaignName,
      winningAdGroupName: winner.adGroupName,
      winningTargetingText: winner.targetingText,
      losers: actionableLosers,
      spendAtRisk: roundCurrency(sumNumbers(actionableLosers.map((item) => item.spend))),
      suggestedMatchType,
      suggestedScope,
      reason:
        overlapType === "cross_campaign"
          ? "同一搜索词正在跨 campaign 重复抢量，建议在低效 campaign 层补防内耗否词。"
          : "同一搜索词正在同 campaign 多广告组重复抢量，建议在低效 ad group 层补防内耗否词。",
      affectedCampaignNames: [...new Set(actionableLosers.map((item) => item.campaignName))],
      affectedAdGroupKeys: [
        ...new Set(
          actionableLosers.map((item) => buildAdGroupKey(item.campaignName, item.adGroupName))
        ),
      ],
      recommendationIds,
    });
  }

  return { risks, recommendations };
}

function annotateCampaignRows(
  campaignRows: CampaignPerformance[],
  recommendations: Recommendation[],
  governanceRisks: GovernanceRisk[],
  budgetGuidance: Map<string, CampaignPerformance["budgetGuidance"]>
) {
  const recommendationMap = new Map<
    string,
    { total: number; placement: number; budget: number }
  >();

  for (const recommendation of recommendations) {
    const key = normalizeLooseText(recommendation.campaignName);
    const current = recommendationMap.get(key) ?? { total: 0, placement: 0, budget: 0 };
    current.total += 1;
    if (recommendation.surface === "placement") {
      current.placement += 1;
    }
    if (recommendation.surface === "budget") {
      current.budget += 1;
    }
    recommendationMap.set(key, current);
  }

  const riskMap = new Map<string, number>();
  for (const risk of governanceRisks) {
    for (const campaignName of risk.affectedCampaignNames) {
      const key = normalizeLooseText(campaignName);
      riskMap.set(key, (riskMap.get(key) ?? 0) + 1);
    }
  }

  return campaignRows.map((row) => {
    const key = normalizeLooseText(row.campaignName);
    const counts = recommendationMap.get(key) ?? { total: 0, placement: 0, budget: 0 };
    return {
      ...row,
      budgetGuidance: budgetGuidance.get(row.id) ?? row.budgetGuidance,
      placementSuggestionCount: counts.placement,
      governanceRiskCount: riskMap.get(key) ?? 0,
      budgetSuggestionCount: counts.budget,
      recommendationCount: counts.total,
    };
  });
}

function annotateAdGroupRows(
  adGroupRows: AdGroupPerformance[],
  campaignRows: CampaignPerformance[],
  recommendations: Recommendation[],
  governanceRisks: GovernanceRisk[]
) {
  const campaignMap = new Map(
    campaignRows.map((row) => [normalizeLooseText(row.campaignName), row])
  );
  const recommendationMap = new Map<string, number>();
  const placementMap = new Map<string, number>();

  for (const recommendation of recommendations) {
    const key = buildAdGroupKey(recommendation.campaignName, recommendation.adGroupName);
    recommendationMap.set(key, (recommendationMap.get(key) ?? 0) + 1);

    if (recommendation.surface === "placement") {
      const campaignKey = normalizeLooseText(recommendation.campaignName);
      placementMap.set(campaignKey, (placementMap.get(campaignKey) ?? 0) + 1);
    }
  }

  const riskMap = new Map<string, number>();
  for (const risk of governanceRisks) {
    for (const adGroupKey of risk.affectedAdGroupKeys) {
      riskMap.set(adGroupKey, (riskMap.get(adGroupKey) ?? 0) + 1);
    }
  }

  return adGroupRows.map((row) => {
    const key = buildAdGroupKey(row.campaignName, row.adGroupName);
    const campaignKey = normalizeLooseText(row.campaignName);
    const parentCampaign = campaignMap.get(campaignKey);

    return {
      ...row,
      parentBudgetGuidance: parentCampaign?.budgetGuidance ?? row.parentBudgetGuidance,
      placementSuggestionCount: placementMap.get(campaignKey) ?? 0,
      governanceRiskCount: riskMap.get(key) ?? 0,
      recommendationCount:
        (recommendationMap.get(key) ?? 0) +
        (placementMap.get(campaignKey) ?? 0) +
        (parentCampaign?.budgetSuggestionCount ?? 0),
    };
  });
}

function buildRecommendation(
  type: RecommendationType,
  item:
    | AggregatedSearchTerm
    | AggregatedTarget
    | PlacementPerformance
    | CampaignPerformance,
  config: RecommendationConfig,
  controls: AnalysisControls
): Recommendation {
  const reviewReasons = collectReviewReasons(type, item, config);
  const bulkExportable = reviewReasons.length === 0;
  const status: RecommendationStatus = bulkExportable ? "ready" : "needs_review";

  return {
    id: `${type}::${item.id}`,
    type,
    surface: RECOMMENDATION_SURFACES[type],
    actionLabel: config.actionLabel,
    title: config.title,
    reason: config.reason,
    priority: resolvePriority(type, item, controls),
    status,
    campaignName: item.campaignName,
    adGroupName: "adGroupName" in item ? item.adGroupName : "",
    campaignId: "campaignId" in item ? item.campaignId : null,
    adGroupId: "adGroupId" in item ? item.adGroupId : null,
    targetingText:
      "targetingText" in item
        ? item.targetingText
        : "placementName" in item
          ? item.placementName
          : item.campaignName,
    customerSearchTerm: "customerSearchTerm" in item ? item.customerSearchTerm : "",
    matchType: "matchType" in item ? item.matchType : "",
    targetingType: "targetingType" in item ? item.targetingType : "unknown",
    entityLevel: config.entityLevel,
    negativeScope: config.negativeScope ?? null,
    keywordId:
      "sourceKeywordId" in item
        ? item.sourceKeywordId
        : "keywordId" in item
          ? item.keywordId
          : null,
    productTargetId:
      "sourceProductTargetId" in item
        ? item.sourceProductTargetId
        : "productTargetId" in item
          ? item.productTargetId
          : null,
    currentBid: "currentBid" in item ? item.currentBid : null,
    suggestedBid: config.suggestedBid ?? null,
    currentBudget: "dailyBudget" in item ? item.dailyBudget : null,
    suggestedBudget: config.suggestedBudget ?? null,
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

function collectReviewReasons(
  type: RecommendationType,
  item:
    | AggregatedSearchTerm
    | AggregatedTarget
    | PlacementPerformance
    | CampaignPerformance,
  config: RecommendationConfig
) {
  const reasons: string[] = [];
  const campaignId = "campaignId" in item ? item.campaignId : null;
  const adGroupId = "adGroupId" in item ? item.adGroupId : null;

  if (campaignId === null) {
    reasons.push("缺少 Campaign ID");
  }

  if (
    (type === "harvest_exact" ||
      type === "harvest_product_target" ||
      type === "negative_exact" ||
      type === "negative_phrase" ||
      type === "governance_negative_exact" ||
      type === "governance_negative_phrase") &&
    config.negativeScope !== "campaign" &&
    adGroupId === null
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
      reasons.push("自动投放对象无法稳定映射成 bulk 更新行");
    }
  }

  if (type === "harvest_product_target" && !config.suggestedTargetExpression) {
    reasons.push("未生成可用的商品定向表达式");
  }
  if ((type === "lower_bid" || type === "raise_bid") && config.suggestedBid === null) {
    reasons.push("无法计算建议竞价");
  }
  if (
    (type === "raise_placement_modifier" || type === "lower_placement_modifier") &&
    config.suggestedPlacementAdjustment === null
  ) {
    reasons.push("缺少广告位系数值");
  }
  if (type === "watch_placement_modifier") {
    reasons.push("观察项只进入 Review，不直接写入 bulk");
  }
  if ((type === "increase_budget" || type === "decrease_budget") && config.suggestedBudget === null) {
    reasons.push("缺少建议预算值");
  }

  return reasons;
}

function buildRecommendationSummary(recommendations: Recommendation[]) {
  return (Object.keys(RECOMMENDATION_LABELS) as RecommendationType[]).map((type) => {
    const items = recommendations.filter((item) => item.type === type);
    return {
      type,
      label: RECOMMENDATION_LABELS[type],
      surface: RECOMMENDATION_SURFACES[type],
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

function dedupeRecommendations(recommendations: Recommendation[]) {
  const seen = new Set<string>();
  const results: Recommendation[] = [];
  for (const recommendation of recommendations) {
    if (seen.has(recommendation.id)) {
      continue;
    }
    seen.add(recommendation.id);
    results.push(recommendation);
  }
  return results;
}

function resolvePriority(
  type: RecommendationType,
  item:
    | AggregatedSearchTerm
    | AggregatedTarget
    | PlacementPerformance
    | CampaignPerformance,
  controls: AnalysisControls
): RecommendationPriority {
  if (type === "watch_placement_modifier") {
    return "low";
  }
  if (type === "increase_budget" || type === "decrease_budget") {
    return item.current.cost >= controls.minCampaignSpend * 2 ? "high" : "medium";
  }
  if (
    type === "negative_exact" ||
    type === "negative_phrase" ||
    type === "governance_negative_exact" ||
    type === "governance_negative_phrase"
  ) {
    return item.current.cost >= 20 || item.current.clicks >= 30 ? "high" : "medium";
  }
  if (type === "lower_bid" || type === "lower_placement_modifier") {
    return item.current.acos !== null && item.current.acos > resolveSafeAcos(controls) * 1.45
      ? "high"
      : "medium";
  }
  if (type === "harvest_exact" || type === "harvest_product_target") {
    return item.current.orders >= 4 ? "high" : "medium";
  }
  if (type === "raise_bid" || type === "raise_placement_modifier") {
    return item.current.orders >= 3 ? "medium" : "low";
  }
  return "low";
}

function resolveGovernanceSeverity(
  losers: GovernanceRisk["losers"],
  overlapType: GovernanceRisk["overlapType"]
) {
  const spendAtRisk = sumNumbers(losers.map((item) => item.spend));
  if (overlapType === "cross_campaign" && spendAtRisk >= 15) {
    return "high";
  }
  if (spendAtRisk >= 20 || losers.length >= 3) {
    return "high";
  }
  if (spendAtRisk >= 8) {
    return "medium";
  }
  return "low";
}

function compareRecommendations(left: Recommendation, right: Recommendation) {
  const priorityWeight = { high: 3, medium: 2, low: 1 };
  return (
    priorityWeight[right.priority] - priorityWeight[left.priority] ||
    right.current.cost - left.current.cost ||
    right.current.sales - left.current.sales
  );
}

function compareGovernanceCandidates(
  left: AggregatedSearchTerm,
  right: AggregatedSearchTerm
) {
  return (
    right.current.orders - left.current.orders ||
    right.current.sales - left.current.sales ||
    (left.current.acos ?? Number.POSITIVE_INFINITY) -
      (right.current.acos ?? Number.POSITIVE_INFINITY) ||
    right.current.cost - left.current.cost
  );
}

function buildNegativeRecommendationKey(
  campaignName: string,
  adGroupName: string,
  customerSearchTerm: string,
  scope: Recommendation["negativeScope"],
  matchType: string
) {
  return [
    normalizeLooseText(campaignName),
    scope === "campaign" ? "" : normalizeLooseText(adGroupName),
    normalizeLooseText(customerSearchTerm),
    normalizeLooseText(matchType),
  ].join("::");
}

function hasExistingNegative(
  item: AggregatedSearchTerm,
  suggestedMatchType: "negative-exact" | "negative-phrase"
) {
  return suggestedMatchType === "negative-exact"
    ? item.hasNegativeExactAlready
    : item.hasNegativePhraseAlready;
}

function isProfitable(row: CampaignPerformance, controls: AnalysisControls) {
  if (row.profitView.estimatedProfit !== null) {
    return row.profitView.estimatedProfit > 0;
  }
  return row.current.acos !== null && row.current.acos <= resolveSafeAcos(controls);
}

function targetEntityLevel(targetingType: Recommendation["targetingType"]) {
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

function resolveSafeAcos(controls: AnalysisControls) {
  if (controls.grossMarginPct !== null) {
    return Math.max(0.05, controls.grossMarginPct - controls.profitSafetyMarginPct);
  }
  return controls.targetAcos;
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

function formatMaybeCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `$${value.toFixed(2)}`;
}

function formatMaybeRate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `${(value * 100).toFixed(1)}%`;
}
