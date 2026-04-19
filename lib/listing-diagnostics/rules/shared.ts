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
  ListingDiagnosticsImpactType,
  ListingDiagnosticsPriority,
  ListingDiagnosticsRootCauseCategory,
  ListingDiagnosticsSeverity,
  ListingDiagnosticsSourceStatus,
  ListingDiagnosticsTheme,
  ListingDiagnosticsVerification,
} from "@/lib/listing-diagnostics/types";

type ListingDiagnosticsPriorityInput =
  | ListingDiagnosticsPriority
  | "now"
  | "next"
  | "later";

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
export function normalizePriority(
  priority: ListingDiagnosticsPriorityInput
): ListingDiagnosticsPriority {
  switch (priority) {
    case "now":
      return "P0";
    case "next":
      return "P1";
    case "later":
      return "P2";
    default:
      return priority;
  }
}

export function getPriorityRank(priority: ListingDiagnosticsPriority): number {
  switch (priority) {
    case "P0":
      return 0;
    case "P1":
      return 1;
    case "P2":
      return 2;
  }
}

export function getImpactRank(impactType: ListingDiagnosticsImpactType): number {
  switch (impactType) {
    case "buyability":
      return 0;
    case "compliance":
      return 1;
    case "visibility":
      return 2;
    case "conversion":
      return 3;
    case "click":
      return 4;
  }
}

export function getVerificationRank(
  verification: ListingDiagnosticsVerification
): number {
  switch (verification) {
    case "verified":
      return 0;
    case "direct":
      return 1;
    case "inferred":
      return 2;
  }
}

export function formatImpactType(
  impactType: ListingDiagnosticsImpactType
): string {
  switch (impactType) {
    case "visibility":
      return "Visibility";
    case "click":
      return "Click";
    case "conversion":
      return "Conversion";
    case "buyability":
      return "Buyability";
    case "compliance":
      return "Compliance";
  }
}

export function formatDimensionLabel(dimensionId: string): string {
  switch (dimensionId) {
    case "content-coverage":
      return "Content coverage";
    case "keyword-opportunity":
      return "Keyword opportunity";
    case "review-signal":
      return "Review signal";
    case "listing-health":
      return "Buyability & discoverability";
    case "market-position":
      return "Market position";
    default:
      return dimensionId.replace(/-/g, " ");
  }
}

export function formatRootCauseCategory(
  category: ListingDiagnosticsRootCauseCategory | null
): string {
  if (!category) {
    return "General";
  }

  switch (category) {
    case "inventory":
      return "Inventory";
    case "offer":
      return "Offer";
    case "pricing":
      return "Pricing";
    case "buy-box":
      return "Buy Box";
    case "restrictions":
      return "Restrictions";
    case "missing-attributes":
      return "Missing Attributes";
    case "variation-issues":
      return "Variation Issues";
    case "listing-status":
      return "Listing Status";
  }
}

function getDefaultImpactType(
  dimensionId: string
): ListingDiagnosticsImpactType {
  switch (dimensionId) {
    case "content-coverage":
      return "click";
    case "keyword-opportunity":
      return "visibility";
    case "review-signal":
      return "conversion";
    case "listing-health":
      return "buyability";
    case "market-position":
    default:
      return "conversion";
  }
}

function getDefaultWhereToChange(
  dimensionId: string,
  category: ListingDiagnosticsRootCauseCategory | null
): string {
  if (category) {
    switch (category) {
      case "inventory":
        return "Seller Central > Manage All Inventory / FBA replenishment";
      case "offer":
        return "Seller Central > Offer / fulfillment settings / SKU setup";
      case "pricing":
        return "Seller Central > Pricing / offer settings";
      case "buy-box":
        return "Seller Central > Pricing / shipping / fulfillment";
      case "restrictions":
        return "Seller Central > Listing limitations / compliance workflows";
      case "missing-attributes":
        return "Seller Central > Edit listing > title / bullets / attributes / images";
      case "variation-issues":
        return "Seller Central > Edit listing > Variations";
      case "listing-status":
        return "Seller Central > Listing quality dashboard / Search Suppressed / Manage All Inventory";
    }
  }

  switch (dimensionId) {
    case "content-coverage":
      return "Seller Central > title / bullets / gallery content";
    case "keyword-opportunity":
      return "Title, bullets, backend keywords, and keyword indexing inputs";
    case "review-signal":
      return "Copy, gallery proof points, FAQs, and expectation-setting content";
    case "listing-health":
      return "Seller Central listing health and offer status";
    case "market-position":
    default:
      return "Pricing, merchandising, and offer positioning";
  }
}

