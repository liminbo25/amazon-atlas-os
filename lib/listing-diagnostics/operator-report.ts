import {
  isRecord,
  normalizeStringValue,
  normalizeTextList,
  requestAiTextCompletion,
  requestStructuredJson,
  resolveAiConfig,
} from "@/lib/ai-route-helpers";
import { getListingDefaultModel } from "@/lib/listing-ai-runtime";
import {
  buildListingText,
  formatDimensionLabel,
  formatImpactType,
  formatRootCauseCategory,
  keywordIsPresent,
} from "@/lib/listing-diagnostics/rules/shared";
import type {
  ListingDiagnosticsEntitySnapshot,
  ListingDiagnosticsFinding,
  ListingDiagnosticsOperatorCoverageRow,
  ListingDiagnosticsOperatorGapRow,
  ListingDiagnosticsOperatorIssueRow,
  ListingDiagnosticsOperatorKeywordRow,
  ListingDiagnosticsOperatorOptimizationBullet,
  ListingDiagnosticsOperatorOptimizationPlan,
  ListingDiagnosticsOperatorOptimizationTextRow,
  ListingDiagnosticsOperatorReport,
  ListingDiagnosticsOperatorRoadmapRow,
  ListingDiagnosticsResult,
} from "@/lib/listing-diagnostics/types";
import { selectTrafficKeywords } from "@/lib/traffic-keyword-helpers";
import type { CompetitorListing, TrafficKeyword } from "@/lib/types";

const UNKNOWN_LABEL = "待补充";
const TITLE_LIMIT = 190;
const MAX_KEYWORD_ROWS = 30;
const MAX_ISSUES = 10;
const SCENE_KEYWORDS = [
  "wedding guest",
  "cocktail",
  "party",
  "formal",
  "casual",
  "work",
  "vacation",
  "beach",
  "travel",
  "daily",
  "gym",
  "running",
  "hiking",
  "outdoor",
  "office",
  "date night",
  "bridesmaid",
  "prom",
  "baby shower",
  "bridal shower",
];

interface OperatorReportAiDraft {
  headline: string;
  summary: string;
  leadingDiagnosis: string;
  dataQuality: string;
  keyTakeaways: string[];
  gapRows: ListingDiagnosticsOperatorGapRow[];
  issues: ListingDiagnosticsOperatorIssueRow[];
  optimizationPlan: ListingDiagnosticsOperatorOptimizationPlan;
  roadmap: ListingDiagnosticsOperatorRoadmapRow[];
}

interface FallbackReportBundle {
  headline: string;
  summary: string;
  leadingDiagnosis: string;
  dataQuality: string;
  keyTakeaways: string[];
  comparisonRows: ListingDiagnosticsOperatorReport["comparisonRows"];
  keywordRows: ListingDiagnosticsOperatorKeywordRow[];
  gapRows: ListingDiagnosticsOperatorGapRow[];
  issues: ListingDiagnosticsOperatorIssueRow[];
  optimizationPlan: ListingDiagnosticsOperatorOptimizationPlan;
  coverageRows: ListingDiagnosticsOperatorCoverageRow[];
  roadmap: ListingDiagnosticsOperatorRoadmapRow[];
}

export async function buildListingDiagnosticsOperatorReport(
  result: ListingDiagnosticsResult
): Promise<ListingDiagnosticsOperatorReport> {
  const primaryCompetitor = choosePrimaryCompetitor(result);
  const comparisonRows = buildComparisonRows(result, primaryCompetitor);
  const keywordRows = buildKeywordRows(result, primaryCompetitor);
  const fallbackIssues = buildFallbackIssues(result, primaryCompetitor, keywordRows);
  const fallbackGapRows = buildFallbackGapRows(
    result,
    primaryCompetitor,
    keywordRows,
    fallbackIssues
  );
  const fallbackOptimizationPlan = buildFallbackOptimizationPlan(
    result,
    primaryCompetitor,
    keywordRows,
    fallbackIssues
  );
  const fallbackRoadmap = buildExpandedFallbackRoadmap(
    result,
    fallbackIssues,
    fallbackOptimizationPlan,
    keywordRows
  );

  const fallbackBundle: FallbackReportBundle = {
    headline: buildFallbackHeadline(result, fallbackIssues, primaryCompetitor),
    summary: buildFallbackSummary(
      result,
      primaryCompetitor,
      keywordRows,
      fallbackIssues
    ),
    leadingDiagnosis: buildLeadingDiagnosis(
      result,
      primaryCompetitor,
      keywordRows,
      fallbackIssues
    ),
    dataQuality: buildDataQualityText(result),
    keyTakeaways: buildFallbackTakeaways(
      result,
      primaryCompetitor,
      keywordRows,
      fallbackIssues
    ),
    comparisonRows,
    keywordRows,
    gapRows: fallbackGapRows,
    issues: fallbackIssues,
    optimizationPlan: fallbackOptimizationPlan,
    coverageRows: [],
    roadmap: fallbackRoadmap,
  };

  const aiDraft = await generateAiDraft(result, primaryCompetitor, fallbackBundle);
  const issues = mergeIssueRows(aiDraft?.issues ?? [], fallbackBundle.issues);
  const optimizationPlan = aiDraft?.optimizationPlan
    ? mergeOptimizationPlan(aiDraft.optimizationPlan, fallbackBundle.optimizationPlan)
    : fallbackBundle.optimizationPlan;
  const gapRows = mergeGapRows(aiDraft?.gapRows ?? [], fallbackBundle.gapRows);
  const roadmap = mergeRoadmapRows(
    aiDraft?.roadmap ?? [],
    fallbackBundle.roadmap,
    issues,
    optimizationPlan,
    keywordRows
  );
  const coverageRows = buildCoverageRows(
    result,
    primaryCompetitor,
    keywordRows,
    optimizationPlan
  );

  return {
    primaryCompetitorAsin: primaryCompetitor?.asin ?? null,
    primaryCompetitorLabel: primaryCompetitor?.asin ?? "竞品基准",
    headline: aiDraft?.headline || fallbackBundle.headline,
    summary: aiDraft?.summary || fallbackBundle.summary,
    leadingDiagnosis: aiDraft?.leadingDiagnosis || fallbackBundle.leadingDiagnosis,
    dataQuality: aiDraft?.dataQuality || fallbackBundle.dataQuality,
    keyTakeaways:
      aiDraft?.keyTakeaways.length ? aiDraft.keyTakeaways : fallbackBundle.keyTakeaways,
    comparisonRows,
    keywordRows,
    gapRows,
    issues,
    optimizationPlan,
    coverageRows,
    roadmap,
  };
}

