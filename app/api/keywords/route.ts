import type {
  CompetitorCopyAnalysis,
  CompetitorListing,
  PainPoint,
  ReviewData,
  ValuePoint,
} from "@/lib/types";
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

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

const VOC_SYSTEM_PROMPT = [
  "You analyze Amazon competitor listings and review VOC.",
  "Return exactly one valid JSON object.",
  "Do not use markdown code fences.",
  "Do not add explanations before or after the JSON.",
].join(" ");

interface KeywordsRequestPayload {
  reviews: Record<string, ReviewData[]>;
  positiveReviews: Record<string, ReviewData[]>;
  listings: CompetitorListing[];
}

interface KeywordsResponsePayload {
  painPoints: PainPoint[];
  valuePoints: ValuePoint[];
  competitorAnalysis: CompetitorCopyAnalysis[];
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const runtimeConfig = readAiRuntimeConfig(body);
    const payload = validateKeywordsRequest(body);
    const config = resolveAiConfig({
      runtimeConfig,
      defaultModel: DEFAULT_MODEL,
    });

    const result = await requestStructuredJson<KeywordsResponsePayload>({
      operationName: "VOC analysis",
      requestText: (attempt) =>
        requestAiTextCompletion({
          config,
          operationName: "VOC analysis",
          systemPrompt: VOC_SYSTEM_PROMPT,
          userPrompt: buildVocPrompt(payload, attempt),
          maxTokens: 4096,
          temperature: 0,
        }),
      parseResult: parseKeywordsResponse,
    });

    return Response.json(result);
  } catch (error) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("keywords", error);
    }

    return toErrorResponse(error, "VOC analysis failed.");
  }
}

function validateKeywordsRequest(
  body: Record<string, unknown>
): KeywordsRequestPayload {
  const reviews = normalizeReviewGroups(body.reviews, "reviews");
  const positiveReviews = normalizeReviewGroups(
    body.positiveReviews ?? {},
    "positiveReviews"
  );
  const listings = normalizeListings(body.listings);

  if (listings.length === 0) {
    throw new RouteError("listings must include at least one valid competitor listing.", {
      status: 400,
      code: "listings_required",
    });
  }

  const totalReviews =
    Object.values(reviews).flat().length +
    Object.values(positiveReviews).flat().length;

  if (totalReviews === 0) {
    throw new RouteError("At least one review is required for VOC analysis.", {
      status: 400,
      code: "reviews_required",
    });
  }

  return {
    reviews,
    positiveReviews,
    listings,
  };
}

function normalizeReviewGroups(
  value: unknown,
  fieldName: string
): Record<string, ReviewData[]> {
  if (!isRecord(value)) {
    throw new RouteError(`${fieldName} must be an object.`, {
      status: 400,
      code: `${fieldName}_invalid`,
    });
  }

  const groups: Record<string, ReviewData[]> = {};

  for (const [asinKey, reviewsValue] of Object.entries(value)) {
    if (!Array.isArray(reviewsValue)) {
      throw new RouteError(`${fieldName}.${asinKey} must be an array.`, {
        status: 400,
        code: `${fieldName}_invalid`,
      });
    }

    const normalized = reviewsValue
      .map((item, index) => normalizeReview(item, asinKey, index))
      .filter((item): item is ReviewData => item !== null);

    if (normalized.length > 0) {
      groups[asinKey] = normalized;
    }
  }

  return groups;
}

function normalizeReview(
  value: unknown,
  fallbackAsin: string,
  index: number
): ReviewData | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = normalizeStringValue(value.title, { allowEmpty: true });
  const content = normalizeStringValue(value.content, { allowEmpty: true });

  if (!title && !content) {
    return null;
  }

  return {
    id:
      normalizeStringValue(value.id, {
        allowEmpty: true,
        fallback: `${fallbackAsin}-${index}`,
      }) || `${fallbackAsin}-${index}`,
    asin:
      normalizeStringValue(value.asin, {
        allowEmpty: true,
        fallback: fallbackAsin,
      }) || fallbackAsin,
    rating: normalizeNumberValue(value.rating, { min: 0, max: 5 }),
    title,
    content,
    date: normalizeStringValue(value.date, { allowEmpty: true }),
    verifiedPurchase: Boolean(value.verifiedPurchase),
    helpfulVotes: normalizeNumberValue(value.helpfulVotes, {
      min: 0,
      integer: true,
    }),
  };
}

