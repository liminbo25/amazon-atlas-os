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
import { selectTrafficKeywords } from "@/lib/traffic-keyword-helpers";
import type {
  AbaReportFile,
  CompetitorListing,
  DataAnalysisResult,
  ProductProfile,
  RufusScreenshot,
  ScreenshotMediaType,
  TrafficKeyword,
} from "@/lib/types";

const DEFAULT_MODEL = "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B";

const DATA_ANALYSIS_SYSTEM_PROMPT = [
  "You analyze Amazon listing inputs for an internal workflow.",
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
    const runtimeConfig = readAiRuntimeConfig(body);
    const payload = validateRequest(body);
    const config = resolveAiConfig({
      runtimeConfig,
      defaultModel: DEFAULT_MODEL,
    });

    const result = await requestStructuredJson<DataAnalysisResult>({
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
            maxTokens: 3200,
            temperature: 0,
          });
        }

        return requestAiTextCompletion({
          config,
          operationName: "multi-source data analysis",
          systemPrompt: DATA_ANALYSIS_SYSTEM_PROMPT,
          userPrompt: prompt,
          maxTokens: 2800,
          temperature: 0,
        });
      },
      parseResult: parseDataAnalysisResult,
    });

    return Response.json(result);
  } catch (error) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("data-analysis", error);
    }

    return toErrorResponse(error, "数据分析失败。");
  }
}

function validateRequest(
  body: Record<string, unknown>
): DataAnalysisRequestPayload {
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
    throw new RouteError("请先提供卖家精灵、ABA 或 Rufus 数据源。", {
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
    productCategory: normalizeStringValue(value.productCategory, { allowEmpty: true }),
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
  const bulletPoints = normalizeTextList(value.bulletPoints, {
    maxItems: 8,
  });

  if (!asin || !title) {
    return null;
  }

  return {
    asin,
    title,
    bulletPoints,
    attributes: {},
    price: typeof value.price === "number" ? value.price : 0,
    rating: typeof value.rating === "number" ? value.rating : 0,
    reviews: typeof value.reviews === "number" ? value.reviews : 0,
    monthlySales: typeof value.monthlySales === "number" ? value.monthlySales : 0,
    bsr: typeof value.bsr === "number" ? value.bsr : 0,
    mainImage: normalizeStringValue(value.mainImage, { allowEmpty: true }),
  };
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
  const headers = normalizeTextList(value.headers, {
    maxItems: 20,
  });
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
  };

  const hasUsefulContent =
    Boolean(result.marketOverview) ||
    result.sellerSpriteInsights.length > 0 ||
    result.abaInsights.length > 0 ||
    result.rufusInsights.length > 0 ||
    result.aiRecommendations.length > 0 ||
    result.cosmoFocus.length > 0;

  if (!hasUsefulContent) {
    throw new RouteError("数据分析结果为空。", {
      status: 502,
      code: "data_analysis_empty",
      retryable: true,
    });
  }

  return result;
}

function buildPrompt(
  payload: DataAnalysisRequestPayload,
  attempt: number
): string {
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
        `${keyword.keyword} (搜索量 ${keyword.searchVolume}, 转化份额 ${keyword.conversionShare}, 自然位 ${keyword.organicRank || "n/a"})`
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
请基于多源输入，生成亚马逊 Listing 前置数据分析结果。所有输出必须使用简体中文。

产品信息：
${productSummary}

竞品 ASIN：
${payload.competitorAsins.join(", ") || "未填写"}

卖家精灵真实数据：
${listingSummary || "无"}

关键词数据：
${selectedKeywords || "无"}

ABA 搜索词报告：
${abaSummary}

Rufus 问答截图说明：
${payload.rufusScreenshots.length > 0 ? "已附带截图，请识别截图中的问题、用户意图、关切点和回答方向。" : "未提供截图"}

返回且只返回一个 JSON 对象，格式如下：
{
  "marketOverview": "1 段多源市场总结",
  "sellerSpriteInsights": ["卖家精灵洞察1", "卖家精灵洞察2"],
  "abaInsights": ["ABA洞察1", "ABA洞察2"],
  "rufusInsights": ["Rufus洞察1", "Rufus洞察2"],
  "aiRecommendations": ["AI策略建议1", "AI策略建议2"],
  "cosmoFocus": ["COSMO导向1", "COSMO导向2"]
}

规则：
- sellerSpriteInsights 只能基于卖家精灵真实数据和关键词数据。
- abaInsights 只能基于 ABA 数据；如果没有 ABA 数据，返回空数组。
- rufusInsights 需要基于截图可见内容；不确定时可标注为“推测”。
- aiRecommendations 需要整合多源证据，输出可执行的 Listing 策略建议。
- cosmoFocus 要聚焦标题相关性、场景覆盖、转化动机、关键词组织和语义一致性等文案方向。
- 每个数组返回 3 到 6 条短句，避免空话。
- 只返回 JSON。
${getRetryPromptSuffix(attempt)}
  `.trim();
}
