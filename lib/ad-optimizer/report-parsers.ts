import type {
  ParsedPlacementReport,
  ParsedSearchTermReport,
  PlacementDiagnostics,
  PlacementRecord,
  SearchTermRecord,
} from "@/lib/ad-optimizer/types";
import { buildMetricBundle, sumMetricBundles } from "@/lib/ad-optimizer/metrics";
import {
  canonicalizeMatchType,
  canonicalizePlacementName,
  collectHeaders,
  readNumberByHeader,
  readRateByHeader,
  readStringByHeader,
  readWorkbook,
  resolveHeader,
  resolveTargetingType,
  selectBestSheet,
  isRowEmpty,
} from "@/lib/ad-optimizer/shared";

const SEARCH_SHEET_HINTS = [
  "search term",
  "search terms",
  "customer search term",
  "搜索词",
  "顾客搜索词",
  "客户搜索词",
];

const PLACEMENT_SHEET_HINTS = ["placement", "placements", "广告位", "投放位置"];

const DEFAULT_CURRENCY = "USD";

export async function parseSearchTermWorkbookFile(
  file: File
): Promise<ParsedSearchTermReport> {
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
    portfolioName: resolveHeader(headers, ["portfolio", "广告组合名称", "广告组合"]),
    currency: resolveHeader(headers, ["currency", "货币"]),
    country: resolveHeader(headers, ["country", "country/region", "国家/地区", "站点"]),
    retailer: resolveHeader(headers, ["retailer", "零售商"]),
    targetingText: resolveHeader(headers, [isTargetingHeader]),
    customerSearchTerm: resolveHeader(headers, [isSearchTermHeader]),
    matchType: resolveHeader(headers, [isMatchTypeHeader]),
    startDate: resolveHeader(headers, ["start date", "开始日期"]),
    endDate: resolveHeader(headers, ["end date", "结束日期"]),
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
    warnings.push("未识别到广告活动列，部分搜索词行可能无法归属到 campaign。");
  }
  if (!columnMap.customerSearchTerm) {
    warnings.push("未识别到顾客搜索词列，搜索词优化建议会明显受限。");
  }
  if (!columnMap.clicks || !columnMap.cost) {
    warnings.push("点击量或花费列不完整，建议结果会降级为只做基础识别。");
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
      retailer: readStringByHeader(row, columnMap.retailer),
      targetingText: targetingText || customerSearchTerm || "-",
      customerSearchTerm: customerSearchTerm || targetingText || "-",
      matchType,
      targetingType,
      startDate: readStringByHeader(row, columnMap.startDate),
      endDate: readStringByHeader(row, columnMap.endDate),
      metrics,
    });
  }

  return {
    meta: {
      kind: "search-term",
      fileName: file.name,
      sheetName: selection.sheetName,
      rowCount: rows.length,
      warnings,
      recognized: rows.length > 0,
    },
    rows,
    summary: sumMetricBundles(rows.map((row) => row.metrics)),
    uniqueCampaigns: uniqueCount(rows.map((row) => row.campaignName)),
    uniqueAdGroups: uniqueCount(
      rows.map((row) => `${row.campaignName}::${row.adGroupName}`)
    ),
    uniqueTargets: uniqueCount(
      rows.map(
        (row) =>
          `${row.campaignName}::${row.adGroupName}::${row.targetingText}::${row.matchType}`
      )
    ),
    uniqueSearchTerms: uniqueCount(
      rows.map(
        (row) => `${row.campaignName}::${row.adGroupName}::${row.customerSearchTerm}`
      )
    ),
  };
}

