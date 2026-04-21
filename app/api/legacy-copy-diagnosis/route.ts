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
  requestStructuredJson,
  resolveAiConfig,
  toErrorResponse,
} from "@/lib/ai-route-helpers";
import { buildLegacyDiagnosisReport } from "@/lib/legacy-copy-diagnosis/analysis";
import type {
  LegacyAiOutput,
  LegacyCopyDiagnosisRequest,
  LegacyDiagnosisReport,
} from "@/lib/legacy-copy-diagnosis/types";
import {
  getCompetitorListing,
  getCompetitorReviews,
  getTrafficKeywords,
  isSellerSpriteClientError,
} from "@/lib/seller-sprite-client";
import type { SellerSpriteRuntimeConfig } from "@/lib/types";

const DEFAULT_MODEL = "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B";

const LEGACY_DIAGNOSIS_SYSTEM_PROMPT = [
  "You diagnose Amazon legacy listing copy for an internal workflow.",
  "Return exactly one valid JSON object.",
  "Do not use markdown code fences.",
  "Do not add explanations before or after the JSON.",
  "All output must be in Simplified Chinese except the rewritten Amazon copy fields.",
].join(" ");

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const runtimeConfig = readAiRuntimeConfig(body);
    const payload = validateRequest(body);
    const sellerSpriteConfig = payload.sellerSpriteConfig;

    const [
      targetListing,
      targetNegativeReviews,
      targetPositiveReviews,
      targetKeywords,
      competitorListings,
      competitorKeywords,
    ] = await Promise.all([
      getCompetitorListing(
        payload.targetAsin,
        payload.marketplace,
        sellerSpriteConfig
      ),
      getCompetitorReviews(
        payload.targetAsin,
        "negative",
        40,
        payload.marketplace,
        sellerSpriteConfig
      ),
      getCompetitorReviews(
        payload.targetAsin,
        "positive",
        40,
        payload.marketplace,
        sellerSpriteConfig
      ),
      getTrafficKeywords(
        payload.targetAsin,
        payload.marketplace,
        sellerSpriteConfig
      ),
      Promise.all(
        payload.competitorAsins.map((asin) =>
          getCompetitorListing(asin, payload.marketplace, sellerSpriteConfig)
        )
      ),
      Promise.all(
        payload.competitorAsins.map(async (asin) => ({
          asin,
          keywords: await getTrafficKeywords(
            asin,
            payload.marketplace,
            sellerSpriteConfig
          ),
        }))
      ).then((entries) =>
        Object.fromEntries(entries.map((entry) => [entry.asin, entry.keywords]))
      ),
    ]);

    const report = buildLegacyDiagnosisReport({
      marketplace: payload.marketplace,
      targetAsin: payload.targetAsin,
      targetListing,
      targetNegativeReviews,
      targetPositiveReviews,
      targetKeywords,
      competitorListings,
      competitorKeywords,
      currentTitle: payload.currentTitle,
      currentBullets: payload.currentBullets,
      currentSearchTerms: payload.currentSearchTerms,
    });

    const aiSection = await maybeGenerateAiRecommendations(report, runtimeConfig);

    return Response.json({
      ...report,
      ai: aiSection,
    } satisfies LegacyDiagnosisReport);
  } catch (error) {
    if (isSellerSpriteClientError(error)) {
      error = new RouteError(error.message, {
        status: error.statusCode,
        code: `seller_sprite_${error.code}`,
        retryable: error.code === "timeout" || error.code === "upstream",
      });
    }

    if (!(error instanceof RouteError) || error.status >= 500) {
      logRouteError("legacy-copy-diagnosis", error);
    }

    return toErrorResponse(error, "老品文案诊断失败。");
  }
}