function normalizeListings(value: unknown): CompetitorListing[] {
  if (!Array.isArray(value)) {
    throw new RouteError("listings must be an array.", {
      status: 400,
      code: "listings_invalid",
    });
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

  if (!asin || !title || bulletPoints.length === 0) {
    return null;
  }

  return {
    asin,
    title,
    bulletPoints,
    attributes: normalizeStringRecord(value.attributes),
    price: normalizeNumberValue(value.price, { min: 0 }),
    rating: normalizeNumberValue(value.rating, { min: 0, max: 5 }),
    reviews: normalizeNumberValue(value.reviews, { min: 0, integer: true }),
    monthlySales: normalizeNumberValue(value.monthlySales, {
      min: 0,
      integer: true,
    }),
    bsr: normalizeNumberValue(value.bsr, { min: 0, integer: true }),
    mainImage: normalizeStringValue(value.mainImage, { allowEmpty: true }),
  };
}

function parseKeywordsResponse(value: unknown): KeywordsResponsePayload {
  if (!isRecord(value)) {
    throw new RouteError("VOC analysis returned an invalid JSON shape.", {
      status: 502,
      code: "voc_invalid_shape",
      retryable: true,
    });
  }

  const painPoints = Array.isArray(value.painPoints)
    ? value.painPoints
        .map((item, index) => normalizePainPoint(item, index))
        .filter((item): item is PainPoint => item !== null)
    : [];

  const valuePoints = Array.isArray(value.valuePoints)
    ? value.valuePoints
        .map((item) => normalizeValuePoint(item))
        .filter((item): item is ValuePoint => item !== null)
    : [];

  const competitorAnalysis = Array.isArray(value.competitorAnalysis)
    ? value.competitorAnalysis
        .map((item) => normalizeCompetitorAnalysis(item))
        .filter((item): item is CompetitorCopyAnalysis => item !== null)
    : [];

  if (
    painPoints.length === 0 &&
    valuePoints.length === 0 &&
    competitorAnalysis.length === 0
  ) {
    throw new RouteError("VOC analysis returned an empty result.", {
      status: 502,
      code: "voc_empty_result",
      retryable: true,
    });
  }

  return {
    painPoints,
    valuePoints,
    competitorAnalysis,
  };
}

function normalizePainPoint(value: unknown, index: number): PainPoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const category =
    normalizeStringValue(value.category, {
      allowEmpty: true,
      fallback: "其他",
    }) || "其他";
  const typicalQuotes = normalizeTextList(value.typicalQuotes, {
    maxItems: 3,
    unique: true,
  });
  const sellingPointSuggestion = normalizeStringValue(
    value.sellingPointSuggestion,
    { allowEmpty: true }
  );

  if (!category && typicalQuotes.length === 0 && !sellingPointSuggestion) {
    return null;
  }

  return {
    rank: normalizeNumberValue(value.rank, {
      min: 1,
      integer: true,
      fallback: index + 1,
    }),
    category: category as PainPoint["category"],
    frequency: normalizeNumberValue(value.frequency, { min: 0, integer: true }),
    percentage: normalizeNumberValue(value.percentage, { min: 0, max: 100 }),
    typicalQuotes,
    sellingPointSuggestion,
  };
}

function normalizeValuePoint(value: unknown): ValuePoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const category = normalizeStringValue(value.category, { allowEmpty: true });
  const typicalQuotes = normalizeTextList(value.typicalQuotes, {
    maxItems: 3,
    unique: true,
  });
  const leverageSuggestion = normalizeStringValue(value.leverageSuggestion, {
    allowEmpty: true,
  });

  if (!category && typicalQuotes.length === 0 && !leverageSuggestion) {
    return null;
  }

  return {
    category: category || "其他",
    frequency: normalizeNumberValue(value.frequency, { min: 0, integer: true }),
    percentage: normalizeNumberValue(value.percentage, { min: 0, max: 100 }),
    typicalQuotes,
    leverageSuggestion,
  };
}