export async function parsePlacementWorkbookFile(
  file: File
): Promise<ParsedPlacementReport> {
  const workbook = await readWorkbook(file);
  const selection = selectBestSheet(workbook, PLACEMENT_SHEET_HINTS, [
    isPlacementHeader,
    isCampaignHeader,
    isClicksHeader,
    isSpendHeader,
  ]);
  const headers = collectHeaders(selection.rows);
  const columnMap = {
    campaignName: resolveHeader(headers, [isCampaignHeader]),
    adGroupName: resolveHeader(headers, [isAdGroupHeader]),
    placementName: resolveHeader(headers, [isPlacementHeader]),
    searchTerm: resolveHeader(headers, [isSearchTermHeader]),
    targetingText: resolveHeader(headers, [isTargetingHeader]),
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

  const detection: PlacementDiagnostics = {
    recognized: false,
    fallbackReason: null,
    hasAdGroupDimension: Boolean(columnMap.adGroupName),
    detectedPlacementColumn: columnMap.placementName,
    normalizedPlacementCount: 0,
  };

  const warnings: string[] = [];
  if (!columnMap.placementName) {
    detection.fallbackReason =
      columnMap.searchTerm || columnMap.targetingText
        ? "这份文件更像搜索词报表，不是真实 placement 报表，广告位策略已安全降级。"
        : "没有识别到 placement / 广告位列，已跳过广告位策略。";
    warnings.push(detection.fallbackReason);
    return {
      meta: {
        kind: "placement",
        fileName: file.name,
        sheetName: selection.sheetName,
        rowCount: selection.rows.length,
        warnings,
        recognized: false,
      },
      rows: [],
      usable: false,
      diagnostics: detection,
    };
  }

  const rows: PlacementRecord[] = [];
  let recognizedPlacements = 0;
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

    if (
      placementName === "Top of Search" ||
      placementName === "Product Pages" ||
      placementName === "Rest of Search" ||
      placementName === "Amazon Business"
    ) {
      recognizedPlacements += 1;
    }

    rows.push({
      campaignName: campaignName || "Unknown Campaign",
      adGroupName: readStringByHeader(row, columnMap.adGroupName),
      placementName,
      metrics,
    });
  }

  const looksLikeSearchTermReport =
    Boolean(columnMap.searchTerm) &&
    Boolean(columnMap.targetingText) &&
    recognizedPlacements === 0;

  if (looksLikeSearchTermReport) {
    detection.fallbackReason =
      "这份文件更像搜索词报表，不是真实 placement 报表，广告位策略已安全降级。";
    warnings.push(detection.fallbackReason);
    return {
      meta: {
        kind: "placement",
        fileName: file.name,
        sheetName: selection.sheetName,
        rowCount: selection.rows.length,
        warnings,
        recognized: false,
      },
      rows: [],
      usable: false,
      diagnostics: detection,
    };
  }

  if (recognizedPlacements === 0) {
    detection.fallbackReason =
      "已读取文件，但没有识别到 Top of Search / Product Pages / Rest of Search 等真实广告位。";
    warnings.push(detection.fallbackReason);
    return {
      meta: {
        kind: "placement",
        fileName: file.name,
        sheetName: selection.sheetName,
        rowCount: rows.length,
        warnings,
        recognized: false,
      },
      rows: [],
      usable: false,
      diagnostics: detection,
    };
  }

  detection.recognized = true;
  detection.normalizedPlacementCount = recognizedPlacements;

  return {
    meta: {
      kind: "placement",
      fileName: file.name,
      sheetName: selection.sheetName,
      rowCount: rows.length,
      warnings,
      recognized: true,
    },
    rows,
    usable: rows.length > 0,
    diagnostics: detection,
  };
}

function uniqueCount(values: string[]) {
  return new Set(values.filter(Boolean)).size;
}

function includesAny(normalizedHeader: string, keywords: string[]) {
  return keywords.some((keyword) => normalizedHeader.includes(keyword));
}

function isCampaignHeader(normalizedHeader: string) {
  return (
    includesAny(normalizedHeader, ["campaignname", "campaign", "广告活动名称", "广告活动"]) &&
    !normalizedHeader.includes("id") &&
    !normalizedHeader.includes("status")
  );
}

function isAdGroupHeader(normalizedHeader: string) {
  return (
    includesAny(normalizedHeader, ["adgroupname", "adgroup", "广告组名称", "广告组"]) &&
    !normalizedHeader.includes("id") &&
    !normalizedHeader.includes("status")
  );
}

function isTargetingHeader(normalizedHeader: string) {
  return (
    includesAny(normalizedHeader, ["targeting", "keywordtext", "投放", "关键词文本"]) &&
    !normalizedHeader.includes("id")
  );
}

function isSearchTermHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, [
    "customersearchterm",
    "searchterm",
    "客户搜索词",
    "顾客搜索词",
  ]);
}

function isMatchTypeHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, ["matchtype", "匹配类型"]);
}

function isPlacementHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, ["placement", "广告位", "投放位置"]);
}

function isImpressionsHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, ["impressions", "展示量"]);
}

function isClicksHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, ["clicks", "点击量"]);
}

function isSpendHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, ["spend", "cost", "花费"]);
}

function isSalesHeader(normalizedHeader: string) {
  return (
    includesAny(normalizedHeader, [
      "sales",
      "totalsales",
      "7daytotalsales",
      "14daytotalsales",
      "7天总销售额",
      "14天总销售额",
      "销量",
    ]) &&
    !includesAny(normalizedHeader, ["salesquantity", "销售量", "商品数量"])
  );
}

function isOrdersHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, [
    "orders",
    "totalorders",
    "7daytotalorders",
    "14daytotalorders",
    "订单数量",
    "总订单数",
  ]);
}

function isUnitsHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, [
    "units",
    "salesquantity",
    "7daytotalsalesquantity",
    "14daytotalsalesquantity",
    "7天总销售量",
    "14天总销售量",
    "商品数量",
  ]);
}

function isCtrHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, ["ctr", "点击率"]);
}

function isCpcHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, ["cpc", "单次点击成本"]);
}

function isCvrHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, ["cvr", "conversionrate", "转化率"]);
}

function isAcosHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, ["acos", "广告投入产出比"]);
}

function isRoasHeader(normalizedHeader: string) {
  return includesAny(normalizedHeader, ["roas", "广告投资回报率", "广告投入产出回报"]);
}
