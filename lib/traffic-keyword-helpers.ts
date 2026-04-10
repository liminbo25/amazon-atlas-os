import type { TrafficKeyword } from "./types";

export const DEFAULT_MAX_SELECTED_KEYWORDS = 25;

const KEYWORD_RANK_SIGNAL_LIMIT = 80;

export function selectTrafficKeywords(
  candidates: TrafficKeyword[],
  maxItems: number = DEFAULT_MAX_SELECTED_KEYWORDS
): TrafficKeyword[] {
  const deduped = new Map<string, TrafficKeyword>();

  for (const candidate of candidates) {
    const normalized = normalizeTrafficKeyword(candidate);
    if (!normalized) {
      continue;
    }

    const key = buildKeywordKey(normalized.keyword);
    const existing = deduped.get(key);

    if (!existing || compareTrafficKeywords(normalized, existing) < 0) {
      deduped.set(key, normalized);
    }
  }

  return Array.from(deduped.values())
    .sort(compareTrafficKeywords)
    .slice(0, maxItems);
}

export function compareTrafficKeywords(
  left: TrafficKeyword,
  right: TrafficKeyword
): number {
  return (
    compareNumbersDesc(getRelevanceTier(left), getRelevanceTier(right)) ||
    compareNumbersDesc(left.searchVolume, right.searchVolume) ||
    compareNumbersDesc(left.conversionShare, right.conversionShare) ||
    compareNumbersAsc(rankForComparison(left.organicRank), rankForComparison(right.organicRank)) ||
    compareNumbersAsc(
      rankForComparison(left.sponsoredRank),
      rankForComparison(right.sponsoredRank)
    ) ||
    left.keyword.localeCompare(right.keyword, "en", { sensitivity: "base" })
  );
}

function normalizeTrafficKeyword(candidate: TrafficKeyword): TrafficKeyword | null {
  const keyword = candidate.keyword.trim().replace(/\s+/g, " ");
  if (!keyword) {
    return null;
  }

  const normalized: TrafficKeyword = {
    keyword,
    searchVolume: normalizeNonNegativeInteger(candidate.searchVolume),
    organicRank: normalizeNonNegativeInteger(candidate.organicRank),
    sponsoredRank:
      candidate.sponsoredRank === null || candidate.sponsoredRank === undefined
        ? null
        : normalizeNonNegativeInteger(candidate.sponsoredRank),
    conversionShare: normalizePercentage(candidate.conversionShare),
  };

  if (!hasUsableSignal(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function normalizePercentage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
}

function hasUsableSignal(keyword: TrafficKeyword): boolean {
  return (
    keyword.searchVolume > 0 ||
    keyword.conversionShare > 0 ||
    hasRankSignal(keyword.organicRank) ||
    hasRankSignal(keyword.sponsoredRank)
  );
}

function getRelevanceTier(keyword: TrafficKeyword): number {
  const hasConversionSignal = keyword.conversionShare > 0;
  const hasOrganicSignal = hasRankSignal(keyword.organicRank);
  const hasSponsoredSignal = hasRankSignal(keyword.sponsoredRank);

  if (hasConversionSignal && (hasOrganicSignal || hasSponsoredSignal)) {
    return 4;
  }

  if (hasConversionSignal) {
    return 3;
  }

  if (hasOrganicSignal || hasSponsoredSignal) {
    return 2;
  }

  if (keyword.searchVolume > 0) {
    return 1;
  }

  return 0;
}

function hasRankSignal(rank: number | null | undefined): boolean {
  return typeof rank === "number" && rank > 0 && rank <= KEYWORD_RANK_SIGNAL_LIMIT;
}

function buildKeywordKey(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

function rankForComparison(rank: number | null): number {
  return typeof rank === "number" && rank > 0 ? rank : Number.MAX_SAFE_INTEGER;
}

function compareNumbersDesc(left: number, right: number): number {
  return right - left;
}

function compareNumbersAsc(left: number, right: number): number {
  return left - right;
}
