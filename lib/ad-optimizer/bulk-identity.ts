import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";
import type {
  BulkAdGroupIdentity,
  BulkCampaignIdentity,
  BulkIdentityBundle,
  BulkKeywordIdentity,
  BulkPlacementAdjustmentIdentity,
  BulkProductTargetIdentity,
  SearchTermRecord,
} from "@/lib/ad-optimizer/types";
import {
  buildAdGroupKey,
  buildCampaignKey,
  buildKeywordKey,
  buildNegativeKeywordKey,
  buildPlacementAdjustmentKey,
  buildProductTargetKey,
  canonicalizeMatchType,
  canonicalizeNegativeMatchType,
  canonicalizePlacementName,
  normalizeText,
  parseNumberLike,
  resolveTargetingType,
} from "@/lib/ad-optimizer/shared";

type SheetRow = Record<string, unknown>;

const BULK_SHEET_NAME = "商品推广活动";

const BULK_HEADERS = {
  entityLevel: ["实体层级", "Entity", "Entity Level"],
  campaignId: ["广告活动编号", "Campaign Id", "Campaign ID"],
  adGroupId: ["广告组编号", "Ad Group Id", "Ad Group ID"],
  keywordId: ["关键词编号", "Keyword Id", "Keyword ID"],
  productTargetId: ["商品投放 ID", "Product Targeting ID"],
  campaignName: [
    "广告活动名称",
    "广告活动名称（仅供参考）",
    "Campaign Name",
    "Campaign Name (Informational only)",
  ],
  adGroupName: [
    "广告组名称",
    "广告组名称（仅供参考）",
    "Ad Group Name",
    "Ad Group Name (Informational only)",
  ],
  portfolioName: [
    "广告组合名称（仅供参考）",
    "广告组合名称",
    "Portfolio Name (Informational only)",
    "Portfolio Name",
  ],
  dailyBudget: ["每日预算", "Daily Budget", "Budget"],
  bidStrategy: ["竞价方案", "Bidding Strategy"],
  status: ["状态", "State", "Status"],
  defaultBid: [
    "广告组默认竞价",
    "广告组默认竞价（仅供参考）",
    "Ad Group Default Bid",
    "Ad Group Default Bid (Informational only)",
  ],
  bid: ["竞价", "Bid"],
  keywordText: ["关键词文本", "Keyword Text"],
  matchType: ["匹配类型", "Match Type"],
  placementName: ["广告位", "Placement"],
  percentage: ["百分比", "Percentage"],
  targetExpression: [
    "拓展商品投放编号",
    "拓展商品投放名称（仅供参考）",
    "Resolved Product Targeting Expression",
    "Product Targeting Expression",
    "Keyword Text",
  ],
} as const;

export async function parseBulkIdentityWorkbookFile(
  file: File
): Promise<BulkIdentityBundle> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  return buildBulkIdentityBundleFromWorkbook(workbook, file.name);
}

