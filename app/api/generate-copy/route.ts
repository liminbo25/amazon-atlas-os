import { checkFieldCompliance } from "@/lib/compliance";
import {
  RouteError,
  getRetryPromptSuffix,
  isRecord,
  logRouteError,
  normalizeNumberValue,
  normalizeStringValue,
  normalizeTextList,
  readAiRuntimeConfig,
  readJsonBody,
  requestAiTextCompletion,
  requestStructuredJson,
  resolveAiConfig,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import { selectTrafficKeywords } from "@/lib/traffic-keyword-helpers";
import type {
  ComplianceResult,
  DataAnalysisResult,
  ListingVersion,
  PainPoint,
  ProductProfile,
  TrafficKeyword,
  ValuePoint,
} from "@/lib/types";

const DEFAULT_MODEL = "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B";

const LISTING_SYSTEM_PROMPT = [
  "You generate Amazon listing copy for an internal workflow.",
  "Return exactly one valid JSON object.",
  "Do not use markdown code fences.",
  "Do not add explanations before or after the JSON.",
].join(" ");

interface GenerateCopyRequestPayload {
  productProfile: ProductProfile;
  painPoints: PainPoint[];
  valuePoints: ValuePoint[];
  coreSellingPoints: string;
  trafficKeywords: Record<string, TrafficKeyword[]>;
  dataAnalysis: DataAnalysisResult | null;
  lightMode: boolean;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const runtimeConfig = readAiRuntimeConfig(body);
    const payload = validateGenerateCopyRequest(body);
    const config = resolveAiConfig({
      runtimeConfig,
      defaultModel: DEFAULT_MODEL,
    });

    const versions = await requestStructuredJson<ListingVersion[]>({
      operationName: "listing generation",
      requestText: (attempt) =>
        requestAiTextCompletion({
          config,
          operationName: "listing generation",
          systemPrompt: LISTING_SYSTEM_PROMPT,
          userPrompt: buildListingPrompt(payload, attempt),
          maxTokens: payload.lightMode ? 3200 : 6000,
          temperature: 0,
        }),
      parseResult: parseGeneratedVersions,
    });

    const complianceResults = buildComplianceResults(versions);
    return Response.json({ versions, complianceResults });
  } catch (error) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("generate-copy", error);
    }

    return toErrorResponse(error, "文案生成失败。");
  }
}

function validateGenerateCopyRequest(
  body: Record<string, unknown>
): GenerateCopyRequestPayload {
  const productProfile = normalizeProductProfile(body.productProfile);
  const painPoints = normalizePainPointInputs(body.painPoints);
  const valuePoints = normalizeValuePointInputs(body.valuePoints);
  const coreSellingPoints = normalizeStringValue(body.coreSellingPoints, {
    allowEmpty: true,
  });
  const trafficKeywords = normalizeTrafficKeywordGroups(body.trafficKeywords ?? {});
  const dataAnalysis = normalizeDataAnalysis(body.dataAnalysis);
  const lightMode = body.lightMode === true;

  const keywordCount = Object.values(trafficKeywords).flat().length;

  if (
    !productProfile.productName &&
    !productProfile.productDescription &&
    painPoints.length === 0 &&
    valuePoints.length === 0 &&
    !coreSellingPoints &&
    keywordCount === 0 &&
    !dataAnalysis
  ) {
    throw new RouteError(
      "请至少提供产品信息、VOC 数据、关键词数据或多源分析结果中的一种。",
      {
        status: 400,
        code: "listing_inputs_required",
      }
    );
  }

  return {
    productProfile,
    painPoints,
    valuePoints,
    coreSellingPoints,
    trafficKeywords,
    dataAnalysis,
    lightMode,
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

function normalizeDataAnalysis(value: unknown): DataAnalysisResult | null {
  if (!isRecord(value)) {
    return null;
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

  return hasUsefulContent ? result : null;
}

function normalizePainPointInputs(value: unknown): PainPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => normalizePainPoint(item, index))
    .filter((item): item is PainPoint => item !== null);
}

function normalizePainPoint(value: unknown, index: number): PainPoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const category = normalizeStringValue(value.category, { allowEmpty: true });
  const suggestion = normalizeStringValue(value.sellingPointSuggestion, {
    allowEmpty: true,
  });
  const quotes = normalizeTextList(value.typicalQuotes, {
    maxItems: 3,
    unique: true,
  });

  if (!category && !suggestion && quotes.length === 0) {
    return null;
  }

  return {
    rank: normalizeNumberValue(value.rank, {
      min: 1,
      integer: true,
      fallback: index + 1,
    }),
    category: (category || "其他") as PainPoint["category"],
    frequency: normalizeNumberValue(value.frequency, { min: 0, integer: true }),
    percentage: normalizeNumberValue(value.percentage, { min: 0, max: 100 }),
    typicalQuotes: quotes,
    sellingPointSuggestion: suggestion,
  };
}

function normalizeValuePointInputs(value: unknown): ValuePoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeValuePoint(item))
    .filter((item): item is ValuePoint => item !== null);
}

