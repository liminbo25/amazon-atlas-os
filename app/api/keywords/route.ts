import type {
  CompetitorCopyAnalysis,
  CompetitorListing,
  PainPoint,
  ProductProfile,
  ReviewData,
  SupportFaqItem,
  ValuePoint,
  VocActionPlan,
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
import { getListingDefaultModel } from "@/lib/listing-ai-runtime";
import {
  buildSupportFaqs,
  buildVocActionPlan,
} from "@/lib/listing-operator";

const PRIMARY_PROMPT_PLAN: VocPromptPlan = {
  negativeReviewLimit: 18,
  positiveReviewLimit: 12,
  listingLimit: 3,
  bulletPointLimit: 5,
  titleMaxLength: 160,
  bulletMaxLength: 180,
  reviewTitleMaxLength: 80,
  reviewContentMaxLength: 260,
};

const RETRY_PROMPT_PLAN: VocPromptPlan = {
  negativeReviewLimit: 10,
  positiveReviewLimit: 8,
  listingLimit: 2,
  bulletPointLimit: 4,
  titleMaxLength: 120,
  bulletMaxLength: 140,
  reviewTitleMaxLength: 60,
  reviewContentMaxLength: 180,
};

const VOC_SYSTEM_PROMPT = [
  "You analyze Amazon competitor listings and review VOC for operators.",
  "Return exactly one valid JSON object.",
  "Do not use markdown code fences.",
  "Do not add explanations before or after the JSON.",
].join(" ");

interface KeywordsRequestPayload {
  productProfile: ProductProfile;
  reviews: Record<string, ReviewData[]>;
  positiveReviews: Record<string, ReviewData[]>;
  listings: CompetitorListing[];
}

interface KeywordsResponsePayload {
  painPoints: PainPoint[];
  valuePoints: ValuePoint[];
  competitorAnalysis: CompetitorCopyAnalysis[];
  vocActionPlan: VocActionPlan | null;
  supportFaqs: SupportFaqItem[];
}

interface VocPromptPlan {
  negativeReviewLimit: number;
  positiveReviewLimit: number;
  listingLimit: number;
  bulletPointLimit: number;
  titleMaxLength: number;
  bulletMaxLength: number;
  reviewTitleMaxLength: number;
  reviewContentMaxLength: number;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const runtimeConfig = readAiRuntimeConfig(body);
    const payload = validateKeywordsRequest(body);
    const config = resolveAiConfig({
      runtimeConfig,
      defaultModel: getListingDefaultModel("vocAnalysis"),
    });

    const partialResult = await requestStructuredJson<KeywordsResponsePayload>({
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

    const result: KeywordsResponsePayload = {
      ...partialResult,
      vocActionPlan:
        partialResult.vocActionPlan ??
        buildVocActionPlan({
          productProfile: payload.productProfile,
          painPoints: partialResult.painPoints,
          valuePoints: partialResult.valuePoints,
          competitorAnalysis: partialResult.competitorAnalysis,
        }),
      supportFaqs:
        partialResult.supportFaqs.length > 0
          ? partialResult.supportFaqs
          : buildSupportFaqs(
              payload.productProfile.productName,
              partialResult.painPoints,
              partialResult.valuePoints
            ),
    };

    return Response.json(result);
  } catch (error) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("keywords", error);
    }

    return toErrorResponse(error, "VOC analysis failed.");
  }
}

