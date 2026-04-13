import * as XLSX from "xlsx";
import { formatCurrency, formatRate } from "@/lib/ad-optimizer/analysis";
import { toBulkKeywordMatchType } from "@/lib/ad-optimizer/bulk-identity";
import type {
  AdOptimizerAnalysisResult,
  Recommendation,
} from "@/lib/ad-optimizer/types";

export type BulkOperationLanguage = "english" | "chinese";

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
  result: AdOptimizerAnalysisResult
) {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildSummaryRows(result)),
    "Summary"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildRecommendationRows(result.recommendations)),
    "Actions"
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
    XLSX.utils.json_to_sheet(buildReviewRows(result.reviewItems)),
    "Review"
  );

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
  }
) {
  const mode = options.mode;
  const operationLanguage = options.operationLanguage ?? "english";
  const workbook = XLSX.utils.book_new();
  const includedRecommendations =
    mode === "direct"
      ? result.recommendations.filter((item) => item.bulkExportable)
      : result.recommendations;

  const bulkRows = includedRecommendations.map((item) =>
    buildBulkRow(item, operationLanguage)
  );

  const reviewRows =
    mode === "direct"
      ? result.recommendations
          .filter((item) => !item.bulkExportable)
          .map((item) => buildReviewRow(item))
      : result.reviewItems.map((item) => buildReviewRow(item));

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      buildBulkSummaryRows(result, mode, operationLanguage, bulkRows.length)
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

  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  const fileName = buildFileName(
    mode === "direct" ? "ad-optimizer-bulk-ready" : "ad-optimizer-bulk-draft",
    "xlsx"
  );
  triggerDownload(fileName, new Blob([buffer], { type: XLSX_MIME }));
  return fileName;
}

function buildSummaryRows(result: AdOptimizerAnalysisResult) {
  return [
    { item: "generatedAt", value: result.generatedAt },
    { item: "targetAcos", value: formatRate(result.controls.targetAcos) },
    { item: "currentSpend", value: formatCurrency(result.summary.current.cost) },
    { item: "currentSales", value: formatCurrency(result.summary.current.sales) },
    { item: "currentOrders", value: result.summary.current.orders },
    { item: "uniqueCampaigns", value: result.summary.uniqueCampaigns },
    { item: "uniqueAdGroups", value: result.summary.uniqueAdGroups },
    { item: "uniqueTargets", value: result.summary.uniqueTargets },
    { item: "uniqueSearchTerms", value: result.summary.uniqueSearchTerms },
    {
      item: "readyRecommendations",
      value: result.mappingCoverage?.readyRecommendations ?? 0,
    },
    {
      item: "reviewRecommendations",
      value: result.mappingCoverage?.reviewRecommendations ?? result.reviewItems.length,
    },
    ...result.notices.map((notice, index) => ({
      item: `notice_${index + 1}`,
      value: notice,
    })),
  ];
}

function buildRecommendationRows(recommendations: Recommendation[]) {
  if (recommendations.length === 0) {
    return [{}];
  }

  return recommendations.map((item) => ({
    action: item.actionLabel,
    type: item.type,
    priority: item.priority,
    status: item.status,
    entityLevel: item.entityLevel,
    campaign: item.campaignName,
    adGroup: item.adGroupName,
    target: item.targetingText,
    searchTerm: item.customerSearchTerm,
    suggestedMatchType: item.suggestedMatchType ?? "",
    suggestedTargetExpression: item.suggestedTargetExpression ?? "",
    placementName: item.placementName ?? "",
    currentPlacementAdjustment: item.currentPlacementAdjustment ?? "",
    suggestedPlacementAdjustment: item.suggestedPlacementAdjustment ?? "",
    currentBid: item.currentBid ?? "",
    suggestedBid: item.suggestedBid ?? "",
    spend: formatCurrency(item.current.cost),
    sales: formatCurrency(item.current.sales),
    orders: item.current.orders,
    acos: formatRate(item.current.acos),
    reviewReasons: item.reviewReasons.join(" | "),
    reason: item.reason,
  }));
}

function buildSearchTermRows(result: AdOptimizerAnalysisResult) {
  if (result.topSearchTerms.length === 0) {
    return [{}];
  }

  return result.topSearchTerms.map((item) => ({
    campaign: item.campaignName,
    adGroup: item.adGroupName,
    targetingText: item.targetingText,
    customerSearchTerm: item.customerSearchTerm,
    targetingType: item.targetingType,
    matchType: item.matchType,
    spend: formatCurrency(item.current.cost),
    sales: formatCurrency(item.current.sales),
    orders: item.current.orders,
    clicks: item.current.clicks,
    acos: formatRate(item.current.acos),
    exactKeywordAlready: item.hasExactKeywordAlready ? "yes" : "no",
    negativeExactAlready: item.hasNegativeExactAlready ? "yes" : "no",
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
    targetingText: item.targetingText,
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
    return [{}];
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
  }));
}

function buildReviewRows(recommendations: Recommendation[]) {
  if (recommendations.length === 0) {
    return [{}];
  }

  return recommendations.map((item) => buildReviewRow(item));
}

function buildReviewRow(item: Recommendation) {
  return {
    action: item.actionLabel,
    type: item.type,
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
  includedRows: number
) {
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
  row["广告组编号"] = item.adGroupId ?? "";
  row["关键词编号"] = item.keywordId ?? "";
  row["商品投放 ID"] = item.productTargetId ?? "";
  row["广告活动名称"] = item.campaignName;
  row["广告组名称"] = item.adGroupName;
  row["广告活动名称（仅供参考）"] = item.campaignName;
  row["广告组名称（仅供参考）"] = item.adGroupName;
  row["状态"] = "已启用";

  if (item.type === "harvest_exact") {
    row["关键词文本"] = item.customerSearchTerm;
    row["匹配类型"] = toBulkKeywordMatchType("exact");
    row["竞价"] = item.suggestedBid ?? "";
    return row;
  }

  if (item.type === "negative_exact") {
    row["关键词文本"] = item.customerSearchTerm;
    row["匹配类型"] = toBulkKeywordMatchType("negative-exact");
    return row;
  }

  if (item.type === "harvest_product_target") {
    row["商品投放 ID"] = "";
    row["拓展商品投放编号"] =
      item.suggestedTargetExpression ?? item.customerSearchTerm;
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

function resolveBulkEntityLevel(item: Recommendation) {
  if (item.type === "negative_exact") {
    return "否定关键词";
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
  if (item.type === "harvest_exact") {
    return "关键词";
  }

  return item.targetingType === "keyword" ? "关键词" : "商品定向";
}

function resolveBulkAction(item: Recommendation) {
  if (
    item.type === "harvest_exact" ||
    item.type === "harvest_product_target" ||
    item.type === "negative_exact"
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
      return "广告位亚马逊企业购";
    default:
      return value;
  }
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