function validateRequest(body: Record<string, unknown>): LegacyCopyDiagnosisRequest {
  const marketplace =
    normalizeStringValue(body.marketplace, { allowEmpty: true }).toUpperCase() ||
    "US";
  const targetAsin = normalizeAsin(body.targetAsin);
  const competitorAsins = normalizeAsinList(body.competitorAsins);
  const currentTitle = normalizeStringValue(body.currentTitle, { allowEmpty: true });
  const currentSearchTerms = normalizeStringValue(body.currentSearchTerms, {
    allowEmpty: true,
  });
  const currentBullets = normalizeBulletInput(body.currentBullets);
  const sellerSpriteConfig = normalizeSellerSpriteConfig(body.sellerSpriteConfig);

  if (!targetAsin) {
    throw new RouteError("请输入有效的目标 ASIN。", {
      status: 400,
      code: "target_asin_required",
    });
  }

  return {
    marketplace,
    targetAsin,
    competitorAsins: competitorAsins
      .filter((asin) => asin !== targetAsin)
      .slice(0, 5),
    currentTitle,
    currentBullets,
    currentSearchTerms,
    sellerSpriteConfig,
  };
}

function normalizeSellerSpriteConfig(
  value: unknown
): SellerSpriteRuntimeConfig | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new RouteError("sellerSpriteConfig 必须是对象。", {
      status: 400,
      code: "seller_sprite_config_invalid",
    });
  }

  const baseUrl = normalizeStringValue(value.baseUrl ?? value.baseURL, {
    allowEmpty: true,
  });
  const secretKey = normalizeStringValue(
    value.secretKey ?? value.secret_key,
    {
      allowEmpty: true,
    }
  );
  const requestTimeoutMs = normalizePositiveInteger(
    value.requestTimeoutMs ?? value.timeoutMs ?? value.timeout,
    "sellerSpriteConfig.requestTimeoutMs"
  );

  const config: SellerSpriteRuntimeConfig = {};

  if (baseUrl) {
    config.baseUrl = baseUrl;
  }

  if (secretKey) {
    config.secretKey = secretKey;
  }

  if (requestTimeoutMs !== undefined) {
    config.requestTimeoutMs = requestTimeoutMs;
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

function normalizePositiveInteger(
  value: unknown,
  fieldName: string
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RouteError(`${fieldName} 必须是正整数。`, {
      status: 400,
      code: "seller_sprite_timeout_invalid",
    });
  }

  return parsed;
}

function normalizeBulletInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeTextList(value, {
      maxItems: 8,
    });
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\r?\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  return [];
}

function normalizeAsinList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => normalizeAsin(item))
          .filter((item): item is string => Boolean(item))
      )
    );
  }

  if (typeof value === "string" && value.trim()) {
    return Array.from(
      new Set(
        value
          .split(/[\s,，;；]+/)
          .map((item) => normalizeAsin(item))
          .filter((item): item is string => Boolean(item))
      )
    );
  }

  return [];
}

function normalizeAsin(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(normalized) ? normalized : "";
}

async function maybeGenerateAiRecommendations(
  report: LegacyDiagnosisReport,
  runtimeConfig: ReturnType<typeof readAiRuntimeConfig>
): Promise<LegacyDiagnosisReport["ai"]> {
  let config: ReturnType<typeof resolveAiConfig>;

  try {
    config = resolveAiConfig({
      runtimeConfig,
      defaultModel: DEFAULT_MODEL,
    });
  } catch (error) {
    if (error instanceof RouteError) {
      return {
        used: false,
        provider: null,
        model: null,
        reason: error.message,
        output: null,
      };
    }

    throw error;
  }

  try {
    const output = await requestStructuredJson<LegacyAiOutput>({
      operationName: "legacy copy diagnosis ai recommendations",
      requestText: (attempt) =>
        requestAiTextCompletion({
          config,
          operationName: "legacy copy diagnosis ai recommendations",
          systemPrompt: LEGACY_DIAGNOSIS_SYSTEM_PROMPT,
          userPrompt: buildGroundedAiPrompt(report, attempt),
          maxTokens: 3200,
          temperature: 0,
        }),
      parseResult: (value) => parseAiOutputGrounded(value, report),
    });

    return {
      used: true,
      provider: config.provider,
      model: config.model,
      reason: null,
      output,
    };
  } catch (error) {
    console.warn("[legacy-copy-diagnosis] AI enhancement skipped.", error);

    return {
      used: false,
      provider: config.provider,
      model: config.model,
      reason: error instanceof Error ? error.message : "AI enhancement unavailable.",
      output: null,
    };
  }
}

