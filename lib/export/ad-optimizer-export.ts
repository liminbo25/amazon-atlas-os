import * as XLSX from "xlsx";
import { formatCurrency, formatRate } from "@/lib/ad-optimizer/analysis";
import { toBulkKeywordMatchType } from "@/lib/ad-optimizer/bulk-identity";
import type {
  AdOptimizerAnalysisResult,
  Recommendation,
  RecommendationLifecycleMap,
} from "@/lib/ad-optimizer/types";

export type BulkOperationLanguage = "english" | "chinese";
export type WorkbenchOperationLogEntry = {
  at: string;
  label: string;
  detail: string;
};

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const BULK_SHEET_NAME = "商品推广活动";

const BULK_COLUMNS = [
  "产品",
  "实体层级",
  "操作",
  "广告活动编号",
  "广告组编号",
  "广告组合编号",
  "广告编号",
  "关键词编号",
  "商品投放 ID",
  "广告活动名称",
  "广告组名称",
  "广告活动名称（仅供参考）",
  "广告组名称（仅供参考）",
  "广告组合名称（仅供参考）",
  "开始日期",
  "结束日期",
  "投放类型",
  "状态",
  "广告活动状态（仅供参考）",
  "广告组状态（仅供参考）",
  "每日预算",
  "SKU",
  "ASIN（仅供参考）",
  "资格状态（仅供参考）",
  "不符合条件的原因（仅供参考）",
  "广告组默认竞价",
  "广告组默认竞价（仅供参考）",
  "竞价",
  "关键词文本",
  "母语关键词",
  "母语区域",
  "匹配类型",
  "竞价方案",
  "广告位",
  "百分比",
  "拓展商品投放编号",
  "拓展商品投放名称（仅供参考）",
  "受众编号",
  "购物者群体占比",
  "购物者群体类型",
  "站点名称（仅供参考）",
  "站点",
  "展示量",
  "点击量",
  "点击率",
  "花费",
  "销量",
  "订单数量",
  "商品数量",
  "转化率",
  "ACOS",
  "CPC",
  "ROAS",
] as const;

type BulkRow = Record<(typeof BULK_COLUMNS)[number], string | number>;

export async function exportAdOptimizerWorkbookXlsx(
  result: AdOptimizerAnalysisResult,
  options?: {
    lifecycleMap?: RecommendationLifecycleMap;
    operationLog?: WorkbenchOperationLogEntry[];
  }
) {
  const workbook = buildAdOptimizerReportWorkbook(result, options);
  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  const fileName = buildFileName("ad-optimizer-report", "xlsx");
  triggerDownload(fileName, new Blob([buffer], { type: XLSX_MIME }));
  return fileName;
}

export async function exportAdOptimizerBulkWorkbookXlsx(
  result: AdOptimizerAnalysisResult,
  options: {
    mode: "draft" | "direct";
    operationLanguage?: BulkOperationLanguage;
    lifecycleMap?: RecommendationLifecycleMap;
    operationLog?: WorkbenchOperationLogEntry[];
  }
) {
  const workbook = buildAdOptimizerBulkWorkbook(result, options);
  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  const fileName = buildFileName(
    options.mode === "direct" ? "ad-optimizer-bulk-ready" : "ad-optimizer-bulk-draft",
    "xlsx"
  );
  triggerDownload(fileName, new Blob([buffer], { type: XLSX_MIME }));
  return fileName;
}

export function buildAdOptimizerReportWorkbook(
  result: AdOptimizerAnalysisResult,
  options?: {
    lifecycleMap?: RecommendationLifecycleMap;
    operationLog?: WorkbenchOperationLogEntry[];
  }
) {
  const workbook = XLSX.utils.book_new();
  const lifecycleMap = options?.lifecycleMap;

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildSummaryRows(result, lifecycleMap)),
    "Summary"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildCoverageRows(result, lifecycleMap)),
    "Coverage"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildFileRows(result)),
    "Files"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildRecommendationRows(result.recommendations, lifecycleMap)),
    "Actions"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildCampaignRows(result)),
    "Campaigns"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildAdGroupRows(result)),
    "AdGroups"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildSearchTermRows(result)),
    "TopSearchTerms"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildTargetRows(result)),
    "TopTargets"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildPlacementRows(result)),
    "Placements"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildGovernanceRows(result)),
    "Governance"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildLifecycleRows(result, lifecycleMap)),
    "Lifecycle"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      buildOperationLogRows(result, lifecycleMap, options?.operationLog)
    ),
    "Operations"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildReviewRows(result.reviewItems, lifecycleMap)),
    "Review"
  );

  return workbook;
}

