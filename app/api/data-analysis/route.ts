import {
  RouteError,
  getRetryPromptSuffix,
  isRecord,
  logRouteError,
  normalizeStringValue,
  normalizeTextList,
  readAiRuntimeConfig,
  readJsonBody,
  requestAiTextCompletion,
  requestAiVisionCompletion,
  requestStructuredJson,
  resolveAiConfig,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import { getListingDefaultModel } from "@/lib/listing-ai-runtime";
import {
  enrichDataAnalysisResult,
} from "@/lib/listing-opportunity";
import { selectTrafficKeywords } from "@/lib/traffic-keyword-helpers";
import type {
  AbaReportFile,
  DataAnalysisResult,
  KeywordAllocationItem,
  KeywordCampaignPlan,
  KeywordStrategy,
  OpportunityAssessment,
  OpportunityBreakdownItem,
  ProductProfile,
  RufusIntentItem,
  RufusIntentLayer,
  RufusScreenshot,
  ScreenshotMediaType,
  TrafficKeyword,
  CompetitorListing,
} from "@/lib/types";

const DATA_ANALYSIS_SYSTEM_PROMPT = [
  "You analyze Amazon listing inputs for an internal operator workflow.",
  "Return exactly one valid JSON object.",
  "Do not use markdown code fences.",
  "Do not add explanations before or after the JSON.",
].join(" ");

interface DataAnalysisRequestPayload {
  targetMarket: string;
  productProfile: ProductProfile;
  coreSellingPoints: string;
  competitorAsins: string[];
  listings: CompetitorListing[];
  trafficKeywords: Record<string, TrafficKeyword[]>;
  abaReport: AbaReportFile | null;
  rufusScreenshots: RufusScreenshot[];
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const runtimeConfig = readAiRuntimeConfig(body, request);
    const payload = validateRequest(body);
    const config = resolveAiConfig({
      runtimeConfig,
      defaultModel: getListingDefaultModel("vocAnalysis"),
    });

    const partialResult = await requestStructuredJson<DataAnalysisResult>({
      operationName: "multi-source data analysis",
      requestText: (attempt) => {
        const prompt = buildPrompt(payload, attempt);

        if (payload.rufusScreenshots.length > 0) {
          return requestAiVisionCompletion({
            config,
            operationName: "multi-source data analysis",
            systemPrompt: DATA_ANALYSIS_SYSTEM_PROMPT,
            userPrompt: prompt,
            images: payload.rufusScreenshots.map((item) => ({
              data: item.preview.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ""),
              mediaType: item.mediaType,
            })),
            maxTokens: 4000,
            temperature: 0,
          });
        }

        return requestAiTextCompletion({
          config,
          operationName: "multi-source data analysis",
          systemPrompt: DATA_ANALYSIS_SYSTEM_PROMPT,
          userPrompt: prompt,
          maxTokens: 3600,
          temperature: 0,
        });
      },
      parseResult: parseDataAnalysisResult,
    });

    const result = enrichDataAnalysisResult(partialResult, {
      productProfile: payload.productProfile,
      listings: payload.listings,
      trafficKeywords: payload.trafficKeywords,
      abaReport: payload.abaReport,
      rufusScreenshotCount: payload.rufusScreenshots.length,
    });

    return Response.json(result);
  } catch (error) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("data-analysis", error);
    }

    return toErrorResponse(error, "数据分析失败。");
  }
}