/* eslint-disable @typescript-eslint/no-unused-vars */
function buildAiPrompt(report: LegacyDiagnosisReport, attempt: number): string {
  const pillarSummary = report.pillars
    .map(
      (pillar) =>
        `${pillar.title}: ${pillar.score}/${pillar.maxScore}; summary=${pillar.summary}; findings=${pillar.findings.join(
          " | "
        )}; actions=${pillar.recommendedActions.join(" | ")}`
    )
    .join("\n");

  const competitorSummary = report.competitorSnapshots
    .map(
      (item) =>
        `${item.asin}: price=${item.price}, rating=${item.rating}, reviews=${item.reviews}, keywords=${item.keywordCount}, topKeywords=${item.topKeywords.join(
          ", "
        )}`
    )
    .join("\n");

  const keywordGapSummary = report.keywordGaps
    .slice(0, 8)
    .map(
      (item) =>
        `${item.keyword}: search=${item.searchVolume}, targetOrganic=${item.targetOrganicRank || "-"}, competitor=${item.bestCompetitorAsin || "-"} ${item.bestCompetitorOrganicRank || "-"}, coverage=${item.coverage.title ? "title " : ""}${item.coverage.bullets ? "bullets " : ""}${item.coverage.searchTerms ? "st " : ""}, reason=${item.reason}`
    )
    .join("\n");

  const reviewSummary = [
    `Negative themes: ${report.negativeThemes
      .map((item) => `${item.phrase}(${item.count})`)
      .join(", ") || "None"}`,
    `Positive themes: ${report.positiveThemes
      .map((item) => `${item.phrase}(${item.count})`)
      .join(", ") || "None"}`,
  ].join("\n");
  const reviewSamples = [
    ...report.negativeThemes
      .slice(0, 3)
      .map((item) => `negative: phrase=${item.phrase}; sample=${item.sample}`),
    ...report.positiveThemes
      .slice(0, 2)
      .map((item) => `positive: phrase=${item.phrase}; sample=${item.sample}`),
  ].join("\n");
  const targetAttributeSummary = summarizeListingAttributes(report.targetListing.attributes);
  const pillarEvidenceSummary = report.pillars
    .map(
      (pillar) =>
        `${pillar.title} evidence: ${pillar.evidence.slice(0, 3).join(" | ") || "None"}`
    )
    .join("\n");
  const groundingTokens = buildGroundingTokens(report).join(", ");

  return `
你要根据已有规则诊断结果，输出一份更像资深运营顾问写的“老品文案诊断优化建议”。

背景:
- Marketplace: ${report.marketplace}
- Target ASIN: ${report.targetAsin}
- Current score: ${report.score.total}/100 (${report.score.label})
- Score headline: ${report.score.headline}

当前可见文案:
- Title: ${report.resolvedTitle || "None"}
- Bullets:
${report.resolvedBullets.map((item, index) => `${index + 1}. ${item}`).join("\n") || "None"}
- Search Terms: ${report.resolvedSearchTerms || "None"}

规则诊断摘要:
${pillarSummary}

关键词缺口:
${keywordGapSummary || "None"}

评论信号:
${reviewSummary}

竞品摘要:
${competitorSummary || "None"}

请只返回一个 JSON 对象，格式如下:
{
  "executiveSummary": "中文总评，1段",
  "quickWins": ["中文快改动作1", "中文快改动作2", "中文快改动作3"],
  "titleSuggestion": "English Amazon title",
  "bulletSuggestions": [
    "English bullet 1",
    "English bullet 2",
    "English bullet 3",
    "English bullet 4",
    "English bullet 5"
  ],
  "searchTermsSuggestion": "English backend search terms",
  "p0Actions": ["中文P0动作1", "中文P0动作2"],
  "p1Actions": ["中文P1动作1", "中文P1动作2"],
  "p2Actions": ["中文P2动作1", "中文P2动作2"],
  "watchouts": ["中文风险提示1", "中文风险提示2"]
}

规则:
- executiveSummary、quickWins、p0Actions、p1Actions、p2Actions、watchouts 用简体中文。
- titleSuggestion、bulletSuggestions、searchTermsSuggestion 必须用英文。
- 重写建议必须严格基于现有诊断数据，不要凭空虚构产品功能。
- 优先处理关键词缺口、评论高频顾虑、移动端可读性、广告依赖和场景映射问题。
- titleSuggestion 控制在 200 字符内。
- bulletSuggestions 必须正好 5 条。
- searchTermsSuggestion 控制在 250 字符内，尽量避免与标题机械重复。
- 返回 JSON only。
${getRetryPromptSuffix(attempt)}
  `.trim();
}
/* eslint-enable @typescript-eslint/no-unused-vars */