export function buildBulkIdentityBundleFromWorkbook(
  workbook: WorkBook,
  fileName: string
): BulkIdentityBundle {
  const sheetName = findSponsoredProductsSheetName(workbook);
  if (!sheetName) {
    throw new Error(
      "未在 bulk 文件中找到“商品推广活动 / Sponsored Products”工作表，请重新导出 Amazon Ads bulk。"
    );
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("bulk 文件读取失败，未找到有效工作表。");
  }

  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, {
    defval: "",
    raw: false,
  });

  const campaignsByName = new Map<string, BulkCampaignIdentity>();
  const adGroupsByKey = new Map<string, BulkAdGroupIdentity>();
  const keywordsByKey = new Map<string, BulkKeywordIdentity>();
  const productTargetsByKey = new Map<string, BulkProductTargetIdentity>();
  const placementAdjustmentsByKey = new Map<string, BulkPlacementAdjustmentIdentity>();
  const exactKeywordsByKey = new Set<string>();
  const negativeKeywordsByKey = new Set<string>();

  let negativeKeywordCount = 0;
  let negativeProductTargetCount = 0;
  let placementAdjustmentCount = 0;

  for (const row of rows) {
    const entityLevel = canonicalizeEntityLevel(readFromHeaders(row, BULK_HEADERS.entityLevel));
    const campaignId = readFromHeaders(row, BULK_HEADERS.campaignId);
    const adGroupId = readFromHeaders(row, BULK_HEADERS.adGroupId);
    const keywordId = readFromHeaders(row, BULK_HEADERS.keywordId);
    const productTargetId = readFromHeaders(row, BULK_HEADERS.productTargetId);
    const campaignName = readFromHeaders(row, BULK_HEADERS.campaignName);
    const adGroupName = readFromHeaders(row, BULK_HEADERS.adGroupName);
    const portfolioName = readFromHeaders(row, BULK_HEADERS.portfolioName);
    const status = readFromHeaders(row, BULK_HEADERS.status);

    if (entityLevel === "campaign" && campaignId && campaignName) {
      campaignsByName.set(buildCampaignKey(campaignName), {
        campaignId,
        campaignName,
        portfolioName,
        dailyBudget: parseNumberLike(readFromHeaders(row, BULK_HEADERS.dailyBudget)),
        bidStrategy: readFromHeaders(row, BULK_HEADERS.bidStrategy),
        status,
      });
      continue;
    }

    if (
      entityLevel === "ad-group" &&
      campaignId &&
      adGroupId &&
      campaignName &&
      adGroupName
    ) {
      adGroupsByKey.set(buildAdGroupKey(campaignName, adGroupName), {
        campaignId,
        campaignName,
        adGroupId,
        adGroupName,
        defaultBid: parseNumberLike(readFromHeaders(row, BULK_HEADERS.defaultBid)),
        status,
      });
      continue;
    }

    if (
      entityLevel === "keyword" &&
      campaignId &&
      adGroupId &&
      keywordId &&
      campaignName &&
      adGroupName
    ) {
      const keywordText = readFromHeaders(row, BULK_HEADERS.keywordText);
      const matchType = canonicalizeMatchType(readFromHeaders(row, BULK_HEADERS.matchType));
      if (!keywordText || !matchType) {
        continue;
      }

      const identity: BulkKeywordIdentity = {
        campaignId,
        campaignName,
        adGroupId,
        adGroupName,
        keywordId,
        keywordText,
        matchType,
        bid:
          parseNumberLike(readFromHeaders(row, BULK_HEADERS.bid)) ??
          parseNumberLike(readFromHeaders(row, BULK_HEADERS.defaultBid)),
      };

      keywordsByKey.set(
        buildKeywordKey(campaignName, adGroupName, keywordText, matchType),
        identity
      );

      if (matchType === "exact") {
        exactKeywordsByKey.add(
          buildKeywordKey(campaignName, adGroupName, keywordText, "exact")
        );
      }
      continue;
    }

    if (
      entityLevel === "product-targeting" &&
      campaignId &&
      adGroupId &&
      productTargetId &&
      campaignName &&
      adGroupName
    ) {
      const targetExpression = extractProductTargetExpression(row);
      if (!targetExpression) {
        continue;
      }

      productTargetsByKey.set(
        buildProductTargetKey(campaignName, adGroupName, targetExpression),
        {
          campaignId,
          campaignName,
          adGroupId,
          adGroupName,
          productTargetId,
          targetExpression,
          bid:
            parseNumberLike(readFromHeaders(row, BULK_HEADERS.bid)) ??
            parseNumberLike(readFromHeaders(row, BULK_HEADERS.defaultBid)),
          entityLevel,
        }
      );
      continue;
    }

    if (entityLevel === "placement-adjustment" && campaignId && campaignName) {
      const placementName = canonicalizePlacementName(
        readFromHeaders(row, BULK_HEADERS.placementName)
      );
      if (!placementName) {
        continue;
      }

      placementAdjustmentCount += 1;
      placementAdjustmentsByKey.set(
        buildPlacementAdjustmentKey(campaignName, placementName),
        {
          campaignId,
          campaignName,
          placementName,
          percentage: parseNumberLike(readFromHeaders(row, BULK_HEADERS.percentage)),
        }
      );
      continue;
    }

    if (entityLevel === "negative-keyword" || entityLevel === "campaign-negative-keyword") {
      const keywordText = readFromHeaders(row, BULK_HEADERS.keywordText);
      const matchType = canonicalizeNegativeMatchType(readFromHeaders(row, BULK_HEADERS.matchType));
      if (!campaignName || !keywordText || !matchType) {
        continue;
      }

      negativeKeywordCount += 1;
      negativeKeywordsByKey.add(
        buildNegativeKeywordKey(
          campaignName,
          entityLevel === "campaign-negative-keyword" ? "" : adGroupName,
          keywordText,
          matchType
        )
      );
      continue;
    }

    if (entityLevel === "negative-product-targeting") {
      negativeProductTargetCount += 1;
    }
  }

  const warnings: string[] = [];
  if (rows.length === 0) {
    warnings.push("商品推广活动工作表没有可解析的数据行。");
  }

  return {
    meta: {
      kind: "bulk-identity",
      fileName,
      sheetName,
      rowCount: rows.length,
      warnings,
      recognized: rows.length > 0,
    },
    summary: {
      campaignCount: campaignsByName.size,
      adGroupCount: adGroupsByKey.size,
      keywordCount: keywordsByKey.size,
      productTargetCount: productTargetsByKey.size,
      placementAdjustmentCount,
      negativeKeywordCount,
      negativeProductTargetCount,
    },
    campaignsByName,
    adGroupsByKey,
    keywordsByKey,
    productTargetsByKey,
    placementAdjustmentsByKey,
    exactKeywordsByKey,
    negativeKeywordsByKey,
  };
}