function getDefaultExpectedImpact(
  impactType: ListingDiagnosticsImpactType
): string {
  switch (impactType) {
    case "visibility":
      return "Should recover indexed query coverage and improve retail-surface visibility.";
    case "click":
      return "Should improve SERP-to-PDP click-through once the listing looks more relevant.";
    case "conversion":
      return "Should reduce purchase friction and improve PDP conversion quality.";
    case "buyability":
      return "Should restore or stabilize the customer's ability to purchase the ASIN.";
    case "compliance":
      return "Should remove compliance blockers that are suppressing the listing.";
  }
}

function resolveVerification(params: {
  verification?: ListingDiagnosticsVerification;
  inferred?: boolean;
}): ListingDiagnosticsVerification {
  if (params.verification) {
    return params.verification;
  }

  return params.inferred ? "inferred" : "direct";
}

function getDefaultPriority(params: {
  severity: ListingDiagnosticsSeverity;
  impactType: ListingDiagnosticsImpactType;
  verification: ListingDiagnosticsVerification;
}): ListingDiagnosticsPriority {
  if (
    params.impactType === "buyability" ||
    params.impactType === "compliance" ||
    (params.severity === "high" && params.verification === "verified")
  ) {
    return "P0";
  }

  if (params.severity === "high" || params.impactType === "visibility") {
    return "P1";
  }

  return "P2";
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
  impactType?: ListingDiagnosticsImpactType;
  priority?: ListingDiagnosticsPriorityInput;
  symptom?: string;
  rootCause?: string;
  rootCauseCategory?: ListingDiagnosticsRootCauseCategory | null;
  whatToChange?: string;
  whereToChange?: string;
  expectedImpact?: string;
  verification?: ListingDiagnosticsVerification;
}): ListingDiagnosticsFinding {
  const verification = resolveVerification(params);
  const impactType = params.impactType ?? getDefaultImpactType(params.dimensionId);
  const priority =
    params.priority !== undefined
      ? normalizePriority(params.priority)
      : getDefaultPriority({
          severity: params.severity,
          impactType,
          verification,
        });
  const rootCauseCategory = params.rootCauseCategory ?? null;

  return {
    ...params,
    tone: params.tone ?? "risk",
    inferred: params.inferred ?? false,
    evidence: params.evidence ?? [],
    impactType,
    priority,
    symptom: params.symptom ?? params.title,
    rootCause: params.rootCause ?? params.description,
    rootCauseCategory,
    whatToChange: params.whatToChange ?? params.description,
    whereToChange:
      params.whereToChange ??
      getDefaultWhereToChange(params.dimensionId, rootCauseCategory),
    expectedImpact:
      params.expectedImpact ?? getDefaultExpectedImpact(impactType),
    verification,
  };
}

export function createAction(params: {
  id: string;
  title: string;
  description: string;
  priority: ListingDiagnosticsActionPriority | ListingDiagnosticsPriorityInput;
  confidence: number;
  inferred?: boolean;
  linkedFindingIds?: string[];
  verification?: ListingDiagnosticsVerification;
  symptom?: string;
  rootCause?: string;
  action?: string;
  whereToChange?: string;
  expectedImpact?: string;
}): ListingDiagnosticsActionPlanItem {
  const verification = resolveVerification(params);

  return {
    ...params,
    inferred: params.inferred ?? false,
    linkedFindingIds: params.linkedFindingIds ?? [],
    priority: normalizePriority(params.priority),
    verification,
    symptom: params.symptom ?? params.title,
    rootCause: params.rootCause ?? params.description,
    action: params.action ?? params.title,
    whereToChange:
      params.whereToChange ?? "Seller Central or the listing content surface tied to the finding",
    expectedImpact:
      params.expectedImpact ??
      "Should turn the diagnosis into a concrete operator next step with measurable impact.",
  };
}
