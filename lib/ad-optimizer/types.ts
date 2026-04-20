export type ReportKind = "search-term" | "placement" | "bulk-identity";

export type TargetingType = "keyword" | "auto" | "product" | "unknown";

export type StrategyTemplateId =
  | "launch"
  | "profit"
  | "clearance"
  | "brand-defense";

export type RecommendationType =
  | "harvest_exact"
  | "harvest_product_target"
  | "negative_exact"
  | "negative_phrase"
  | "governance_negative_exact"
  | "governance_negative_phrase"
  | "lower_bid"
  | "raise_bid"
  | "raise_placement_modifier"
  | "lower_placement_modifier"
  | "watch_placement_modifier"
  | "increase_budget"
  | "decrease_budget";

export type RecommendationSurface =
  | "harvest"
  | "governance"
  | "bid"
  | "placement"
  | "budget";

export type RecommendationStatus = "ready" | "needs_review";

export type RecommendationPriority = "high" | "medium" | "low";

export type NegativeScope = "ad_group" | "campaign";

export type RecommendationLifecycleStatus = "new" | "accepted" | "ignored";

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

export interface ProfitView {
  grossMarginPct: number | null;
  profitSafetyMarginPct: number;
  breakEvenAcos: number | null;
  profitSafeAcos: number | null;
  estimatedProfit: number | null;
  estimatedProfitMargin: number | null;
  tacos: number | null;
  tacosIsEstimated: boolean;
}

export interface UploadedWorkbookMeta {
  kind: ReportKind;
  fileName: string;
  sheetName: string;
  rowCount: number;
  warnings: string[];
  recognized: boolean;
}

export interface PlacementDiagnostics {
  recognized: boolean;
  fallbackReason: string | null;
  hasAdGroupDimension: boolean;
  detectedPlacementColumn: string | null;
  normalizedPlacementCount: number;
}

export interface SearchTermRecord {
  campaignName: string;
  adGroupName: string;
  portfolioName: string;
  currency: string;
  country: string;
  retailer: string;
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
  diagnostics: PlacementDiagnostics;
}

export interface BulkCampaignIdentity {
  campaignId: string;
  campaignName: string;
  portfolioName: string;
  dailyBudget: number | null;
  bidStrategy: string;
  status: string;
}

export interface BulkAdGroupIdentity {
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  defaultBid: number | null;
  status: string;
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
  portfolioName: string;
  targetingText: string;
  sourceTargets: string[];
  sourceMatchTypes: string[];
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
  hasNegativePhraseAlready: boolean;
  hasProductTargetAlready: boolean;
}

export interface AggregatedTarget {
  id: string;
  campaignName: string;
  adGroupName: string;
  portfolioName: string;
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
  sourceAdGroupCount: number;
}

export interface BudgetGuidance {
  type: "increase_budget" | "decrease_budget" | null;
  currentBudget: number | null;
  suggestedBudget: number | null;
  utilization: number | null;
  reason: string | null;
}

export interface CampaignPerformance {
  id: string;
  campaignName: string;
  portfolioName: string;
  campaignId: string | null;
  current: MetricBundle;
  previous: MetricBundle | null;
  deltaCostPct: number | null;
  deltaSalesPct: number | null;
  deltaOrders: number;
  profitView: ProfitView;
  dailyBudget: number | null;
  budgetUtilization: number | null;
  budgetGuidance: BudgetGuidance;
  placementSuggestionCount: number;
  governanceRiskCount: number;
  budgetSuggestionCount: number;
  recommendationCount: number;
}

export interface AdGroupPerformance {
  id: string;
  campaignName: string;
  adGroupName: string;
  portfolioName: string;
  campaignId: string | null;
  adGroupId: string | null;
  current: MetricBundle;
  previous: MetricBundle | null;
  deltaCostPct: number | null;
  deltaSalesPct: number | null;
  deltaOrders: number;
  profitView: ProfitView;
  parentBudgetGuidance: BudgetGuidance;
  placementSuggestionCount: number;
  governanceRiskCount: number;
  recommendationCount: number;
}

export interface GovernanceRiskEntity {
  campaignName: string;
  adGroupName: string;
  targetingText: string;
  spend: number;
  sales: number;
  orders: number;
  acos: number | null;
}

export interface GovernanceRisk {
  id: string;
  searchTerm: string;
  overlapType: "cross_campaign" | "cross_ad_group";
  severity: RecommendationPriority;
  winningCampaignName: string;
  winningAdGroupName: string;
  winningTargetingText: string;
  losers: GovernanceRiskEntity[];
  spendAtRisk: number;
  suggestedMatchType: "negative-exact" | "negative-phrase";
  suggestedScope: NegativeScope;
  reason: string;
  affectedCampaignNames: string[];
  affectedAdGroupKeys: string[];
  recommendationIds: string[];
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  surface: RecommendationSurface;
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
  negativeScope: NegativeScope | null;
  keywordId: string | null;
  productTargetId: string | null;
  currentBid: number | null;
  suggestedBid: number | null;
  currentBudget: number | null;
  suggestedBudget: number | null;
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
  templateId: StrategyTemplateId;
  targetAcos: number;
  minHarvestOrders: number;
  minNegateClicks: number;
  minBidClicks: number;
  minRaiseOrders: number;
  grossMarginPct: number | null;
  profitSafetyMarginPct: number;
  tacosTarget: number | null;
  budgetIncreasePct: number;
  budgetDecreasePct: number;
  minBudgetUsagePct: number;
  minCampaignSpend: number;
  minPlacementClicks: number;
}

export interface StrategyTemplate {
  id: StrategyTemplateId;
  label: string;
  description: string;
  defaultControls: Omit<AnalysisControls, "templateId">;
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
  profitView: ProfitView;
  totalRecommendationCount: number;
}

export interface RecommendationBucketSummary {
  type: RecommendationType;
  label: string;
  surface: RecommendationSurface;
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

export interface RecommendationLifecycleEntry {
  at: string;
  action: "generated" | "accepted" | "ignored" | "note";
  detail: string;
}

export interface RecommendationLifecycleState {
  recommendationId: string;
  status: RecommendationLifecycleStatus;
  note: string;
  generatedAt: string;
  updatedAt: string | null;
  history: RecommendationLifecycleEntry[];
}

export type RecommendationLifecycleMap = Record<
  string,
  RecommendationLifecycleState
>;

export interface AdOptimizerAnalysisResult {
  generatedAt: string;
  controls: AnalysisControls;
  template: StrategyTemplate;
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
  placementDiagnostics: PlacementDiagnostics;
  recommendationSummary: RecommendationBucketSummary[];
  recommendations: Recommendation[];
  topSearchTerms: AggregatedSearchTerm[];
  topTargets: AggregatedTarget[];
  topPlacements: PlacementPerformance[];
  campaignRows: CampaignPerformance[];
  adGroupRows: AdGroupPerformance[];
  governanceRisks: GovernanceRisk[];
  reviewItems: Recommendation[];
}
