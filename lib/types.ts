export interface CompetitorListing {
  asin: string;
  title: string;
  bulletPoints: string[];
  attributes: Record<string, string>;
  price: number;
  rating: number;
  reviews: number;
  monthlySales: number;
  bsr: number;
  mainImage: string;
}

export interface ReviewData {
  id: string;
  asin: string;
  rating: number;
  title: string;
  content: string;
  date: string;
  verifiedPurchase: boolean;
  helpfulVotes: number;
}

export interface TrafficKeyword {
  keyword: string;
  searchVolume: number;
  organicRank: number;
  sponsoredRank: number | null;
  conversionShare: number;
}

export interface ProductProfile {
  brandName: string;
  productName: string;
  productCategory: string;
  productDescription: string;
  coreKeywords: string;
}

export type PainPointCategory =
  | "质量问题"
  | "功能缺陷"
  | "使用体验"
  | "包装物流"
  | "与描述不符";

export interface PainPoint {
  rank: number;
  category: PainPointCategory;
  frequency: number;
  percentage: number;
  typicalQuotes: string[];
  sellingPointSuggestion: string;
}

export interface ValuePoint {
  category: string;
  frequency: number;
  percentage: number;
  typicalQuotes: string[];
  leverageSuggestion: string;
}

export interface CompetitorCopyAnalysis {
  asin: string;
  titleStructure: string;
  bulletPointLogic: string[];
  keywordCoverage: string[];
  strengths: string[];
  weaknesses: string[];
}

export type OpportunityVerdict = "priority" | "test" | "watch";
export type PriorityLevel = "high" | "medium" | "low";
export type MatchType = "exact" | "phrase" | "broad" | "auto";
export type AssetType = "image" | "video" | "a-plus";

export interface OpportunityBreakdownItem {
  key: "demand" | "competition" | "conversion" | "intent";
  label: string;
  score: number;
  rationale: string;
  evidence: string[];
}

export interface OpportunityAssessment {
  score: number;
  verdict: OpportunityVerdict;
  summary: string;
  strengths: string[];
  risks: string[];
  nextActions: string[];
  breakdown: OpportunityBreakdownItem[];
}

export interface KeywordAllocationItem {
  keyword: string;
  priority: PriorityLevel;
  reason: string;
  evidence: string;
}

export interface KeywordCampaignPlan {
  name: string;
  goal: string;
  matchType: MatchType;
  budgetPriority: PriorityLevel;
  keywords: string[];
  negativeKeywords: string[];
  launchPlan: string;
}

export interface KeywordStrategy {
  titleKeywords: KeywordAllocationItem[];
  bulletKeywords: KeywordAllocationItem[];
  searchTermKeywords: KeywordAllocationItem[];
  ppcCoreKeywords: KeywordAllocationItem[];
  ppcExploratoryKeywords: KeywordAllocationItem[];
  negativeKeywords: KeywordAllocationItem[];
  campaignPlans: KeywordCampaignPlan[];
}

export interface RufusIntentItem {
  intent: string;
  question: string;
  responseAngle: string;
  listingHooks: string[];
}

export interface RufusIntentLayer {
  scene: RufusIntentItem[];
  audience: RufusIntentItem[];
  objections: RufusIntentItem[];
  comparisons: RufusIntentItem[];
}

export interface VocActionItem {
  title: string;
  priority: PriorityLevel;
  owner: string;
  action: string;
  evidence: string[];
}

export interface VocActionPlan {
  product: VocActionItem[];
  copy: VocActionItem[];
  aPlus: VocActionItem[];
  support: VocActionItem[];
}

export interface SupportFaqItem {
  question: string;
  shortAnswer: string;
  supportGuidance: string;
  scenario: string;
}

export interface ExperimentPlanItem {
  variable: string;
  hypothesis: string;
  successMetric: string;
  executionNote: string;
}

export interface RufusQaItem {
  intent: string;
  question: string;
  answer: string;
  hook: string;
}

export interface CreativeShotItem {
  assetType: AssetType;
  title: string;
  objective: string;
  scene: string;
  overlay: string;
  proof: string;
}

export interface CreativeBrief {
  positioning: string;
  aPlusModules: string[];
  imageAngles: string[];
  videoAngles: string[];
  deliverables: string[];
  shotList: CreativeShotItem[];
}

export interface ListingVersion {
  versionName: string;
  style: string;
  title: string;
  bulletPoints: string[];
  description: string;
  searchTerms: string;
  experiments: ExperimentPlanItem[];
  rufusQa: RufusQaItem[];
  creativeBrief: CreativeBrief | null;
}

export interface ProhibitedWordMatch {
  word: string;
  position: number;
  context: string;
  severity: PriorityLevel;
  reason: string;
  category?: string;
}

export type ComplianceField =
  | "title"
  | "bulletPoints"
  | "description"
  | "searchTerms";