function buildSummaryRows(
  result: AdOptimizerAnalysisResult,
  lifecycleMap?: RecommendationLifecycleMap
) {
  const profitView = result.summary.profitView;
  const lifecycleStates = Object.values(lifecycleMap ?? {}) as Array<
    RecommendationLifecycleMap[string]
  >;
  return [
    { item: "generatedAt", value: result.generatedAt },
    { item: "template", value: result.template.label },
    { item: "templateDescription", value: result.template.description },
    { item: "targetAcos", value: formatRate(result.controls.targetAcos) },
    {
      item: "grossMargin",
      value: result.controls.grossMarginPct !== null ? formatRate(result.controls.grossMarginPct) : "未配置",
    },
    {
      item: "profitSafeAcos",
      value: profitView.profitSafeAcos !== null ? formatRate(profitView.profitSafeAcos) : "未配置",
    },
    {
      item: "estimatedTacos",
      value: profitView.tacos !== null ? formatRate(profitView.tacos) : "未配置",
    },
    { item: "currentSpend", value: formatCurrency(result.summary.current.cost) },
    { item: "currentSales", value: formatCurrency(result.summary.current.sales) },
    { item: "currentOrders", value: result.summary.current.orders },
    { item: "uniqueCampaigns", value: result.summary.uniqueCampaigns },
    { item: "uniqueAdGroups", value: result.summary.uniqueAdGroups },
    { item: "uniqueTargets", value: result.summary.uniqueTargets },
    { item: "uniqueSearchTerms", value: result.summary.uniqueSearchTerms },
    { item: "recommendations", value: result.recommendations.length },
    {
      item: "readyRecommendations",
      value: result.mappingCoverage?.readyRecommendations ?? 0,
    },
    {
      item: "reviewRecommendations",
      value: result.mappingCoverage?.reviewRecommendations ?? result.reviewItems.length,
    },
    {
      item: "placementRecognized",
      value: result.placementDiagnostics.recognized ? "yes" : "no",
    },
    {
      item: "acceptedRecommendations",
      value: lifecycleStates.filter((item) => item.status === "accepted").length,
    },
    {
      item: "ignoredRecommendations",
      value: lifecycleStates.filter((item) => item.status === "ignored").length,
    },
    ...result.notices.map((notice, index) => ({
      item: `notice_${index + 1}`,
      value: notice,
    })),
  ];
}

function buildCoverageRows(
  result: AdOptimizerAnalysisResult,
  lifecycleMap?: RecommendationLifecycleMap
) {
  const rows = [];
  if (result.mappingCoverage) {
    rows.push(
      { item: "campaignCoverage", value: formatRate(result.mappingCoverage.campaignCoverage) },
      { item: "adGroupCoverage", value: formatRate(result.mappingCoverage.adGroupCoverage) },
      { item: "targetCoverage", value: formatRate(result.mappingCoverage.targetCoverage) },
      {
        item: "readyRecommendations",
        value: result.mappingCoverage.readyRecommendations,
      },
      {
        item: "reviewRecommendations",
        value: result.mappingCoverage.reviewRecommendations,
      }
    );
  }
  if (result.bulkIdentitySummary) {
    rows.push(
      { item: "bulkCampaigns", value: result.bulkIdentitySummary.campaignCount },
      { item: "bulkAdGroups", value: result.bulkIdentitySummary.adGroupCount },
      { item: "bulkKeywords", value: result.bulkIdentitySummary.keywordCount },
      {
        item: "bulkProductTargets",
        value: result.bulkIdentitySummary.productTargetCount,
      },
      {
        item: "bulkPlacementAdjustments",
        value: result.bulkIdentitySummary.placementAdjustmentCount,
      },
      {
        item: "bulkNegativeKeywords",
        value: result.bulkIdentitySummary.negativeKeywordCount,
      }
    );
  }
  if (lifecycleMap) {
    const lifecycleStates = Object.values(lifecycleMap);
    rows.push(
      {
        item: "acceptedRecommendations",
        value: lifecycleStates.filter((item) => item.status === "accepted").length,
      },
      {
        item: "ignoredRecommendations",
        value: lifecycleStates.filter((item) => item.status === "ignored").length,
      }
    );
  }
  return rows.length > 0 ? rows : [{ item: "coverage", value: "n/a" }];
}

