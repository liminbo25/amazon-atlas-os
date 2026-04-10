// Listing全案模块类型定义

// ===== 竞品数据 =====
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

// ===== VOC 分析 =====
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

// ===== 竞品文案分析 =====
export interface CompetitorCopyAnalysis {
  asin: string;
  titleStructure: string;
  bulletPointLogic: string[];
  keywordCoverage: string[];
  strengths: string[];
  weaknesses: string[];
}

// ===== Listing 生成 =====
export interface ListingVersion {
  versionName: string;
  style: string;
  title: string;
  bulletPoints: string[];
  description: string;
  searchTerms: string;
}

// ===== 合规检查 =====
export interface ProhibitedWordMatch {
  word: string;
  position: number;
  context: string;
  severity: "high" | "medium" | "low";
  reason: string;
}

export interface ComplianceResult {
  field: "title" | "bulletPoints" | "description" | "searchTerms";
  passed: boolean;
  violations: ProhibitedWordMatch[];
}

// ===== 产品图片 =====
export type ImageCategory = "front" | "left" | "right" | "back" | "detail";

export interface ProductImage {
  id: string;
  preview: string; // base64 data URL
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

export interface AiRuntimeSettings {
  imageAnalysis: AiRuntimeServiceConfig;
  vocAnalysis: AiRuntimeServiceConfig;
  listingGeneration: AiRuntimeServiceConfig;
}

export interface AiRuntimeRequestConfig extends AiRuntimeServiceConfig {
  task: AiRuntimeServiceKey;
}

// ===== Store State =====
export interface ListingStore {
  // 步骤控制
  currentStep: number;
  aiRuntimeSettings: AiRuntimeSettings;

  // Step 1: 需求确认
  targetMarket: string;
  competitorAsins: string[];
  coreSellingPoints: string;
  productImages: ProductImage[];
  visionAnalysis: VisionAnalysisResult | null;

  // Step 2: 竞品数据采集
  competitorListings: CompetitorListing[];
  competitorReviews: Record<string, ReviewData[]>; // asin -> negative reviews
  positiveReviews: Record<string, ReviewData[]>; // asin -> positive reviews
  trafficKeywords: Record<string, TrafficKeyword[]>; // asin -> keywords

  // Step 3: VOC 深度分析
  painPoints: PainPoint[];
  valuePoints: ValuePoint[];
  competitorAnalysis: CompetitorCopyAnalysis[];

  // Step 4: Listing 生成
  listingVersions: ListingVersion[];
  complianceResults: Record<string, ComplianceResult[]>; // versionName -> results

  // UI 状态
  isLoading: boolean;

  // Actions
  setCurrentStep: (step: number) => void;
  updateAiRuntimeSettings: (
    service: AiRuntimeServiceKey,
    patch: Partial<AiRuntimeServiceConfig>
  ) => void;
  resetAiRuntimeSettings: () => void;
  setTargetMarket: (market: string) => void;
  setCompetitorAsins: (asins: string[]) => void;
  setCoreSellingPoints: (points: string) => void;
  setProductImages: (images: ProductImage[]) => void;
  setVisionAnalysis: (analysis: VisionAnalysisResult | null) => void;
  setCompetitorListings: (listings: CompetitorListing[]) => void;
  setCompetitorReviews: (reviews: Record<string, ReviewData[]>) => void;
  setPositiveReviews: (reviews: Record<string, ReviewData[]>) => void;
  setTrafficKeywords: (keywords: Record<string, TrafficKeyword[]>) => void;
  setPainPoints: (points: PainPoint[]) => void;
  setValuePoints: (points: ValuePoint[]) => void;
  setCompetitorAnalysis: (analysis: CompetitorCopyAnalysis[]) => void;
  setListingVersions: (versions: ListingVersion[]) => void;
  setComplianceResults: (results: Record<string, ComplianceResult[]>) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}
