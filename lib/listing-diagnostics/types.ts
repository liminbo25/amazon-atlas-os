import type {
  CompetitorListing,
  ReviewData,
  TrafficKeyword,
} from "@/lib/types";

export type ListingDiagnosticsStatus =
  | "idle"
  | "loading"
  | "success"
  | "partial"
  | "error";

export type ListingDiagnosticsSourceStatus = "covered" | "partial" | "missing";
export type ListingDiagnosticsSeverity = "high" | "medium" | "low";
export type ListingDiagnosticsFindingTone = "risk" | "opportunity" | "info";
export type ListingDiagnosticsActionPriority = "now" | "next" | "later";

export interface ListingDiagnosticsRequest {
  targetAsin: string;
  competitorAsins: string[];
  marketplace: string;
}

export interface ListingDiagnosticsEntitySnapshot {
  asin: string;
  listing: CompetitorListing | null;
  negativeReviews: ReviewData[];
  positiveReviews: ReviewData[];
  keywords: TrafficKeyword[];
}

export interface ListingDiagnosticsTheme {
  id: string;
  label: string;
  mentions: number;
  share: number;
  keywords: string[];
  inferred: boolean;
}

export interface ListingDiagnosticsBenchmark {
  competitorCount: number;
  averagePrice: number | null;
  averageRating: number | null;
  averageReviews: number | null;
  averageKeywordCount: number | null;
  topKeywords: string[];
  topThemes: ListingDiagnosticsTheme[];
}

export interface ListingDiagnosticsSourceCoverageItem {
  id: string;
  label: string;
  source: string;
  entity: "target" | "competitors" | "benchmark";
  status: ListingDiagnosticsSourceStatus;
  available: number;
  expected: number;
  detail: string;
  confidence: number;
  inferred: boolean;
}

export interface ListingDiagnosticsDimensionScore {
  id: string;
  label: string;
  score: number;
  weight: number;
  summary: string;
  confidence: number;
  coverage: ListingDiagnosticsSourceStatus;
  inferred: boolean;
}

export interface ListingDiagnosticsFinding {
  id: string;
  title: string;
  description: string;
  severity: ListingDiagnosticsSeverity;
  tone: ListingDiagnosticsFindingTone;
  dimensionId: string;
  confidence: number;
  inferred: boolean;
  evidence: string[];
}

export interface ListingDiagnosticsActionPlanItem {
  id: string;
  title: string;
  description: string;
  priority: ListingDiagnosticsActionPriority;
  confidence: number;
  inferred: boolean;
  linkedFindingIds: string[];
}

export interface ListingDiagnosticsResult {
  generatedAt: string;
  request: ListingDiagnosticsRequest;
  status: "success" | "partial";
  overallScore: number;
  confidence: number;
  headline: string;
  summary: string;
  dimensions: ListingDiagnosticsDimensionScore[];
  findings: ListingDiagnosticsFinding[];
  actionPlan: ListingDiagnosticsActionPlanItem[];
  sourceCoverage: ListingDiagnosticsSourceCoverageItem[];
  warnings: string[];
  target: ListingDiagnosticsEntitySnapshot;
  competitors: ListingDiagnosticsEntitySnapshot[];
  benchmark: ListingDiagnosticsBenchmark;
  inferredCount: number;
}

export interface ListingDiagnosticsApiResponse {
  status: "success" | "partial";
  warnings: string[];
  result: ListingDiagnosticsResult;
}

export interface ListingDiagnosticsRuleContext {
  request: ListingDiagnosticsRequest;
  target: ListingDiagnosticsEntitySnapshot;
  competitors: ListingDiagnosticsEntitySnapshot[];
  benchmark: ListingDiagnosticsBenchmark;
  sourceCoverage: ListingDiagnosticsSourceCoverageItem[];
  coverageById: Record<string, ListingDiagnosticsSourceCoverageItem>;
}

export interface ListingDiagnosticsRuleResult {
  dimension: ListingDiagnosticsDimensionScore;
  findings: ListingDiagnosticsFinding[];
  actions: ListingDiagnosticsActionPlanItem[];
}

export interface ListingDiagnosticsRule {
  id: string;
  label: string;
  weight: number;
  run: (
    context: ListingDiagnosticsRuleContext
  ) => ListingDiagnosticsRuleResult;
}

export interface ListingDiagnosticsStoreState {
  targetAsin: string;
  competitorAsins: string[];
  marketplace: string;
  status: ListingDiagnosticsStatus;
  result: ListingDiagnosticsResult | null;
  errorMessage: string | null;
  errorCode: string | null;
}

export interface ListingDiagnosticsStore extends ListingDiagnosticsStoreState {
  setTargetAsin: (asin: string) => void;
  setMarketplace: (marketplace: string) => void;
  setCompetitorAsin: (index: number, asin: string) => void;
  addCompetitorSlot: () => void;
  removeCompetitorSlot: (index: number) => void;
  startAnalysis: () => void;
  finishAnalysis: (response: ListingDiagnosticsApiResponse) => void;
  failAnalysis: (message: string, code?: string | null) => void;
  clearError: () => void;
  reset: () => void;
}