function buildFileRows(result: AdOptimizerAnalysisResult) {
  const rows = [
    {
      kind: "current",
      fileName: result.files.current.fileName,
      sheetName: result.files.current.sheetName,
      rowCount: result.files.current.rowCount,
      recognized: result.files.current.recognized ? "yes" : "no",
      warnings: result.files.current.warnings.join(" | "),
      placementColumn: "",
      placementRecognized: "",
      normalizedPlacements: "",
    },
  ];

  if (result.files.previous) {
    rows.push({
      kind: "previous",
      fileName: result.files.previous.fileName,
      sheetName: result.files.previous.sheetName,
      rowCount: result.files.previous.rowCount,
      recognized: result.files.previous.recognized ? "yes" : "no",
      warnings: result.files.previous.warnings.join(" | "),
      placementColumn: "",
      placementRecognized: "",
      normalizedPlacements: "",
    });
  }

  if (result.files.placement) {
    rows.push({
      kind: "placement",
      fileName: result.files.placement.fileName,
      sheetName: result.files.placement.sheetName,
      rowCount: result.files.placement.rowCount,
      recognized: result.files.placement.recognized ? "yes" : "no",
      warnings: result.files.placement.warnings.join(" | "),
      placementColumn: result.placementDiagnostics.detectedPlacementColumn ?? "",
      placementRecognized: result.placementDiagnostics.recognized ? "yes" : "no",
      normalizedPlacements: String(result.placementDiagnostics.normalizedPlacementCount),
    });
  }

  if (result.files.bulkIdentity) {
    rows.push({
      kind: "bulkIdentity",
      fileName: result.files.bulkIdentity.fileName,
      sheetName: result.files.bulkIdentity.sheetName,
      rowCount: result.files.bulkIdentity.rowCount,
      recognized: result.files.bulkIdentity.recognized ? "yes" : "no",
      warnings: result.files.bulkIdentity.warnings.join(" | "),
      placementColumn: "",
      placementRecognized: "",
      normalizedPlacements: "",
    });
  }

  return rows;
}

function buildRecommendationRows(
  recommendations: Recommendation[],
  lifecycleMap?: RecommendationLifecycleMap
) {
  if (recommendations.length === 0) {
    return [{}];
  }

  return recommendations.map((item) => {
    const lifecycle = lifecycleMap?.[item.id];
    return {
      action: item.actionLabel,
      surface: item.surface,
      type: item.type,
      priority: item.priority,
      status: item.status,
      lifecycleStatus: lifecycle?.status ?? "new",
      lifecycleNote: lifecycle?.note ?? "",
      entityLevel: item.entityLevel,
      negativeScope: item.negativeScope ?? "",
      campaign: item.campaignName,
      adGroup: item.adGroupName,
      target: item.targetingText,
      searchTerm: item.customerSearchTerm,
      currentValue: describeCurrentValue(item),
      suggestedValue: describeSuggestedValue(item),
      spend: formatCurrency(item.current.cost),
      sales: formatCurrency(item.current.sales),
      orders: item.current.orders,
      acos: formatRate(item.current.acos),
      bulkExportable: item.bulkExportable ? "yes" : "no",
      reviewReasons: item.reviewReasons.join(" | "),
      reason: item.reason,
    };
  });
}

function buildCampaignRows(result: AdOptimizerAnalysisResult) {
  if (result.campaignRows.length === 0) {
    return [{}];
  }

  return result.campaignRows.map((item) => ({
    campaign: item.campaignName,
    portfolio: item.portfolioName,
    spend: formatCurrency(item.current.cost),
    sales: formatCurrency(item.current.sales),
    orders: item.current.orders,
    acos: formatRate(item.current.acos),
    tacos: formatRate(item.profitView.tacos),
    estimatedProfit:
      item.profitView.estimatedProfit !== null
        ? formatCurrency(item.profitView.estimatedProfit)
        : "未配置",
    dailyBudget: item.dailyBudget !== null ? formatCurrency(item.dailyBudget) : "未配置",
    budgetUtilization:
      item.budgetUtilization !== null ? formatRate(item.budgetUtilization) : "未配置",
    budgetSuggestion: describeBudgetGuidance(item.budgetGuidance),
    placementSuggestions: item.placementSuggestionCount,
    governanceRiskCount: item.governanceRiskCount,
    recommendationCount: item.recommendationCount,
  }));
}