async function generateAiDraft(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  fallbackBundle: FallbackReportBundle
): Promise<OperatorReportAiDraft | null> {
  try {
    const preferOpenAi = Boolean(process.env.OPENAI_API_KEY);
    const config = resolveAiConfig({
      runtimeConfig: preferOpenAi ? { provider: "openai" } : undefined,
      defaultModel: preferOpenAi
        ? process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini"
        : getListingDefaultModel("listingGeneration"),
    });

    return await requestStructuredJson<OperatorReportAiDraft>({
      operationName: "listing diagnostics operator report",
      requestText: async (attempt) =>
        requestAiTextCompletion({
          config,
          operationName: "listing diagnostics operator report",
          maxTokens: 4200,
          temperature: 0,
          systemPrompt: [
            "你是资深亚马逊中文运营顾问。",
            "你的任务是把结构化 Listing 诊断结果改写成中国卖家能直接执行的运营报告。",
            "除了 keyword、Listing 文案、ASIN、Amazon、SP-API、Seller Central 等专业名词外，其余内容全部使用简体中文。",
            "不得把 inferred 类信号写成已确认事实；inferred 只能写成“待验证假设”。",
            "P0 只能用于 verified 或 direct 证据，不得把推断问题抬成 P0。",
            "优化方案里的 Title、Bullet、Search Terms、Alt Text 保留英文输出，其余说明文字必须是中文。",
            "输出必须是一个 JSON 对象，不要使用 Markdown，不要在 JSON 前后添加任何解释。",
          ].join(" "),
          userPrompt: buildAiPrompt(result, primaryCompetitor, fallbackBundle, attempt),
        }),
      parseResult: parseAiDraft,
      maxAttempts: 2,
    });
  } catch (error) {
    console.warn("[listing-diagnostics] operator report AI fallback", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

function buildAiPrompt(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  fallbackBundle: FallbackReportBundle,
  attempt: number
): string {
  const payload = {
    request: result.request,
    status: result.status,
    overallScore: result.overallScore,
    confidence: result.confidence,
    targetListing: summarizeListing(result.target.listing),
    primaryCompetitor: primaryCompetitor
      ? {
          asin: primaryCompetitor.asin,
          listing: summarizeListing(primaryCompetitor.listing),
        }
      : null,
    competitorPool: {
      competitorCount: result.competitors.length,
      labels: result.competitors.map((competitor) => competitor.asin),
      listingCount: result.competitors.filter((competitor) => competitor.listing).length,
      keywordCount: result.competitors.reduce(
        (total, competitor) => total + competitor.keywords.length,
        0
      ),
      reviewCount: result.competitors.reduce(
        (total, competitor) =>
          total + competitor.negativeReviews.length + competitor.positiveReviews.length,
        0
      ),
      competitors: result.competitors.slice(0, 3).map((competitor) => ({
        asin: competitor.asin,
        listing: summarizeListing(competitor.listing),
        keywordCount: competitor.keywords.length,
        negativeReviewCount: competitor.negativeReviews.length,
        positiveReviewCount: competitor.positiveReviews.length,
      })),
    },
    summaryMetrics: {
      targetKeywordCount: result.target.keywords.length,
      competitorKeywordCount: result.competitors.reduce(
        (total, competitor) => total + competitor.keywords.length,
        0
      ),
      targetNegativeReviewCount: result.target.negativeReviews.length,
      targetPositiveReviewCount: result.target.positiveReviews.length,
      benchmark: {
        averagePrice: result.benchmark.averagePrice,
        averageRating: result.benchmark.averageRating,
        averageReviews: result.benchmark.averageReviews,
      },
    },
    findings: result.findings.slice(0, 8).map((finding) => ({
      title: finding.title,
      priority: finding.priority,
      verification: finding.verification,
      inferred: finding.inferred,
      dimension: formatDimensionLabel(finding.dimensionId),
      impact: formatImpactType(finding.impactType),
      rootCauseCategory: formatRootCauseCategory(finding.rootCauseCategory),
      description: finding.description,
      evidence: finding.evidence.slice(0, 3),
    })),
    sourceCoverage: result.sourceCoverage.map((item) => ({
      label: item.label,
      source: item.source,
      status: item.status,
      detail: item.detail,
      inferred: item.inferred,
    })),
    comparisonRows: fallbackBundle.comparisonRows.slice(0, 10),
    keywordRows: fallbackBundle.keywordRows.slice(0, 18),
    fallbackDraft: {
      headline: fallbackBundle.headline,
      summary: fallbackBundle.summary,
      leadingDiagnosis: fallbackBundle.leadingDiagnosis,
      dataQuality: fallbackBundle.dataQuality,
      keyTakeaways: fallbackBundle.keyTakeaways,
      gapRows: fallbackBundle.gapRows,
      issues: fallbackBundle.issues,
      optimizationPlan: fallbackBundle.optimizationPlan,
      roadmap: fallbackBundle.roadmap,
    },
    outputSchema: {
      headline: "中文总标题",
      summary: "中文摘要，2-4句，讲清楚目标 ASIN 和竞品之间的差距",
      leadingDiagnosis: "一句中文主诊断",
      dataQuality: "一句中文数据质量说明",
      keyTakeaways: ["3-5 条中文结论"],
      gapRows: [
        {
          dimension: "中文维度名称",
          targetStrengths: ["中文"],
          targetWeaknesses: ["中文"],
          competitorStrengths: ["中文"],
          competitorWeaknesses: ["中文"],
        },
      ],
      issues: [
        {
          id: "issue-1",
          title: "中文问题标题",
          dimension: "中文维度",
          priority: "P0-立即处理 / P1-本周执行 / P2-两周内优化",
          evidenceLevel: "Amazon 已验证 / 直接证据 / 待验证假设",
          issueStatus: "已确认问题 / 待验证假设",
          impact: "流量 / 点击 / 转化 / 可售性 / 合规",
          symptom: "中文",
          rootCause: "中文",
          recommendation: "中文，写成可执行动作",
          whereToChange: "中文位置说明",
          expectedImpact: "中文",
          evidenceSummary: "中文，允许夹带必要英文 keyword 或 Listing 片段",
          verificationAction: "中文",
        },
      ],
      optimizationPlan: {
        recommendedTitle: "英文标题",
        titleLogic: "中文标题策略说明",
        coreKeywords: ["英文 keyword"],
        bullets: [
          {
            label: "Bullet 1",
            focus: "中文焦点",
            text: "英文 Bullet",
          },
        ],
        searchTerms: [
          { label: "Search Terms 1", text: "英文 search terms" },
        ],
        searchTermStrategy: "中文",
        aPlusAltText: [
          { label: "Alt Text 1", text: "英文 alt text" },
        ],
        altTextStrategy: "中文",
        occasionType: "英文 occasion_type",
        attributeRecommendations: ["中文"],
        executionNotes: ["中文"],
      },
      roadmap: [
        {
          priority: "P0-立即处理 / P1-本周执行 / P2-两周内优化",
          action: "中文",
          expectedEffect: "中文",
          timeline: "Day 1 / Day 1-3 / Day 3-7 / Day 7-14 / Day 14-30",
          verification: "中文",
          owner: "中文责任角色",
        },
      ],
    },
    retryAttempt: attempt,
  };

  return [
    "请基于以下 JSON，生成一份结构化运营报告。",
    "要求：",
    "1. 不要编造缺失数据；证据不足时明确写成“待验证假设”。",
    "2. 不要把 inferred 问题写成已确认问题。",
    "3. 不要把 verified/direct 以外的问题写成 P0。",
    "4. 除 keyword、Listing 文案、ASIN 和 Amazon 专业名词外，其余全部用中文。",
    "5. 输出必须严格符合 outputSchema。",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function parseAiDraft(value: unknown): OperatorReportAiDraft {
  if (!isRecord(value)) {
    throw new Error("AI operator report is not an object.");
  }

  return {
    headline: cleanLocalizedText(
      normalizeStringValue(value.headline, { allowEmpty: true })
    ),
    summary: cleanLocalizedText(
      normalizeStringValue(value.summary, { allowEmpty: true })
    ),
    leadingDiagnosis: cleanLocalizedText(normalizeStringValue(value.leadingDiagnosis, {
      allowEmpty: true,
    })),
    dataQuality: cleanLocalizedText(
      normalizeStringValue(value.dataQuality, { allowEmpty: true })
    ),
    keyTakeaways: normalizeTextList(value.keyTakeaways, {
      maxItems: 5,
      unique: true,
    }).map(cleanLocalizedText),
    gapRows: normalizeGapRows(value.gapRows),
    issues: normalizeIssueRows(value.issues),
    optimizationPlan: normalizeOptimizationPlan(value.optimizationPlan),
    roadmap: normalizeRoadmap(value.roadmap),
  };
}

function cleanLocalizedText(value: string): string {
  return value
    .replace(/\bdirect\b/gi, "直接")
    .replace(/\bverified\b/gi, "已验证")
    .replace(/\binferred\b/gi, "待验证")
    .replace(/\breviews\b/gi, "条评论")
    .replace(/\breview\b/gi, "评论")
    .replace(/\bissue\b/gi, "问题")
    .trim();
}

function buildCompetitorPoolLabel(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null
): string {
  if (result.competitors.length > 1) {
    return `绔炲搧姹?${result.competitors.length} 涓?ASIN`;
  }

  return primaryCompetitor?.asin ?? "绔炲搧姹?";
}

function buildCompetitorTitlePool(result: ListingDiagnosticsResult): string {
  return result.competitors
    .map((competitor) => competitor.listing?.title ?? "")
    .filter(Boolean)
    .join(" ");
}

function buildCompetitorBulletPool(result: ListingDiagnosticsResult): string {
  return result.competitors
    .flatMap((competitor) => competitor.listing?.bulletPoints ?? [])
    .filter(Boolean)
    .join(" ");
}

function buildCompetitorKeywordSignals(
  competitors: ListingDiagnosticsEntitySnapshot[],
  keyword: string
): Array<{ asin: string; keyword: TrafficKeyword }> {
  return competitors
    .map((competitor) => ({
      asin: competitor.asin,
      keyword: findKeyword(competitor.keywords, keyword),
    }))
    .filter(
      (
        entry
      ): entry is { asin: string; keyword: TrafficKeyword } => Boolean(entry.keyword)
    );
}

function pickBestCompetitorSignal(
  signals: Array<{ asin: string; keyword: TrafficKeyword }>,
  field: "organicRank" | "sponsoredRank"
): { asin: string; keyword: TrafficKeyword } | null {
  const ranked = signals
    .filter(({ keyword }) => {
      const value = field === "organicRank" ? keyword.organicRank : keyword.sponsoredRank;
      return typeof value === "number" && value > 0;
    })
    .sort((left, right) => {
      const leftValue =
        field === "organicRank" ? left.keyword.organicRank : left.keyword.sponsoredRank ?? 0;
      const rightValue =
        field === "organicRank" ? right.keyword.organicRank : right.keyword.sponsoredRank ?? 0;

      return leftValue - rightValue;
    });

  return ranked[0] ?? null;
}

function buildSyntheticCompetitorKeyword(
  keyword: string,
  searchVolume: number,
  conversionShare: number,
  organicSignal: { asin: string; keyword: TrafficKeyword } | null,
  sponsoredSignal: { asin: string; keyword: TrafficKeyword } | null
): TrafficKeyword | undefined {
  if (!organicSignal && !sponsoredSignal) {
    return undefined;
  }

  return {
    keyword,
    searchVolume,
    conversionShare,
    organicRank: organicSignal?.keyword.organicRank ?? 0,
    sponsoredRank: sponsoredSignal?.keyword.sponsoredRank ?? null,
  };
}

function findCompetitorsCoveringKeywordInTitle(
  competitors: ListingDiagnosticsEntitySnapshot[],
  keyword: string
): string[] {
  return competitors
    .filter((competitor) => keywordIsPresent(competitor.listing?.title ?? "", keyword))
    .map((competitor) => competitor.asin);
}

function findCompetitorsCoveringKeywordInBullets(
  competitors: ListingDiagnosticsEntitySnapshot[],
  keyword: string
): string[] {
  return competitors
    .filter((competitor) =>
      keywordIsPresent((competitor.listing?.bulletPoints ?? []).join(" "), keyword)
    )
    .map((competitor) => competitor.asin);
}

function choosePrimaryCompetitor(
  result: ListingDiagnosticsResult
): ListingDiagnosticsEntitySnapshot | null {
  if (result.competitors.length === 0) {
    return null;
  }

  const targetKeywordSet = new Set(
    result.target.keywords.map((item) => normalizeKeyword(item.keyword))
  );

  const ranked = [...result.competitors].map((competitor) => {
    const overlap = competitor.keywords.filter((item) =>
      targetKeywordSet.has(normalizeKeyword(item.keyword))
    ).length;
    const listingScore = competitor.listing ? 25 : 0;
    const keywordScore = Math.min(competitor.keywords.length, 30) * 1.4;
    const reviewScore =
      Math.min(
        competitor.negativeReviews.length + competitor.positiveReviews.length,
        40
      ) * 0.7;
    const organicScore = competitor.keywords.filter(
      (item) => item.organicRank > 0 && item.organicRank <= 30
    ).length;

    return {
      competitor,
      score: listingScore + overlap * 8 + keywordScore + reviewScore + organicScore * 2,
    };
  });

  ranked.sort((left, right) => right.score - left.score);
  return ranked[0]?.competitor ?? null;
}

function buildComparisonRows(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null
): ListingDiagnosticsOperatorReport["comparisonRows"] {
  const targetListing = result.target.listing;
  const competitorListing = primaryCompetitor?.listing ?? null;
  const targetScenes = inferScenes(result.target);
  const competitorScenes = primaryCompetitor ? inferScenes(primaryCompetitor) : [];
  const targetTopOrganicCount = countTopOrganicKeywords(result.target.keywords, 30);
  const competitorTopOrganicCount = countTopOrganicKeywords(
    primaryCompetitor?.keywords ?? [],
    30
  );
  const targetVariationCount = parseInteger(
    readAttribute(targetListing, ["variationCount", "variations", "variation"])
  );
  const competitorVariationCount = parseInteger(
    readAttribute(competitorListing, ["variationCount", "variations", "variation"])
  );
  const targetLqs = readAttribute(targetListing, ["lqs", "listingQuality"]);
  const competitorLqs = readAttribute(competitorListing, ["lqs", "listingQuality"]);
  const targetSubcategory = buildSubcategoryLabel(targetListing);
  const competitorSubcategory = buildSubcategoryLabel(competitorListing);
  const targetFulfillment = buildFulfillmentLabel(targetListing);
  const competitorFulfillment = buildFulfillmentLabel(competitorListing);
  const targetHasAPlus = detectAsset(targetListing, [
    "aPlus",
    "aplus",
    "brandStory",
    "hasAPlus",
  ]);
  const competitorHasAPlus = detectAsset(competitorListing, [
    "aPlus",
    "aplus",
    "brandStory",
    "hasAPlus",
  ]);
  const targetHasVideo = detectAsset(targetListing, [
    "video",
    "hasVideo",
    "videoAvailable",
  ]);
  const competitorHasVideo = detectAsset(competitorListing, [
    "video",
    "hasVideo",
    "videoAvailable",
  ]);

  return [
    {
      metric: "标题结构",
      targetValue: summarizeTitle(targetListing),
      competitorValue: summarizeTitle(competitorListing),
      analysis: buildTitleComparison(targetListing, competitorListing),
    },
    {
      metric: "品牌",
      targetValue: readAttribute(targetListing, ["brand"]) ?? UNKNOWN_LABEL,
      competitorValue: readAttribute(competitorListing, ["brand"]) ?? UNKNOWN_LABEL,
      analysis: buildBrandComparison(targetListing, competitorListing),
    },
    {
      metric: "五点承接",
      targetValue: `${targetListing?.bulletPoints.filter(Boolean).length ?? 0} 条`,
      competitorValue: `${competitorListing?.bulletPoints.filter(Boolean).length ?? 0} 条`,
      analysis: buildBulletComparison(targetListing, competitorListing),
    },
    {
      metric: "价格带",
      targetValue: formatCurrency(targetListing?.price ?? 0),
      competitorValue: formatCurrency(competitorListing?.price ?? 0),
      analysis: buildPriceComparison(targetListing, competitorListing),
    },
    {
      metric: "子类目",
      targetValue: targetSubcategory,
      competitorValue: competitorSubcategory,
      analysis: buildSubcategoryComparison(targetSubcategory, competitorSubcategory),
    },
    {
      metric: "评分与评论量",
      targetValue: buildRatingBlock(targetListing),
      competitorValue: buildRatingBlock(competitorListing),
      analysis: buildReviewComparison(targetListing, competitorListing),
    },
    {
      metric: "月销量",
      targetValue: formatWhole(targetListing?.monthlySales ?? 0),
      competitorValue: formatWhole(competitorListing?.monthlySales ?? 0),
      analysis: buildSalesComparison(targetListing, competitorListing),
    },
    {
      metric: "BSR",
      targetValue: formatBsr(targetListing?.bsr ?? 0),
      competitorValue: formatBsr(competitorListing?.bsr ?? 0),
      analysis: buildBsrComparison(targetListing, competitorListing),
    },
    {
      metric: "变体数",
      targetValue: targetVariationCount > 0 ? String(targetVariationCount) : UNKNOWN_LABEL,
      competitorValue:
        competitorVariationCount > 0 ? String(competitorVariationCount) : UNKNOWN_LABEL,
      analysis: buildVariationComparison(targetVariationCount, competitorVariationCount),
    },
    {
      metric: "LQS",
      targetValue: targetLqs ?? UNKNOWN_LABEL,
      competitorValue: competitorLqs ?? UNKNOWN_LABEL,
      analysis: buildLqsComparison(targetLqs, competitorLqs),
    },
    {
      metric: "流量关键词数",
      targetValue: `${result.target.keywords.length} 个`,
      competitorValue: `${primaryCompetitor?.keywords.length ?? 0} 个`,
      analysis: buildKeywordInventoryComparison(result, primaryCompetitor),
    },
    {
      metric: "自然位 Top30",
      targetValue: `${targetTopOrganicCount} 个`,
      competitorValue: `${competitorTopOrganicCount} 个`,
      analysis: buildOrganicComparison(targetTopOrganicCount, competitorTopOrganicCount),
    },
    {
      metric: "场景词覆盖",
      targetValue: targetScenes.length ? targetScenes.join(", ") : UNKNOWN_LABEL,
      competitorValue: competitorScenes.length
        ? competitorScenes.join(", ")
        : UNKNOWN_LABEL,
      analysis: buildSceneComparison(targetScenes, competitorScenes),
    },
    {
      metric: "A+/EBC",
      targetValue: targetHasAPlus ? "有" : "无",
      competitorValue: competitorHasAPlus ? "有" : "无",
      analysis: buildAssetSlotComparison(targetHasAPlus, competitorHasAPlus, "A+"),
    },
    {
      metric: "视频",
      targetValue: targetHasVideo ? "有" : "无",
      competitorValue: competitorHasVideo ? "有" : "无",
      analysis: buildAssetSlotComparison(targetHasVideo, competitorHasVideo, "视频"),
    },
    {
      metric: "FBA/发货方式",
      targetValue: targetFulfillment,
      competitorValue: competitorFulfillment,
      analysis: buildFulfillmentComparison(targetFulfillment, competitorFulfillment),
    },
    {
      metric: "内容资产总览",
      targetValue: buildAssetBlock(targetListing),
      competitorValue: buildAssetBlock(competitorListing),
      analysis: buildAssetComparison(targetListing, competitorListing),
    },
  ];
}

function buildKeywordRows(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null
): ListingDiagnosticsOperatorKeywordRow[] {
  const mergedKeywords = selectTrafficKeywords(
    [...result.target.keywords, ...result.competitors.flatMap((competitor) => competitor.keywords)],
    MAX_KEYWORD_ROWS
  );

  return mergedKeywords.map((keyword) => {
    const targetKeyword = findKeyword(result.target.keywords, keyword.keyword);
    const competitorSignals = buildCompetitorKeywordSignals(
      result.competitors,
      keyword.keyword
    );
    const bestOrganicSignal = pickBestCompetitorSignal(competitorSignals, "organicRank");
    const bestSponsoredSignal = pickBestCompetitorSignal(
      competitorSignals,
      "sponsoredRank"
    );
    const searchVolume = Math.max(
      keyword.searchVolume,
      targetKeyword?.searchVolume ?? 0,
      ...competitorSignals.map((entry) => entry.keyword.searchVolume)
    );
    const conversionShare = Math.max(
      keyword.conversionShare,
      targetKeyword?.conversionShare ?? 0,
      ...competitorSignals.map((entry) => entry.keyword.conversionShare)
    );
    const competitorKeyword = buildSyntheticCompetitorKeyword(
      keyword.keyword,
      searchVolume,
      conversionShare,
      bestOrganicSignal,
      bestSponsoredSignal
    );
    const competitorLabel =
      bestOrganicSignal?.asin ??
      bestSponsoredSignal?.asin ??
      primaryCompetitor?.asin ??
      buildCompetitorPoolLabel(result, primaryCompetitor);

    return {
      keyword: keyword.keyword,
      monthlySearchVolume: searchVolume,
      targetOrganicRank: formatRank(targetKeyword?.organicRank ?? 0),
      targetSponsoredRank: formatSponsoredRank(targetKeyword?.sponsoredRank ?? null),
      competitorAsin: competitorLabel,
      competitorOrganicRank: formatRank(competitorKeyword?.organicRank ?? 0),
      competitorSponsoredRank: formatSponsoredRank(
        competitorKeyword?.sponsoredRank ?? null
      ),
      purchaseShare: formatPercent(conversionShare),
      diagnosis: buildKeywordDiagnosis(
        keyword.keyword,
        targetKeyword,
        competitorKeyword,
        competitorLabel,
        competitorSignals.length
      ),
    };
  });
}

function buildFallbackIssues(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): ListingDiagnosticsOperatorIssueRow[] {
  const priorityRank: Record<"P0" | "P1" | "P2", number> = { P0: 0, P1: 1, P2: 2 };
  const sortedFindings = [...result.findings].sort((left, right) => {
    if (priorityRank[left.priority] !== priorityRank[right.priority]) {
      return priorityRank[left.priority] - priorityRank[right.priority];
    }

    if (left.verification !== right.verification) {
      return verificationRank(left.verification) - verificationRank(right.verification);
    }

    return right.confidence - left.confidence;
  });

  const issues: ListingDiagnosticsOperatorIssueRow[] = [];
  const seen = new Set<string>();

  for (const [index, finding] of sortedFindings.entries()) {
    const issue: ListingDiagnosticsOperatorIssueRow = {
      id: finding.id || `issue-${index + 1}`,
      title: buildIssueTitle(finding, primaryCompetitor, keywordRows),
      dimension: localizeDimension(finding.dimensionId),
      priority: localizePriority(finding.priority, finding.verification),
      evidenceLevel: localizeEvidenceLevel(finding.verification),
      issueStatus:
        finding.verification === "inferred" ? "待验证假设" : "已确认问题",
      impact: localizeImpact(finding.impactType),
      symptom: buildIssueSymptom(finding, primaryCompetitor, keywordRows),
      rootCause: buildIssueRootCause(finding),
      recommendation: buildIssueRecommendation(finding, primaryCompetitor, keywordRows),
      whereToChange: localizeWhereToChange(
        finding.whereToChange,
        finding.dimensionId,
        finding.rootCauseCategory
      ),
      expectedImpact: buildIssueExpectedImpact(finding),
      evidenceSummary: buildIssueEvidenceSummary(
        finding,
        primaryCompetitor,
        keywordRows,
        result
      ),
      verificationAction: buildVerificationAction(finding),
    };
    const dedupeKey = `${issue.dimension}|${issue.title}|${issue.recommendation}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    issues.push(issue);

    if (issues.length >= MAX_ISSUES) {
      break;
    }
  }

  return issues;
}

function buildFallbackGapRows(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[],
  issues: ListingDiagnosticsOperatorIssueRow[]
): ListingDiagnosticsOperatorGapRow[] {
  return [
    buildTitleGapRow(result, primaryCompetitor, keywordRows),
    buildBulletGapRow(result, primaryCompetitor, keywordRows),
    buildKeywordGapRow(result, primaryCompetitor, keywordRows),
    buildSceneGapRow(result, primaryCompetitor),
    buildReviewGapRow(result, primaryCompetitor),
    buildMarketGapRow(result, primaryCompetitor),
    buildAdStrategyGapRow(result, primaryCompetitor, keywordRows),
    buildOpsGapRow(result, primaryCompetitor, issues),
  ];
}

function buildFallbackOptimizationPlan(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[],
  issues: ListingDiagnosticsOperatorIssueRow[]
): ListingDiagnosticsOperatorOptimizationPlan {
  const currentTitle = result.target.listing?.title?.trim() || "";
  const currentListingText = buildListingText(result.target.listing);
  const coreKeywords = keywordRows.slice(0, 12).map((row) => row.keyword);
  const missingKeywords = keywordRows
    .map((row) => row.keyword)
    .filter((keyword) => !keywordIsPresent(currentTitle, keyword))
    .slice(0, 8);
  const recommendedTitle = buildRecommendedTitle(currentTitle, coreKeywords, missingKeywords);
  const bulletKeywordGroups = groupKeywordsForBullets(keywordRows);
  const bullets = buildOptimizationBullets(
    result,
    primaryCompetitor,
    recommendedTitle,
    bulletKeywordGroups
  );
  const searchTerms = buildSearchTermRows(keywordRows, recommendedTitle, currentListingText);
  const aPlusAltText = buildAltTextRows(recommendedTitle, bulletKeywordGroups);

  return {
    recommendedTitle,
    titleLogic: buildTitleLogic(result, primaryCompetitor, missingKeywords),
    coreKeywords,
    bullets,
    searchTerms,
    searchTermStrategy:
      "Search Terms 只补标题和前台文案没有放进去的长尾词，避免和标题重复堆砌，优先补高搜索量但当前自然位偏弱的词。",
    aPlusAltText,
    altTextStrategy:
      "A+ Alt Text 重点承接高价值场景词和差异化卖点，既补检索覆盖，也给图片模块提供更一致的语义。",
    occasionType: inferOccasionType(result.target),
    attributeRecommendations: buildAttributeRecommendations(
      result,
      primaryCompetitor,
      issues
    ),
    executionNotes: buildExecutionNotes(result, issues),
  };
}

function buildCoverageRows(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[],
  optimizationPlan: ListingDiagnosticsOperatorOptimizationPlan
): ListingDiagnosticsOperatorCoverageRow[] {
  const targetTitle = result.target.listing?.title ?? "";
  const targetBullets = result.target.listing?.bulletPoints.join(" ") ?? "";
  const competitorTitle = buildCompetitorTitlePool(result) || primaryCompetitor?.listing?.title || "";
  const competitorBullets =
    buildCompetitorBulletPool(result) ||
    primaryCompetitor?.listing?.bulletPoints.join(" ") ||
    "";
  const optimizedBullets = optimizationPlan.bullets.map((item) => item.text).join(" ");
  const optimizedSearchTerms = optimizationPlan.searchTerms
    .map((item) => item.text)
    .join(" ");
  const optimizedAltText = optimizationPlan.aPlusAltText.map((item) => item.text).join(" ");

  return keywordRows.map((row) => {
    const targetTitleMark = toCoverageMark(targetTitle, row.keyword);
    const targetBulletsMark = toCoverageMark(targetBullets, row.keyword);
    const targetSearchTermsMark = "未采集";
    const competitorTitleMark = toCoverageMark(competitorTitle, row.keyword);
    const competitorBulletsMark = toCoverageMark(competitorBullets, row.keyword);
    const optimizedTitleMark = toCoverageMark(
      optimizationPlan.recommendedTitle,
      row.keyword
    );
    const optimizedBulletsMark = toCoverageMark(optimizedBullets, row.keyword);
    const optimizedSearchTermsMark = toCoverageMark(optimizedSearchTerms, row.keyword);
    const optimizedAltTextMark = toCoverageMark(optimizedAltText, row.keyword);

    return {
      keyword: row.keyword,
      monthlySearchVolume: row.monthlySearchVolume,
      targetTitle: targetTitleMark,
      targetBullets: targetBulletsMark,
      targetSearchTerms: targetSearchTermsMark,
      competitorTitle: competitorTitleMark,
      competitorBullets: competitorBulletsMark,
      optimizedTitle: optimizedTitleMark,
      optimizedBullets: optimizedBulletsMark,
      optimizedSearchTerms: optimizedSearchTermsMark,
      optimizedAltText: optimizedAltTextMark,
      insight: buildCoverageInsight({
        row,
        targetTitleMark,
        targetBulletsMark,
        optimizedTitleMark,
        optimizedBulletsMark,
      }),
    };
  });
}

function buildFallbackRoadmap(
  result: ListingDiagnosticsResult,
  issues: ListingDiagnosticsOperatorIssueRow[],
  optimizationPlan: ListingDiagnosticsOperatorOptimizationPlan,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): ListingDiagnosticsOperatorRoadmapRow[] {
  const roadmap: ListingDiagnosticsOperatorRoadmapRow[] = [];
  const seen = new Set<string>();

  for (const issue of issues) {
    if (seen.has(issue.recommendation)) {
      continue;
    }

    seen.add(issue.recommendation);
    roadmap.push({
      priority: issue.priority,
      action: issue.recommendation,
      expectedEffect: issue.expectedImpact,
      timeline: priorityToTimeline(issue.priority, roadmap.length),
      verification: issue.verificationAction,
      owner: recommendOwner(issue.whereToChange),
    });

    if (roadmap.length >= 8) {
      break;
    }
  }

  if (roadmap.length === 0) {
    roadmap.push({
      priority: "P2-两周内优化",
      action: "当前没有单一阻塞项超过其他问题，建议先完成关键词入口与前台承接优化后再复跑诊断。",
      expectedEffect: "让后续的流量和转化表现更接近真实优化结果。",
      timeline: "Day 7-14",
      verification: "优化后重新拉取 SellerSprite 关键词与 Listing 诊断，观察自然位与点击转化变化。",
      owner: "Listing 运营",
    });
  }

  return roadmap;
}

function buildExpandedFallbackRoadmap(
  result: ListingDiagnosticsResult,
  issues: ListingDiagnosticsOperatorIssueRow[],
  optimizationPlan: ListingDiagnosticsOperatorOptimizationPlan,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): ListingDiagnosticsOperatorRoadmapRow[] {
  const roadmap: ListingDiagnosticsOperatorRoadmapRow[] = [];
  const seen = new Set<string>();
  const topKeywords = keywordRows.slice(0, 6).map((row) => row.keyword);
  const highValueKeywords = keywordRows
    .filter(
      (row) =>
        row.targetOrganicRank === "-" &&
        row.competitorOrganicRank !== "-" &&
        row.monthlySearchVolume > 0
    )
    .slice(0, 4)
    .map((row) => row.keyword);

  const pushRow = (row: ListingDiagnosticsOperatorRoadmapRow) => {
    const dedupeKey = `${row.priority}|${row.action}`;
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    roadmap.push(row);
  };

  for (const issue of issues) {
    pushRow({
      priority: issue.priority,
      action: issue.recommendation,
      expectedEffect: issue.expectedImpact,
      timeline: priorityToTimeline(issue.priority, roadmap.length),
      verification: issue.verificationAction,
      owner: recommendOwner(issue.whereToChange),
    });
  }

  const derivedRows: ListingDiagnosticsOperatorRoadmapRow[] = [
    {
      priority: "P0-立即处理",
      action: `重写标题首屏结构，优先承接 ${topKeywords.slice(0, 3).join(", ") || "核心词"}`,
      expectedEffect: "先补高权重自然入口，减少高价值词只靠广告补量的情况。",
      timeline: "Day 1",
      verification: "更新后 7-14 天复查自然位、CTR 和被竞品压制的高价值词入口。",
      owner: "Listing 运营",
    },
    {
      priority: "P0-立即处理",
      action: "按“核心卖点-场景-顾虑化解-规格-信任证明”重排前两条 Bullet。",
      expectedEffect: "让点击进来的流量更快看到关键信息，提升详情页承接效率。",
      timeline: "Day 1",
      verification: "复查页面跳出、CVR 与新评里对卖点理解是否改善。",
      owner: "Listing 运营",
    },
    {
      priority: "P1-本周执行",
      action: "补齐后台 Search Terms，专门承接标题未放进去的长尾词和场景词。",
      expectedEffect: "扩大可索引词面，避免标题/Bullet 堆词又不补后台入口。",
      timeline: "Day 1-3",
      verification: "复查收录词数量、新增词自然位和广告搜索词报告。",
      owner: "Listing 运营",
    },
    {
      priority: "P1-本周执行",
      action: "同步更新 A+ Alt Text 与图片文案，让视觉模块也承接搜索语义。",
      expectedEffect: "把前台卖点、场景词和图文模块统一到同一条转化逻辑上。",
      timeline: "Day 1-3",
      verification: "复查 A+ 相关关键词覆盖矩阵与页面停留时长变化。",
      owner: "设计 / A+",
    },
    {
      priority: "P1-本周执行",
      action: `校准 occasion_type 与属性字段，优先保证 ${optimizationPlan.occasionType || "主场景"} 和核心规格表达完整。`,
      expectedEffect: "减少前台文案和后台属性脱节，提升类目相关性与过滤器命中率。",
      timeline: "Day 1-3",
      verification: "复查类目归档、前台属性展示和相关关键词收录变化。",
      owner: "运营",
    },
    {
      priority: "P1-本周执行",
      action: `启动 Phase 1 精准词广告，先覆盖 ${highValueKeywords.slice(0, 3).join(", ") || topKeywords.slice(0, 3).join(", ") || "高价值词"}`,
      expectedEffect: "优先验证高价值词是否值得抢位，并为自然位回升提供数据支撑。",
      timeline: "Day 1-3",
      verification: "看精准词点击率、转化率、TACoS 和是否带动自然位回升。",
      owner: "广告运营",
    },
    {
      priority: "P1-本周执行",
      action: "同步开 Phase 1 广泛词采词广告，补充新长尾词并沉淀否词清单。",
      expectedEffect: "避免只守老词，给下一轮 Search Terms 和标题扩词提供真实搜索词证据。",
      timeline: "Day 3-7",
      verification: "复查搜索词报告，沉淀可转精准词与应否掉的低质词。",
      owner: "广告运营",
    },
    {
      priority: "P1-本周执行",
      action: "为 SB / SBV 准备品牌主张与视频脚本，放大场景词和差异化卖点。",
      expectedEffect: "提升品牌词与场景词点击效率，补足只靠 SP 抢位的单一结构。",
      timeline: "Day 3-7",
      verification: "看品牌曝光、视频观看率与品牌词点击成本变化。",
      owner: "广告运营 / 设计",
    },
    {
      priority: "P2-两周内优化",
      action: "补一轮 ASIN 定向广告，锁定评价或卖点较弱但抢走流量的竞品详情页。",
      expectedEffect: "把竞品详情页流量引回自己的转化链路，验证差异化卖点是否成立。",
      timeline: "Day 7-14",
      verification: "观察 ASIN 定向点击率、转化率和下单归因表现。",
      owner: "广告运营",
    },
    {
      priority: "P2-两周内优化",
      action: "结合评价问题点补 FAQ/图片说明，把尺码、适配、材质或使用顾虑前置化解。",
      expectedEffect: "减少详情页临门一脚流失，降低负评里重复出现的顾虑项。",
      timeline: "Day 7-14",
      verification: "跟踪新评主题、客服问题和转化率是否同步改善。",
      owner: "Listing 运营",
    },
    {
      priority: "P2-两周内优化",
      action: "结合优惠券或小额折扣重测价格带，不要只靠改文案判断市场位。",
      expectedEffect: "拆开“相关性不足”和“价格竞争位不清晰”两类问题，避免误判。",
      timeline: "Day 7-14",
      verification: "看优惠前后 CTR、CVR、销量和利润率的联动变化。",
      owner: "运营 / 广告",
    },
    {
      priority: "P2-两周内优化",
      action: "整理一版否词、控预算与提价/降价规则，形成 14 天滚动迭代节奏。",
      expectedEffect: "把文案优化、广告放量和预算管理串成闭环，不再靠单次改稿碰运气。",
      timeline: "Day 14-30",
      verification: "两周后复跑诊断，比较关键词矩阵、问题清单和行动项是否明显收敛。",
      owner: "运营负责人",
    },
  ];

  for (const row of derivedRows) {
    pushRow(row);
  }

  if (roadmap.length === 0) {
    pushRow({
      priority: "P2-两周内优化",
      action: "当前没有单一阻塞项压倒其他问题，先完成关键词入口与详情页承接优化后再复跑诊断。",
      expectedEffect: "让后续的流量和转化表现更接近真实优化结果。",
      timeline: "Day 7-14",
      verification: "优化后重新拉取 SellerSprite 关键词与 Listing 诊断，观察自然位与转化变化。",
      owner: "Listing 运营",
    });
  }

  return roadmap.slice(0, 14);
}

function buildFallbackHeadline(
  result: ListingDiagnosticsResult,
  issues: ListingDiagnosticsOperatorIssueRow[],
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null
): string {
  const topIssue = issues[0];
  const competitorLabel = primaryCompetitor?.asin ?? "竞品基准";

  if (topIssue?.evidenceLevel === "Amazon 已验证") {
    return `先处理 Amazon 已验证阻塞，再放大流量：${result.request.targetAsin} 当前更需要“恢复可售性”，而不是继续堆词。`;
  }

  if (topIssue?.impact === "流量") {
    return `和 ${competitorLabel} 的差距主要不在“有没有词”，而在“高价值关键词有没有进到高权重入口”。`;
  }

  if (topIssue?.impact === "转化") {
    return `${result.request.targetAsin} 当前最大短板在详情页说服力，点击进来以后没有把流量稳定转成下单。`;
  }

  return `${result.request.targetAsin} 当前不是没有基础，而是流量入口、前台承接和运营动作还没有形成一套完整闭环。`;
}

function buildLeadingDiagnosis(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[],
  issues: ListingDiagnosticsOperatorIssueRow[]
): string {
  const highValueGap = keywordRows.find(
    (row) =>
      row.competitorOrganicRank !== "-" &&
      row.targetOrganicRank === "-" &&
      row.monthlySearchVolume >= 1000
  );
  const topIssue = issues[0];

  if (topIssue?.evidenceLevel === "Amazon 已验证") {
    return "当前应先清基础阻塞项，再谈扩大关键词覆盖和转化承接。";
  }

  if (highValueGap) {
    return `高价值词 ${highValueGap.keyword} 已被竞品抢占自然位，而目标 ASIN 还没有稳定入口。`;
  }

  if (primaryCompetitor?.listing && result.target.listing) {
    return `和 ${primaryCompetitor.asin} 相比，目标 ASIN 当前更像“有内容但承接弱”，不是“完全没做”。`;
  }

  return "当前结果更像结构性问题叠加，而不是单条文案的局部失误。";
}

function buildFallbackSummary(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[],
  issues: ListingDiagnosticsOperatorIssueRow[]
): string {
  const confirmedCount = issues.filter((item) => item.issueStatus === "已确认问题").length;
  const hypothesisCount = issues.length - confirmedCount;
  const keywordGapCount = keywordRows.filter(
    (row) => row.targetOrganicRank === "-" && row.competitorOrganicRank !== "-"
  ).length;
  const benchmarkPrice = result.benchmark.averagePrice;
  const priceSentence =
    result.target.listing?.price && benchmarkPrice
      ? `当前价格 ${formatCurrency(result.target.listing.price)}，竞品均价约 ${formatCurrency(benchmarkPrice)}。`
      : "当前价格带仍需结合竞品进一步校准。";
  const competitorSentence = primaryCompetitor
    ? `对比竞品 ${primaryCompetitor.asin}，目标 ASIN 在关键词入口和详情页承接上都有明显优化空间。`
    : "本次竞品样本不足，部分结论需要后续继续补样本确认。";

  return [
    competitorSentence,
    `本次共整理出 ${issues.length} 个重点问题，其中 ${confirmedCount} 个可直接执行，${hypothesisCount} 个被明确标记为待验证假设，不会和已确认问题混写。`,
    `${keywordGapCount} 个高价值词呈现“竞品有自然位、目标 ASIN 没有自然位”的状态，说明当前短板更偏向高权重入口和前台承接。`,
    priceSentence,
  ].join("");
}

function buildFallbackTakeaways(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[],
  issues: ListingDiagnosticsOperatorIssueRow[]
): string[] {
  const topKeywordGap = keywordRows.find(
    (row) => row.targetOrganicRank === "-" && row.competitorOrganicRank !== "-"
  );
  const lowBulletCoverage = result.target.listing?.bulletPoints.filter(Boolean).length ?? 0;
  const topIssue = issues[0];

  const items = [
    topKeywordGap
      ? `高价值词 ${topKeywordGap.keyword} 已被竞品拿到自然位，目标 ASIN 需要把它前置到标题和前两条 Bullet。`
      : "关键词池不是空的，但高价值词没有在高权重位置形成稳定承接。",
    lowBulletCoverage < 5
      ? "当前 Bullet 承接偏弱，详情页没有把关键词、卖点和场景组织成完整闭环。"
      : "Bullet 数量不算少，但卖点顺序和关键词落位仍需重新组织。",
    primaryCompetitor?.listing?.rating && result.target.listing?.rating
      ? `竞品评分/评论沉淀为 ${buildRatingBlock(primaryCompetitor.listing)}，目标 ASIN 为 ${buildRatingBlock(result.target.listing)}。`
      : "评价沉淀是本轮判断转化风险的重要依据，需要持续关注新评走向。",
    topIssue
      ? `当前最优先动作是：${topIssue.recommendation}`
      : "当前没有单一阻塞点压倒其他问题，应先做关键词入口与转化承接优化。",
  ];

  return items.filter(Boolean).slice(0, 5);
}

function buildDataQualityText(result: ListingDiagnosticsResult): string {
  const incompleteSources = result.sourceCoverage.filter((item) => item.status !== "covered");
  const verifiedCount = result.spApiVerification?.verifiedFindingIds.length ?? 0;

  if (incompleteSources.length === 0 && verifiedCount === 0) {
    return "本次数据覆盖较完整，当前诊断结果可以直接进入执行阶段。";
  }

  if (incompleteSources.length === 0) {
    return `本次基础数据覆盖完整，另有 ${verifiedCount} 个问题经过 Amazon SP-API 验证，可直接按 P0/P1 队列推进。`;
  }

  const labels = incompleteSources.map((item) => localizeCoverageLabel(item.id)).slice(0, 3);
  return `当前有 ${incompleteSources.length} 个数据源不是完整覆盖，主要集中在 ${labels.join("、")}，因此我把证据不足的问题单列成“待验证假设”，避免和已确认问题混写。`;
}

function buildTitleGapRow(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): ListingDiagnosticsOperatorGapRow {
  const targetTitle = result.target.listing?.title ?? "";
  const competitorTitle = buildCompetitorTitlePool(result) || primaryCompetitor?.listing?.title || "";
  const competitorPoolLabel = buildCompetitorPoolLabel(result, primaryCompetitor);
  const targetMissingKeywords = keywordRows
    .map((row) => row.keyword)
    .filter((keyword) => !keywordIsPresent(targetTitle, keyword))
    .slice(0, 3);
  const competitorWinningKeywords = keywordRows
    .filter(
      (row) =>
        keywordIsPresent(competitorTitle, row.keyword) &&
        !keywordIsPresent(targetTitle, row.keyword)
    )
    .map((row) => {
      const owners = findCompetitorsCoveringKeywordInTitle(result.competitors, row.keyword);
      return owners.length ? `${row.keyword}（${owners.slice(0, 2).join("/") }）` : row.keyword;
    })
    .slice(0, 3);

  return {
    dimension: "标题结构",
    targetStrengths: [
      targetTitle
        ? `当前标题长度约 ${targetTitle.length} 个字符，已具备继续优化的基础。`
        : "当前标题需要补齐基础信息。",
      ...buildKeywordPresenceStrengths(targetTitle, keywordRows),
    ].slice(0, 4),
    targetWeaknesses: [
      targetMissingKeywords.length
        ? `标题仍未前置高价值词：${targetMissingKeywords.join(", ")}。`
        : "标题已覆盖大部分核心词，但仍需检查词序和卖点优先级。",
      targetTitle.length > TITLE_LIMIT
        ? "标题偏长，容易把真正重要的词挤到低权重位置。"
        : "标题仍可继续压缩赘词，让核心类目词和主卖点更靠前。",
    ].slice(0, 4),
    competitorStrengths: [
      competitorTitle
        ? `${competitorPoolLabel} 在标题里的关键词承接更完整，当前汇总文本里已有稳定覆盖。`
        : "竞品标题数据不足。",
      competitorWinningKeywords.length
        ? `竞品池标题已经吃到：${competitorWinningKeywords.join(", ")}。`
        : "竞品标题没有明显额外领先词。",
    ].slice(0, 4),
    competitorWeaknesses: [
      competitorTitle
        ? "竞品标题也可能存在堆词问题，可借鉴承接逻辑但不建议直接照搬。"
        : "竞品标题样本不足。",
    ],
  };
}

function buildBulletGapRow(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): ListingDiagnosticsOperatorGapRow {
  const targetBullets = result.target.listing?.bulletPoints.filter(Boolean) ?? [];
  const competitorBullets = result.competitors.flatMap(
    (competitor) => competitor.listing?.bulletPoints.filter(Boolean) ?? []
  );
  const competitorPoolLabel = buildCompetitorPoolLabel(result, primaryCompetitor);
  const targetBulletText = targetBullets.join(" ");
  const competitorBulletText = competitorBullets.join(" ");
  const targetMissing = keywordRows
    .map((row) => row.keyword)
    .filter((keyword) => !keywordIsPresent(targetBulletText, keyword))
    .slice(0, 3);
  const competitorCovered = keywordRows
    .filter((row) => keywordIsPresent(competitorBulletText, row.keyword))
    .map((row) => {
      const owners = findCompetitorsCoveringKeywordInBullets(result.competitors, row.keyword);
      return owners.length ? `${row.keyword}（${owners.slice(0, 2).join("/") }）` : row.keyword;
    })
    .slice(0, 3);

  return {
    dimension: "五点承接",
    targetStrengths: [
      `${targetBullets.length} 条 Bullet 已提供一定承接空间。`,
      targetBullets.length >= 5
        ? "前台信息位数量够用，重点是重排逻辑顺序。"
        : "仍有可补充的 Bullet 空间，可以增加场景和差异化证明。",
    ],
    targetWeaknesses: [
      targetMissing.length
        ? `当前 Bullet 仍未接住：${targetMissing.join(", ")}。`
        : "Bullet 已覆盖主要词，但说服顺序和差异化表达仍可加强。",
      "建议把“类目/卖点/材质/场景/预期管理”拆成五段，而不是平均分散信息密度。",
    ],
    competitorStrengths: [
      competitorBullets.length
        ? `${competitorPoolLabel} 的 Bullet 语料更完整，适合拿来观察承接顺序和场景词布局。`
        : "竞品 Bullet 样本不足。",
      competitorCovered.length
        ? `竞品池 Bullet 已承接：${competitorCovered.join(", ")}。`
        : "竞品 Bullet 没有明显额外承接优势。",
    ],
    competitorWeaknesses: [
      competitorBullets.length
        ? "竞品 Bullet 也不一定是最优版本，但它在流量词承接上通常更靠前。"
        : "竞品 Bullet 数据不足。",
    ],
  };
}

function buildKeywordGapRow(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): ListingDiagnosticsOperatorGapRow {
  const competitorPoolLabel = buildCompetitorPoolLabel(result, primaryCompetitor);
  const targetTopOrganic = keywordRows
    .filter((row) => /^#\d+/.test(row.targetOrganicRank))
    .slice(0, 4)
    .map((row) => `${row.keyword} ${row.targetOrganicRank}`);
  const competitorLeads = keywordRows
    .filter(
      (row) =>
        row.competitorOrganicRank !== "-" &&
        (row.targetOrganicRank === "-" ||
          rankValue(row.competitorOrganicRank) + 15 < rankValue(row.targetOrganicRank))
    )
    .slice(0, 4)
    .map((row) => `${row.keyword} ${row.competitorOrganicRank} @ ${row.competitorAsin}`);

  return {
    dimension: "关键词入口",
    targetStrengths: [
      targetTopOrganic.length
        ? `当前已有自然位的词：${targetTopOrganic.join("；")}。`
        : "仍缺少足够多的自然位样本。",
      `${result.target.keywords.length} 个 traffic keyword 为后续优化提供了抓手。`,
    ],
    targetWeaknesses: [
      competitorLeads.length
        ? `竞品领先词主要集中在：${competitorLeads.join("；")}。`
        : "与竞品相比没有极端词差，但仍需提高核心词稳定性。",
      "关键词问题不是“有没有词”，而是“高价值词有没有进入标题前半段和前两条 Bullet”。",
    ],
    competitorStrengths: [
      result.competitors.length
        ? `${competitorPoolLabel} 在高价值词上的自然位更稳定。`
        : "竞品样本不足。",
      competitorLeads.length
        ? `竞品池优先吃到的词：${competitorLeads.join("；")}。`
        : "竞品词位优势不明显。",
    ],
    competitorWeaknesses: [
      "竞品的词位优势并不代表前台表达一定更好，仍然可以通过更精准的结构化文案追平。",
    ],
  };
}

function buildSceneGapRow(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null
): ListingDiagnosticsOperatorGapRow {
  const targetScenes = inferScenes(result.target);
  const competitorScenes = Array.from(
    new Set(result.competitors.flatMap((competitor) => inferScenes(competitor)))
  );
  const missingScenes = competitorScenes.filter((scene) => !targetScenes.includes(scene));

  return {
    dimension: "场景覆盖",
    targetStrengths: [
      targetScenes.length
        ? `目标 ASIN 当前已覆盖的场景词：${targetScenes.join("、")}。`
        : "当前场景词表达偏少，前台内容对使用场景承接不够。",
    ],
    targetWeaknesses: [
      missingScenes.length
        ? `竞品池已覆盖但目标尚未重点承接的场景词：${missingScenes.slice(0, 4).join("、")}。`
        : "场景词差距不算极端，但仍需把高转化场景往标题前半段和前两条 Bullet 靠。",
      "场景覆盖不是简单加词，而是要把“什么场景下适合这款产品”讲得更具体。",
    ],
    competitorStrengths: [
      competitorScenes.length
        ? `竞品池更常见的场景表达：${competitorScenes.slice(0, 5).join("、")}。`
        : primaryCompetitor
          ? `竞品 ${primaryCompetitor.asin} 的场景样本较少，但仍可作为阶段性参照。`
          : "竞品场景样本不足。",
    ],
    competitorWeaknesses: [
      "竞品场景词覆盖更多，不代表它们的前台说服顺序已经最优，仍然可以用更清晰的场景承接追平。",
    ],
  };
}

function buildAdStrategyGapRow(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): ListingDiagnosticsOperatorGapRow {
  const targetAdHeavyKeywords = keywordRows
    .filter((row) => row.targetOrganicRank === "-" && row.targetSponsoredRank !== "-")
    .slice(0, 4)
    .map((row) => row.keyword);
  const competitorDefendedKeywords = keywordRows
    .filter((row) => row.competitorSponsoredRank !== "-")
    .slice(0, 4)
    .map((row) => `${row.keyword}（${row.competitorAsin}）`);

  return {
    dimension: "广告策略",
    targetStrengths: [
      targetAdHeavyKeywords.length
        ? `目标 ASIN 已经在用广告承接：${targetAdHeavyKeywords.join("、")}。`
        : "当前广告承接痕迹不重，后续可以更聚焦地建立采词和抢位计划。",
    ],
    targetWeaknesses: [
      targetAdHeavyKeywords.length
        ? "部分高价值词更像只靠广告补量，自然位和详情页承接还没有同步跟上。"
        : "如果不建立分阶段广告结构，后续很难判断哪些词值得重写文案、哪些词只适合测试。",
      "需要把精准词、广泛词、品牌词和 ASIN 定向拆开，不要把所有预算堆在同一层计划里。",
    ],
    competitorStrengths: [
      competitorDefendedKeywords.length
        ? `竞品池已有广告防守的关键词：${competitorDefendedKeywords.join("、")}。`
        : primaryCompetitor
          ? `竞品 ${primaryCompetitor.asin} 当前广告样本有限。`
          : "竞品广告样本不足。",
    ],
    competitorWeaknesses: [
      "竞品有广告布局不代表投放结构一定高效，只要文案承接和否词策略更干净，仍有机会降低抢位成本。",
    ],
  };
}

function buildReviewGapRow(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null
): ListingDiagnosticsOperatorGapRow {
  const targetListing = result.target.listing;
  const competitorListing = primaryCompetitor?.listing ?? null;

  return {
    dimension: "评论与转化证明",
    targetStrengths: [
      targetListing?.rating
        ? `当前评分为 ${targetListing.rating.toFixed(1)}，评论量 ${formatWhole(
            targetListing.reviews
          )}。`
        : "当前评分和评论量样本不足。",
      result.target.positiveReviews.length
        ? `已抓取 ${result.target.positiveReviews.length} 条正向评论，可提炼卖点证明。`
        : "正向评论样本不足，后续可继续补抓。",
    ],
    targetWeaknesses: [
      result.target.negativeReviews.length
        ? `已抓取 ${result.target.negativeReviews.length} 条负向评论，需要把反复出现的问题前置解释。`
        : "负向评论样本偏少，转化风险需要继续观察。",
      "如果评论里的顾虑没有被标题、Bullet、图片和 A+ 承接，点击进来后仍然会流失。",
    ],
    competitorStrengths: [
      competitorListing?.rating
        ? `竞品评分为 ${competitorListing.rating.toFixed(1)}，评论量 ${formatWhole(
            competitorListing.reviews
          )}。`
        : "竞品评论沉淀样本不足。",
      primaryCompetitor?.negativeReviews.length
        ? `竞品评论样本更完整，能给更多场景词和担忧点参考。`
        : "竞品评论样本不充分。",
    ],
    competitorWeaknesses: [
      "竞品评论沉淀大不代表它把顾虑解释得更清楚，仍有机会通过前台证明拉近差距。",
    ],
  };
}

function buildMarketGapRow(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null
): ListingDiagnosticsOperatorGapRow {
  const targetListing = result.target.listing;
  const competitorListing = primaryCompetitor?.listing ?? null;

  return {
    dimension: "价格策略",
    targetStrengths: [
      targetListing?.price
        ? `当前价格为 ${formatCurrency(targetListing.price)}。`
        : "当前价格数据不足。",
      result.benchmark.averagePrice
        ? `竞品均价约为 ${formatCurrency(result.benchmark.averagePrice)}。`
        : "竞品均价暂时不可用。",
    ],
    targetWeaknesses: [
      buildPriceComparison(targetListing, competitorListing),
      "价格问题不能只看绝对值，还要联动评分、评论量、主图和文案说服力一起看。",
    ],
    competitorStrengths: [
      competitorListing?.price
        ? `竞品价格为 ${formatCurrency(competitorListing.price)}。`
        : "竞品价格数据不足。",
      competitorListing?.monthlySales
        ? `竞品月销量约 ${formatWhole(competitorListing.monthlySales)}。`
        : "竞品销量数据不足。",
    ],
    competitorWeaknesses: [
      "竞品当前竞争位未必稳固，一旦你的关键词入口和前台证明做对，仍有机会在同价带反超。",
    ],
  };
}

function buildOpsGapRow(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  issues: ListingDiagnosticsOperatorIssueRow[]
): ListingDiagnosticsOperatorGapRow {
  const confirmedOpsIssue = issues.find(
    (item) =>
      item.dimension.includes("可售性") ||
      item.dimension.includes("运营基础") ||
      item.evidenceLevel === "Amazon 已验证"
  );

  return {
    dimension: "运营基础",
    targetStrengths: [
      primaryCompetitor ? `当前对标竞品为 ${primaryCompetitor.asin}。` : "当前对标竞品样本有限。",
      result.spApiVerification?.enabled
        ? "已启用 Amazon SP-API 验证，可把阻塞项与推断问题区分开。"
        : "当前主要依赖 SellerSprite 信号，后续可通过 SP-API 进一步增强验证。",
    ],
    targetWeaknesses: [
      confirmedOpsIssue
        ? confirmedOpsIssue.recommendation
        : "运营基础层目前没有单一阻塞项压倒其他问题，但仍要持续看目录状态、属性完整度和可售性。",
      result.sourceCoverage.some((item) => item.status !== "covered")
        ? "部分数据源覆盖不完整，建议后续继续补竞品和评论样本，避免把代理信号当成最终结论。"
        : "当前数据覆盖较完整，可以直接进入执行阶段。",
    ],
    competitorStrengths: [
      primaryCompetitor
        ? `竞品 ${primaryCompetitor.asin} 在当前样本中表现更完整，适合作为短期对标对象。`
        : "竞品样本有限。",
    ],
    competitorWeaknesses: [
      "竞品只是阶段性对标，不建议把它的标题结构或词序原样复制到自己的 Listing 上。",
    ],
  };
}

function buildIssueTitle(
  finding: ListingDiagnosticsFinding,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): string {
  const leadingGap = keywordRows.find(
    (row) => row.targetOrganicRank === "-" && row.competitorOrganicRank !== "-"
  );

  switch (finding.dimensionId) {
    case "keyword-opportunity":
      return leadingGap
        ? `核心流量词 ${leadingGap.keyword} 仍未拿到自然位`
        : "高价值关键词入口偏弱";
    case "content-coverage":
      return "标题与 Bullet 承接没有形成闭环";
    case "review-signal":
      return "评论信号没有被前台内容充分承接";
    case "listing-health":
      return finding.verification === "verified"
        ? "Amazon 已验证的可售性/目录问题需要优先清理"
        : "Listing 健康度存在基础风险";
    case "market-position":
      return primaryCompetitor
        ? `与 ${primaryCompetitor.asin} 相比，价格带与竞争位不够清晰`
        : "价格带与竞争位需要重新校准";
    default:
      return `${localizeDimension(finding.dimensionId)}存在可执行缺口`;
  }
}

function buildIssueSymptom(
  finding: ListingDiagnosticsFinding,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): string {
  const leadingGap = keywordRows.find(
    (row) => row.targetOrganicRank === "-" && row.competitorOrganicRank !== "-"
  );

  switch (finding.dimensionId) {
    case "keyword-opportunity":
      if (leadingGap) {
        return `高价值词 ${leadingGap.keyword} 当前呈现“竞品有自然位、目标 ASIN 没有自然位”的状态，说明关键词入口仍偏弱。`;
      }
      return "虽然已有 traffic keyword 数据，但核心词没有在高权重位置形成稳定承接。";
    case "content-coverage":
      return "标题、Bullet 或属性位没有把类目词、主卖点和使用场景串成同一条转化链路。";
    case "review-signal":
      return "详情页没有充分解释用户在评论里最在意的点，导致点击后容易在 PDP 流失。";
    case "listing-health":
      return finding.verification === "verified"
        ? "Amazon 侧已经出现可售性或目录状态的硬阻塞。"
        : "Listing 健康度、属性完整度或目录状态存在基础风险。";
    case "market-position":
      return primaryCompetitor
        ? `和 ${primaryCompetitor.asin} 相比，目标 ASIN 还没有形成清晰的价格-评价-卖点竞争位。`
        : "当前价格带与竞争位没有清晰形成差异化。";
    default:
      return `当前在“${localizeDimension(finding.dimensionId)}”这一维度已经出现可执行风险。`;
  }
}

function buildIssueRootCause(finding: ListingDiagnosticsFinding): string {
  const category = localizeRootCause(finding.rootCauseCategory);

  switch (finding.dimensionId) {
    case "keyword-opportunity":
      return "根因更偏向“高价值词没有进入高权重入口”，而不是词池完全为空。";
    case "content-coverage":
      return "根因更偏向“前台信息排序和表达方式不对”，而不是单条 Bullet 字数不够。";
    case "review-signal":
      return "根因更偏向“评论里的顾虑没有被前台提前解释和证明”。";
    case "listing-health":
      return category !== UNKNOWN_LABEL
        ? `根因已经落在 ${category} 这一层，需要先解决基础阻塞。`
        : "根因位于可售性或目录基础层，必须优先处理。";
    case "market-position":
      return `根因更偏向“价格带、评分沉淀和前台卖点之间没有形成统一竞争位”。${category !== UNKNOWN_LABEL ? `当前归类为：${category}。` : ""}`;
    default:
      return category !== UNKNOWN_LABEL
        ? `当前问题主要归类到 ${category}。`
        : "当前问题需要结合更多执行数据继续细化根因。";
  }
}

function buildIssueRecommendation(
  finding: ListingDiagnosticsFinding,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): string {
  const leadingGapKeywords = keywordRows
    .filter(
      (row) =>
        row.targetOrganicRank === "-" &&
        row.competitorOrganicRank !== "-" &&
        row.monthlySearchVolume > 0
    )
    .slice(0, 3)
    .map((row) => row.keyword);

  switch (finding.dimensionId) {
    case "keyword-opportunity":
      return leadingGapKeywords.length
        ? `先把 ${leadingGapKeywords.join(", ")} 这类高价值词前置到标题和前两条 Bullet，再用 Search Terms 补剩余长尾词。`
        : "先重排标题和前两条 Bullet 的词序，让高价值类目词和主场景词进入高权重位置。";
    case "content-coverage":
      return "按“类目/主卖点/材质体验/场景覆盖/预期管理”重写 Bullet 顺序，并把真正的差异化证明放到前两屏。";
    case "review-signal":
      return "从差评高频顾虑里抽 2-3 个重点，前置到 Bullet、图片文案和 A+ 模块里，让用户在详情页就能看到解释。";
    case "listing-health":
      return finding.verification === "verified"
        ? "先进入 Seller Central 清掉已验证的可售性或目录问题，确认恢复后再继续做流量放大。"
        : "优先检查 Listing 健康度、属性完整度和目录状态，先清基础风险再继续优化文案。";
    case "market-position":
      return primaryCompetitor
        ? `以 ${primaryCompetitor.asin} 为基准，重看价格带、优惠和主图卖点，避免只打价格战。`
        : "重新校准价格带、优惠节奏和前台卖点，确保价格位和卖点位能互相支撑。";
    default:
      return "把问题拆成“改哪里、为什么改、改完看什么”三步执行，不要只停留在泛泛建议上。";
  }
}

function buildIssueExpectedImpact(finding: ListingDiagnosticsFinding): string {
  switch (finding.impactType) {
    case "visibility":
      return "优先恢复或扩大自然流量入口，减少对广告补量的依赖。";
    case "click":
      return "让搜索结果页的相关性感知更强，提升曝光到点击的转化效率。";
    case "conversion":
      return "降低详情页流失，让点击后的用户更容易完成加购和下单。";
    case "buyability":
      return "先把可售性恢复稳定，再让后续流量放大变得有意义。";
    case "compliance":
      return "降低被抑制、被限制或被系统拦截的风险。";
  }
}

function buildIssueEvidenceSummary(
  finding: ListingDiagnosticsFinding,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[],
  result: ListingDiagnosticsResult
): string {
  const evidenceText = finding.evidence.slice(0, 2).join("；");
  const leadingGap = keywordRows.find(
    (row) => row.targetOrganicRank === "-" && row.competitorOrganicRank !== "-"
  );

  if (finding.dimensionId === "keyword-opportunity" && leadingGap) {
    return `${localizeEvidenceLevel(finding.verification)}：${leadingGap.keyword} 当前竞品自然位为 ${leadingGap.competitorOrganicRank}，目标 ASIN 暂无自然位。`;
  }

  if (finding.dimensionId === "review-signal") {
    return `${localizeEvidenceLevel(finding.verification)}：已抓取 ${result.target.negativeReviews.length} 条负评、${result.target.positiveReviews.length} 条正评，说明当前需要把评论信号转成前台证明。`;
  }

  if (finding.dimensionId === "market-position" && primaryCompetitor?.listing) {
    return `${localizeEvidenceLevel(finding.verification)}：目标价格 ${formatCurrency(
      result.target.listing?.price ?? 0
    )}，竞品价格 ${formatCurrency(primaryCompetitor.listing.price)}。`;
  }

  if (evidenceText) {
    return `${localizeEvidenceLevel(finding.verification)}：${evidenceText}`;
  }

  return `${localizeEvidenceLevel(finding.verification)}：当前问题来自 ${localizeDimension(
    finding.dimensionId
  )} 维度的规则诊断。`;
}

function buildOptimizationBullets(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  recommendedTitle: string,
  keywordGroups: string[][]
): ListingDiagnosticsOperatorOptimizationBullet[] {
  const descriptor = inferProductDescriptor(
    result.target.listing,
    primaryCompetitor?.listing ?? null
  );

  return [
    {
      label: "Bullet 1",
      focus: "核心类目 + 主卖点",
      text: buildBulletText(
        descriptor,
        keywordGroups[0],
        "Keep the strongest category signal and the clearest benefit visible in the first bullet so the shopper immediately understands what the product is and why it belongs in the click."
      ),
    },
    {
      label: "Bullet 2",
      focus: "材质/体验",
      text: buildBulletText(
        descriptor,
        keywordGroups[1],
        "Translate features into wear, feel, or handling outcomes. This is where material, comfort, durability, and ease-of-use proof should be stated plainly."
      ),
    },
    {
      label: "Bullet 3",
      focus: "场景覆盖",
      text: buildBulletText(
        descriptor,
        keywordGroups[2],
        "Use this bullet to widen scenario coverage with the most valuable intent phrases so the listing can rank for real use cases instead of only generic category language."
      ),
    },
    {
      label: "Bullet 4",
      focus: "差异化证明",
      text: buildBulletText(
        descriptor,
        keywordGroups[3],
        "Show why this option deserves the click over alternatives by pairing differentiation, style, or functional proof with the exact search language shoppers already use."
      ),
    },
    {
      label: "Bullet 5",
      focus: "预期管理",
      text: buildBulletText(
        descriptor,
        keywordGroups[4],
        "Use the final bullet for size, care, compatibility, or expectation-setting so the listing closes hesitation instead of leaving critical details buried after purchase."
      ),
    },
  ];
}

function buildSearchTermRows(
  keywordRows: ListingDiagnosticsOperatorKeywordRow[],
  recommendedTitle: string,
  currentListingText: string
): ListingDiagnosticsOperatorOptimizationTextRow[] {
  const unusedKeywords = keywordRows
    .map((row) => row.keyword)
    .filter(
      (keyword) =>
        !keywordIsPresent(recommendedTitle, keyword) &&
        !keywordIsPresent(currentListingText, keyword)
    )
    .slice(0, 24);

  const rows: ListingDiagnosticsOperatorOptimizationTextRow[] = [];

  for (let index = 0; index < unusedKeywords.length; index += 4) {
    const chunk = unusedKeywords.slice(index, index + 4);
    rows.push({
      label: `Search Terms ${rows.length + 1}`,
      text: chunk.join(" "),
    });
  }

  return rows.slice(0, 6);
}

function buildAltTextRows(
  recommendedTitle: string,
  keywordGroups: string[][]
): ListingDiagnosticsOperatorOptimizationTextRow[] {
  return keywordGroups.map((group, index) => ({
    label: `Alt Text ${index + 1}`,
    text: buildAltTextLine(recommendedTitle, group),
  }));
}

function buildTitleLogic(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  missingKeywords: string[]
): string {
  const competitorLabel = primaryCompetitor?.asin ?? "竞品";

  if (missingKeywords.length === 0) {
    return `当前标题已经具备基础关键词覆盖，这次优化重点放在词序、主卖点前置和与 ${competitorLabel} 的差异化表达上。`;
  }

  return `标题保留当前 Listing 的核心类目表达，同时优先补齐 ${missingKeywords.join(
    ", "
  )} 这类高价值词，并把真正的卖点放到更靠前的位置，避免像 ${competitorLabel} 那样只做堆词。`;
}

function buildAttributeRecommendations(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null,
  issues: ListingDiagnosticsOperatorIssueRow[]
): string[] {
  const recommendations: string[] = [];
  const targetListing = result.target.listing;

  if (!targetListing?.attributes.brand) {
    recommendations.push("补齐品牌字段，避免标题和属性位之间出现语义断层。");
  }

  if (!readAttribute(targetListing, ["fabricType", "material"])) {
    recommendations.push("补齐 material / fabric 相关属性，别让材质信息只出现在 Bullet 里。");
  }

  if (!readAttribute(targetListing, ["subcategoryLabel", "itemType", "productType"])) {
    recommendations.push("复核子类目和 item type，确认当前类目真的承接高价值流量词。");
  }

  if (primaryCompetitor?.listing) {
    recommendations.push(
      `对照竞品 ${primaryCompetitor.asin} 的类目和属性结构，找出目标 ASIN 当前缺失或表达过弱的属性位。`
    );
  }

  if (issues.some((item) => item.dimension.includes("评论"))) {
    recommendations.push("把评论里反复出现的顾虑同步映射到图片卖点、A+ 模块和 FAQ，形成前后台一致表达。");
  }

  if (!recommendations.length) {
    recommendations.push("当前属性位没有明显硬缺口，重点转向标题、Bullet 和场景词的重排。");
  }

  return recommendations.slice(0, 6);
}

function buildExecutionNotes(
  result: ListingDiagnosticsResult,
  issues: ListingDiagnosticsOperatorIssueRow[]
): string[] {
  const notes: string[] = [];

  if (issues.some((item) => item.evidenceLevel === "Amazon 已验证")) {
    notes.push("先清 Amazon 已验证问题，再做关键词和文案放大，否则流量优化容易白做。");
  }

  if (result.sourceCoverage.some((item) => item.status !== "covered")) {
    notes.push("当前仍有部分数据源覆盖不完整，执行时要把“待验证假设”和“已确认问题”分开推进。");
  }

  notes.push("标题、Bullet、Search Terms、A+ Alt Text 要围绕同一批高价值词，不要各写各的。");
  notes.push("优化完成后至少观察 7-14 天，再结合自然位、CTR、CVR 和新评判断动作是否有效。");

  return notes.slice(0, 5);
}

function buildRecommendedTitle(
  currentTitle: string,
  topKeywords: string[],
  missingKeywords: string[]
): string {
  const cleanTitle = currentTitle.trim();
  const phrases = cleanTitle ? splitTitleIntoPhrases(cleanTitle) : [];
  const output = [...phrases];

  for (const keyword of [...missingKeywords, ...topKeywords]) {
    if (!keyword || output.some((item) => item.toLowerCase() === keyword.toLowerCase())) {
      continue;
    }

    const candidate = [...output, keyword].join(" ").replace(/\s+/g, " ").trim();
    if (candidate.length > TITLE_LIMIT) {
      continue;
    }

    output.push(keyword);
  }

  const title = output.join(" ").replace(/\s+/g, " ").trim();
  return title || currentTitle || topKeywords.slice(0, 6).join(" ");
}

function buildBulletText(
  descriptor: string,
  keywords: string[],
  rationale: string
): string {
  const keywordText = keywords.filter(Boolean).slice(0, 4).join(", ");
  const prefix = descriptor ? `${descriptor}: ` : "";

  if (!keywordText) {
    return `${prefix}${rationale}`;
  }

  return `${prefix}${keywordText}. ${rationale}`;
}

function buildAltTextLine(title: string, keywords: string[]): string {
  const head = title.split(" ").slice(0, 12).join(" ").trim();
  const tail = keywords.filter(Boolean).slice(0, 4).join(" ").trim();
  return [head, tail].filter(Boolean).join(" ").trim();
}

function buildCoverageInsight({
  row,
  targetTitleMark,
  targetBulletsMark,
  optimizedTitleMark,
  optimizedBulletsMark,
}: {
  row: ListingDiagnosticsOperatorKeywordRow;
  targetTitleMark: string;
  targetBulletsMark: string;
  optimizedTitleMark: string;
  optimizedBulletsMark: string;
}): string {
  if (targetTitleMark === "未覆盖" && optimizedTitleMark === "已覆盖") {
    return "建议优先补进优化标题，先抢高权重入口，再观察自然位是否回升。";
  }

  if (targetBulletsMark === "未覆盖" && optimizedBulletsMark === "已覆盖") {
    return "这个词更适合由 Bullet 承接，不一定要硬塞进标题。";
  }

  if (targetTitleMark === "已覆盖" && targetBulletsMark === "已覆盖") {
    return "当前前台已具备基础覆盖，后续重点看排名、点击和转化是否同步改善。";
  }

  return "当前仍需持续验证，避免只看覆盖不看实际竞争位和转化结果。";
}

function summarizeListing(listing: CompetitorListing | null) {
  if (!listing) {
    return null;
  }

  return {
    title: listing.title,
    bulletPoints: listing.bulletPoints,
    price: listing.price,
    rating: listing.rating,
    reviews: listing.reviews,
    monthlySales: listing.monthlySales,
    bsr: listing.bsr,
    attributes: {
      brand: readAttribute(listing, ["brand"]),
      material: readAttribute(listing, ["fabricType", "material"]),
      variationCount: readAttribute(listing, ["variationCount", "variations"]),
      subcategory: readAttribute(listing, ["subcategoryLabel", "itemType", "productType"]),
      video: detectAsset(listing, ["video", "hasVideo", "videoAvailable"]) ? "yes" : "no",
      aPlus: detectAsset(listing, ["aPlus", "aplus", "brandStory", "hasAPlus"])
        ? "yes"
        : "no",
    },
  };
}

function normalizeGapRows(value: unknown): ListingDiagnosticsOperatorGapRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const dimension = normalizeStringValue(item.dimension, { allowEmpty: true });
      if (!dimension) {
        return null;
      }

      return {
        dimension,
        targetStrengths: normalizeTextList(item.targetStrengths, {
          maxItems: 4,
          unique: true,
        }),
        targetWeaknesses: normalizeTextList(item.targetWeaknesses, {
          maxItems: 4,
          unique: true,
        }),
        competitorStrengths: normalizeTextList(item.competitorStrengths, {
          maxItems: 4,
          unique: true,
        }),
        competitorWeaknesses: normalizeTextList(item.competitorWeaknesses, {
          maxItems: 4,
          unique: true,
        }),
      };
    })
    .filter((item): item is ListingDiagnosticsOperatorGapRow => item !== null)
    .slice(0, 8);
}

function normalizeIssueRows(value: unknown): ListingDiagnosticsOperatorIssueRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const title = normalizeStringValue(item.title, { allowEmpty: true });
      if (!title) {
        return null;
      }

      const evidenceLevel = normalizeEvidenceLevelLabel(
        cleanLocalizedText(normalizeStringValue(item.evidenceLevel, { allowEmpty: true }))
      );
      const issueStatus = normalizeIssueStatusLabel(
        cleanLocalizedText(normalizeStringValue(item.issueStatus, { allowEmpty: true })),
        evidenceLevel
      );

      return {
        id:
          normalizeStringValue(item.id, { allowEmpty: true }) || `issue-${index + 1}`,
        title: cleanLocalizedText(title),
        dimension:
          cleanLocalizedText(
            normalizeStringValue(item.dimension, { allowEmpty: true })
          ) || "诊断维度",
        priority: normalizePriorityLabel(
          cleanLocalizedText(normalizeStringValue(item.priority, { allowEmpty: true })),
          evidenceLevel
        ),
        evidenceLevel,
        issueStatus,
        impact:
          cleanLocalizedText(normalizeStringValue(item.impact, { allowEmpty: true })) ||
          "转化",
        symptom: cleanLocalizedText(
          normalizeStringValue(item.symptom, { allowEmpty: true })
        ),
        rootCause: cleanLocalizedText(
          normalizeStringValue(item.rootCause, { allowEmpty: true })
        ),
        recommendation: cleanLocalizedText(normalizeStringValue(item.recommendation, {
          allowEmpty: true,
        })),
        whereToChange: cleanLocalizedText(normalizeStringValue(item.whereToChange, {
          allowEmpty: true,
        })),
        expectedImpact: cleanLocalizedText(normalizeStringValue(item.expectedImpact, {
          allowEmpty: true,
        })),
        evidenceSummary: cleanLocalizedText(normalizeStringValue(item.evidenceSummary, {
          allowEmpty: true,
        })),
        verificationAction: cleanLocalizedText(normalizeStringValue(item.verificationAction, {
          allowEmpty: true,
        })),
      };
    })
    .filter((item): item is ListingDiagnosticsOperatorIssueRow => item !== null)
    .slice(0, MAX_ISSUES);
}

function normalizeOptimizationPlan(
  value: unknown
): ListingDiagnosticsOperatorOptimizationPlan {
  if (!isRecord(value)) {
    return emptyOptimizationPlan();
  }

  return {
    recommendedTitle: normalizeStringValue(value.recommendedTitle, {
      allowEmpty: true,
    }),
    titleLogic: normalizeStringValue(value.titleLogic, { allowEmpty: true }),
    coreKeywords: normalizeTextList(value.coreKeywords, {
      maxItems: 16,
      unique: true,
    }),
    bullets: normalizeOptimizationBullets(value.bullets),
    searchTerms: normalizeTextRows(value.searchTerms, "Search Terms"),
    searchTermStrategy: normalizeStringValue(value.searchTermStrategy, {
      allowEmpty: true,
    }),
    aPlusAltText: normalizeTextRows(value.aPlusAltText, "Alt Text"),
    altTextStrategy: normalizeStringValue(value.altTextStrategy, {
      allowEmpty: true,
    }),
    occasionType: normalizeStringValue(value.occasionType, { allowEmpty: true }),
    attributeRecommendations: normalizeTextList(value.attributeRecommendations, {
      maxItems: 8,
      unique: true,
    }),
    executionNotes: normalizeTextList(value.executionNotes, {
      maxItems: 8,
      unique: true,
    }),
  };
}

function normalizeOptimizationBullets(
  value: unknown
): ListingDiagnosticsOperatorOptimizationBullet[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const text = normalizeStringValue(item.text, { allowEmpty: true });
      if (!text) {
        return null;
      }

      return {
        label:
          normalizeStringValue(item.label, { allowEmpty: true }) ||
          `Bullet ${index + 1}`,
        focus:
          normalizeStringValue(item.focus, { allowEmpty: true }) || "执行重点",
        text,
      };
    })
    .filter(
      (item): item is ListingDiagnosticsOperatorOptimizationBullet => item !== null
    )
    .slice(0, 5);
}

function normalizeTextRows(
  value: unknown,
  prefix: string
): ListingDiagnosticsOperatorOptimizationTextRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const text = normalizeStringValue(item.text, { allowEmpty: true });
      if (!text) {
        return null;
      }

      return {
        label:
          normalizeStringValue(item.label, { allowEmpty: true }) ||
          `${prefix} ${index + 1}`,
        text,
      };
    })
    .filter(
      (item): item is ListingDiagnosticsOperatorOptimizationTextRow => item !== null
    )
    .slice(0, 8);
}

function normalizeRoadmap(value: unknown): ListingDiagnosticsOperatorRoadmapRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const action = normalizeStringValue(item.action, { allowEmpty: true });
      if (!action) {
        return null;
      }

      return {
        priority: normalizePriorityLabel(
          cleanLocalizedText(normalizeStringValue(item.priority, { allowEmpty: true })),
          ""
        ),
        action,
        expectedEffect: normalizeStringValue(item.expectedEffect, {
          allowEmpty: true,
        }),
        timeline:
          normalizeStringValue(item.timeline, { allowEmpty: true }) || "Day 1-7",
        verification: normalizeStringValue(item.verification, {
          allowEmpty: true,
        }),
        owner:
          normalizeStringValue(item.owner, { allowEmpty: true }) || "Listing 运营",
      };
    })
    .filter((item): item is ListingDiagnosticsOperatorRoadmapRow => item !== null)
    .slice(0, 14);
}

function normalizeEvidenceLevelLabel(value: string): string {
  const text = value.trim();

  if (!text) {
    return "直接证据";
  }

  if (/amazon|已验证|verified/i.test(text)) {
    return "Amazon 已验证";
  }

  if (/待验证|假设|推断|方向|inferred/i.test(text)) {
    return "待验证假设";
  }

  if (/直接|直证|direct/i.test(text)) {
    return "直接证据";
  }

  return "直接证据";
}

function normalizeIssueStatusLabel(issueStatus: string, evidenceLevel: string): string {
  const text = issueStatus.trim();
  const normalizedEvidence = normalizeEvidenceLevelLabel(evidenceLevel);

  if (/待验证|假设|推断|方向|inferred/i.test(text)) {
    return "待验证假设";
  }

  if (/已确认|确认|已核实|confirmed|verified|direct/i.test(text)) {
    return normalizedEvidence === "待验证假设" ? "待验证假设" : "已确认问题";
  }

  return normalizedEvidence === "待验证假设" ? "待验证假设" : "已确认问题";
}

function normalizePriorityLabel(priority: string, evidenceLevel: string): string {
  const text = priority.trim().toUpperCase();
  const normalizedEvidence = normalizeEvidenceLevelLabel(evidenceLevel);

  if (text.startsWith("P0")) {
    return normalizedEvidence === "待验证假设" ? "P1-本周执行" : "P0-立即处理";
  }

  if (text.startsWith("P2")) {
    return "P2-两周内优化";
  }

  return "P1-本周执行";
}

function mergeGapRows(
  aiRows: ListingDiagnosticsOperatorGapRow[],
  fallbackRows: ListingDiagnosticsOperatorGapRow[]
): ListingDiagnosticsOperatorGapRow[] {
  const aiByDimension = new Map(aiRows.map((row) => [row.dimension, row]));

  return fallbackRows.map((fallbackRow) => {
    const aiRow = aiByDimension.get(fallbackRow.dimension);
    if (!aiRow) {
      return fallbackRow;
    }

    return {
      dimension: aiRow.dimension || fallbackRow.dimension,
      targetStrengths: aiRow.targetStrengths.length
        ? aiRow.targetStrengths
        : fallbackRow.targetStrengths,
      targetWeaknesses: aiRow.targetWeaknesses.length
        ? aiRow.targetWeaknesses
        : fallbackRow.targetWeaknesses,
      competitorStrengths: aiRow.competitorStrengths.length
        ? aiRow.competitorStrengths
        : fallbackRow.competitorStrengths,
      competitorWeaknesses: aiRow.competitorWeaknesses.length
        ? aiRow.competitorWeaknesses
        : fallbackRow.competitorWeaknesses,
    };
  });
}

function mergeIssueRows(
  aiRows: ListingDiagnosticsOperatorIssueRow[],
  fallbackRows: ListingDiagnosticsOperatorIssueRow[]
): ListingDiagnosticsOperatorIssueRow[] {
  const merged: ListingDiagnosticsOperatorIssueRow[] = [];
  const seen = new Set<string>();
  const total = Math.max(aiRows.length, fallbackRows.length);

  for (let index = 0; index < total; index += 1) {
    const candidate = mergeIssueRow(aiRows[index], fallbackRows[index]);
    if (!candidate) {
      continue;
    }

    const dedupeKey = `${candidate.dimension}|${candidate.title}|${candidate.recommendation}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    merged.push(candidate);

    if (merged.length >= MAX_ISSUES) {
      break;
    }
  }

  return merged.length ? merged : fallbackRows.slice(0, MAX_ISSUES);
}

function mergeIssueRow(
  aiRow: ListingDiagnosticsOperatorIssueRow | undefined,
  fallbackRow: ListingDiagnosticsOperatorIssueRow | undefined
): ListingDiagnosticsOperatorIssueRow | null {
  if (!aiRow && !fallbackRow) {
    return null;
  }

  const base = fallbackRow ?? aiRow!;
  const draft = aiRow ?? fallbackRow!;
  const evidenceLevel = normalizeEvidenceLevelLabel(draft.evidenceLevel || base.evidenceLevel);

  return {
    id: draft.id || base.id,
    title: draft.title || base.title,
    dimension: draft.dimension || base.dimension,
    priority: normalizePriorityLabel(draft.priority || base.priority, evidenceLevel),
    evidenceLevel,
    issueStatus: normalizeIssueStatusLabel(draft.issueStatus || base.issueStatus, evidenceLevel),
    impact: draft.impact || base.impact,
    symptom: draft.symptom || base.symptom,
    rootCause: draft.rootCause || base.rootCause,
    recommendation: draft.recommendation || base.recommendation,
    whereToChange: draft.whereToChange || base.whereToChange,
    expectedImpact: draft.expectedImpact || base.expectedImpact,
    evidenceSummary: draft.evidenceSummary || base.evidenceSummary,
    verificationAction: draft.verificationAction || base.verificationAction,
  };
}

function mergeOptimizationPlan(
  aiPlan: ListingDiagnosticsOperatorOptimizationPlan,
  fallbackPlan: ListingDiagnosticsOperatorOptimizationPlan
): ListingDiagnosticsOperatorOptimizationPlan {
  return {
    recommendedTitle: aiPlan.recommendedTitle || fallbackPlan.recommendedTitle,
    titleLogic: aiPlan.titleLogic || fallbackPlan.titleLogic,
    coreKeywords: mergeTextList(aiPlan.coreKeywords, fallbackPlan.coreKeywords, 16),
    bullets: mergeOptimizationBullets(aiPlan.bullets, fallbackPlan.bullets, 5),
    searchTerms: mergeTextRows(aiPlan.searchTerms, fallbackPlan.searchTerms, 8),
    searchTermStrategy: aiPlan.searchTermStrategy || fallbackPlan.searchTermStrategy,
    aPlusAltText: mergeTextRows(aiPlan.aPlusAltText, fallbackPlan.aPlusAltText, 8),
    altTextStrategy: aiPlan.altTextStrategy || fallbackPlan.altTextStrategy,
    occasionType: aiPlan.occasionType || fallbackPlan.occasionType,
    attributeRecommendations: mergeTextList(
      aiPlan.attributeRecommendations,
      fallbackPlan.attributeRecommendations,
      8
    ),
    executionNotes: mergeTextList(aiPlan.executionNotes, fallbackPlan.executionNotes, 8),
  };
}

function mergeOptimizationBullets(
  aiRows: ListingDiagnosticsOperatorOptimizationBullet[],
  fallbackRows: ListingDiagnosticsOperatorOptimizationBullet[],
  limit: number
): ListingDiagnosticsOperatorOptimizationBullet[] {
  const rows: ListingDiagnosticsOperatorOptimizationBullet[] = [];
  const total = Math.max(aiRows.length, fallbackRows.length, limit);

  for (let index = 0; index < total; index += 1) {
    const aiRow = aiRows[index];
    const fallbackRow = fallbackRows[index];
    if (!aiRow && !fallbackRow) {
      continue;
    }

    rows.push({
      label: aiRow?.label || fallbackRow?.label || `Bullet ${index + 1}`,
      focus: aiRow?.focus || fallbackRow?.focus || "执行重点",
      text: aiRow?.text || fallbackRow?.text || "",
    });
  }

  return rows.filter((row) => row.text).slice(0, limit);
}

function mergeTextRows(
  aiRows: ListingDiagnosticsOperatorOptimizationTextRow[],
  fallbackRows: ListingDiagnosticsOperatorOptimizationTextRow[],
  limit: number
): ListingDiagnosticsOperatorOptimizationTextRow[] {
  const rows: ListingDiagnosticsOperatorOptimizationTextRow[] = [];
  const total = Math.max(aiRows.length, fallbackRows.length, limit);

  for (let index = 0; index < total; index += 1) {
    const aiRow = aiRows[index];
    const fallbackRow = fallbackRows[index];
    if (!aiRow && !fallbackRow) {
      continue;
    }

    rows.push({
      label: aiRow?.label || fallbackRow?.label || `Row ${index + 1}`,
      text: aiRow?.text || fallbackRow?.text || "",
    });
  }

  return rows.filter((row) => row.text).slice(0, limit);
}

function mergeTextList(primary: string[], fallback: string[], limit: number): string[] {
  return Array.from(new Set([...primary, ...fallback].map((item) => item.trim()).filter(Boolean))).slice(
    0,
    limit
  );
}

function mergeRoadmapRows(
  aiRows: ListingDiagnosticsOperatorRoadmapRow[],
  fallbackRows: ListingDiagnosticsOperatorRoadmapRow[],
  _issues: ListingDiagnosticsOperatorIssueRow[],
  _optimizationPlan: ListingDiagnosticsOperatorOptimizationPlan,
  _keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): ListingDiagnosticsOperatorRoadmapRow[] {
  const merged: ListingDiagnosticsOperatorRoadmapRow[] = [];
  const seen = new Set<string>();
  const baseRows = [...aiRows, ...fallbackRows];

  for (const row of baseRows) {
    const dedupeKey = `${row.priority}|${row.action}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    merged.push({
      priority: normalizePriorityLabel(row.priority, ""),
      action: row.action,
      expectedEffect: row.expectedEffect,
      timeline: row.timeline || "Day 1-7",
      verification: row.verification,
      owner: row.owner || "Listing 运营",
    });

    if (merged.length >= 14) {
      break;
    }
  }

  return merged;
}

function hasUsableOptimizationPlan(
  value: ListingDiagnosticsOperatorOptimizationPlan | undefined
): value is ListingDiagnosticsOperatorOptimizationPlan {
  return Boolean(
    value &&
      (value.recommendedTitle ||
        value.bullets.length ||
        value.searchTerms.length ||
        value.aPlusAltText.length)
  );
}

function emptyOptimizationPlan(): ListingDiagnosticsOperatorOptimizationPlan {
  return {
    recommendedTitle: "",
    titleLogic: "",
    coreKeywords: [],
    bullets: [],
    searchTerms: [],
    searchTermStrategy: "",
    aPlusAltText: [],
    altTextStrategy: "",
    occasionType: "",
    attributeRecommendations: [],
    executionNotes: [],
  };
}

function summarizeTitle(listing: CompetitorListing | null): string {
  const title = listing?.title?.trim();
  if (!title) {
    return UNKNOWN_LABEL;
  }

  return title.length > 110 ? `${title.slice(0, 107)}...` : title;
}

function buildTitleComparison(
  target: CompetitorListing | null,
  competitor: CompetitorListing | null
): string {
  const targetTitle = target?.title?.trim() ?? "";
  const competitorTitle = competitor?.title?.trim() ?? "";

  if (!targetTitle && !competitorTitle) {
    return "当前缺少标题样本，需先补齐 Listing 快照。";
  }

  if (!targetTitle) {
    return "目标 ASIN 连基础标题都不完整，必须先补齐前台入口。";
  }

  if (!competitorTitle) {
    return "竞品标题样本不足，当前更适合先围绕目标 ASIN 本身把词序和卖点结构理顺。";
  }

  const targetLength = targetTitle.length;
  const competitorLength = competitorTitle.length;

  if (targetLength + 18 < competitorLength) {
    return "目标标题明显更短，常见结果是高价值词和场景词放不进去，高权重入口容易偏薄。";
  }

  if (targetLength > TITLE_LIMIT) {
    return "目标标题偏长，容易把真正重要的类目词和主卖点挤到低权重位置。";
  }

  return "两边标题长度差异不算极端，真正拉开差距的更可能是词序、前置卖点和场景词承接。";
}

function buildBrandComparison(
  target: CompetitorListing | null,
  competitor: CompetitorListing | null
): string {
  const targetBrand = readAttribute(target, ["brand"]);
  const competitorBrand = readAttribute(competitor, ["brand"]);

  if (!targetBrand || !competitorBrand) {
    return "品牌字段不完整，当前更适合把它当成辅助判断，而不是核心结论。";
  }

  if (targetBrand === competitorBrand) {
    return "品牌相同时，竞争重点更偏向关键词承接与前台说服力。";
  }

  return "品牌不同意味着搜索认知和用户预期也不同，标题与卖点表达要更强调自己的定位。";
}

function buildBulletComparison(
  target: CompetitorListing | null,
  competitor: CompetitorListing | null
): string {
  const targetCount = target?.bulletPoints.filter(Boolean).length ?? 0;
  const competitorCount = competitor?.bulletPoints.filter(Boolean).length ?? 0;

  if (targetCount < 5 && competitorCount >= 5) {
    return "竞品已经把五点位用满，而目标 ASIN 仍有可补充空间，说明前台承接还没跑满。";
  }

  if (targetCount >= 5 && competitorCount >= 5) {
    return "双方信息位数量都够用，核心不在“有没有写满”，而在“主卖点和高价值词写在什么顺序”。";
  }

  return "当前 Bullet 样本偏少，建议先把信息位补满，再判断表达强弱。";
}

function buildPriceComparison(
  target: CompetitorListing | null,
  competitor: CompetitorListing | null
): string {
  const targetPrice = target?.price ?? 0;
  const competitorPrice = competitor?.price ?? 0;

  if (!targetPrice || !competitorPrice) {
    return "价格数据不完整，当前只能把价格带作为参考，不宜单独下结论。";
  }

  if (targetPrice > competitorPrice * 1.08) {
    return "目标 ASIN 价格高于对标竞品，但前台说服力未必同步更强，容易在详情页被比价。";
  }

  if (targetPrice < competitorPrice * 0.92) {
    return "目标 ASIN 当前价格更低，可以利用这个位差，但不能只靠低价，应同步补足主卖点和证明。";
  }

  return "价格带比较接近，最终胜负更取决于标题入口、主图点击和详情页证明。";
}

function buildSubcategoryComparison(
  targetSubcategory: string,
  competitorSubcategory: string
): string {
  if (targetSubcategory === UNKNOWN_LABEL || competitorSubcategory === UNKNOWN_LABEL) {
    return "子类目数据不完整，但它往往会直接影响流量精准度和类目竞争位。";
  }

  if (targetSubcategory === competitorSubcategory) {
    return "双方子类目定位接近，后续重点是把同类流量入口和转化承接做得更精准。";
  }

  return "子类目不同通常意味着需求场景不同，后续要重点检查目标 ASIN 是否真的放在最适合承接高价值词的位置。";
}

function buildReviewComparison(
  target: CompetitorListing | null,
  competitor: CompetitorListing | null
): string {
  if (!target?.rating || !competitor?.rating) {
    return "评分和评论量样本不完整，建议把评论沉淀当作转化风险参考，而不是绝对结论。";
  }

  if (target.rating + 0.15 < competitor.rating) {
    return "目标 ASIN 的评分沉淀偏弱，详情页必须补更多解释与证明，否则更容易被竞品截流。";
  }

  if (target.reviews + 80 < competitor.reviews) {
    return "竞品评论沉淀更厚，目标 ASIN 需要通过更强的前台表达去弥补社会证明不足。";
  }

  return "评分和评论量差距不是不可追，但前台卖点和场景表达必须更克制、更精准。";
}

function buildSalesComparison(
  target: CompetitorListing | null,
  competitor: CompetitorListing | null
): string {
  const targetSales = target?.monthlySales ?? 0;
  const competitorSales = competitor?.monthlySales ?? 0;

  if (!targetSales || !competitorSales) {
    return "月销量数据不完整，当前更适合作为竞争位参考，而不是最终归因。";
  }

  if (targetSales < competitorSales * 0.7) {
    return "竞品销量明显更高，说明它在流量入口和转化承接至少有一环更强。";
  }

  if (targetSales > competitorSales * 1.2) {
    return "目标 ASIN 当前销量不弱，说明仍有放大的基础，更要避免在标题和详情页上浪费优势。";
  }

  return "销量差距不算极端，优化重点仍应回到关键词入口和前台说服力。";
}

function buildBsrComparison(
  target: CompetitorListing | null,
  competitor: CompetitorListing | null
): string {
  const targetBsr = target?.bsr ?? 0;
  const competitorBsr = competitor?.bsr ?? 0;

  if (!targetBsr || !competitorBsr) {
    return "BSR 样本不完整，可作为背景信号参考。";
  }

  if (targetBsr > competitorBsr) {
    return "竞品当前类目排序更强，目标 ASIN 需要先补足高价值词入口和转化证明。";
  }

  return "目标 ASIN 的类目排序并非全面落后，说明仍有可追空间。";
}

function buildVariationComparison(targetCount: number, competitorCount: number): string {
  if (!targetCount || !competitorCount) {
    return "变体数不完整，但过多变体通常会稀释流量权重，过少又可能不够承接需求。";
  }

  if (targetCount > competitorCount * 1.5) {
    return "目标 ASIN 变体明显更多，后续要警惕主力 child 流量被分散。";
  }

  if (competitorCount > targetCount * 1.5) {
    return "竞品变体更丰富，说明它在颜色、尺码或场景承接上可能更完整。";
  }

  return "变体规模差距不算极端，后续重点仍是主力 child 的关键词和转化表现。";
}

function buildLqsComparison(
  targetLqs: string | undefined,
  competitorLqs: string | undefined
): string {
  if (!targetLqs || !competitorLqs) {
    return "LQS 只能作辅助参考，真正要看的是高价值词入口和前台转化链路。";
  }

  if (targetLqs === competitorLqs) {
    return "即使 LQS 接近，也不代表关键词入口和详情页承接一样强。";
  }

  return "LQS 有差异时可以用来判断基础完整度，但不能替代关键词和转化诊断。";
}

function buildKeywordInventoryComparison(
  result: ListingDiagnosticsResult,
  primaryCompetitor: ListingDiagnosticsEntitySnapshot | null
): string {
  const targetCount = result.target.keywords.length;
  const competitorCount = primaryCompetitor?.keywords.length ?? 0;

  if (targetCount + 8 < competitorCount) {
    return "竞品 traffic keyword 样本更丰富，目标 ASIN 的自然入口还偏薄。";
  }

  if (targetCount > competitorCount + 8) {
    return "目标 ASIN 并不缺词，问题更可能出在高价值词没有进到高权重位置。";
  }

  return "词量差距不是最核心矛盾，后续更要看哪些词真正拿到了自然位。";
}

function buildOrganicComparison(targetCount: number, competitorCount: number): string {
  if (targetCount + 3 < competitorCount) {
    return "竞品在 Top30 自然位上的稳定词更多，说明它的前台相关性闭环更完整。";
  }

  if (targetCount > competitorCount + 3) {
    return "目标 ASIN 已经有一定自然位基础，后续重点是放大高价值词，而不是盲目扩词。";
  }

  return "双方自然位样本接近，真正要拉开差距的是词序、卖点顺序和详情页证明。";
}

function buildAssetComparison(
  target: CompetitorListing | null,
  competitor: CompetitorListing | null
): string {
  const targetAssets = buildAssetBlock(target);
  const competitorAssets = buildAssetBlock(competitor);

  if (targetAssets === competitorAssets) {
    return "双方内容资产表面上接近，真正差距更可能落在每个信息位承接了什么卖点。";
  }

  return "内容资产结构存在差异，说明除了改词，还要同步看图片、A+ 和变体承接是否到位。";
}

function buildAssetSlotComparison(
  targetHas: boolean,
  competitorHas: boolean,
  label: string
): string {
  if (targetHas && competitorHas) {
    return `双方都有${label}，真正差距更可能落在内容质量和卖点承接，而不是有没有这个模块。`;
  }

  if (!targetHas && competitorHas) {
    return `竞品已有${label}而目标 ASIN 没有，这会削弱点击后的说服力，建议尽快补齐。`;
  }

  if (targetHas && !competitorHas) {
    return `目标 ASIN 已有${label}，可以继续把它当成差异化承接位放大。`;
  }

  return `${label} 当前双方都不占优，重点仍要先把标题、Bullet 和主图卖点打透。`;
}

function buildFulfillmentComparison(target: string, competitor: string): string {
  if (target === UNKNOWN_LABEL || competitor === UNKNOWN_LABEL) {
    return "发货方式字段不完整，但这通常会直接影响可售性、时效预期和 Buy Box 稳定性。";
  }

  if (target === competitor) {
    return "双方发货方式一致时，竞争重点仍会回到关键词入口、价格位和详情页承接。";
  }

  return "发货方式不同会直接影响可售性与用户预期，后续不要只盯文案，要把履约差异一起考虑。";
}

function buildRatingBlock(listing: CompetitorListing | null): string {
  if (!listing?.rating) {
    return UNKNOWN_LABEL;
  }

  return `${listing.rating.toFixed(1)} / ${formatWhole(listing.reviews)}条评论`;
}

function buildAssetBlock(listing: CompetitorListing | null): string {
  if (!listing) {
    return UNKNOWN_LABEL;
  }

  const assets: string[] = [];

  if (detectAsset(listing, ["video", "hasVideo", "videoAvailable"])) {
    assets.push("视频");
  }

  if (detectAsset(listing, ["aPlus", "aplus", "brandStory", "hasAPlus"])) {
    assets.push("A+");
  }

  const variationCount = parseInteger(
    readAttribute(listing, ["variationCount", "variations", "variation"])
  );
  if (variationCount > 0) {
    assets.push(`变体 ${variationCount}`);
  }

  return assets.length ? assets.join(" / ") : "基础图片";
}

function buildSubcategoryLabel(listing: CompetitorListing | null): string {
  if (!listing) {
    return UNKNOWN_LABEL;
  }

  const label = readAttribute(listing, [
    "subcategoryLabel",
    "subcategory",
    "itemType",
    "productType",
  ]);
  const rank = parseInteger(
    readAttribute(listing, ["subcategoryRank", "categoryRank", "rank"])
  );

  if (!label) {
    return UNKNOWN_LABEL;
  }

  return rank > 0 ? `${label} #${rank}` : label;
}

function buildFulfillmentLabel(listing: CompetitorListing | null): string {
  const value = readAttribute(listing, ["fulfillment", "ship", "fba", "fbm"]);
  if (!value) {
    return UNKNOWN_LABEL;
  }

  if (/fba/i.test(value)) {
    return "FBA";
  }

  if (/fbm|merchant/i.test(value)) {
    return "FBM";
  }

  return value;
}

function buildKeywordPresenceStrengths(
  title: string,
  keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): string[] {
  const covered = keywordRows
    .map((row) => row.keyword)
    .filter((keyword) => keywordIsPresent(title, keyword))
    .slice(0, 3);

  if (!covered.length) {
    return [];
  }

  return [`标题已覆盖：${covered.join(", ")}。`];
}

function inferProductDescriptor(
  target: CompetitorListing | null,
  competitor: CompetitorListing | null
): string {
  const source = target?.title || competitor?.title || "";
  if (!source) {
    return "";
  }

  const clean = source
    .replace(/[|,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = clean.split(" ").filter(Boolean).slice(0, 8);
  return parts.slice(0, 5).join(" ");
}

function splitTitleIntoPhrases(title: string): string[] {
  const pieces = title
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (pieces.length > 0) {
    return pieces;
  }

  return title.split(/\s+/).filter(Boolean);
}

function groupKeywordsForBullets(
  keywordRows: ListingDiagnosticsOperatorKeywordRow[]
): string[][] {
  const keywords = keywordRows.map((row) => row.keyword);

  return [
    keywords.slice(0, 4),
    keywords.slice(4, 8),
    keywords.slice(8, 12),
    keywords.slice(12, 16),
    keywords.slice(16, 20),
  ];
}

function buildKeywordDiagnosis(
  keyword: string,
  targetKeyword: TrafficKeyword | undefined,
  competitorKeyword: TrafficKeyword | undefined,
  competitorLabel = "竞品池",
  competitorCoverageCount = 0
): string {
  const targetOrganic = targetKeyword?.organicRank ?? 0;
  const competitorOrganic = competitorKeyword?.organicRank ?? 0;
  const targetSponsored = targetKeyword?.sponsoredRank ?? null;

  if (!targetOrganic && competitorOrganic && competitorOrganic <= 20) {
    return `${competitorLabel} 已经靠 ${keyword} 抢到前排自然位，目标 ASIN 还没有稳定入口，建议优先补标题和前两条 Bullet。`;
  }

  if (!targetOrganic && targetSponsored) {
    return `当前 ${keyword} 更像靠广告补量，自然位还没有形成稳定承接。`;
  }

  if (targetOrganic && competitorOrganic && targetOrganic - competitorOrganic >= 20) {
    return `目标 ASIN 对 ${keyword} 已有覆盖，但自然位明显落后于竞品，需要同步补相关性和转化证明。`;
  }

  if (targetOrganic && (!competitorOrganic || targetOrganic < competitorOrganic)) {
    return `目标 ASIN 在 ${keyword} 上已有一定自然位，可作为后续保量和放大的优先词。`;
  }

  if (competitorCoverageCount > 1 && competitorOrganic) {
    return `${keyword} 已被多个竞品共同覆盖，当前更适合把它放进持续监控和广告采词队列。`;
  }

  return `这是一个需要持续观察的关键词，重点看标题、Bullet 和 Search Terms 是否在同一方向上承接它。`;
}

function buildVerificationAction(finding: ListingDiagnosticsFinding): string {
  if (finding.verification === "verified") {
    return "先在 Seller Central / SP-API 页面确认状态恢复，再复跑诊断和业务指标。";
  }

  switch (finding.dimensionId) {
    case "keyword-opportunity":
      return "优化后 7-14 天复查 SellerSprite 自然位、广告依赖度和高价值词覆盖。";
    case "review-signal":
      return "优化后继续观察新评内容、退货/差评趋势和 PDP 转化变化。";
    case "market-position":
      return "配合价格测试和优惠节奏一起看 CTR、CVR 和销量，不要只看单点销量。";
    default:
      return "动作执行后重新跑诊断，确认优先级和风险等级是否下降。";
  }
}

function buildSceneComparison(targetScenes: string[], competitorScenes: string[]): string {
  if (targetScenes.length === 0 && competitorScenes.length > 0) {
    return "竞品已经把更多高转化场景词做进前台，目标 ASIN 需要尽快补场景承接。";
  }

  if (targetScenes.length > competitorScenes.length + 1) {
    return "目标 ASIN 场景词并不少，重点是把最值钱的场景词放到更靠前的位置。";
  }

  return "场景覆盖差异不算极端，后续重点看哪些场景词真正带来排名和转化。";
}

function readAttribute(
  listing: CompetitorListing | null,
  keys: string[]
): string | undefined {
  if (!listing) {
    return undefined;
  }

  for (const [key, value] of Object.entries(listing.attributes)) {
    if (!value?.trim()) {
      continue;
    }

    const normalizedKey = key.trim().toLowerCase();
    if (keys.some((candidate) => normalizedKey.includes(candidate.toLowerCase()))) {
      return value.trim();
    }
  }

  return undefined;
}

function detectAsset(listing: CompetitorListing | null, keys: string[]): boolean {
  const value = readAttribute(listing, keys);
  if (!value) {
    return false;
  }

  return /^(yes|y|true|1|available|有)$/i.test(value);
}

function findKeyword(
  keywords: TrafficKeyword[],
  keyword: string
): TrafficKeyword | undefined {
  const normalized = normalizeKeyword(keyword);
  return keywords.find((item) => normalizeKeyword(item.keyword) === normalized);
}

function inferScenes(snapshot: ListingDiagnosticsEntitySnapshot): string[] {
  const haystack = `${buildListingText(snapshot.listing)} ${snapshot.keywords
    .map((item) => item.keyword)
    .join(" ")}`.toLowerCase();

  return SCENE_KEYWORDS.filter((keyword) => haystack.includes(keyword))
    .map((keyword) => toTitleCase(keyword))
    .slice(0, 6);
}

function inferOccasionType(snapshot: ListingDiagnosticsEntitySnapshot): string {
  const scenes = inferScenes(snapshot);
  return scenes.length ? scenes.join(", ") : "General Use";
}

function countTopOrganicKeywords(keywords: TrafficKeyword[], limit: number): number {
  return keywords.filter((item) => item.organicRank > 0 && item.organicRank <= limit).length;
}

function localizeDimension(dimensionId: string): string {
  return formatDimensionLabel(dimensionId);
}

function localizeImpact(impactType: ListingDiagnosticsFinding["impactType"]): string {
  return formatImpactType(impactType);
}

function localizeRootCause(
  category: ListingDiagnosticsFinding["rootCauseCategory"]
): string {
  return category ? formatRootCauseCategory(category) : UNKNOWN_LABEL;
}

function localizePriority(
  priority: ListingDiagnosticsFinding["priority"],
  verification: ListingDiagnosticsFinding["verification"]
): string {
  if (priority === "P0" && verification === "inferred") {
    return "P1-本周执行";
  }

  switch (priority) {
    case "P0":
      return "P0-立即处理";
    case "P1":
      return "P1-本周执行";
    case "P2":
    default:
      return "P2-两周内优化";
  }
}

function localizeEvidenceLevel(
  verification: ListingDiagnosticsFinding["verification"]
): string {
  switch (verification) {
    case "verified":
      return "Amazon 已验证";
    case "direct":
      return "直接证据";
    case "inferred":
    default:
      return "待验证假设";
  }
}

function localizeWhereToChange(
  where: string,
  dimensionId: string,
  rootCauseCategory: ListingDiagnosticsFinding["rootCauseCategory"] = null
): string {
  const normalized = where.toLowerCase();

  if (dimensionId === "listing-health") {
    if (rootCauseCategory === "variation-issues") {
      return "Seller Central > 变体结构 / Listing Health";
    }

    if (rootCauseCategory === "missing-attributes") {
      return "Seller Central > 属性完整度 / Listing Health";
    }

    return "Seller Central > Listing Health / 目录状态";
  }

  if (normalized.includes("title")) {
    return "Seller Central > 标题";
  }

  if (normalized.includes("bullet")) {
    return "Seller Central > Bullet";
  }

  if (normalized.includes("image") || normalized.includes("gallery")) {
    return "主图 / 副图 / 图片文案";
  }

  if (normalized.includes("a+")) {
    return "A+ / Brand Story";
  }

  if (normalized.includes("search")) {
    return "Search Terms / 后台关键词";
  }

  if (normalized.includes("pricing") || normalized.includes("price")) {
    return "Pricing / 优惠 / 价格带";
  }

  if (normalized.includes("variation")) {
    return "变体结构";
  }

  if (normalized.includes("seller central")) {
    return "Seller Central 对应配置页";
  }

  switch (dimensionId) {
    case "keyword-opportunity":
      return "标题 / Bullet / Search Terms";
    case "content-coverage":
      return "标题 / Bullet / 图片 / A+";
    case "review-signal":
      return "Bullet / 图片 / A+ / FAQ";
    case "market-position":
      return "价格 / 优惠 / 主图卖点";
    case "listing-health":
      return "Seller Central / Listing 健康度";
    default:
      return where || "对应 Listing 配置页";
  }
}

function recommendOwner(whereToChange: string): string {
  const normalized = whereToChange.toLowerCase();

  if (normalized.includes("价格") || normalized.includes("pricing")) {
    return "运营 / 广告";
  }

  if (normalized.includes("图片") || normalized.includes("a+")) {
    return "设计 / A+";
  }

  if (normalized.includes("seller central")) {
    return "运营";
  }

  if (normalized.includes("search terms") || normalized.includes("标题")) {
    return "Listing 运营";
  }

  return "Listing 运营";
}

function priorityToTimeline(priority: string, index: number): string {
  if (priority.startsWith("P0")) {
    return "Day 1";
  }

  if (priority.startsWith("P1")) {
    return index < 2 ? "Day 1-3" : "Day 3-7";
  }

  return index < 4 ? "Day 7-14" : "Day 14-30";
}

function localizeCoverageLabel(id: string): string {
  switch (id) {
    case "target-listing":
      return "目标 Listing";
    case "target-negative-reviews":
      return "目标差评";
    case "target-positive-reviews":
      return "目标好评";
    case "target-keywords":
      return "目标关键词";
    case "competitor-listings":
      return "竞品 Listing";
    case "competitor-reviews":
      return "竞品评论";
    case "competitor-keywords":
      return "竞品关键词";
    case "derived-benchmark":
      return "竞品基准模型";
    case "sp-api-catalog":
      return "SP-API 目录验证";
    case "sp-api-account-listing":
      return "SP-API 账号 Listing 验证";
    case "sp-api-account-restrictions":
      return "SP-API 限制验证";
    default:
      return id;
  }
}

function toCoverageMark(text: string, keyword: string): string {
  if (!text.trim()) {
    return "未采集";
  }

  return keywordIsPresent(text, keyword) ? "已覆盖" : "未覆盖";
}

function rankValue(value: string): number {
  const match = value.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
}

function verificationRank(verification: ListingDiagnosticsFinding["verification"]): number {
  switch (verification) {
    case "verified":
      return 0;
    case "direct":
      return 1;
    case "inferred":
    default:
      return 2;
  }
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseInteger(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRank(value: number): string {
  if (!value || Number.isNaN(value)) {
    return "-";
  }

  return `#${value}`;
}

function formatSponsoredRank(value: number | null): string {
  if (!value || Number.isNaN(value)) {
    return "-";
  }

  return `AD #${value}`;
}

function formatCurrency(value: number): string {
  if (!value || Number.isNaN(value)) {
    return UNKNOWN_LABEL;
  }

  return `$${value.toFixed(2)}`;
}

function formatWhole(value: number): string {
  if (!value || Number.isNaN(value)) {
    return UNKNOWN_LABEL;
  }

  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatBsr(value: number): string {
  if (!value || Number.isNaN(value)) {
    return UNKNOWN_LABEL;
  }

  return `#${new Intl.NumberFormat("en-US").format(Math.round(value))}`;
}

function formatPercent(value: number): string {
  if (!value || Number.isNaN(value)) {
    return "0.00%";
  }

  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(2)}%`;
}

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}