function buildGroundedAiPrompt(
  report: LegacyDiagnosisReport,
  attempt: number
): string {
  const pillarSummary = report.pillars
    .map(
      (pillar) =>
        `${pillar.title}: ${pillar.score}/${pillar.maxScore}; summary=${pillar.summary}; findings=${pillar.findings.join(
          " | "
        )}; actions=${pillar.recommendedActions.join(" | ")}`
    )
    .join("\n");

  const competitorSummary = report.competitorSnapshots
    .map(
      (item) =>
        `${item.asin}: title=${item.title}; price=${item.price}; rating=${item.rating}; reviews=${item.reviews}; keywordCount=${item.keywordCount}; topKeywords=${item.topKeywords.join(
          ", "
        )}`
    )
    .join("\n");

  const keywordGapSummary = report.keywordGaps
    .slice(0, 12)
    .map(
      (item) =>
        `${item.keyword}: search=${item.searchVolume}; targetOrganic=${item.targetOrganicRank || "-"}; competitor=${item.bestCompetitorAsin || "-"} ${item.bestCompetitorOrganicRank || "-"}; coverage=${item.coverage.title ? "title " : ""}${item.coverage.bullets ? "bullets " : ""}${item.coverage.searchTerms ? "searchTerms " : ""}; reason=${item.reason}`
    )
    .join("\n");

  const reviewSummary = [
    `Negative themes: ${report.negativeThemes
      .map((item) => `${item.phrase}(${item.count})`)
      .join(", ") || "None"}`,
    `Positive themes: ${report.positiveThemes
      .map((item) => `${item.phrase}(${item.count})`)
      .join(", ") || "None"}`,
  ].join("\n");

  const reviewSamples = [
    ...report.negativeThemes
      .slice(0, 5)
      .map((item) => `negative sample: ${item.phrase} => ${item.sample}`),
    ...report.positiveThemes
      .slice(0, 4)
      .map((item) => `positive sample: ${item.phrase} => ${item.sample}`),
  ].join("\n");

  const pillarEvidenceSummary = report.pillars
    .map(
      (pillar) =>
        `${pillar.title} evidence: ${pillar.evidence.slice(0, 4).join(" | ") || "None"}`
    )
    .join("\n");

  const targetAttributeSummary = summarizeListingAttributes(report.targetListing.attributes);
  const groundingTokens = buildGroundingTokens(report).join(", ");
  const copyGroundingTokens = buildCopyGroundingTokens(report).join(", ");
  const targetTrafficKeywordSummary = [...report.targetKeywords]
    .sort(
      (left, right) =>
        right.conversionShare - left.conversionShare || right.searchVolume - left.searchVolume
    )
    .slice(0, 12)
    .map(
      (item) =>
        `${item.keyword}: search=${item.searchVolume}; organic=${item.organicRank || "-"}; sponsored=${item.sponsoredRank || "-"}; conversionShare=${item.conversionShare}`
    )
    .join("\n");

  return `
You are diagnosing one specific Amazon listing. Ground every recommendation in the supplied evidence.

Context:
- Marketplace: ${report.marketplace}
- Target ASIN: ${report.targetAsin}
- Score: ${report.score.total}/100 (${report.score.label})
- Headline: ${report.score.headline}
- Target listing facts: price=${report.targetListing.price}; rating=${report.targetListing.rating}; reviews=${report.targetListing.reviews}; bsr=${report.targetListing.bsr}; monthlySales=${report.targetListing.monthlySales}
- Target listing attributes: ${targetAttributeSummary}

Current listing copy:
- Title: ${report.resolvedTitle || "None"}
- Bullets:
${report.resolvedBullets.map((item, index) => `${index + 1}. ${item}`).join("\n") || "None"}
- Search terms: ${report.resolvedSearchTerms || "None"}

Rule-based diagnosis:
${pillarSummary}

Keyword gaps:
${keywordGapSummary || "None"}

Review themes:
${reviewSummary}

Review samples:
${reviewSamples || "None"}

Traffic keyword leaderboard:
${targetTrafficKeywordSummary || "None"}

Competitor summary:
${competitorSummary || "None"}

Pillar evidence:
${pillarEvidenceSummary}

Grounding tokens:
${groundingTokens}

Copy grounding tokens:
${copyGroundingTokens}

Return exactly one JSON object with this schema:
{
  "executiveSummary": "简体中文，1-2段",
  "quickWins": ["简体中文动作1", "简体中文动作2", "简体中文动作3"],
  "titleSuggestion": "<concrete English title for this ASIN>",
  "bulletSuggestions": [
    "<concrete English bullet 1 for this ASIN>",
    "<concrete English bullet 2 for this ASIN>",
    "<concrete English bullet 3 for this ASIN>",
    "<concrete English bullet 4 for this ASIN>",
    "<concrete English bullet 5 for this ASIN>"
  ],
  "searchTermsSuggestion": "<concrete English backend search terms for this ASIN>",
  "p0Actions": ["简体中文P0动作1", "简体中文P0动作2"],
  "p1Actions": ["简体中文P1动作1", "简体中文P1动作2"],
  "p2Actions": ["简体中文P2动作1", "简体中文P2动作2"],
  "watchouts": ["简体中文风险1", "简体中文风险2"]
}

Rules:
- executiveSummary, quickWins, p0Actions, p1Actions, p2Actions, watchouts must be in Simplified Chinese.
- titleSuggestion, bulletSuggestions, searchTermsSuggestion must be in English.
- Every recommendation in executiveSummary, quickWins, p0Actions, p1Actions, p2Actions, watchouts must mention at least one concrete anchor from the grounding tokens, review samples, competitor ASINs, or pillar evidence.
- titleSuggestion must reference at least two concrete copy grounding tokens.
- At least four bulletSuggestions must each reference at least one concrete copy grounding token.
- searchTermsSuggestion must prioritize uncovered keyword gaps from the report instead of generic filler.
- If there is not enough evidence for a recommendation, say that explicitly instead of giving generic advice.
- Do not use generic filler like "提升转化", "优化关键词", "增强卖点" unless it is immediately tied to a concrete field, keyword, review phrase, title fragment, or competitor.
- Do not invent product claims that are not present in the evidence.
- titleSuggestion must stay within 200 characters.
- bulletSuggestions must contain exactly 5 items.
- searchTermsSuggestion must stay within 250 characters and avoid obvious repetition from the title.
- Return JSON only.
${getRetryPromptSuffix(attempt)}
  `.trim();
}