function buildAdGroupRows(result: AdOptimizerAnalysisResult) {
  if (result.adGroupRows.length === 0) {
    return [{}];
  }

  return result.adGroupRows.map((item) => ({
    campaign: item.campaignName,
    adGroup: item.adGroupName,
    portfolio: item.portfolioName,
    spend: formatCurrency(item.current.cost),
    sales: formatCurrency(item.current.sales),
    orders: item.current.orders,
    acos: formatRate(item.current.acos),
    tacos: formatRate(item.profitView.tacos),
    parentBudgetSignal: describeBudgetGuidance(item.parentBudgetGuidance),
    placementSuggestions: item.placementSuggestionCount,
    governanceRiskCount: item.governanceRiskCount,
    recommendationCount: item.recommendationCount,
  }));
}

function buildSearchTermRows(result: AdOptimizerAnalysisResult) {
  if (result.topSearchTerms.length === 0) {
    return [{}];
  }

  return result.topSearchTerms.map((item) => ({
    campaign: item.campaignName,
    adGroup: item.adGroupName,
    target: item.targetingText,
    sourceTargets: item.sourceTargets.join(" | "),
    searchTerm: item.customerSearchTerm,
    sourceMatchTypes: item.sourceMatchTypes.join(" | "),
    spend: formatCurrency(item.current.cost),
    sales: formatCurrency(item.current.sales),
    orders: item.current.orders,
    clicks: item.current.clicks,
    acos: formatRate(item.current.acos),
    exactKeywordAlready: item.hasExactKeywordAlready ? "yes" : "no",
    negativeExactAlready: item.hasNegativeExactAlready ? "yes" : "no",
    negativePhraseAlready: item.hasNegativePhraseAlready ? "yes" : "no",
    productTargetAlready: item.hasProductTargetAlready ? "yes" : "no",
  }));
}

function buildTargetRows(result: AdOptimizerAnalysisResult) {
  if (result.topTargets.length === 0) {
    return [{}];
  }

  return result.topTargets.map((item) => ({
    campaign: item.campaignName,
    adGroup: item.adGroupName,
    target: item.targetingText,
    targetingType: item.targetingType,
    matchType: item.matchType,
    spend: formatCurrency(item.current.cost),
    sales: formatCurrency(item.current.sales),
    orders: item.current.orders,
    clicks: item.current.clicks,
    acos: formatRate(item.current.acos),
    currentBid: item.currentBid ?? "",
  }));
}

function buildPlacementRows(result: AdOptimizerAnalysisResult) {
  if (result.topPlacements.length === 0) {
    return [
      {
        message:
          result.placementDiagnostics.fallbackReason ??
          "当前没有可展示的 placement 聚合数据。",
      },
    ];
  }

  return result.topPlacements.map((item) => ({
    campaign: item.campaignName,
    placement: item.placementName,
    spend: formatCurrency(item.current.cost),
    sales: formatCurrency(item.current.sales),
    orders: item.current.orders,
    clicks: item.current.clicks,
    acos: formatRate(item.current.acos),
    currentAdjustment:
      item.currentAdjustment !== null ? `${item.currentAdjustment}%` : "",
    sourceAdGroupCount: item.sourceAdGroupCount,
  }));
}

function buildGovernanceRows(result: AdOptimizerAnalysisResult) {
  if (result.governanceRisks.length === 0) {
    return [{}];
  }

  return result.governanceRisks.map((item) => ({
    searchTerm: item.searchTerm,
    overlapType: item.overlapType,
    severity: item.severity,
    winner: `${item.winningCampaignName} / ${item.winningAdGroupName}`,
    winnerTarget: item.winningTargetingText,
    losers: item.losers
      .map((loser) => `${loser.campaignName} / ${loser.adGroupName} / ${loser.targetingText}`)
      .join(" | "),
    spendAtRisk: formatCurrency(item.spendAtRisk),
    suggestedScope: item.suggestedScope,
    suggestedMatchType: item.suggestedMatchType,
    reason: item.reason,
  }));
}

