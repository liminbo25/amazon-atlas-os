import { buildAdGroupRows, buildAggregatedPlacements, buildAggregatedSearchTerms, buildAggregatedTargets, buildCampaignRows } from "@/lib/ad-optimizer/aggregates";
import { buildProfitView, calculateDeltaPct, formatCurrency, formatRate } from "@/lib/ad-optimizer/metrics";
import { parseBulkIdentityWorkbookFile } from "@/lib/ad-optimizer/bulk-identity";
import { parsePlacementWorkbookFile, parseSearchTermWorkbookFile } from "@/lib/ad-optimizer/report-parsers";
import {
  DEFAULT_ANALYSIS_CONTROLS,
  getStrategyTemplate,
  mergeAnalysisControls,
} from "@/lib/ad-optimizer/strategy-templates";
import { dedupeStrings } from "@/lib/ad-optimizer/shared";
import { buildRecommendationPlan } from "@/lib/ad-optimizer/recommendations";
import type {
  AdOptimizerAnalysisResult,
  AnalysisControls,
  AnalysisSummary,
  ParsedPlacementReport,
  ParsedSearchTermReport,
} from "@/lib/ad-optimizer/types";

type AnalysisFileArgs = {
  currentFile: File;
  previousFile?: File | null;
  placementFile?: File | null;
  bulkIdentityFile?: File | null;
  controls?: Partial<AnalysisControls>;
};

export { DEFAULT_ANALYSIS_CONTROLS, formatCurrency, formatRate };

export async function buildAdOptimizerAnalysisFromFiles(
  args: AnalysisFileArgs
): Promise<AdOptimizerAnalysisResult> {
  const controls = mergeAnalysisControls(args.controls);
  const template = getStrategyTemplate(controls.templateId);

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

  const generatedAt = new Date().toISOString();
  const topSearchTerms = buildAggregatedSearchTerms(current, previous, bulkIdentity);
  const topTargets = buildAggregatedTargets(current, previous, bulkIdentity);
  const topPlacements = buildAggregatedPlacements(placement, bulkIdentity);
  const campaignRows = buildCampaignRows(current, previous, bulkIdentity, controls);
  const adGroupRows = buildAdGroupRows(current, previous, bulkIdentity, controls);

  const recommendationPlan = buildRecommendationPlan({
    searchTerms: topSearchTerms,
    targets: topTargets,
    placements: topPlacements,
    campaignRows,
    adGroupRows,
    bulkIdentity,
    controls,
  });

  return {
    generatedAt,
    controls,
    template,
    files: {
      current: current.meta,
      previous: previous?.meta ?? null,
      placement: placement?.meta ?? null,
      bulkIdentity: bulkIdentity?.meta ?? null,
    },
    notices: buildNotices(current, previous, placement, bulkIdentity, controls, recommendationPlan.reviewItems.length),
    summary: buildAnalysisSummary(
      current,
      previous,
      controls,
      recommendationPlan.recommendations.length
    ),
    bulkIdentitySummary: bulkIdentity?.summary ?? null,
    mappingCoverage: recommendationPlan.mappingCoverage,
    placementDiagnostics: placement?.diagnostics ?? {
      recognized: false,
      fallbackReason: "未上传 placement 报表，广告位策略已跳过。",
      hasAdGroupDimension: false,
      detectedPlacementColumn: null,
      normalizedPlacementCount: 0,
    },
    recommendationSummary: recommendationPlan.recommendationSummary,
    recommendations: recommendationPlan.recommendations,
    topSearchTerms,
    topTargets,
    topPlacements,
    campaignRows: recommendationPlan.campaignRows,
    adGroupRows: recommendationPlan.adGroupRows,
    governanceRisks: recommendationPlan.governanceRisks,
    reviewItems: recommendationPlan.reviewItems,
  };
}

function buildAnalysisSummary(
  current: ParsedSearchTermReport,
  previous: ParsedSearchTermReport | null,
  controls: AnalysisControls,
  totalRecommendationCount: number
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
    profitView: buildProfitView(current.summary, controls),
    totalRecommendationCount,
  };
}

function buildNotices(
  current: ParsedSearchTermReport,
  previous: ParsedSearchTermReport | null,
  placement: ParsedPlacementReport | null,
  bulkIdentity: Awaited<ReturnType<typeof parseBulkIdentityWorkbookFile>> | null,
  controls: AnalysisControls,
  reviewItemCount: number
) {
  const notices = [
    ...current.meta.warnings,
    ...(previous?.meta.warnings ?? []),
    ...(placement?.meta.warnings ?? []),
    ...(bulkIdentity?.meta.warnings ?? []),
  ];

  if (!previous) {
    notices.push("未上传上周期搜索词报表，本次无法输出完整环比趋势。");
  }

  if (!placement) {
    notices.push("未上传 placement 报表，广告位策略已自动跳过。");
  } else if (!placement.usable && placement.diagnostics.fallbackReason) {
    notices.push(placement.diagnostics.fallbackReason);
  } else if (placement.diagnostics.recognized && !placement.diagnostics.hasAdGroupDimension) {
    notices.push("placement 报表仅含 campaign + placement 维度，已按活动层聚合。");
  }

  if (!bulkIdentity) {
    notices.push("未上传 bulk 身份表，建议仍可生成，但预算与 bulk-ready 导出会降级。");
  } else if (reviewItemCount > 0) {
    notices.push(`当前仍有 ${reviewItemCount} 条建议缺少 bulk 所需字段，已进入 Review。`);
  }

  if (controls.grossMarginPct === null) {
    notices.push("未配置毛利率，利润和安全线建议将回退到 ACOS 口径。");
  }

  if (controls.tacosTarget === null) {
    notices.push("未配置 TACOS 目标，当前展示的是归因销售口径下的估算 TACOS。");
  }

  return dedupeStrings(notices);
}
