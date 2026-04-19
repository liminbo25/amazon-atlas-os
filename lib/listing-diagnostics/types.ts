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
export type ListingDiagnosticsImpactType =
  | "visibility"
  | "click"
  | "conversion"
  | "buyability"
  | "compliance";
export type ListingDiagnosticsPriority = "P0" | "P1" | "P2";
export type ListingDiagnosticsActionPriority = ListingDiagnosticsPriority;
export type ListingDiagnosticsVerification = "verified" | "direct" | "inferred";
export type ListingDiagnosticsRootCauseCategory =
  | "inventory"
  | "offer"
  | "pricing"
  | "buy-box"
  | "restrictions"
  | "missing-attributes"
  | "variation-issues"
  | "listing-status";
export type ListingDiagnosticsSpApiMode = "off" | "server-default" | "runtime";

export interface ListingDiagnosticsSpApiRuntimeCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sellerId: string;
}

export interface ListingDiagnosticsSpApiConfig {
  mode: ListingDiagnosticsSpApiMode;
  runtime: ListingDiagnosticsSpApiRuntimeCredentials;
}

export interface ListingDiagnosticsCapabilitiesResponse {
  sellerSprite: {
    configured: boolean;
  };
  spApi: {
    supported: true;
    serverDefaultConfigured: boolean;
    supportedModes: ListingDiagnosticsSpApiMode[];
    requiredRuntimeFields: Array<keyof ListingDiagnosticsSpApiRuntimeCredentials>;
    marketplaces: Record<
      string,
      {
        marketplaceId: string;
        region: string;
      }
    >;
  };
}

export interface ListingDiagnosticsSpApiVerificationSummary {
  enabled: boolean;
  mode: Exclude<ListingDiagnosticsSpApiMode, "off">;
  sellerIdMasked: string;
  catalogStatus: ListingDiagnosticsSourceStatus;
  accountStatus: ListingDiagnosticsSourceStatus;
  verifiedFindingIds: string[];
  blockingVerifiedFindingIds: string[];
  scoreCeiling: number | null;
  scoreCapApplied: boolean;
}

export interface ListingDiagnosticsSpApiTestResponse {
  ok: true;
  mode: Exclude<ListingDiagnosticsSpApiMode, "off">;
  sellerIdMasked: string;
  marketplace: string;
  tokenExchange: "success";
  targetAsin: string | null;
  checks: {
    catalog: "verified" | "skipped";
    account: "verified" | "skipped";
  };
  message: string;
}

export interface ListingDiagnosticsRequest {
  targetAsin: string;
  competitorAsins: string[];
  marketplace: string;
  spApi?: ListingDiagnosticsSpApiConfig;
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
  entity: "target" | "competitors" | "benchmark" | "catalog" | "account";
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
  impactType: ListingDiagnosticsImpactType;
  priority: ListingDiagnosticsPriority;
  symptom: string;
  rootCause: string;
  rootCauseCategory: ListingDiagnosticsRootCauseCategory | null;
  whatToChange: string;
  whereToChange: string;
  expectedImpact: string;
  verification: ListingDiagnosticsVerification;
  confidence: number;
  inferred: boolean;
  evidence: string[];
}

export interface ListingDiagnosticsActionPlanItem {
  id: string;
  title: string;
  description: string;
  priority: ListingDiagnosticsActionPriority;
  verification: ListingDiagnosticsVerification;
  symptom: string;
  rootCause: string;
  action: string;
  whereToChange: string;
  expectedImpact: string;
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
  spApiVerification: ListingDiagnosticsSpApiVerificationSummary | null;
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
  spApiConfig: ListingDiagnosticsSpApiConfig;
  status: ListingDiagnosticsStatus;
  result: ListingDiagnosticsResult | null;
  errorMessage: string | null;
  errorCode: string | null;
}

export interface ListingDiagnosticsStore extends ListingDiagnosticsStoreState {
  setTargetAsin: (asin: string) => void;
  setMarketplace: (marketplace: string) => void;
  setCompetitorAsin: (index: number, asin: string) => void;
  setSpApiMode: (mode: ListingDiagnosticsSpApiMode) => void;
  updateSpApiRuntime: (
    patch: Partial<ListingDiagnosticsSpApiRuntimeCredentials>
  ) => void;
  resetSpApiRuntime: () => void;
  addCompetitorSlot: () => void;
  removeCompetitorSlot: (index: number) => void;
  startAnalysis: () => void;
  finishAnalysis: (response: ListingDiagnosticsApiResponse) => void;
  failAnalysis: (message: string, code?: string | null) => void;
  clearError: () => void;
  reset: () => void;
}