function buildLifecycleRows(
  result: AdOptimizerAnalysisResult,
  lifecycleMap?: RecommendationLifecycleMap
) {
  const rows = result.recommendations.map((item) => {
    const lifecycle = lifecycleMap?.[item.id];
    return {
      recommendationId: item.id,
      action: item.actionLabel,
      lifecycleStatus: lifecycle?.status ?? "new",
      note: lifecycle?.note ?? "",
      generatedAt: lifecycle?.generatedAt ?? result.generatedAt,
      updatedAt: lifecycle?.updatedAt ?? "",
      history:
        lifecycle?.history.map((entry) => `${entry.at} ${entry.action}: ${entry.detail}`).join(" | ") ??
        `${result.generatedAt} generated: 初次分析生成`,
    };
  });

  return rows.length > 0 ? rows : [{}];
}

function buildOperationLogRows(
  result: AdOptimizerAnalysisResult,
  lifecycleMap?: RecommendationLifecycleMap,
  operationLog?: WorkbenchOperationLogEntry[]
) {
  const rows: Array<Record<string, string>> = [];

  for (const entry of operationLog ?? []) {
    rows.push({
      at: entry.at,
      source: "workbench",
      recommendationId: "",
      label: entry.label,
      action: "manual",
      detail: entry.detail,
    });
  }

  for (const recommendation of result.recommendations) {
    const lifecycle = lifecycleMap?.[recommendation.id];
    const history =
      lifecycle?.history ?? [
        {
          at: result.generatedAt,
          action: "generated",
          detail: "初次分析生成",
        },
      ];
    for (const entry of history) {
      rows.push({
        at: entry.at,
        source: "lifecycle",
        recommendationId: recommendation.id,
        label: recommendation.actionLabel,
        action: entry.action,
        detail: entry.detail,
      });
    }
  }

  return rows.length > 0 ? rows : [{}];
}

function buildReviewRows(
  recommendations: Recommendation[],
  lifecycleMap?: RecommendationLifecycleMap
) {
  if (recommendations.length === 0) {
    return [{}];
  }

  return recommendations.map((item) => ({
    action: item.actionLabel,
    type: item.type,
    lifecycleStatus: lifecycleMap?.[item.id]?.status ?? "new",
    campaign: item.campaignName,
    adGroup: item.adGroupName,
    target: item.targetingText,
    searchTerm: item.customerSearchTerm,
    reviewReasons: item.reviewReasons.join(" | "),
    reason: item.reason,
  }));
}

export function buildAdOptimizerBulkWorkbook(
  result: AdOptimizerAnalysisResult,
  options: {
    mode: "draft" | "direct";
    operationLanguage?: BulkOperationLanguage;
    lifecycleMap?: RecommendationLifecycleMap;
    operationLog?: WorkbenchOperationLogEntry[];
  }
) {
  const workbook = XLSX.utils.book_new();
  const operationLanguage = options.operationLanguage ?? "english";
  const lifecycleMap = options.lifecycleMap;
  const visibleRecommendations = result.recommendations.filter(
    (item) => lifecycleMap?.[item.id]?.status !== "ignored"
  );
  const bulkCandidates = visibleRecommendations.filter(isBulkRowEligible);
  const includedRecommendations =
    options.mode === "direct"
      ? bulkCandidates.filter((item) => item.bulkExportable)
      : bulkCandidates;
  const reviewRows =
    options.mode === "direct"
      ? visibleRecommendations
          .filter((item) => !item.bulkExportable || !isBulkRowEligible(item))
          .map((item) => buildReviewRow(item, lifecycleMap))
      : result.reviewItems.map((item) => buildReviewRow(item, lifecycleMap));
  const bulkRows = includedRecommendations.map((item) =>
    buildBulkRow(item, operationLanguage)
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      buildBulkSummaryRows(
        result,
        options.mode,
        operationLanguage,
        includedRecommendations.length,
        lifecycleMap
      )
    ),
    "Summary"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      bulkRows.length > 0 ? bulkRows : [createEmptyBulkRow()],
      { header: [...BULK_COLUMNS] }
    ),
    BULK_SHEET_NAME
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(reviewRows.length > 0 ? reviewRows : [{}]),
    "Review"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      buildOperationLogRows(result, lifecycleMap, options.operationLog)
    ),
    "Operations"
  );

  return workbook;
}

