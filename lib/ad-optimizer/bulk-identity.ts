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
  TargetingType,
} from "@/lib/ad-optimizer/types";

type SheetRow = Record<string, unknown>;

const BULK_SHEET_NAME = "商品推广活动";

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
      "未在 bulk 文件中找到“商品推广活动”工作表，请重新导出 Sponsored Products bulk。"
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
    const entityLevel = readString(row["实体层级"]);
    const campaignId = readString(row["广告活动编号"]);
    const adGroupId = readString(row["广告组编号"]);
    const keywordId = readString(row["关键词编号"]);
    const productTargetId = readString(row["商品投放 ID"]);
    const campaignName = resolveBulkCampaignName(row);
    const adGroupName = resolveBulkAdGroupName(row);

    if (entityLevel === "广告活动" && campaignId && campaignName) {
      campaignsByName.set(buildCampaignKey(campaignName), {
        campaignId,
        campaignName,
      });
    }

    if (
      entityLevel === "广告组" &&
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
        defaultBid:
          parseNumberLike(row["广告组默认竞价"]) ??
          parseNumberLike(row["广告组默认竞价（仅供参考）"]),
      });
    }

    if (
      entityLevel === "关键词" &&
      campaignId &&
      adGroupId &&
      keywordId &&
      campaignName &&
      adGroupName
    ) {
      const keywordText = readString(row["关键词文本"]);
      const matchType = canonicalizeMatchType(row["匹配类型"]);

      if (keywordText && matchType) {
        const identity: BulkKeywordIdentity = {
          campaignId,
          campaignName,
          adGroupId,
          adGroupName,
          keywordId,
          keywordText,
          matchType,
          bid:
            parseNumberLike(row["竞价"]) ??
            parseNumberLike(row["广告组默认竞价"]) ??
            parseNumberLike(row["广告组默认竞价（仅供参考）"]),
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
      }
    }

    if (
      entityLevel === "商品定向" &&
      campaignId &&
      adGroupId &&
      productTargetId &&
      campaignName &&
      adGroupName
    ) {
      const targetExpression = extractProductTargetExpression(row);
      if (targetExpression) {
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
              parseNumberLike(row["竞价"]) ??
              parseNumberLike(row["广告组默认竞价"]) ??
              parseNumberLike(row["广告组默认竞价（仅供参考）"]),
            entityLevel,
          }
        );
      }
    }

    if (entityLevel === "竞价调整" && campaignId && campaignName) {
      const placementName = canonicalizePlacementName(row["广告位"]);
      if (placementName) {
        placementAdjustmentCount += 1;
        placementAdjustmentsByKey.set(
          buildPlacementAdjustmentKey(campaignName, placementName),
          {
            campaignId,
            campaignName,
            placementName,
            percentage: parseNumberLike(row["百分比"]),
          }
        );
      }
    }

    if (
      entityLevel === "否定关键词" ||
      entityLevel === "广告活动否定关键词"
    ) {
      const keywordText = readString(row["关键词文本"]);
      const matchType = canonicalizeNegativeMatchType(row["匹配类型"]);

      if (campaignName && keywordText && matchType) {
        negativeKeywordCount += 1;
        negativeKeywordsByKey.add(
          buildNegativeKeywordKey(
            campaignName,
            entityLevel === "广告活动否定关键词" ? "" : adGroupName,
            keywordText,
            matchType
          )
        );
      }
    }

    if (entityLevel === "否定商品定向") {
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

export function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function canonicalizeMatchType(value: unknown) {
  const raw = normalizeText(value);
  if (!raw || raw === "-") {
    return "";
  }

  if (raw.includes("broad") || raw.includes("广泛")) {
    return "broad";
  }
  if (raw.includes("phrase") || raw.includes("词组")) {
    return "phrase";
  }
  if (raw.includes("exact") || raw.includes("精准")) {
    return "exact";
  }

  return raw;
}

export function canonicalizeNegativeMatchType(value: unknown) {
  const raw = normalizeText(value);

  if (!raw) {
    return "";
  }
  if (raw.includes("否定精准") || raw.includes("negative exact")) {
    return "negative-exact";
  }
  if (raw.includes("否定词组") || raw.includes("negative phrase")) {
    return "negative-phrase";
  }

  return raw;
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

export function resolveTargetingType(
  targetingText: string,
  matchType: string
): TargetingType {
  if (matchType === "broad" || matchType === "phrase" || matchType === "exact") {
    return "keyword";
  }

  const normalizedTarget = normalizeText(targetingText);
  if (!normalizedTarget) {
    return "unknown";
  }

  if (
    normalizedTarget === "close-match" ||
    normalizedTarget === "loose-match" ||
    normalizedTarget === "substitutes" ||
    normalizedTarget === "complements"
  ) {
    return "auto";
  }

  if (
    normalizedTarget.startsWith('asin="') ||
    normalizedTarget.startsWith('category="') ||
    normalizedTarget.startsWith('brand="')
  ) {
    return "product";
  }

  return "unknown";
}

export function buildCampaignKey(campaignName: string) {
  return normalizeText(campaignName);
}

export function buildAdGroupKey(campaignName: string, adGroupName: string) {
  return [normalizeText(campaignName), normalizeText(adGroupName)].join("::");
}

export function buildKeywordKey(
  campaignName: string,
  adGroupName: string,
  keywordText: string,
  matchType: string
) {
  return [
    normalizeText(campaignName),
    normalizeText(adGroupName),
    normalizeText(keywordText),
    normalizeText(matchType),
  ].join("::");
}

export function buildProductTargetKey(
  campaignName: string,
  adGroupName: string,
  targetExpression: string
) {
  return [
    normalizeText(campaignName),
    normalizeText(adGroupName),
    normalizeText(targetExpression),
  ].join("::");
}

export function buildPlacementAdjustmentKey(
  campaignName: string,
  placementName: string
) {
  return [normalizeText(campaignName), normalizeText(placementName)].join("::");
}

export function buildNegativeKeywordKey(
  campaignName: string,
  adGroupName: string,
  keywordText: string,
  matchType: string
) {
  return [
    normalizeText(campaignName),
    normalizeText(adGroupName),
    normalizeText(keywordText),
    normalizeText(matchType),
  ].join("::");
}

export function lookupBulkEntitiesForSearchTerm(
  bulkIdentity: BulkIdentityBundle | null | undefined,
  row: Pick<
    SearchTermRecord,
    "campaignName" | "adGroupName" | "targetingText" | "matchType"
  >
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
    bulkIdentity.campaignsByName.get(buildCampaignKey(row.campaignName))?.campaignId ??
    null;
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

export function canonicalizePlacementName(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) {
    return "";
  }

  if (
    raw.includes("top of search") ||
    raw.includes("搜索结果首页首位") ||
    raw.includes("搜索结果首页顶部")
  ) {
    return "Top of Search";
  }
  if (raw.includes("product pages") || raw.includes("商品页面")) {
    return "Product Pages";
  }
  if (
    raw.includes("rest of search") ||
    raw.includes("搜索结果的其余位置") ||
    raw.includes("其余搜索位置")
  ) {
    return "Rest of Search";
  }
  if (raw.includes("amazon business") || raw.includes("亚马逊企业购")) {
    return "Amazon Business";
  }

  return String(value ?? "").trim();
}

function extractProductTargetExpression(row: SheetRow) {
  return readString(
    row["拓展商品投放编号"] ||
      row["拓展商品投放名称（仅供参考）"] ||
      row["关键词文本"]
  );
}

function resolveBulkCampaignName(row: SheetRow) {
  return readString(row["广告活动名称"] || row["广告活动名称（仅供参考）"]);
}

function resolveBulkAdGroupName(row: SheetRow) {
  return readString(row["广告组名称"] || row["广告组名称（仅供参考）"]);
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

function parseNumberLike(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/[$,%\s,]/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function readString(value: unknown) {
  return String(value ?? "").trim();
}