export function toBulkKeywordMatchType(value: string) {
  switch (value) {
    case "broad":
      return "广泛";
    case "phrase":
      return "词组";
    case "exact":
      return "精准";
    case "negative-exact":
      return "否定精准匹配";
    case "negative-phrase":
      return "否定词组";
    default:
      return value;
  }
}

export function lookupBulkEntitiesForSearchTerm(
  bulkIdentity: BulkIdentityBundle | null | undefined,
  row: Pick<SearchTermRecord, "campaignName" | "adGroupName" | "targetingText" | "matchType">
) {
  if (!bulkIdentity) {
    return {
      campaignId: null,
      adGroupId: null,
      keywordId: null,
      productTargetId: null,
      currentBid: null,
    };
  }

  const campaignId =
    bulkIdentity.campaignsByName.get(buildCampaignKey(row.campaignName))?.campaignId ?? null;
  const adGroupIdentity = bulkIdentity.adGroupsByKey.get(
    buildAdGroupKey(row.campaignName, row.adGroupName)
  );
  const keywordIdentity = bulkIdentity.keywordsByKey.get(
    buildKeywordKey(row.campaignName, row.adGroupName, row.targetingText, row.matchType)
  );
  const productIdentity = bulkIdentity.productTargetsByKey.get(
    buildProductTargetKey(row.campaignName, row.adGroupName, row.targetingText)
  );

  return {
    campaignId: adGroupIdentity?.campaignId ?? campaignId,
    adGroupId: adGroupIdentity?.adGroupId ?? null,
    keywordId: keywordIdentity?.keywordId ?? null,
    productTargetId: productIdentity?.productTargetId ?? null,
    currentBid:
      keywordIdentity?.bid ?? productIdentity?.bid ?? adGroupIdentity?.defaultBid ?? null,
  };
}

export function lookupPlacementAdjustment(
  bulkIdentity: BulkIdentityBundle | null | undefined,
  campaignName: string,
  placementName: string
) {
  if (!bulkIdentity) {
    return {
      campaignId: null,
      currentAdjustment: null,
    };
  }

  const campaignId =
    bulkIdentity.campaignsByName.get(buildCampaignKey(campaignName))?.campaignId ?? null;
  const placementIdentity = bulkIdentity.placementAdjustmentsByKey.get(
    buildPlacementAdjustmentKey(campaignName, placementName)
  );

  return {
    campaignId: placementIdentity?.campaignId ?? campaignId,
    currentAdjustment: placementIdentity?.percentage ?? null,
  };
}

function extractProductTargetExpression(row: SheetRow) {
  return readFromHeaders(row, BULK_HEADERS.targetExpression);
}

function readFromHeaders(row: SheetRow, headers: readonly string[]) {
  for (const header of headers) {
    const value = row[header];
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function canonicalizeEntityLevel(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) {
    return "";
  }

  if (raw.includes("campaign negative keyword") || raw.includes("广告活动否定关键词")) {
    return "campaign-negative-keyword";
  }
  if (raw.includes("negative product targeting") || raw.includes("否定商品定向")) {
    return "negative-product-targeting";
  }
  if (raw.includes("negative keyword") || raw.includes("否定关键词")) {
    return "negative-keyword";
  }
  if (raw.includes("bidding adjustment") || raw.includes("竞价调整")) {
    return "placement-adjustment";
  }
  if (raw.includes("product targeting") || raw.includes("商品定向")) {
    return "product-targeting";
  }
  if (raw === "campaign" || raw.includes("广告活动")) {
    return "campaign";
  }
  if (raw === "ad group" || raw === "adgroup" || raw.includes("广告组")) {
    return "ad-group";
  }
  if (raw === "keyword" || raw.includes("关键词")) {
    return "keyword";
  }

  return raw;
}

function findSponsoredProductsSheetName(workbook: WorkBook) {
  if (workbook.SheetNames.includes(BULK_SHEET_NAME)) {
    return BULK_SHEET_NAME;
  }

  return (
    workbook.SheetNames.find((sheetName) => sheetName.includes("商品推广活动")) ??
    workbook.SheetNames.find((sheetName) =>
      sheetName.toLowerCase().includes("sponsored products")
    ) ??
    null
  );
}

export {
  buildAdGroupKey,
  buildCampaignKey,
  buildKeywordKey,
  buildNegativeKeywordKey,
  buildPlacementAdjustmentKey,
  buildProductTargetKey,
  canonicalizeMatchType,
  canonicalizeNegativeMatchType,
  canonicalizePlacementName,
  normalizeText,
  resolveTargetingType,
};