export interface ComplianceResult {
  field: ComplianceField;
  passed: boolean;
  violations: ProhibitedWordMatch[];
}

export interface CompliancePlaybookItem {
  area: string;
  riskLevel: PriorityLevel;
  rule: string;
  whyItMatters: string;
  suggestedAction: string;
  evidenceNeeded: string;
  watchTerms: string[];
  triggered: boolean;
  triggeredExamples: string[];
}

export type ImageCategory = "front" | "left" | "right" | "back" | "detail";

export interface ProductImage {
  id: string;
  preview: string;
  category: ImageCategory;
  label: string;
}

export interface VisionAnalysisResult {
  appearance: string;
  material: string;
  features: string[];
  sellingPoints: string[];
  suggestions: string;
}

export interface AbaReportFile {
  fileName: string;
  size: number;
  content: string;
  headers: string[];
  rows: string[][];
}

export type ScreenshotMediaType = "image/jpeg" | "image/png" | "image/webp";

export interface RufusScreenshot {
  id: string;
  name: string;
  preview: string;
  mediaType: ScreenshotMediaType;
}

export interface SupportAssets {
  abaReport: AbaReportFile | null;
  rufusScreenshots: RufusScreenshot[];
}

export interface DataAnalysisResult {
  marketOverview: string;
  sellerSpriteInsights: string[];
  abaInsights: string[];
  rufusInsights: string[];
  aiRecommendations: string[];
  cosmoFocus: string[];
  opportunityAssessment: OpportunityAssessment | null;
  keywordStrategy: KeywordStrategy | null;
  rufusIntentLayer: RufusIntentLayer | null;
}

export type AiProvider = "anthropic" | "openai";

export type AiRuntimeServiceKey =
  | "imageAnalysis"
  | "vocAnalysis"
  | "listingGeneration";

export interface AiRuntimeServiceConfig {
  provider: AiProvider | "";
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface SellerSpriteRuntimeConfig {
  baseUrl?: string;
  secretKey?: string;
  requestTimeoutMs?: number;
}

export interface AiRuntimeSettings {
  imageAnalysis: AiRuntimeServiceConfig;
  vocAnalysis: AiRuntimeServiceConfig;
  listingGeneration: AiRuntimeServiceConfig;
}

export interface AiRuntimeRequestConfig extends AiRuntimeServiceConfig {
  task: AiRuntimeServiceKey;
}

export interface ListingStore {
  currentStep: number;
  aiRuntimeSettings: AiRuntimeSettings;

  productProfile: ProductProfile;
  targetMarket: string;
  competitorAsins: string[];
  coreSellingPoints: string;
  productImages: ProductImage[];
  visionAnalysis: VisionAnalysisResult | null;
  supportAssets: SupportAssets;

  competitorListings: CompetitorListing[];
  competitorReviews: Record<string, ReviewData[]>;
  positiveReviews: Record<string, ReviewData[]>;
  trafficKeywords: Record<string, TrafficKeyword[]>;
  dataAnalysis: DataAnalysisResult | null;

  painPoints: PainPoint[];
  valuePoints: ValuePoint[];
  competitorAnalysis: CompetitorCopyAnalysis[];
  vocActionPlan: VocActionPlan | null;
  supportFaqs: SupportFaqItem[];

  listingVersions: ListingVersion[];
  complianceResults: Record<string, ComplianceResult[]>;

  isLoading: boolean;

  setCurrentStep: (step: number) => void;
  updateAiRuntimeSettings: (
    service: AiRuntimeServiceKey,
    patch: Partial<AiRuntimeServiceConfig>
  ) => void;
  resetAiRuntimeSettings: () => void;
  updateProductProfile: (patch: Partial<ProductProfile>) => void;
  setTargetMarket: (market: string) => void;
  setCompetitorAsins: (asins: string[]) => void;
  setCoreSellingPoints: (points: string) => void;
  setProductImages: (images: ProductImage[]) => void;
  setVisionAnalysis: (analysis: VisionAnalysisResult | null) => void;
  setSupportAssets: (patch: Partial<SupportAssets>) => void;
  setCompetitorListings: (listings: CompetitorListing[]) => void;
  setCompetitorReviews: (reviews: Record<string, ReviewData[]>) => void;
  setPositiveReviews: (reviews: Record<string, ReviewData[]>) => void;
  setTrafficKeywords: (keywords: Record<string, TrafficKeyword[]>) => void;
  setDataAnalysis: (result: DataAnalysisResult | null) => void;
  setPainPoints: (points: PainPoint[]) => void;
  setValuePoints: (points: ValuePoint[]) => void;
  setCompetitorAnalysis: (analysis: CompetitorCopyAnalysis[]) => void;
  setVocActionPlan: (plan: VocActionPlan | null) => void;
  setSupportFaqs: (items: SupportFaqItem[]) => void;
  setListingVersions: (versions: ListingVersion[]) => void;
  setComplianceResults: (results: Record<string, ComplianceResult[]>) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}