function validateRequest(body: Record<string, unknown>): DataAnalysisRequestPayload {
  const targetMarket =
    normalizeStringValue(body.targetMarket, { allowEmpty: true }) || "US";
  const productProfile = normalizeProductProfile(body.productProfile);
  const coreSellingPoints = normalizeStringValue(body.coreSellingPoints, {
    allowEmpty: true,
  });
  const competitorAsins = normalizeTextList(body.competitorAsins, {
    maxItems: 5,
    unique: true,
  });
  const listings = normalizeListings(body.listings);
  const trafficKeywords = normalizeTrafficKeywordGroups(body.trafficKeywords ?? {});
  const abaReport = normalizeAbaReport(body.abaReport);
  const rufusScreenshots = normalizeRufusScreenshots(body.rufusScreenshots);

  const keywordCount = Object.values(trafficKeywords).flat().length;

  if (
    listings.length === 0 &&
    keywordCount === 0 &&
    !abaReport &&
    rufusScreenshots.length === 0
  ) {
    throw new RouteError("请先提供卖家精灵、ABA 或 Rufus 相关数据。", {
      status: 400,
      code: "data_sources_required",
    });
  }

  return {
    targetMarket,
    productProfile,
    coreSellingPoints,
    competitorAsins,
    listings,
    trafficKeywords,
    abaReport,
    rufusScreenshots,
  };
}

function normalizeProductProfile(value: unknown): ProductProfile {
  if (!isRecord(value)) {
    return {
      brandName: "",
      productName: "",
      productCategory: "",
      productDescription: "",
      coreKeywords: "",
    };
  }

  return {
    brandName: normalizeStringValue(value.brandName, { allowEmpty: true }),
    productName: normalizeStringValue(value.productName, { allowEmpty: true }),
    productCategory: normalizeStringValue(value.productCategory, {
      allowEmpty: true,
    }),
    productDescription: normalizeStringValue(value.productDescription, {
      allowEmpty: true,
    }),
    coreKeywords: normalizeStringValue(value.coreKeywords, { allowEmpty: true }),
  };
}

function normalizeListings(value: unknown): CompetitorListing[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeListing(item))
    .filter((item): item is CompetitorListing => item !== null);
}

function normalizeListing(value: unknown): CompetitorListing | null {
  if (!isRecord(value)) {
    return null;
  }

  const asin = normalizeStringValue(value.asin, { allowEmpty: true });
  const title = normalizeStringValue(value.title, { allowEmpty: true });
  const bulletPoints = normalizeTextList(value.bulletPoints, { maxItems: 8 });

  if (!asin || !title) {
    return null;
  }

  return {
    asin,
    title,
    bulletPoints,
    attributes: normalizeAttributes(value.attributes),
    price: typeof value.price === "number" ? value.price : 0,
    rating: typeof value.rating === "number" ? value.rating : 0,
    reviews: typeof value.reviews === "number" ? value.reviews : 0,
    monthlySales: typeof value.monthlySales === "number" ? value.monthlySales : 0,
    bsr: typeof value.bsr === "number" ? value.bsr : 0,
    mainImage: normalizeStringValue(value.mainImage, { allowEmpty: true }),
  };
}

function normalizeAttributes(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [
        key,
        normalizeStringValue(entryValue, { allowEmpty: true }),
      ])
      .filter(([, entryValue]) => Boolean(entryValue))
  );
}

function normalizeTrafficKeywordGroups(
  value: unknown
): Record<string, TrafficKeyword[]> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, TrafficKeyword[]> = {};

  for (const [asinKey, keywordsValue] of Object.entries(value)) {
    if (!Array.isArray(keywordsValue)) {
      continue;
    }

    const normalized = keywordsValue
      .map((item) => normalizeTrafficKeyword(item))
      .filter((item): item is TrafficKeyword => item !== null);

    if (normalized.length > 0) {
      result[asinKey] = normalized;
    }
  }

  return result;
}

function normalizeTrafficKeyword(value: unknown): TrafficKeyword | null {
  if (!isRecord(value)) {
    return null;
  }

  const keyword = normalizeStringValue(value.keyword, { allowEmpty: true });
  if (!keyword) {
    return null;
  }

  return {
    keyword,
    searchVolume: typeof value.searchVolume === "number" ? value.searchVolume : 0,
    organicRank: typeof value.organicRank === "number" ? value.organicRank : 0,
    sponsoredRank:
      typeof value.sponsoredRank === "number" ? value.sponsoredRank : null,
    conversionShare:
      typeof value.conversionShare === "number" ? value.conversionShare : 0,
  };
}