function validateKeywordsRequest(body: Record<string, unknown>): KeywordsRequestPayload {
  const reviews = normalizeReviewGroups(body.reviews, "reviews");
  const positiveReviews = normalizeReviewGroups(
    body.positiveReviews ?? {},
    "positiveReviews"
  );
  const listings = normalizeListings(body.listings);
  const productProfile = normalizeProductProfile(body.productProfile);

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
    productProfile,
    reviews,
    positiveReviews,
    listings,
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
    vocActionPlan: normalizeVocActionPlan(value.vocActionPlan),
    supportFaqs: normalizeSupportFaqs(value.supportFaqs),
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

function normalizeVocActionPlan(value: unknown): VocActionPlan | null {
  if (!isRecord(value)) {
    return null;
  }

  const product = normalizeVocActionItems(value.product);
  const copy = normalizeVocActionItems(value.copy);
  const aPlus = normalizeVocActionItems(value.aPlus);
  const support = normalizeVocActionItems(value.support);

  if (
    product.length === 0 &&
    copy.length === 0 &&
    aPlus.length === 0 &&
    support.length === 0
  ) {
    return null;
  }

  return { product, copy, aPlus, support };
}

function normalizeVocActionItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const title = normalizeStringValue(item.title, { allowEmpty: true });
      const action = normalizeStringValue(item.action, { allowEmpty: true });

      if (!title && !action) {
        return null;
      }

      const priorityRaw = normalizeStringValue(item.priority, { allowEmpty: true }).toLowerCase();
      const priority =
        priorityRaw === "high" || priorityRaw === "medium" || priorityRaw === "low"
          ? priorityRaw
          : "medium";

      return {
        title,
        priority,
        owner: normalizeStringValue(item.owner, { allowEmpty: true }),
        action,
        evidence: normalizeTextList(item.evidence, { maxItems: 4, unique: true }),
      };
    })
    .filter(
      (
        item
      ): item is {
        title: string;
        priority: "high" | "medium" | "low";
        owner: string;
        action: string;
        evidence: string[];
      } => item !== null
    );
}

function normalizeSupportFaqs(value: unknown): SupportFaqItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const question = normalizeStringValue(item.question, { allowEmpty: true });
      const shortAnswer = normalizeStringValue(item.shortAnswer, {
        allowEmpty: true,
      });

      if (!question && !shortAnswer) {
        return null;
      }

      return {
        question,
        shortAnswer,
        supportGuidance: normalizeStringValue(item.supportGuidance, {
          allowEmpty: true,
        }),
        scenario: normalizeStringValue(item.scenario, { allowEmpty: true }),
      };
    })
    .filter((item): item is SupportFaqItem => item !== null)
    .slice(0, 6);
}

function buildVocPrompt(payload: KeywordsRequestPayload, attempt: number): string {
  const promptPlan = resolvePromptPlan(attempt);
  const allNegativeReviews = Object.values(payload.reviews).flat();
  const allPositiveReviews = Object.values(payload.positiveReviews).flat();
  const sampledNegativeReviews = selectRepresentativeReviews(
    allNegativeReviews,
    promptPlan.negativeReviewLimit
  );
  const sampledPositiveReviews = selectRepresentativeReviews(
    allPositiveReviews,
    promptPlan.positiveReviewLimit
  );
  const sampledListings = payload.listings.slice(0, promptPlan.listingLimit);

  const negativeReviewSummary = sampledNegativeReviews
    .map((review) => formatReview(review, promptPlan))
    .join("\n");

  const positiveReviewSummary = sampledPositiveReviews
    .map((review) => formatReview(review, promptPlan))
    .join("\n");

  const listingSummary = sampledListings
    .map((listing) =>
      [
        `ASIN: ${listing.asin}`,
        `Title: ${truncateText(listing.title, promptPlan.titleMaxLength)}`,
        "Bullet points:",
        listing.bulletPoints
          .slice(0, promptPlan.bulletPointLimit)
          .map(
            (point, index) =>
              `${index + 1}. ${truncateText(point, promptPlan.bulletMaxLength)}`
          )
          .join("\n"),
        `Price: $${listing.price} | Rating: ${listing.rating} | Reviews: ${listing.reviews} | BSR: #${listing.bsr}`,
      ].join("\n")
    )
    .join("\n\n---\n\n");

  return `
Use the supplied competitor listings and reviews to produce a VOC summary for downstream Amazon operator execution.

Return all analysis text in Simplified Chinese.
The input below is a representative sample chosen from the supplied dataset to keep latency stable.

Product context:
Brand: ${payload.productProfile.brandName || "None"}
Product: ${payload.productProfile.productName || "None"}
Category: ${payload.productProfile.productCategory || "None"}
Seed keywords: ${payload.productProfile.coreKeywords || "None"}

Competitor listings:
${listingSummary || "None"}

Negative reviews (sampled ${sampledNegativeReviews.length} of ${allNegativeReviews.length}):
${negativeReviewSummary || "None"}

Positive reviews (sampled ${sampledPositiveReviews.length} of ${allPositiveReviews.length}):
${positiveReviewSummary || "None"}

Return exactly one JSON object with this shape:
{
  "painPoints": [
    {
      "rank": 1,
      "category": "Pain point category",
      "frequency": 12,
      "percentage": 24,
      "typicalQuotes": ["Direct quote 1", "Direct quote 2"],
      "sellingPointSuggestion": "Specific listing angle"
    }
  ],
  "valuePoints": [
    {
      "category": "Positive value category",
      "frequency": 8,
      "percentage": 16,
      "typicalQuotes": ["Direct quote 1", "Direct quote 2"],
      "leverageSuggestion": "How to amplify this value in the listing"
    }
  ],
  "competitorAnalysis": [
    {
      "asin": "B0XXXXXXX",
      "titleStructure": "Title structure analysis",
      "bulletPointLogic": ["Bullet logic 1", "Bullet logic 2", "Bullet logic 3"],
      "keywordCoverage": ["keyword 1", "keyword 2"],
      "strengths": ["Strength 1", "Strength 2"],
      "weaknesses": ["Weakness 1", "Weakness 2"]
    }
  ],
  "vocActionPlan": {
    "product": [
      {
        "title": "动作标题",
        "priority": "high",
        "owner": "产品 / 供应链",
        "action": "要做什么",
        "evidence": ["评论原话"]
      }
    ],
    "copy": [],
    "aPlus": [],
    "support": []
  },
  "supportFaqs": [
    {
      "question": "用户会怎么问",
      "shortAnswer": "客服 / 文案简答",
      "supportGuidance": "客服动作",
      "scenario": "场景标签"
    }
  ]
}

Rules:
- painPoints should prioritize common and actionable issues.
- valuePoints must use positive-review evidence only.
- typicalQuotes must be direct excerpts from the supplied reviews.
- competitorAnalysis must be based only on the supplied listings.
- vocActionPlan must split into product / copy / A+ / support four execution lanes.
- supportFaqs must focus on real shopper objections, not generic FAQ filler.
- Return JSON only.
${getRetryPromptSuffix(attempt)}
  `.trim();
}