function buildReviewRow(
  item: Recommendation,
  lifecycleMap?: RecommendationLifecycleMap
) {
  return {
    action: item.actionLabel,
    type: item.type,
    lifecycleStatus: lifecycleMap?.[item.id]?.status ?? "new",
    campaign: item.campaignName,
    adGroup: item.adGroupName,
    target: item.targetingText,
    searchTerm: item.customerSearchTerm,
    reviewReasons: item.reviewReasons.join(" | "),
    reason: item.reason,
  };
}

function buildBulkSummaryRows(
  result: AdOptimizerAnalysisResult,
  mode: "draft" | "direct",
  operationLanguage: BulkOperationLanguage,
  includedRows: number,
  lifecycleMap?: RecommendationLifecycleMap
) {
  const lifecycleStates = Object.values(lifecycleMap ?? {});
  return [
    { item: "generatedAt", value: result.generatedAt },
    { item: "mode", value: mode },
    { item: "operationLanguage", value: operationLanguage },
    { item: "includedRows", value: includedRows },
    {
      item: "readyRecommendations",
      value: result.recommendations.filter((item) => item.bulkExportable).length,
    },
    {
      item: "reviewRecommendations",
      value: result.recommendations.filter((item) => !item.bulkExportable).length,
    },
    {
      item: "acceptedRecommendations",
      value: lifecycleStates.filter((item) => item.status === "accepted").length,
    },
    {
      item: "ignoredRecommendations",
      value: lifecycleStates.filter((item) => item.status === "ignored").length,
    },
  ];
}

function buildBulkRow(
  item: Recommendation,
  operationLanguage: BulkOperationLanguage
): BulkRow {
  const row = createEmptyBulkRow();

  row["产品"] = "商品推广";
  row["实体层级"] = resolveBulkEntityLevel(item);
  row["操作"] = mapBulkOperation(resolveBulkAction(item), operationLanguage);
  row["广告活动编号"] = item.campaignId ?? "";
  row["广告组编号"] = item.negativeScope === "campaign" ? "" : item.adGroupId ?? "";
  row["关键词编号"] = item.keywordId ?? "";
  row["商品投放 ID"] = item.productTargetId ?? "";
  row["广告活动名称"] = item.campaignName;
  row["广告组名称"] = item.negativeScope === "campaign" ? "" : item.adGroupName;
  row["广告活动名称（仅供参考）"] = item.campaignName;
  row["广告组名称（仅供参考）"] = item.negativeScope === "campaign" ? "" : item.adGroupName;
  row["状态"] = "已启用";

  if (item.type === "harvest_exact") {
    row["关键词文本"] = item.customerSearchTerm;
    row["匹配类型"] = toBulkKeywordMatchType("exact");
    row["竞价"] = item.suggestedBid ?? "";
    return row;
  }

  if (
    item.type === "negative_exact" ||
    item.type === "negative_phrase" ||
    item.type === "governance_negative_exact" ||
    item.type === "governance_negative_phrase"
  ) {
    row["关键词文本"] = item.customerSearchTerm;
    row["匹配类型"] = toBulkKeywordMatchType(item.suggestedMatchType ?? "negative-exact");
    return row;
  }

  if (item.type === "harvest_product_target") {
    row["拓展商品投放编号"] = item.suggestedTargetExpression ?? item.customerSearchTerm;
    row["拓展商品投放名称（仅供参考）"] =
      item.suggestedTargetExpression ?? item.customerSearchTerm;
    row["竞价"] = item.suggestedBid ?? "";
    return row;
  }

  if (
    item.type === "raise_placement_modifier" ||
    item.type === "lower_placement_modifier"
  ) {
    row["广告组编号"] = "";
    row["广告组名称"] = "";
    row["广告组名称（仅供参考）"] = "";
    row["关键词编号"] = "";
    row["商品投放 ID"] = "";
    row["广告位"] = toBulkPlacementName(item.placementName ?? item.targetingText);
    row["百分比"] = item.suggestedPlacementAdjustment ?? "";
    return row;
  }

  if (item.type === "increase_budget" || item.type === "decrease_budget") {
    row["广告组编号"] = "";
    row["广告组名称"] = "";
    row["广告组名称（仅供参考）"] = "";
    row["关键词编号"] = "";
    row["商品投放 ID"] = "";
    row["每日预算"] = item.suggestedBudget ?? "";
    return row;
  }

  if (item.targetingType === "keyword") {
    row["关键词文本"] = item.targetingText;
    row["匹配类型"] = toBulkKeywordMatchType(item.matchType);
    row["竞价"] = item.suggestedBid ?? "";
    return row;
  }

  row["拓展商品投放编号"] = item.targetingText;
  row["拓展商品投放名称（仅供参考）"] = item.targetingText;
  row["竞价"] = item.suggestedBid ?? "";
  return row;
}