function normalizeValuePoint(value: unknown): ValuePoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const category = normalizeStringValue(value.category, { allowEmpty: true });
  const suggestion = normalizeStringValue(value.leverageSuggestion, {
    allowEmpty: true,
  });
  const quotes = normalizeTextList(value.typicalQuotes, {
    maxItems: 3,
    unique: true,
  });

  if (!category && !suggestion && quotes.length === 0) {
    return null;
  }

  return {
    category: category || "其他",
    frequency: normalizeNumberValue(value.frequency, { min: 0, integer: true }),
    percentage: normalizeNumberValue(value.percentage, { min: 0, max: 100 }),
    typicalQuotes: quotes,
    leverageSuggestion: suggestion,
  };
}

function normalizeTrafficKeywordGroups(
  value: unknown
): Record<string, TrafficKeyword[]> {
  if (!isRecord(value)) {
    return {};
  }

  const groups: Record<string, TrafficKeyword[]> = {};

  for (const [asinKey, keywordsValue] of Object.entries(value)) {
    if (!Array.isArray(keywordsValue)) {
      continue;
    }

    const normalized = keywordsValue
      .map((item) => normalizeTrafficKeyword(item))
      .filter((item): item is TrafficKeyword => item !== null);

    const selected = selectTrafficKeywords(normalized);
    if (selected.length > 0) {
      groups[asinKey] = selected;
    }
  }

  return groups;
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
    searchVolume: normalizeNumberValue(value.searchVolume, {
      min: 0,
      integer: true,
    }),
    organicRank: normalizeNumberValue(value.organicRank, {
      min: 0,
      integer: true,
    }),
    sponsoredRank:
      value.sponsoredRank === null || value.sponsoredRank === undefined
        ? null
        : normalizeNumberValue(value.sponsoredRank, {
            min: 0,
            integer: true,
          }),
    conversionShare: normalizeNumberValue(value.conversionShare, {
      min: 0,
      max: 100,
    }),
  };
}

function parseGeneratedVersions(value: unknown): ListingVersion[] {
  if (!isRecord(value)) {
    throw new RouteError("Listing generation returned an invalid JSON shape.", {
      status: 502,
      code: "listing_invalid_shape",
      retryable: true,
    });
  }

  const versions = Array.isArray(value.versions)
    ? value.versions
        .map((item, index) => normalizeListingVersion(item, index))
        .filter((item): item is ListingVersion => item !== null)
        .slice(0, 3)
    : [];

  if (versions.length === 0) {
    throw new RouteError("Listing generation returned an empty result.", {
      status: 502,
      code: "listing_empty_result",
      retryable: true,
    });
  }

  return ensureUniqueVersionNames(versions);
}

function normalizeListingVersion(
  value: unknown,
  index: number
): ListingVersion | null {
  if (!isRecord(value)) {
    return null;
  }

  const versionName =
    normalizeStringValue(value.versionName, {
      allowEmpty: true,
      fallback: `Version ${index + 1}`,
    }) || `Version ${index + 1}`;
  const style = normalizeStringValue(value.style, { allowEmpty: true });
  const title = normalizeStringValue(value.title, { allowEmpty: true });
  const bulletPoints = normalizeTextList(value.bulletPoints, {
    maxItems: 5,
  });
  const description = normalizeStringValue(value.description, {
    allowEmpty: true,
  });
  const searchTerms = normalizeStringValue(value.searchTerms, {
    allowEmpty: true,
  });

  if (!title && bulletPoints.length === 0 && !description && !searchTerms) {
    return null;
  }

  return {
    versionName,
    style,
    title,
    bulletPoints,
    description,
    searchTerms,
  };
}

function ensureUniqueVersionNames(versions: ListingVersion[]): ListingVersion[] {
  const seen = new Map<string, number>();

  return versions.map((version, index) => {
    const baseName = version.versionName || `Version ${index + 1}`;
    const count = seen.get(baseName) ?? 0;
    seen.set(baseName, count + 1);

    if (count === 0) {
      return {
        ...version,
        versionName: baseName,
      };
    }

    return {
      ...version,
      versionName: `${baseName}-${count + 1}`,
    };
  });
}

function buildComplianceResults(
  versions: ListingVersion[]
): Record<string, ComplianceResult[]> {
  const complianceResults: Record<string, ComplianceResult[]> = {};

  for (const version of versions) {
    const titleCheck = checkFieldCompliance("title", version.title);
    const bulletCheck = checkFieldCompliance(
      "bulletPoints",
      version.bulletPoints
    );
    const descriptionCheck = checkFieldCompliance(
      "description",
      version.description
    );
    const searchTermsCheck = checkFieldCompliance(
      "searchTerms",
      version.searchTerms
    );

    complianceResults[version.versionName] = [
      { field: "title", ...titleCheck },
      { field: "bulletPoints", ...bulletCheck },
      { field: "description", ...descriptionCheck },
      { field: "searchTerms", ...searchTermsCheck },
    ];
  }

  return complianceResults;
}