function normalizeAbaReport(value: unknown): AbaReportFile | null {
  if (!isRecord(value)) {
    return null;
  }

  const fileName = normalizeStringValue(value.fileName, { allowEmpty: true });
  const content = normalizeStringValue(value.content, { allowEmpty: true });
  const headers = normalizeTextList(value.headers, { maxItems: 20 });
  const rows = Array.isArray(value.rows)
    ? value.rows
        .filter((item): item is unknown[] => Array.isArray(item))
        .map((row) =>
          row
            .map((cell) =>
              typeof cell === "string"
                ? cell.trim()
                : typeof cell === "number"
                  ? String(cell)
                  : ""
            )
            .slice(0, 20)
        )
        .filter((row) => row.some(Boolean))
        .slice(0, 20)
    : [];

  if (!fileName && !content && headers.length === 0 && rows.length === 0) {
    return null;
  }

  return {
    fileName,
    size: typeof value.size === "number" ? value.size : 0,
    content,
    headers,
    rows,
  };
}

function normalizeRufusScreenshots(value: unknown): RufusScreenshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => normalizeRufusScreenshot(item, index))
    .filter((item): item is RufusScreenshot => item !== null)
    .slice(0, 4);
}

function normalizeRufusScreenshot(
  value: unknown,
  index: number
): RufusScreenshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const preview = normalizeStringValue(value.preview, { allowEmpty: true });
  if (!preview.startsWith("data:image/")) {
    return null;
  }

  const mediaType = normalizeMediaType(value.mediaType);

  return {
    id:
      normalizeStringValue(value.id, {
        allowEmpty: true,
        fallback: `rufus-${index + 1}`,
      }) || `rufus-${index + 1}`,
    name:
      normalizeStringValue(value.name, {
        allowEmpty: true,
        fallback: `Rufus ${index + 1}`,
      }) || `Rufus ${index + 1}`,
    preview,
    mediaType,
  };
}

function normalizeMediaType(value: unknown): ScreenshotMediaType {
  if (value === "image/png" || value === "image/webp") {
    return value;
  }
  return "image/jpeg";
}

function parseDataAnalysisResult(value: unknown): DataAnalysisResult {
  if (!isRecord(value)) {
    throw new RouteError("数据分析结果 JSON 结构无效。", {
      status: 502,
      code: "data_analysis_invalid_shape",
      retryable: true,
    });
  }

  const result: DataAnalysisResult = {
    marketOverview: normalizeStringValue(value.marketOverview, { allowEmpty: true }),
    sellerSpriteInsights: normalizeTextList(value.sellerSpriteInsights, {
      maxItems: 6,
      unique: true,
    }),
    abaInsights: normalizeTextList(value.abaInsights, {
      maxItems: 6,
      unique: true,
    }),
    rufusInsights: normalizeTextList(value.rufusInsights, {
      maxItems: 6,
      unique: true,
    }),
    aiRecommendations: normalizeTextList(value.aiRecommendations, {
      maxItems: 6,
      unique: true,
    }),
    cosmoFocus: normalizeTextList(value.cosmoFocus, {
      maxItems: 6,
      unique: true,
    }),
    opportunityAssessment: normalizeOpportunityAssessment(value.opportunityAssessment),
    keywordStrategy: normalizeKeywordStrategy(value.keywordStrategy),
    rufusIntentLayer: normalizeRufusIntentLayer(value.rufusIntentLayer),
  };

  const hasUsefulContent =
    Boolean(result.marketOverview) ||
    result.sellerSpriteInsights.length > 0 ||
    result.abaInsights.length > 0 ||
    result.rufusInsights.length > 0 ||
    result.aiRecommendations.length > 0 ||
    result.cosmoFocus.length > 0 ||
    result.opportunityAssessment !== null ||
    result.keywordStrategy !== null ||
    result.rufusIntentLayer !== null;

  if (!hasUsefulContent) {
    throw new RouteError("数据分析结果为空。", {
      status: 502,
      code: "data_analysis_empty",
      retryable: true,
    });
  }

  return result;
}

