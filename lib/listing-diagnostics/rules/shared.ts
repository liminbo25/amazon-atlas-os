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
    label: "质量稳定性",
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
    label: "尺码与版型",
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
    label: "使用体验",
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
    label: "包装与物流",
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
    label: "价格与价值感",
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
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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
      return "流量";
    case "click":
      return "点击";
    case "conversion":
      return "转化";
    case "buyability":
      return "可售性";
    case "compliance":
      return "合规";
  }
}

export function formatDimensionLabel(dimensionId: string): string {
  switch (dimensionId) {
    case "content-coverage":
      return "内容结构";
    case "keyword-opportunity":
      return "关键词入口";
    case "review-signal":
      return "评论与转化";
    case "listing-health":
      return "可售性与流量基础";
    case "market-position":
      return "价格与竞争位";
    default:
      return dimensionId.replace(/-/g, " ");
  }
}

export function formatRootCauseCategory(
  category: ListingDiagnosticsRootCauseCategory | null
): string {
  if (!category) {
    return "通用问题";
  }

  switch (category) {
    case "inventory":
      return "库存";
    case "offer":
      return "报价与商品提供";
    case "pricing":
      return "价格";
    case "buy-box":
      return "Buy Box";
    case "restrictions":
      return "限制与阻塞";
    case "missing-attributes":
      return "属性缺失";
    case "variation-issues":
      return "变体问题";
    case "listing-status":
      return "Listing 状态";
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
        return "Seller Central > 库存 / FBA 补货";
      case "offer":
        return "Seller Central > Offer / SKU 配置";
      case "pricing":
        return "Seller Central > Pricing / 优惠设置";
      case "buy-box":
        return "Seller Central > Pricing / 配送 / Buy Box";
      case "restrictions":
        return "Seller Central > Listing 限制 / 合规流程";
      case "missing-attributes":
        return "Seller Central > 编辑 Listing > 标题 / Bullet / 属性 / 图片";
      case "variation-issues":
        return "Seller Central > 编辑 Listing > 变体";
      case "listing-status":
        return "Seller Central > Listing Health / Search Suppressed / 库存";
    }
  }

  switch (dimensionId) {
    case "content-coverage":
      return "Seller Central > 标题 / Bullet / 图片内容";
    case "keyword-opportunity":
      return "标题、Bullet、后台关键词与索引输入";
    case "review-signal":
      return "文案、图片证明、FAQ 与预期管理";
    case "listing-health":
      return "Seller Central > Listing 健康度与 Offer 状态";
    case "market-position":
    default:
      return "价格、促销与竞争位策略";
  }
}

function getDefaultExpectedImpact(
  impactType: ListingDiagnosticsImpactType
): string {
  switch (impactType) {
    case "visibility":
      return "有助于恢复核心词覆盖并提升搜索流量入口。";
    case "click":
      return "有助于提升搜索结果页到详情页的点击效率。";
    case "conversion":
      return "有助于降低详情页流失并提升转化质量。";
    case "buyability":
      return "有助于恢复或稳定 ASIN 的可售性。";
    case "compliance":
      return "有助于降低 Listing 被抑制或受限的风险。";
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
      params.whereToChange ?? "Seller Central 或对应的前台内容位",
    expectedImpact:
      params.expectedImpact ??
      "把诊断结论转成具体可执行动作，并能在后续指标上看到影响。",
  };
}