function buildListingPrompt(
  payload: GenerateCopyRequestPayload,
  attempt: number
): string {
  const selectedPainPoints = payload.lightMode
    ? payload.painPoints.slice(0, 4)
    : payload.painPoints;
  const selectedValuePoints = payload.lightMode
    ? payload.valuePoints.slice(0, 4)
    : payload.valuePoints;
  const painSummary = selectedPainPoints
    .map(
      (point) =>
        `${point.rank}. [${point.category}] frequency ${point.frequency}, ${point.percentage}% - suggestion: ${point.sellingPointSuggestion}`
    )
    .join("\n");

  const valueSummary = selectedValuePoints
    .map(
      (point) =>
        `[${point.category}] frequency ${point.frequency}, ${point.percentage}% - suggestion: ${point.leverageSuggestion}`
    )
    .join("\n");

  const keywordSummary = selectTrafficKeywords(
    Object.values(payload.trafficKeywords).flat(),
    payload.lightMode ? 8 : 20
  )
    .map(
      (keyword) =>
        `${keyword.keyword} (volume ${keyword.searchVolume}, conversion ${keyword.conversionShare}, organic ${keyword.organicRank || "n/a"}, sponsored ${
          keyword.sponsoredRank ?? "n/a"
        })`
    )
    .join(", ");

  const productSummary = [
    `Brand: ${payload.productProfile.brandName || "None"}`,
    `Product name: ${payload.productProfile.productName || "None"}`,
    `Category: ${payload.productProfile.productCategory || "None"}`,
    `Product description: ${payload.productProfile.productDescription || "None"}`,
    `Seed keywords: ${payload.productProfile.coreKeywords || "None"}`,
  ].join("\n");

  const dataAnalysisSummary = payload.dataAnalysis
    ? [
        `Market overview: ${payload.dataAnalysis.marketOverview || "None"}`,
        `SellerSprite insights: ${
          payload.dataAnalysis.sellerSpriteInsights.join(" | ") || "None"
        }`,
        `ABA insights: ${payload.dataAnalysis.abaInsights.join(" | ") || "None"}`,
        `Rufus insights: ${
          payload.dataAnalysis.rufusInsights.join(" | ") || "None"
        }`,
        `AI recommendations: ${
          payload.dataAnalysis.aiRecommendations.join(" | ") || "None"
        }`,
        `COSMO focus: ${payload.dataAnalysis.cosmoFocus.join(" | ") || "None"}`,
      ].join("\n")
    : "None";

  return `
Generate Amazon listing copy for an internal workflow that combines COSMO-oriented structuring, VOC diagnosis, and keyword data.

Product context:
${productSummary}

Use the following VOC insights:

Competitor pain points:
${painSummary || "None"}

Positive value points:
${valueSummary || "None"}

Seller core selling points:
${payload.coreSellingPoints || "None"}

Selected traffic keywords:
${keywordSummary || "None"}

Additional multi-source data analysis:
${dataAnalysisSummary}

Return exactly one JSON object in this shape:
{
  "versions": [
    {
      "versionName": "Professional",
      "style": "brief style description",
      "title": "English title under 200 characters",
      "bulletPoints": [
        "English bullet 1",
        "English bullet 2",
        "English bullet 3",
        "English bullet 4",
        "English bullet 5"
      ],
      "description": "English description",
      "searchTerms": "english backend search terms"
    },
    {
      "versionName": "Lifestyle",
      "style": "brief style description",
      "title": "English title under 200 characters",
      "bulletPoints": ["...", "...", "...", "...", "..."],
      "description": "English description",
      "searchTerms": "english backend search terms"
    },
    {
      "versionName": "Value",
      "style": "brief style description",
      "title": "English title under 200 characters",
      "bulletPoints": ["...", "...", "...", "...", "..."],
      "description": "English description",
      "searchTerms": "english backend search terms"
    }
  ]
}

Rules:
- All customer-facing listing copy must be in English.
- Make the three versions meaningfully different in angle and emphasis.
- Use a COSMO-oriented structure: front-load category relevance and high-intent terms in the title, sequence bullets from primary conversion promise to pain-point resolution, and keep semantic coverage consistent across the whole listing.
- Each bullet point should solve or preempt a competitor pain point when evidence exists.
- Reflect the product context, seed keywords, and any available SellerSprite / ABA / Rufus insights when they add clear value.
- Integrate keywords naturally and avoid keyword stuffing.
- Prefer keywords with real traffic and ranking signals over generic high-volume terms.
- Avoid these prohibited words: best, guaranteed, #1, cure, FDA approved, sale, discount, free shipping, amazing, perfect, incredible.
- Keep the title under 200 characters.
- Keep search terms under 250 characters and avoid duplicating obvious title words.
- If light mode is enabled, prefer concise outputs and shorter descriptions to improve response speed.
- Return JSON only.
Mode: ${payload.lightMode ? "light" : "standard"}.
${getRetryPromptSuffix(attempt)}
  `.trim();
}