function normalizeOpportunityAssessment(value: unknown): OpportunityAssessment | null {
  if (!isRecord(value)) {
    return null;
  }

  const breakdown = Array.isArray(value.breakdown)
    ? value.breakdown
        .map((item) => normalizeOpportunityBreakdown(item))
        .filter((item): item is OpportunityBreakdownItem => item !== null)
    : [];

  const summary = normalizeStringValue(value.summary, { allowEmpty: true });

  if (!summary && breakdown.length === 0) {
    return null;
  }

  const verdictRaw = normalizeStringValue(value.verdict, { allowEmpty: true }).toLowerCase();

  return {
    score: normalizeScore(value.score),
    verdict:
      verdictRaw === "priority" || verdictRaw === "test" || verdictRaw === "watch"
        ? verdictRaw
        : "test",
    summary,
    strengths: normalizeTextList(value.strengths, { maxItems: 4, unique: true }),
    risks: normalizeTextList(value.risks, { maxItems: 4, unique: true }),
    nextActions: normalizeTextList(value.nextActions, {
      maxItems: 4,
      unique: true,
    }),
    breakdown,
  };
}

function normalizeOpportunityBreakdown(
  value: unknown
): OpportunityBreakdownItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const key = normalizeStringValue(value.key, { allowEmpty: true });
  const label = normalizeStringValue(value.label, { allowEmpty: true });
  const rationale = normalizeStringValue(value.rationale, { allowEmpty: true });

  if (!key && !label && !rationale) {
    return null;
  }

  const normalizedKey =
    key === "demand" || key === "competition" || key === "conversion" || key === "intent"
      ? key
      : "demand";

  return {
    key: normalizedKey,
    label: label || normalizedKey,
    score: normalizeScore(value.score),
    rationale,
    evidence: normalizeTextList(value.evidence, { maxItems: 4, unique: true }),
  };
}

function normalizeKeywordStrategy(value: unknown): KeywordStrategy | null {
  if (!isRecord(value)) {
    return null;
  }

  const titleKeywords = normalizeKeywordItems(value.titleKeywords);
  const bulletKeywords = normalizeKeywordItems(value.bulletKeywords);
  const searchTermKeywords = normalizeKeywordItems(value.searchTermKeywords);
  const ppcCoreKeywords = normalizeKeywordItems(value.ppcCoreKeywords);
  const ppcExploratoryKeywords = normalizeKeywordItems(value.ppcExploratoryKeywords);
  const negativeKeywords = normalizeKeywordItems(value.negativeKeywords);
  const campaignPlans = Array.isArray(value.campaignPlans)
    ? value.campaignPlans
        .map((item) => normalizeCampaignPlan(item))
        .filter((item): item is KeywordCampaignPlan => item !== null)
    : [];

  const hasUsefulContent =
    titleKeywords.length > 0 ||
    bulletKeywords.length > 0 ||
    searchTermKeywords.length > 0 ||
    ppcCoreKeywords.length > 0 ||
    ppcExploratoryKeywords.length > 0 ||
    negativeKeywords.length > 0 ||
    campaignPlans.length > 0;

  if (!hasUsefulContent) {
    return null;
  }

  return {
    titleKeywords,
    bulletKeywords,
    searchTermKeywords,
    ppcCoreKeywords,
    ppcExploratoryKeywords,
    negativeKeywords,
    campaignPlans,
  };
}

function normalizeKeywordItems(value: unknown): KeywordAllocationItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeKeywordItem(item))
    .filter((item): item is KeywordAllocationItem => item !== null)
    .slice(0, 10);
}

function normalizeKeywordItem(value: unknown): KeywordAllocationItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const keyword = normalizeStringValue(value.keyword, { allowEmpty: true });
  if (!keyword) {
    return null;
  }

  const priority = normalizePriority(value.priority);

  return {
    keyword,
    priority,
    reason: normalizeStringValue(value.reason, { allowEmpty: true }),
    evidence: normalizeStringValue(value.evidence, { allowEmpty: true }),
  };
}

