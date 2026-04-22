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
import { getListingDefaultModel } from "@/lib/listing-ai-runtime";
import { enrichListingVersions } from "@/lib/listing-operator";
import { selectTrafficKeywords } from "@/lib/traffic-keyword-helpers";
import type {
  ComplianceResult,
  CreativeBrief,
  DataAnalysisResult,
  ExperimentPlanItem,
  KeywordStrategy,
  ListingVersion,
  PainPoint,
  ProductProfile,
  RufusIntentLayer,
  RufusQaItem,
  TrafficKeyword,
  ValuePoint,
} from "@/lib/types";

const LISTING_SYSTEM_PROMPT = [
  "You generate Amazon listing copy for an internal operator workflow.",
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
    const runtimeConfig = readAiRuntimeConfig(body, request);
    const payload = validateGenerateCopyRequest(body);
    const config = resolveAiConfig({
      runtimeConfig,
      defaultModel: getListingDefaultModel("listingGeneration"),
    });

    const partialVersions = await requestStructuredJson<ListingVersion[]>({
      operationName: "listing generation",
      requestText: (attempt) =>
        requestAiTextCompletion({
          config,
          operationName: "listing generation",
          systemPrompt: LISTING_SYSTEM_PROMPT,
          userPrompt: buildListingPrompt(payload, attempt),
          maxTokens: payload.lightMode ? 3600 : 7000,
          temperature: 0,
        }),
      parseResult: parseGeneratedVersions,
    });

    const versions = enrichListingVersions(partialVersions, {
      productProfile: payload.productProfile,
      coreSellingPoints: payload.coreSellingPoints,
      painPoints: payload.painPoints,
      valuePoints: payload.valuePoints,
      dataAnalysis: payload.dataAnalysis,
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
    productCategory: normalizeStringValue(value.productCategory, {
      allowEmpty: true,
    }),
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

  return hasUsefulContent ? result : null;
}

function normalizeOpportunityAssessment(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const summary = normalizeStringValue(value.summary, { allowEmpty: true });
  if (!summary) {
    return null;
  }

  const verdictRaw = normalizeStringValue(value.verdict, { allowEmpty: true }).toLowerCase();
  return {
    score: normalizeNumberValue(value.score, { min: 0, max: 100, integer: true }),
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
    breakdown: [],
  } as DataAnalysisResult["opportunityAssessment"];
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

  if (
    titleKeywords.length === 0 &&
    bulletKeywords.length === 0 &&
    searchTermKeywords.length === 0 &&
    ppcCoreKeywords.length === 0 &&
    ppcExploratoryKeywords.length === 0 &&
    negativeKeywords.length === 0
  ) {
    return null;
  }

  return {
    titleKeywords,
    bulletKeywords,
    searchTermKeywords,
    ppcCoreKeywords,
    ppcExploratoryKeywords,
    negativeKeywords,
    campaignPlans: [],
  };
}

function normalizeKeywordItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const keyword = normalizeStringValue(item.keyword, { allowEmpty: true });
      if (!keyword) {
        return null;
      }

      const priorityRaw = normalizeStringValue(item.priority, { allowEmpty: true }).toLowerCase();
      const priority =
        priorityRaw === "high" || priorityRaw === "medium" || priorityRaw === "low"
          ? priorityRaw
          : "medium";

      return {
        keyword,
        priority,
        reason: normalizeStringValue(item.reason, { allowEmpty: true }),
        evidence: normalizeStringValue(item.evidence, { allowEmpty: true }),
      };
    })
    .filter(
      (
        item
      ): item is {
        keyword: string;
        priority: "high" | "medium" | "low";
        reason: string;
        evidence: string;
      } => item !== null
    );
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

  return { scene, audience, objections, comparisons };
}

function normalizeIntentItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const question = normalizeStringValue(item.question, { allowEmpty: true });
      const intent = normalizeStringValue(item.intent, { allowEmpty: true });

      if (!question && !intent) {
        return null;
      }

      return {
        intent,
        question,
        responseAngle: normalizeStringValue(item.responseAngle, { allowEmpty: true }),
        listingHooks: normalizeTextList(item.listingHooks, {
          maxItems: 4,
          unique: true,
        }),
      };
    })
    .filter(
      (
        item
      ): item is {
        intent: string;
        question: string;
        responseAngle: string;
        listingHooks: string[];
      } => item !== null
    );
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
    experiments: normalizeExperimentPlan(value.experiments),
    rufusQa: normalizeRufusQa(value.rufusQa),
    creativeBrief: normalizeCreativeBrief(value.creativeBrief),
  };
}

function normalizeExperimentPlan(value: unknown): ExperimentPlanItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const variable = normalizeStringValue(item.variable, { allowEmpty: true });
      const hypothesis = normalizeStringValue(item.hypothesis, {
        allowEmpty: true,
      });

      if (!variable && !hypothesis) {
        return null;
      }

      return {
        variable,
        hypothesis,
        successMetric: normalizeStringValue(item.successMetric, {
          allowEmpty: true,
        }),
        executionNote: normalizeStringValue(item.executionNote, {
          allowEmpty: true,
        }),
      };
    })
    .filter((item): item is ExperimentPlanItem => item !== null)
    .slice(0, 5);
}

function normalizeRufusQa(value: unknown): RufusQaItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const question = normalizeStringValue(item.question, { allowEmpty: true });
      const answer = normalizeStringValue(item.answer, { allowEmpty: true });

      if (!question && !answer) {
        return null;
      }

      return {
        intent: normalizeStringValue(item.intent, { allowEmpty: true }),
        question,
        answer,
        hook: normalizeStringValue(item.hook, { allowEmpty: true }),
      };
    })
    .filter((item): item is RufusQaItem => item !== null)
    .slice(0, 5);
}

