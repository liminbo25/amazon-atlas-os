import type {
  CompetitorListing,
  ReviewData,
  TrafficKeyword,
} from "@/lib/types";
import type {
  ListingDiagnosticsActionPlanItem,
  ListingDiagnosticsActionPriority,
  ListingDiagnosticsFinding,
  ListingDiagnosticsFindingTone,
  ListingDiagnosticsSeverity,
  ListingDiagnosticsSourceStatus,
  ListingDiagnosticsTheme,
} from "@/lib/listing-diagnostics/types";

const REVIEW_THEME_DICTIONARY = [
  {
    id: "quality",
    label: "Quality consistency",
    keywords: [
      "broken",
      "defect",
      "defective",
      "cheap",
      "tear",
      "tore",
      "rip",
      "ripped",
      "quality",
      "durable",
      "durability",
      "crack",
      "cracked",
      "fall apart",
      "flimsy",
      "sturdy",
    ],
  },
  {
    id: "fit",
    label: "Sizing and fit",
    keywords: [
      "small",
      "large",
      "tight",
      "loose",
      "fit",
      "size",
      "sizing",
      "short",
      "long",
      "narrow",
      "wide",
    ],
  },
  {
    id: "usability",
    label: "Ease of use",
    keywords: [
      "hard",
      "difficult",
      "install",
      "instructions",
      "assembly",
      "setup",
      "use",
      "operate",
      "confusing",
      "awkward",
    ],
  },
  {
    id: "packaging",
    label: "Packaging and shipping",
    keywords: [
      "package",
      "packaging",
      "box",
      "shipping",
      "delivery",
      "arrived",
      "damaged",
      "scratch",
      "scratched",
      "missing",
      "late",
    ],
  },
  {
    id: "value",
    label: "Price and value",
    keywords: [
      "price",
      "expensive",
      "worth",
      "value",
      "cost",
      "overpriced",
      "cheap",
      "money",
    ],
  },
];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

export function safeDivide(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildListingText(listing: CompetitorListing | null): string {
  if (!listing) {
    return "";
  }

  return [listing.title, ...listing.bulletPoints].filter(Boolean).join(" ");
}

export function hasMeaningfulListingSnapshot(
  listing: CompetitorListing | null
): boolean {
  if (!listing) {
    return false;
  }

  return Boolean(
    listing.title.trim() ||
      listing.bulletPoints.some((point) => point.trim()) ||
      listing.price > 0 ||
      listing.rating > 0 ||
      listing.reviews > 0 ||
      listing.mainImage.trim()
  );
}

export function hasAnyEntitySignal(options: {
  listing: CompetitorListing | null;
  negativeReviews: ReviewData[];
  positiveReviews: ReviewData[];
  keywords: TrafficKeyword[];
}): boolean {
  return (
    hasMeaningfulListingSnapshot(options.listing) ||
    options.negativeReviews.length > 0 ||
    options.positiveReviews.length > 0 ||
    options.keywords.length > 0
  );
}

export function keywordIsPresent(text: string, keyword: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);

  if (!normalizedText || !normalizedKeyword) {
    return false;
  }

  return normalizedText.includes(normalizedKeyword);
}

export function uniqueKeywords(keywords: TrafficKeyword[]): TrafficKeyword[] {
  const seen = new Set<string>();

  return [...keywords]
    .sort((left, right) => right.searchVolume - left.searchVolume)
    .filter((keyword) => {
      const normalized = normalizeText(keyword.keyword);
      if (!normalized || seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

export function extractReviewThemes(
  reviews: ReviewData[],
  inferred: boolean,
  limit = 3
): ListingDiagnosticsTheme[] {
  if (reviews.length === 0) {
    return [];
  }

  const counts = new Map<
    string,
    { label: string; mentions: number; keywords: Set<string> }
  >();

  for (const theme of REVIEW_THEME_DICTIONARY) {
    counts.set(theme.id, {
      label: theme.label,
      mentions: 0,
      keywords: new Set<string>(),
    });
  }

  for (const review of reviews) {
    const haystack = normalizeText(`${review.title} ${review.content}`);
    if (!haystack) {
      continue;
    }

    for (const theme of REVIEW_THEME_DICTIONARY) {
      const matchedKeywords = theme.keywords.filter((keyword) =>
        haystack.includes(normalizeText(keyword))
      );

      if (matchedKeywords.length === 0) {
        continue;
      }

      const entry = counts.get(theme.id);
      if (!entry) {
        continue;
      }

      entry.mentions += 1;
      matchedKeywords.forEach((keyword) => {
        entry.keywords.add(keyword);
      });
    }
  }

  return Array.from(counts.entries())
    .map(([id, entry]) => ({
      id,
      label: entry.label,
      mentions: entry.mentions,
      share: safeDivide(entry.mentions, reviews.length),
      keywords: Array.from(entry.keywords).slice(0, 4),
      inferred,
    }))
    .filter((theme) => theme.mentions > 0)
    .sort((left, right) => right.mentions - left.mentions)
    .slice(0, limit);
}

export function getCoverageStatus(
  available: number,
  expected: number,
  coveredThreshold = 1
): ListingDiagnosticsSourceStatus {
  if (available <= 0 || expected <= 0) {
    return "missing";
  }

  const ratio = safeDivide(available, expected);

  if (ratio >= coveredThreshold) {
    return "covered";
  }

  return "partial";
}

export function getCountCoverageStatus(
  count: number,
  coveredAt: number,
  partialAt: number
): ListingDiagnosticsSourceStatus {
  if (count >= coveredAt) {
    return "covered";
  }

  if (count >= partialAt) {
    return "partial";
  }

  return "missing";
}

export function getCountConfidence(
  count: number,
  coveredAt: number,
  partialAt: number
): number {
  if (count <= 0) {
    return 0;
  }

  if (count >= coveredAt) {
    return clamp(0.85 + (count - coveredAt) / (coveredAt * 4), 0.85, 1);
  }

  if (count >= partialAt) {
    return clamp(0.45 + count / (coveredAt * 2), 0.45, 0.84);
  }

  return clamp(0.2 + count / (partialAt * 5), 0.2, 0.44);
}

export function createFinding(params: {
  id: string;
  title: string;
  description: string;
  severity: ListingDiagnosticsSeverity;
  tone?: ListingDiagnosticsFindingTone;
  dimensionId: string;
  confidence: number;
  inferred?: boolean;
  evidence?: string[];
}): ListingDiagnosticsFinding {
  return {
    tone: params.tone ?? "risk",
    inferred: params.inferred ?? false,
    evidence: params.evidence ?? [],
    ...params,
  };
}

export function createAction(params: {
  id: string;
  title: string;
  description: string;
  priority: ListingDiagnosticsActionPriority;
  confidence: number;
  inferred?: boolean;
  linkedFindingIds?: string[];
}): ListingDiagnosticsActionPlanItem {
  return {
    inferred: params.inferred ?? false,
    linkedFindingIds: params.linkedFindingIds ?? [],
    ...params,
  };
}
