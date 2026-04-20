import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";
import type { TargetingType } from "@/lib/ad-optimizer/types";

export type SheetRow = Record<string, unknown>;

export type WorkbookSelection = {
  sheetName: string;
  rows: SheetRow[];
};

export type ColumnCandidate =
  | string
  | ((normalizedHeader: string, rawHeader: string) => boolean);

export async function readWorkbook(file: File) {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    raw: false,
  });
}

export function selectBestSheet(
  workbook: WorkBook,
  nameHints: string[],
  scoreChecks: ColumnCandidate[]
): WorkbookSelection {
  let best: (WorkbookSelection & { score: number }) | null = null;

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
  const fallbackSheet = fallbackName ? workbook.Sheets[fallbackName] : null;
  return {
    sheetName: fallbackName ?? "Sheet1",
    rows: fallbackSheet
      ? XLSX.utils.sheet_to_json<SheetRow>(fallbackSheet, {
          defval: "",
          raw: false,
        })
      : [],
  };
}

export function collectHeaders(rows: SheetRow[]) {
  const headers = new Set<string>();
  for (const row of rows.slice(0, Math.min(rows.length, 12))) {
    for (const key of Object.keys(row)) {
      if (key) {
        headers.add(key);
      }
    }
  }
  return [...headers];
}

export function resolveHeader(headers: string[], candidates: ColumnCandidate[]) {
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

export function matchesCandidate(
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

export function readStringByHeader(row: SheetRow, header: string | null) {
  if (!header) {
    return "";
  }
  return String(row[header] ?? "").trim();
}

export function readNumberByHeader(row: SheetRow, header: string | null) {
  if (!header) {
    return 0;
  }
  return parseNumberLike(row[header]) ?? 0;
}

export function readRateByHeader(row: SheetRow, header: string | null, nullable = false) {
  if (!header) {
    return nullable ? null : 0;
  }
  const parsed = parseRateLike(row[header]);
  if (parsed === null) {
    return nullable ? null : 0;
  }
  return parsed;
}

export function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeLooseText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}%/\\\-_,.:;'"`~!?，。；：、“”‘’（）【】《》]/g, "");
}

export function normalizeHeader(value: string) {
  return normalizeLooseText(value).replace(/[#+]/g, "");
}

export function parseNumberLike(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || raw === "--") {
    return null;
  }

  const negative = raw.startsWith("(") && raw.endsWith(")");
  const normalized = raw.replace(/[$￥¥,%\s,]/g, "").replace(/[()]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return negative ? -parsed : parsed;
}

export function parseRateLike(value: unknown) {
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

export function isRowEmpty(row: SheetRow) {
  return Object.values(row).every((value) => String(value ?? "").trim() === "");
}

export function dedupeStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim() !== ""))];
}

export function extractAsin(value: string) {
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

export function looksLikeAsin(value: string) {
  return extractAsin(value) !== null;
}

export function buildAsinTargetExpression(value: string) {
  const asin = extractAsin(value);
  return asin ? `asin="${asin}"` : null;
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
  if (raw.includes("negative exact") || raw.includes("否定精准")) {
    return "negative-exact";
  }
  if (raw.includes("negative phrase") || raw.includes("否定词组")) {
    return "negative-phrase";
  }
  return raw;
}

export function canonicalizePlacementName(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) {
    return "";
  }

  if (
    raw.includes("top of search") ||
    raw.includes("搜索结果首页首位") ||
    raw.includes("搜索结果顶部")
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

export function countWords(value: string) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