function normalizeCreativeBrief(value: unknown): CreativeBrief | null {
  if (!isRecord(value)) {
    return null;
  }

  const positioning = normalizeStringValue(value.positioning, { allowEmpty: true });
  const aPlusModules = normalizeTextList(value.aPlusModules, {
    maxItems: 5,
    unique: true,
  });

  if (!positioning && aPlusModules.length === 0) {
    return null;
  }

  const shotList = Array.isArray(value.shotList)
    ? value.shotList
        .map((item) => {
          if (!isRecord(item)) {
            return null;
          }

          const title = normalizeStringValue(item.title, { allowEmpty: true });
          if (!title) {
            return null;
          }

          const assetTypeRaw = normalizeStringValue(item.assetType, {
            allowEmpty: true,
          });
          const assetType =
            assetTypeRaw === "image" ||
            assetTypeRaw === "video" ||
            assetTypeRaw === "a-plus"
              ? assetTypeRaw
              : "image";

          return {
            assetType,
            title,
            objective: normalizeStringValue(item.objective, { allowEmpty: true }),
            scene: normalizeStringValue(item.scene, { allowEmpty: true }),
            overlay: normalizeStringValue(item.overlay, { allowEmpty: true }),
            proof: normalizeStringValue(item.proof, { allowEmpty: true }),
          };
        })
        .filter(
          (
            item
          ): item is {
            assetType: "image" | "video" | "a-plus";
            title: string;
            objective: string;
            scene: string;
            overlay: string;
            proof: string;
          } => item !== null
        )
        .slice(0, 6)
    : [];

  return {
    positioning,
    aPlusModules,
    imageAngles: normalizeTextList(value.imageAngles, { maxItems: 5, unique: true }),
    videoAngles: normalizeTextList(value.videoAngles, { maxItems: 5, unique: true }),
    deliverables: normalizeTextList(value.deliverables, {
      maxItems: 6,
      unique: true,
    }),
    shotList,
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
    const bulletCheck = checkFieldCompliance("bulletPoints", version.bulletPoints);
    const descriptionCheck = checkFieldCompliance("description", version.description);
    const searchTermsCheck = checkFieldCompliance("searchTerms", version.searchTerms);

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
        `${point.rank}. [${point.category}] 频次 ${point.frequency}，占比 ${point.percentage}% - 建议: ${point.sellingPointSuggestion}`
    )
    .join("\n");

  const valueSummary = selectedValuePoints
    .map(
      (point) =>
        `[${point.category}] 频次 ${point.frequency}，占比 ${point.percentage}% - 建议: ${point.leverageSuggestion}`
    )
    .join("\n");

  const keywordSummary = selectTrafficKeywords(
    Object.values(payload.trafficKeywords).flat(),
    payload.lightMode ? 8 : 20
  )
    .map(
      (keyword) =>
        `${keyword.keyword} (搜索量 ${keyword.searchVolume}, 转化份额 ${normalizeConversionShare(
          keyword.conversionShare
        ).toFixed(1)}%, 自然位 ${keyword.organicRank || "n/a"}, 广告位 ${
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
        `AI recommendations: ${
          payload.dataAnalysis.aiRecommendations.join(" | ") || "None"
        }`,
        `COSMO focus: ${payload.dataAnalysis.cosmoFocus.join(" | ") || "None"}`,
        `Opportunity summary: ${
          payload.dataAnalysis.opportunityAssessment?.summary || "None"
        }`,
        `Title keywords: ${
          payload.dataAnalysis.keywordStrategy?.titleKeywords
            .map((item) => item.keyword)
            .join(" | ") || "None"
        }`,
        `Rufus intent hooks: ${
          payload.dataAnalysis.rufusIntentLayer?.objections
            .map((item) => item.question)
            .join(" | ") || "None"
        }`,
      ].join("\n")
    : "None";

  return `
Generate Amazon listing copy for an internal operator workflow that combines COSMO-oriented structuring, VOC diagnosis, keyword routing, Rufus intent coverage, and creative execution planning.

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
      "searchTerms": "english backend search terms",
      "experiments": [
        {
          "variable": "what to test",
          "hypothesis": "why this should move the metric",
          "successMetric": "what to watch",
          "executionNote": "how to run a clean experiment"
        }
      ],
      "rufusQa": [
        {
          "intent": "scene / audience / objection / comparison",
          "question": "question shoppers may ask",
          "answer": "how the listing should answer",
          "hook": "which listing hook to reuse"
        }
      ],
      "creativeBrief": {
        "positioning": "how this version should be executed by design",
        "aPlusModules": ["module 1", "module 2"],
        "imageAngles": ["angle 1", "angle 2"],
        "videoAngles": ["angle 1", "angle 2"],
        "deliverables": ["deliverable 1"],
        "shotList": [
          {
            "assetType": "image",
            "title": "shot name",
            "objective": "why this exists",
            "scene": "what to show",
            "overlay": "on-image text direction",
            "proof": "what evidence must appear"
          }
        ]
      }
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
- Add experiments that test title, main image / asset promise, bullet order, and A+ / creative proof.
- Rufus QA must cover scene, audience, objection, or comparison intent.
- creativeBrief must be executable by design / content teams, not generic inspiration.
- Avoid these prohibited words: best, guaranteed, #1, cure, FDA approved, sale, discount, free shipping, amazing, perfect, incredible.
- Keep the title under 200 characters.
- Keep search terms under 250 characters and avoid duplicating obvious title words.
- If light mode is enabled, prefer concise outputs and shorter descriptions to improve response speed.
- Return JSON only.
Mode: ${payload.lightMode ? "light" : "standard"}.
${getRetryPromptSuffix(attempt)}
  `.trim();
}

function normalizeConversionShare(value: number): number {
  if (value <= 1 && value > 0) {
    return value * 100;
  }
  return value;
}