function normalizeCampaignPlan(value: unknown): KeywordCampaignPlan | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = normalizeStringValue(value.name, { allowEmpty: true });
  const goal = normalizeStringValue(value.goal, { allowEmpty: true });

  if (!name && !goal) {
    return null;
  }

  const matchTypeRaw = normalizeStringValue(value.matchType, { allowEmpty: true });
  const matchType =
    matchTypeRaw === "exact" ||
    matchTypeRaw === "phrase" ||
    matchTypeRaw === "broad" ||
    matchTypeRaw === "auto"
      ? matchTypeRaw
      : "exact";

  return {
    name: name || "Campaign",
    goal,
    matchType,
    budgetPriority: normalizePriority(value.budgetPriority),
    keywords: normalizeTextList(value.keywords, { maxItems: 8, unique: true }),
    negativeKeywords: normalizeTextList(value.negativeKeywords, {
      maxItems: 8,
      unique: true,
    }),
    launchPlan: normalizeStringValue(value.launchPlan, { allowEmpty: true }),
  };
}

function normalizeRufusIntentLayer(value: unknown): RufusIntentLayer | null {
  if (!isRecord(value)) {
    return null;
  }

  const scene = normalizeIntentItems(value.scene);
  const audience = normalizeIntentItems(value.audience);
  const objections = normalizeIntentItems(value.objections);
  const comparisons = normalizeIntentItems(value.comparisons);

  if (
    scene.length === 0 &&
    audience.length === 0 &&
    objections.length === 0 &&
    comparisons.length === 0
  ) {
    return null;
  }

  return {
    scene,
    audience,
    objections,
    comparisons,
  };
}

function normalizeIntentItems(value: unknown): RufusIntentItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeIntentItem(item))
    .filter((item): item is RufusIntentItem => item !== null)
    .slice(0, 4);
}

function normalizeIntentItem(value: unknown): RufusIntentItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const question = normalizeStringValue(value.question, { allowEmpty: true });
  const intent = normalizeStringValue(value.intent, { allowEmpty: true });

  if (!question && !intent) {
    return null;
  }

  return {
    intent,
    question,
    responseAngle: normalizeStringValue(value.responseAngle, { allowEmpty: true }),
    listingHooks: normalizeTextList(value.listingHooks, {
      maxItems: 4,
      unique: true,
    }),
  };
}

function normalizePriority(value: unknown): "high" | "medium" | "low" {
  const normalized = normalizeStringValue(value, { allowEmpty: true }).toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "medium";
}

function normalizeScore(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : 0;
}

