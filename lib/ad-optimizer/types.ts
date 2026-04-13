export type ReportKind = "search-term" | "placement" | "bulk-identity";

export type TargetingType = "keyword" | "auto" | "product" | "unknown";

export type RecommendationType =
  | "harvest_exact"
  | "harvest_product_target"
  | "negative_exact"
  | "lower_bid"
  | "raise_bid"
  | "raise_placement_modifier"
  | "lower_placement_modifier";

export type RecommendationStatus = "ready" | "needs_review";

export type RecommendationPriority = "high" | "medium" | "low";

export interface MetricBundle {
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
  units: number;
  ctr: number;
  cpc: number;
  cvr: number;
  acos: number | null;
  roas: number;
}

export interface UploadedWorkbookMeta {
  kind: ReportKind;
  fileName: string;
  sheetName: string;
  rowCount: number;
  warnings: string[];
}

export interface SearchTermRecord {
  campaignName: string;
  adGroupName: string;
  portfolioName: string;
  currency: string;
  country: string;
  targetingText: string;
  customerSearchTerm: string;
  matchType: string;
  targetingType: TargetingType;
  startDate: string;
  endDate: string;
  metrics: MetricBundle;
}

export interface ParsedSearchTermReport {
  meta: UploadedWorkbookMeta;
  rows: SearchTermRecord[];
  summary: MetricBundle;
  uniqueCampaigns: number;
  uniqueAdGroups: number;
  uniqueTargets: number;
  uniqueSearchTerms: number;
}

export interface PlacementRecord {
  campaignName: string;
  adGroupName: string;
  placementName: string;
  metrics: MetricBundle;
}

export interface ParsedPlacementReport {
  meta: UploadedWorkbookMeta;
  rows: PlacementRecord[];
  usable: boolean;
}

export interface BulkCampaignIdentity {
  campaignId: string;
  campaignName: string;
}

export interface BulkAdGroupIdentity {
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  defaultBid: number | null;
}

export interface BulkKeywordIdentity {
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  keywordId: string;
  keywordText: string;
  matchType: string;
  bid: number | null;
}

export interface BulkProductTargetIdentity {
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  productTargetId: string;
  targetExpression: string;
  bid: number | null;
  entityLevel: string;
}

export interface BulkPlacementAdjustmentIdentity {
  campaignId: string;
  campaignName: string;
  placementName: string;
  percentage: number | null;
}

export interface BulkIdentitySummary {
  campaignCount: number;
  adGroupCount: number;
  keywordCount: number;
  productTargetCount: number;
  placementAdjustmentCount: number;
  negativeKeywordCount: number;
  negativeProductTargetCount: number;
}

export interface BulkIdentityBundle {
  meta: UploadedWorkbookMeta;
  summary: BulkIdentitySummary;
  campaignsByName: Map<string, BulkCampaignIdentity>;
  adGroupsByKey: Map<string, BulkAdGroupIdentity>;
  keywordsByKey: Map<string, BulkKeywordIdentity>;
  productTargetsByKey: Map<string, BulkProductTargetIdentity>;
  placementAdjustmentsByKey: Map<string, BulkPlacementAdjustmentIdentity>;
  exactKeywordsByKey: Set<string>;
  negativeKeywordsByKey: Set<string>;
}

export interface AggregatedSearchTerm {
  id: string;
  campaignName: string;
  adGroupName: string;
  targetingText: string;
  matchType: string;
  targetingType: TargetingType;
  customerSearchTerm: string;
  current: MetricBundle;
  previous: MetricBundle | null;
  deltaCostPct: number | null;
  deltaSalesPct: number | null;
  deltaOrders: number;
  currentBid: number | null;
  campaignId: string | null;
  adGroupId: string | null;
  sourceKeywordId: string | null;
  sourceProductTargetId: string | null;
  hasExactKeywordAlready: boolean;
  hasNegativeExactAlready: boolean;
  hasProductTargetAlready: boolean;
}

export interface AggregatedTarget {
  id: string;
  campaignName: string;
  adGroupName: string;
  targetingText: string;
  matchType: string;
  targetingType: TargetingType;
  current: MetricBundle;
  previous: MetricBundle | null;
  deltaCostPct: number | null;
  deltaSalesPct: number | null;
  currentBid: number | null;
  campaignId: string | null;
  adGroupId: string | null;
  keywordId: string | null;
  productTargetId: string | null;
}

export interface PlacementPerformance {
  id: string;
  campaignName: string;
  placementName: string;
  current: MetricBundle;
  previous: MetricBundle | null;
  deltaCostPct: number | null;
  deltaSalesPct: number | null;
  campaignId: string | null;
  currentAdjustment: number | null;
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  actionLabel: string;
  title: string;
  reason: string;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  campaignName: string;
  adGroupName: string;
  campaignId: string | null;
  adGroupId: string | null;
  targetingText: string;
  customerSearchTerm: string;
  matchType: string;
  targetingType: TargetingType;
  entityLevel: string;
  keywordId: string | null;
  productTargetId: string | null;
  currentBid: number | null;
  suggestedBid: number | null;
  suggestedMatchType: string | null;
  suggestedTargetExpression: string | null;
  placementName: string | null;
  currentPlacementAdjustment: number | null;
  suggestedPlacementAdjustment: number | null;
  current: MetricBundle;
  previous: MetricBundle | null;
  deltaCostPct: number | null;
  deltaSalesPct: number | null;
  deltaOrders: number;
  confidence: number;
  estimatedSavedSpend: number;
  estimatedIncrementalSales: number;
  bulkExportable: boolean;
  reviewReasons: string[];
}

export interface AnalysisControls {
  targetAcos: number;
  minHarvestOrders: number;
  minNegateClicks: number;
  minBidClicks: number;
  minRaiseOrders: number;
}

export interface AnalysisSummary {
  current: MetricBundle;
  previous: MetricBundle | null;
  deltaCostPct: number | null;
  deltaSalesPct: number | null;
  deltaOrders: number;
  uniqueCampaigns: number;
  uniqueAdGroups: number;
  uniqueTargets: number;
  uniqueSearchTerms: number;
}

export interface RecommendationBucketSummary {
  type: RecommendationType;
  label: string;
  count: number;
  readyCount: number;
  reviewCount: number;
  estimatedSavedSpend: number;
  estimatedIncrementalSales: number;
}

export interface MappingCoverageSummary {
  campaignCoverage: number;
  adGroupCoverage: number;
  targetCoverage: number;
  readyRecommendations: number;
  reviewRecommendations: number;
}

export interface AdOptimizerAnalysisResult {
  generatedAt: string;
  controls: AnalysisControls;
  files: {
    current: UploadedWorkbookMeta;
    previous: UploadedWorkbookMeta | null;
    placement: UploadedWorkbookMeta | null;
    bulkIdentity: UploadedWorkbookMeta | null;
  };
  notices: string[];
  summary: AnalysisSummary;
  bulkIdentitySummary: BulkIdentitySummary | null;
  mappingCoverage: MappingCoverageSummary | null;
  recommendationSummary: RecommendationBucketSummary[];
  recommendations: Recommendation[];
  topSearchTerms: AggregatedSearchTerm[];
  topTargets: AggregatedTarget[];
  topPlacements: PlacementPerformance[];
  reviewItems: Recommendation[];
}