function parseAiOutput(value: unknown): LegacyAiOutput {
  if (!isRecord(value)) {
    throw new RouteError("AI 诊断结果 JSON 结构无效。", {
      status: 502,
      code: "legacy_ai_invalid_shape",
      retryable: true,
    });
  }

  const bulletSuggestions = normalizeTextList(value.bulletSuggestions, {
    maxItems: 5,
  });

  if (bulletSuggestions.length !== 5) {
    throw new RouteError("AI 没有返回 5 条 bullet 建议。", {
      status: 502,
      code: "legacy_ai_bullets_invalid",
      retryable: true,
    });
  }

  return {
    executiveSummary: normalizeStringValue(value.executiveSummary, {
      allowEmpty: true,
    }),
    quickWins: normalizeTextList(value.quickWins, {
      maxItems: 5,
      unique: true,
    }),
    titleSuggestion: normalizeStringValue(value.titleSuggestion, {
      allowEmpty: true,
    }),
    bulletSuggestions,
    searchTermsSuggestion: normalizeStringValue(value.searchTermsSuggestion, {
      allowEmpty: true,
    }),
    p0Actions: normalizeTextList(value.p0Actions, {
      maxItems: 6,
      unique: true,
    }),
    p1Actions: normalizeTextList(value.p1Actions, {
      maxItems: 6,
      unique: true,
    }),
    p2Actions: normalizeTextList(value.p2Actions, {
      maxItems: 6,
      unique: true,
    }),
    watchouts: normalizeTextList(value.watchouts, {
      maxItems: 6,
      unique: true,
    }),
  };
}