function normalizeCompetitorAnalysis(
  value: unknown
): CompetitorCopyAnalysis | null {
  if (!isRecord(value)) {
    return null;
  }

  const asin = normalizeStringValue(value.asin, { allowEmpty: true });
  const titleStructure = normalizeStringValue(value.titleStructure, {
    allowEmpty: true,
  });
  const bulletPointLogic = normalizeTextList(value.bulletPointLogic, {
    maxItems: 5,
  });
  const keywordCoverage = normalizeTextList(value.keywordCoverage, {
    maxItems: 12,
    unique: true,
  });
  const strengths = normalizeTextList(value.strengths, {
    maxItems: 5,
    unique: true,
  });
  const weaknesses = normalizeTextList(value.weaknesses, {
    maxItems: 5,
    unique: true,
  });

  if (
    !asin &&
    !titleStructure &&
    bulletPointLogic.length === 0 &&
    keywordCoverage.length === 0 &&
    strengths.length === 0 &&
    weaknesses.length === 0
  ) {
    return null;
  }

  return {
    asin,
    titleStructure,
    bulletPointLogic,
    keywordCoverage,
    strengths,
    weaknesses,
  };
}

function buildVocPrompt(
  payload: KeywordsRequestPayload,
  attempt: number
): string {
  const allNegativeReviews = Object.values(payload.reviews).flat();
  const allPositiveReviews = Object.values(payload.positiveReviews).flat();

  const negativeReviewSummary = allNegativeReviews
    .slice(0, 60)
    .map((review) => formatReview(review))
    .join("\n");

  const positiveReviewSummary = allPositiveReviews
    .slice(0, 60)
    .map((review) => formatReview(review))
    .join("\n");

  const listingSummary = payload.listings
    .map((listing) =>
      [
        `ASIN: ${listing.asin}`,
        `Title: ${listing.title}`,
        "Bullet points:",
        listing.bulletPoints
          .map((point, index) => `${index + 1}. ${point}`)
          .join("\n"),
        `Price: $${listing.price} | Rating: ${listing.rating} | Reviews: ${listing.reviews} | BSR: #${listing.bsr}`,
      ].join("\n")
    )
    .join("\n\n---\n\n");

  return `
Use the supplied competitor listings and reviews to produce a VOC summary for downstream listing strategy work.

Return all analysis text in Simplified Chinese.

Competitor listings:
${listingSummary}

Negative reviews (${allNegativeReviews.length}):
${negativeReviewSummary || "None"}

Positive reviews (${allPositiveReviews.length}):
${positiveReviewSummary || "None"}

Return exactly one JSON object with this shape:
{
  "painPoints": [
    {
      "rank": 1,
      "category": "痛点类型",
      "frequency": 12,
      "percentage": 24,
      "typicalQuotes": ["原文摘录1", "原文摘录2"],
      "sellingPointSuggestion": "对应卖点建议"
    }
  ],
  "valuePoints": [
    {
      "category": "价值点类型",
      "frequency": 8,
      "percentage": 16,
      "typicalQuotes": ["原文摘录1", "原文摘录2"],
      "leverageSuggestion": "如何在 Listing 中放大这个价值点"
    }
  ],
  "competitorAnalysis": [
    {
      "asin": "B0XXXXXXX",
      "titleStructure": "标题结构分析",
      "bulletPointLogic": ["第1点逻辑", "第2点逻辑", "第3点逻辑"],
      "keywordCoverage": ["关键词1", "关键词2"],
      "strengths": ["优势1", "优势2"],
      "weaknesses": ["弱点1", "弱点2"]
    }
  ]
}

Rules:
- painPoints should prioritize common and actionable issues.
- valuePoints must use positive-review evidence only.
- typicalQuotes must be direct excerpts from the supplied reviews.
- competitorAnalysis must be based only on the supplied listings.
- Return JSON only.
${getRetryPromptSuffix(attempt)}
  `.trim();
}

function formatReview(review: ReviewData): string {
  const title = review.title || "无标题";
  const content = review.content || "无正文";
  return `[${review.rating}星] ${title}: ${content}`;
}

function normalizeStringRecord(value: unknown): Record<string, string> {
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
