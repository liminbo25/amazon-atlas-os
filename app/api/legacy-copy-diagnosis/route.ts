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
import { getListingDefaultModel } from "@/lib/listing-ai-runtime";
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
    const runtimeConfig = readAiRuntimeConfig(body, request);
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
      defaultModel: getListingDefaultModel("legacyCopyDiagnosis"),
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
          userPrompt: buildAiPrompt(report, attempt),
          maxTokens: 4200,
          temperature: 0,
        }),
      parseResult: parseAiOutput,
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

  return `
你要根据已有规则诊断结果，输出一份直接可执行的“老品 ASIN 诊断作战台”。
不要解释诊断框架，不要介绍模块能力，不要复述 Excel 来历，不要写“我们升级了什么”。
只回答这个目标 ASIN 当前卡在哪里、哪个字段先改、为什么先改、改完看什么指标。

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
  "topRecommendation": {
    "problem": "当前最致命的问题，必须指向具体字段/流量/转化卡点",
    "why": "为什么它优先，必须引用关键词/评论/竞品/分数证据",
    "changeNow": "现在要怎么改，必须是可交给运营执行的一条动作",
    "expectedOutcome": "预期拉动的指标，例如 CTR、CVR、自然位、索引词数",
    "confidence": "高/中/低 + 简短原因"
  },
  "quickWins": ["中文快改动作1", "中文快改动作2", "中文快改动作3"],
  "fieldDiagnostics": [
    {
      "field": "Title 前80字符 / Bullet 1 / Bullet 2 / Search Terms / A+ Alt Text / 图片视频 / 类目属性",
      "priority": "P0",
      "problem": "这个字段现在浪费了什么机会",
      "fix": "这个字段应该补什么、删什么、前置什么",
      "keywords": ["keyword 1", "keyword 2"]
    }
  ],
  "competitorDeltas": [
    "目标 ASIN 与竞品的一个具体差距，不要泛泛说竞品更强"
  ],
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
  "validationPlan": [
    {
      "window": "7天",
      "metric": "要观察的指标",
      "target": "什么变化算有效",
      "rollbackSignal": "什么信号说明要回滚或换方案"
    },
    {
      "window": "14天",
      "metric": "要观察的指标",
      "target": "什么变化算有效",
      "rollbackSignal": "什么信号说明要回滚或换方案"
    },
    {
      "window": "28天",
      "metric": "要观察的指标",
      "target": "什么变化算有效",
      "rollbackSignal": "什么信号说明要回滚或换方案"
    }
  ],
  "watchouts": ["中文风险提示1", "中文风险提示2"]
}

规则:
- executiveSummary、topRecommendation、quickWins、fieldDiagnostics、competitorDeltas、p0Actions、p1Actions、p2Actions、validationPlan、watchouts 用简体中文；关键词本身保留英文。
- titleSuggestion、bulletSuggestions、searchTermsSuggestion 必须用英文。
- 重写建议必须严格基于现有诊断数据，不要凭空虚构产品功能。
- 优先处理关键词缺口、评论高频顾虑、移动端可读性、广告依赖和场景映射问题。
- fieldDiagnostics 必须至少 4 条，且覆盖 Title、Bullet、Search Terms；如果资产或类目有问题，也要覆盖 A+/图片视频/类目属性。
- competitorDeltas 必须给 3-5 条具体差距，例如价格/评分/关键词/场景表达/资产状态，不要写口号。
- validationPlan 必须包含 7天、14天、28天三个窗口。
- titleSuggestion 控制在 200 字符内。
- bulletSuggestions 必须正好 5 条。
- searchTermsSuggestion 控制在 250 字符内，尽量避免与标题机械重复。
- 返回 JSON only。
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
    topRecommendation: parseTopRecommendation(value.topRecommendation),
    quickWins: normalizeTextList(value.quickWins, {
      maxItems: 5,
      unique: true,
    }),
    fieldDiagnostics: parseFieldDiagnostics(value.fieldDiagnostics),
    competitorDeltas: normalizeTextList(value.competitorDeltas, {
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
    validationPlan: parseValidationPlan(value.validationPlan),
    watchouts: normalizeTextList(value.watchouts, {
      maxItems: 6,
      unique: true,
    }),
  };
}

function parseTopRecommendation(value: unknown): LegacyAiOutput["topRecommendation"] {
  if (!isRecord(value)) {
    return {
      problem: "",
      why: "",
      changeNow: "",
      expectedOutcome: "",
      confidence: "",
    };
  }

  return {
    problem: normalizeStringValue(value.problem, { allowEmpty: true }),
    why: normalizeStringValue(value.why, { allowEmpty: true }),
    changeNow: normalizeStringValue(value.changeNow, { allowEmpty: true }),
    expectedOutcome: normalizeStringValue(value.expectedOutcome, { allowEmpty: true }),
    confidence: normalizeStringValue(value.confidence, { allowEmpty: true }),
  };
}

function parseFieldDiagnostics(value: unknown): LegacyAiOutput["fieldDiagnostics"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => ({
      field: normalizeStringValue(item.field, { allowEmpty: true }),
      priority: normalizeActionPriority(item.priority),
      problem: normalizeStringValue(item.problem, { allowEmpty: true }),
      fix: normalizeStringValue(item.fix, { allowEmpty: true }),
      keywords: normalizeTextList(item.keywords, {
        maxItems: 6,
        unique: true,
      }),
    }))
    .filter((item) => item.field && (item.problem || item.fix))
    .slice(0, 8);
}

function parseValidationPlan(value: unknown): LegacyAiOutput["validationPlan"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => ({
      window: normalizeStringValue(item.window, { allowEmpty: true }),
      metric: normalizeStringValue(item.metric, { allowEmpty: true }),
      target: normalizeStringValue(item.target, { allowEmpty: true }),
      rollbackSignal: normalizeStringValue(item.rollbackSignal, {
        allowEmpty: true,
      }),
    }))
    .filter((item) => item.window && item.metric)
    .slice(0, 3);
}

function normalizeActionPriority(value: unknown): "P0" | "P1" | "P2" {
  if (typeof value !== "string") {
    return "P1";
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "P0" || normalized === "P1" || normalized === "P2") {
    return normalized;
  }

  return "P1";
}