function parseAiOutputGrounded(
  value: unknown,
  report: LegacyDiagnosisReport
): LegacyAiOutput {
  const output = parseAiOutput(value);
  validateAiOutputSpecificity(output, report);
  return output;
}

function validateAiOutputSpecificity(
  output: LegacyAiOutput,
  report: LegacyDiagnosisReport
): void {
  const serializedOutput = [
    output.executiveSummary,
    ...output.quickWins,
    output.titleSuggestion,
    ...output.bulletSuggestions,
    output.searchTermsSuggestion,
    ...output.p0Actions,
    ...output.p1Actions,
    ...output.p2Actions,
    ...output.watchouts,
  ]
    .join("\n")
    .trim();

  if (!serializedOutput) {
    /*
    throw new RouteError("AI 杈撳嚭涓虹┖锛屾棤娉曠敤浜庤€佸搧璇婃柇銆?, {
      status: 502,
      code: "legacy_ai_empty",
      retryable: true,
    });
  }

    */
    throw new RouteError("AI output was empty and could not be used for legacy diagnosis.", {
      status: 502,
      code: "legacy_ai_empty",
      retryable: true,
    });
  }

  const placeholderFragments = [
    "<concrete English title",
    "<concrete English bullet",
    "<concrete English backend search terms",
    "<grounded Simplified Chinese",
    "<one grounded Simplified Chinese",
  ];

  if (placeholderFragments.some((fragment) => serializedOutput.includes(fragment))) {
    /*
    throw new RouteError("AI 杩斿洖浜嗘ā鏉垮寲鍗犱綅鍐呭銆?, {
      status: 502,
      code: "legacy_ai_placeholder_output",
      retryable: true,
    });
  }

    */
    throw new RouteError("AI returned placeholder content instead of grounded copy.", {
      status: 502,
      code: "legacy_ai_placeholder_output",
      retryable: true,
    });
  }

  const groundingTokens = buildGroundingTokens(report);
  const copyGroundingTokens = buildCopyGroundingTokens(report);
  const groundedActionCount = [
    ...output.quickWins,
    ...output.p0Actions,
    ...output.p1Actions,
    ...output.p2Actions,
    ...output.watchouts,
  ].filter((item) => containsGroundingToken(item, groundingTokens)).length;
  const uniqueGroundingHits = new Set(
    groundingTokens.filter((token) =>
      serializedOutput.toLowerCase().includes(token.toLowerCase())
    )
  );
  const titleGroundingHits = countGroundingMatches(
    output.titleSuggestion,
    copyGroundingTokens
  );
  const groundedBullets = output.bulletSuggestions.filter(
    (item) => countGroundingMatches(item, copyGroundingTokens) > 0
  );
  const searchTermGroundingHits = countGroundingMatches(
    output.searchTermsSuggestion,
    report.keywordGaps.slice(0, 12).map((item) => item.keyword)
  );

  if (uniqueGroundingHits.size < 3 || groundedActionCount < 3) {
    /*
    throw new RouteError("AI 杈撳嚭缂轰箯鍟嗗搧璇佹嵁锛岀浉鍏虫€т笉瓒炽€?, {
      status: 502,
      code: "legacy_ai_not_grounded",
      retryable: true,
      logDetails: {
        groundingHits: Array.from(uniqueGroundingHits),
        groundedActionCount,
      },
    });
  }

    */
    throw new RouteError("AI output was not grounded enough in product-specific evidence.", {
      status: 502,
      code: "legacy_ai_not_grounded",
      retryable: true,
      logDetails: {
        groundingHits: Array.from(uniqueGroundingHits),
        groundedActionCount,
      },
    });
  }

  if (
    titleGroundingHits < 2 ||
    groundedBullets.length < 4 ||
    searchTermGroundingHits < 2
  ) {
    throw new RouteError("AI copy suggestions are not grounded enough in listing-specific evidence.", {
      status: 502,
      code: "legacy_ai_copy_not_grounded",
      retryable: true,
      logDetails: {
        titleGroundingHits,
        groundedBulletCount: groundedBullets.length,
        searchTermGroundingHits,
      },
    });
  }
}