function buildPrompt(payload: DataAnalysisRequestPayload, attempt: number): string {
  const productSummary = [
    `品牌名称: ${payload.productProfile.brandName || "未填写"}`,
    `产品名称: ${payload.productProfile.productName || "未填写"}`,
    `产品品类: ${payload.productProfile.productCategory || "未填写"}`,
    `目标市场: ${payload.targetMarket}`,
    `产品描述: ${payload.productProfile.productDescription || "未填写"}`,
    `差异化卖点: ${payload.coreSellingPoints || "未填写"}`,
    `核心关键词: ${payload.productProfile.coreKeywords || "未填写"}`,
  ].join("\n");

  const listingSummary = payload.listings
    .slice(0, 4)
    .map((listing) =>
      [
        `ASIN: ${listing.asin}`,
        `标题: ${listing.title}`,
        listing.bulletPoints.length > 0
          ? `五点: ${listing.bulletPoints.join(" | ")}`
          : "五点: 无",
        `价格: ${listing.price} | 评分: ${listing.rating} | 评论数: ${listing.reviews} | 月销: ${listing.monthlySales}`,
      ].join("\n")
    )
    .join("\n\n---\n\n");

  const selectedKeywords = selectTrafficKeywords(
    Object.values(payload.trafficKeywords).flat(),
    15
  )
    .map(
      (keyword) =>
        `${keyword.keyword} (搜索量 ${keyword.searchVolume}, 转化份额 ${normalizeConversionShare(
          keyword.conversionShare
        ).toFixed(1)}%, 自然位 ${keyword.organicRank || "n/a"}, 广告位 ${
          keyword.sponsoredRank ?? "n/a"
        })`
    )
    .join("\n");

  const abaSummary = payload.abaReport
    ? [
        `文件名: ${payload.abaReport.fileName}`,
        payload.abaReport.headers.length > 0
          ? `表头: ${payload.abaReport.headers.join(" | ")}`
          : "",
        payload.abaReport.rows.length > 0
          ? `示例数据:\n${payload.abaReport.rows
              .slice(0, 12)
              .map((row) => row.join(" | "))
              .join("\n")}`
          : payload.abaReport.content
            ? `原始内容节选:\n${payload.abaReport.content.slice(0, 2000)}`
            : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "未上传 ABA 数据";

  return `
请基于输入，产出一份面向“亚马逊专业操盘手”的前置分析。
所有分析文字都使用简体中文，只返回一个 JSON 对象。

产品信息:
${productSummary}

竞品 ASIN:
${payload.competitorAsins.join(", ") || "未填写"}

卖家精灵与竞品数据:
${listingSummary || "无"}

关键词数据:
${selectedKeywords || "无"}

ABA 搜索词报告:
${abaSummary}

Rufus 截图说明:
${payload.rufusScreenshots.length > 0 ? "已附截图，请识别截图中的意图、顾虑、比较和场景问题。" : "未提供截图"}

请返回如下 JSON 结构:
{
  "marketOverview": "1 段市场概览",
  "sellerSpriteInsights": ["洞察 1", "洞察 2"],
  "abaInsights": ["ABA 洞察 1", "ABA 洞察 2"],
  "rufusInsights": ["Rufus 洞察 1", "Rufus 洞察 2"],
  "aiRecommendations": ["操盘建议 1", "操盘建议 2"],
  "cosmoFocus": ["COSMO 文案焦点 1", "COSMO 文案焦点 2"],
  "opportunityAssessment": {
    "score": 78,
    "verdict": "priority",
    "summary": "一句机会总结",
    "strengths": ["优势 1"],
    "risks": ["风险 1"],
    "nextActions": ["下一步 1"],
    "breakdown": [
      {
        "key": "demand",
        "label": "需求强度",
        "score": 80,
        "rationale": "原因",
        "evidence": ["证据 1", "证据 2"]
      }
    ]
  },
  "keywordStrategy": {
    "titleKeywords": [
      {
        "keyword": "keyword",
        "priority": "high",
        "reason": "为什么放标题",
        "evidence": "信号"
      }
    ],
    "bulletKeywords": [],
    "searchTermKeywords": [],
    "ppcCoreKeywords": [],
    "ppcExploratoryKeywords": [],
    "negativeKeywords": [],
    "campaignPlans": [
      {
        "name": "campaign name",
        "goal": "目标",
        "matchType": "exact",
        "budgetPriority": "high",
        "keywords": ["kw1"],
        "negativeKeywords": ["kw2"],
        "launchPlan": "启动建议"
      }
    ]
  },
  "rufusIntentLayer": {
    "scene": [
      {
        "intent": "场景意图",
        "question": "用户会怎么问",
        "responseAngle": "应该怎么答",
        "listingHooks": ["文案钩子"]
      }
    ],
    "audience": [],
    "objections": [],
    "comparisons": []
  }
}

规则:
- sellerSpriteInsights 只基于竞品与关键词数据。
- abaInsights 只基于 ABA 数据，没有就返回空数组。
- rufusInsights 只基于截图能看到的内容；不确定时可写“推测”。
- opportunityAssessment 要回答“值不值得打”，不要停留在泛泛摘要。
- keywordStrategy 要明确标题词、Bullet 词、Search Terms、PPC 主攻词、PPC 探索词、否定词和 campaign plan。
- rufusIntentLayer 要覆盖 场景 / 人群 / 顾虑 / 对比 四类问题。
- 每个数组控制在 3-6 条，避免空话。
- 只返回 JSON。
${getRetryPromptSuffix(attempt)}
  `.trim();
}

function normalizeConversionShare(value: number): number {
  if (value <= 1 && value > 0) {
    return value * 100;
  }
  return value;
}
