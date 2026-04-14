import type {
  AiRuntimeServiceConfig,
  CompetitorListing,
  ReviewData,
  SellerSpriteRuntimeConfig,
  TrafficKeyword,
} from "@/lib/types";

export type LegacyPriority = "critical" | "high" | "medium";
export type LegacyStatus = "strong" | "watch" | "weak";

export interface LegacyCopyDiagnosisRequest {
  marketplace: string;
  targetAsin: string;
  competitorAsins: string[];
  currentTitle: string;
  currentBullets: string[];
  currentSearchTerms: string;
  sellerSpriteConfig?: SellerSpriteRuntimeConfig;
}

export interface LegacyRuntimeRequest {
  runtime?: {
    task: string;
  } & AiRuntimeServiceConfig;
  runtimeConfig?: {
    ai?: AiRuntimeServiceConfig;
    legacyCopyDiagnosis?: AiRuntimeServiceConfig;
  };
  sellerSpriteConfig?: SellerSpriteRuntimeConfig;
}

export interface LegacyFieldCoverage {
  title: boolean;
  bullets: boolean;
  searchTerms: boolean;
  anywhere: boolean;
}

export interface LegacyKeywordGap {
  keyword: string;
  searchVolume: number;
  targetOrganicRank: number;
  targetSponsoredRank: number | null;
  bestCompetitorAsin: string | null;
  bestCompetitorOrganicRank: number | null;
  coverage: LegacyFieldCoverage;
  opportunity: LegacyPriority;
  reason: string;
}

export interface LegacyReviewTheme {
  phrase: string;
  count: number;
  sample: string;
  addressedInCopy: boolean;
}

export interface LegacyCompetitorSnapshot {
  asin: string;
  title: string;
  price: number;
  rating: number;
  reviews: number;
  monthlySales: number;
  bsr: number;
  keywordCount: number;
  topKeywords: string[];
  hasAPlus: boolean;
  hasVideo: boolean;
  variationCount: number;
}

export interface LegacyPillarScore {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  status: LegacyStatus;
  summary: string;
  findings: string[];
  recommendedActions: string[];
  evidence: string[];
}

export interface LegacyAiOutput {
  executiveSummary: string;
  quickWins: string[];
  titleSuggestion: string;
  bulletSuggestions: string[];
  searchTermsSuggestion: string;
  p0Actions: string[];
  p1Actions: string[];
  p2Actions: string[];
  watchouts: string[];
}

export interface LegacyDiagnosisReport {
  generatedAt: string;
  marketplace: string;
  targetAsin: string;
  targetListing: CompetitorListing;
  resolvedTitle: string;
  resolvedBullets: string[];
  resolvedSearchTerms: string;
  targetKeywords: TrafficKeyword[];
  competitorSnapshots: LegacyCompetitorSnapshot[];
  negativeThemes: LegacyReviewTheme[];
  positiveThemes: LegacyReviewTheme[];
  keywordGaps: LegacyKeywordGap[];
  score: {
    total: number;
    max: number;
    label: string;
    headline: string;
  };
  pillars: LegacyPillarScore[];
  actionPlan: {
    p0: string[];
    p1: string[];
    p2: string[];
    watchouts: string[];
    metrics: string[];
  };
  ai: {
    used: boolean;
    provider: string | null;
    model: string | null;
    reason: string | null;
    output: LegacyAiOutput | null;
  };
}

export interface LegacyAnalysisInput {
  marketplace: string;
  targetAsin: string;
  targetListing: CompetitorListing;
  targetNegativeReviews: ReviewData[];
  targetPositiveReviews: ReviewData[];
  targetKeywords: TrafficKeyword[];
  competitorListings: CompetitorListing[];
  competitorKeywords: Record<string, TrafficKeyword[]>;
  currentTitle: string;
  currentBullets: string[];
  currentSearchTerms: string;
}