function buildGroundingTokens(report: LegacyDiagnosisReport): string[] {
  const tokens = new Set<string>();

  tokens.add(report.targetAsin);
  report.keywordGaps.slice(0, 12).forEach((item) => tokens.add(item.keyword));
  [...report.negativeThemes, ...report.positiveThemes]
    .slice(0, 10)
    .forEach((item) => tokens.add(item.phrase));
  report.competitorSnapshots
    .slice(0, 5)
    .forEach((item) => {
      tokens.add(item.asin);
      item.topKeywords.slice(0, 3).forEach((keyword) => tokens.add(keyword));
    });
  report.pillars
    .flatMap((pillar) => pillar.evidence)
    .slice(0, 18)
    .forEach((item) => {
      if (item.length >= 3) {
        tokens.add(item);
      }
    });
  [...report.targetKeywords]
    .sort(
      (left, right) =>
        right.conversionShare - left.conversionShare || right.searchVolume - left.searchVolume
    )
    .slice(0, 12)
    .forEach((item) => tokens.add(item.keyword));
  Object.values(report.targetListing.attributes)
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
    .slice(0, 10)
    .forEach((value) => tokens.add(value));

  return Array.from(tokens)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 48);
}

function buildCopyGroundingTokens(report: LegacyDiagnosisReport): string[] {
  const tokens = new Set<string>();

  report.keywordGaps.slice(0, 12).forEach((item) => tokens.add(item.keyword));
  [...report.targetKeywords]
    .sort(
      (left, right) =>
        right.conversionShare - left.conversionShare || right.searchVolume - left.searchVolume
    )
    .slice(0, 12)
    .forEach((item) => tokens.add(item.keyword));
  [...report.negativeThemes, ...report.positiveThemes]
    .slice(0, 8)
    .forEach((item) => tokens.add(item.phrase));
  report.competitorSnapshots
    .slice(0, 5)
    .forEach((item) => {
      item.topKeywords.slice(0, 3).forEach((keyword) => tokens.add(keyword));
    });

  return Array.from(tokens)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 36);
}

function containsGroundingToken(text: string, groundingTokens: string[]): boolean {
  const normalizedText = text.toLowerCase();
  return groundingTokens.some((token) => normalizedText.includes(token.toLowerCase()));
}

function countGroundingMatches(text: string, groundingTokens: string[]): number {
  const normalizedText = text.toLowerCase();

  return new Set(
    groundingTokens.filter((token) => normalizedText.includes(token.toLowerCase()))
  ).size;
}

function summarizeListingAttributes(attributes: Record<string, string>): string {
  const entries = Object.entries(attributes)
    .map(([key, value]) => `${key}=${value}`)
    .filter((entry) => entry.trim())
    .slice(0, 8);

  return entries.length > 0 ? entries.join("; ") : "None";
}