function resolvePromptPlan(attempt: number): VocPromptPlan {
  return attempt > 1 ? RETRY_PROMPT_PLAN : PRIMARY_PROMPT_PLAN;
}

function selectRepresentativeReviews(
  reviews: ReviewData[],
  limit: number
): ReviewData[] {
  if (reviews.length <= limit) {
    return sortReviewsBySignal(reviews);
  }

  const reviewBuckets = new Map<string, ReviewData[]>();

  for (const review of sortReviewsBySignal(reviews)) {
    const bucketKey = review.asin || "unknown";
    const bucket = reviewBuckets.get(bucketKey) ?? [];
    bucket.push(review);
    reviewBuckets.set(bucketKey, bucket);
  }

  const sampled: ReviewData[] = [];
  while (sampled.length < limit) {
    let pulledAny = false;

    for (const bucket of reviewBuckets.values()) {
      const nextReview = bucket.shift();
      if (!nextReview) {
        continue;
      }

      sampled.push(nextReview);
      pulledAny = true;

      if (sampled.length >= limit) {
        break;
      }
    }

    if (!pulledAny) {
      break;
    }
  }

  return sampled;
}

function sortReviewsBySignal(reviews: ReviewData[]): ReviewData[] {
  return [...reviews].sort((left, right) => {
    const scoreDifference = scoreReview(right) - scoreReview(left);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    const timestampDifference = readReviewTimestamp(right) - readReviewTimestamp(left);
    if (timestampDifference !== 0) {
      return timestampDifference;
    }

    return (
      `${right.title} ${right.content}`.length - `${left.title} ${left.content}`.length
    );
  });
}

function scoreReview(review: ReviewData): number {
  const titleLength = Math.min(review.title.trim().length, 80);
  const contentLength = Math.min(review.content.trim().length, 320);
  const helpfulVotes = Math.min(review.helpfulVotes, 20) * 10;
  const verifiedBonus = review.verifiedPurchase ? 40 : 0;

  return titleLength * 2 + contentLength + helpfulVotes + verifiedBonus;
}

function readReviewTimestamp(review: ReviewData): number {
  const timestamp = Date.parse(review.date);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatReview(review: ReviewData, promptPlan: VocPromptPlan): string {
  const title =
    truncateText(review.title, promptPlan.reviewTitleMaxLength) || "No title";
  const content =
    truncateText(review.content, promptPlan.reviewContentMaxLength) || "No content";

  return `[ASIN ${review.asin}] [${review.rating} stars] ${title}: ${content}`;
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
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