function createEmptyBulkRow(): BulkRow {
  return Object.fromEntries(BULK_COLUMNS.map((column) => [column, ""])) as BulkRow;
}

function isBulkRowEligible(item: Recommendation) {
  return item.type !== "watch_placement_modifier";
}

function resolveBulkEntityLevel(item: Recommendation) {
  if (
    item.type === "negative_exact" ||
    item.type === "negative_phrase" ||
    item.type === "governance_negative_exact" ||
    item.type === "governance_negative_phrase"
  ) {
    return item.negativeScope === "campaign" ? "广告活动否定关键词" : "否定关键词";
  }
  if (item.type === "harvest_product_target") {
    return "商品定向";
  }
  if (
    item.type === "raise_placement_modifier" ||
    item.type === "lower_placement_modifier"
  ) {
    return "竞价调整";
  }
  if (item.type === "increase_budget" || item.type === "decrease_budget") {
    return "广告活动";
  }
  if (item.type === "harvest_exact") {
    return "关键词";
  }

  return item.targetingType === "keyword" ? "关键词" : "商品定向";
}

function resolveBulkAction(item: Recommendation) {
  if (
    item.type === "harvest_exact" ||
    item.type === "harvest_product_target" ||
    item.type === "negative_exact" ||
    item.type === "negative_phrase" ||
    item.type === "governance_negative_exact" ||
    item.type === "governance_negative_phrase"
  ) {
    return "create" as const;
  }
  return "update" as const;
}

function mapBulkOperation(
  action: "create" | "update" | "archive",
  language: BulkOperationLanguage
) {
  if (language === "chinese") {
    if (action === "create") {
      return "创建";
    }
    if (action === "update") {
      return "更新";
    }
    return "归档";
  }

  if (action === "create") {
    return "Create";
  }
  if (action === "update") {
    return "Update";
  }
  return "Archive";
}

function toBulkPlacementName(value: string) {
  switch (value) {
    case "Top of Search":
      return "广告位：搜索结果首页首位";
    case "Product Pages":
      return "广告位：商品页面";
    case "Rest of Search":
      return "广告位：搜索结果的其余位置";
    case "Amazon Business":
      return "广告位：亚马逊企业购";
    default:
      return value;
  }
}

function describeCurrentValue(item: Recommendation) {
  if (item.currentPlacementAdjustment !== null) {
    return `${item.currentPlacementAdjustment}%`;
  }
  if (item.currentBudget !== null) {
    return formatCurrency(item.currentBudget);
  }
  if (item.currentBid !== null) {
    return formatCurrency(item.currentBid);
  }
  return "-";
}

function describeSuggestedValue(item: Recommendation) {
  if (item.suggestedPlacementAdjustment !== null) {
    return `${item.suggestedPlacementAdjustment}%`;
  }
  if (item.suggestedBudget !== null) {
    return formatCurrency(item.suggestedBudget);
  }
  if (item.suggestedTargetExpression) {
    return `${item.suggestedTargetExpression}${item.suggestedBid !== null ? ` / ${formatCurrency(item.suggestedBid)}` : ""}`;
  }
  if (item.suggestedMatchType) {
    return `${item.suggestedMatchType}${item.suggestedBid !== null ? ` / ${formatCurrency(item.suggestedBid)}` : ""}`;
  }
  if (item.suggestedBid !== null) {
    return formatCurrency(item.suggestedBid);
  }
  return "-";
}

function describeBudgetGuidance(
  value:
    | AdOptimizerAnalysisResult["campaignRows"][number]["budgetGuidance"]
    | AdOptimizerAnalysisResult["adGroupRows"][number]["parentBudgetGuidance"]
) {
  if (!value.type || value.suggestedBudget === null) {
    return value.currentBudget !== null ? "观察" : "未配置";
  }
  return `${value.type === "increase_budget" ? "放量" : "收缩"} -> ${formatCurrency(
    value.suggestedBudget
  )}`;
}

function buildFileName(baseName: string, extension: string) {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${baseName}-${year}${month}${day}-${hours}${minutes}.${extension}`;
}

function triggerDownload(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
