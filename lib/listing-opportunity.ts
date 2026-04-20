import { selectTrafficKeywords } from "@/lib/traffic-keyword-helpers";
import type {
  AbaReportFile,
  CompetitorListing,
  DataAnalysisResult,
  KeywordAllocationItem,
  KeywordCampaignPlan,
  KeywordStrategy,
  OpportunityAssessment,
  OpportunityBreakdownItem,
  OpportunityVerdict,
  PriorityLevel,
  ProductProfile,
  RufusIntentItem,
  RufusIntentLayer,
  TrafficKeyword,
} from "@/lib/types";

export interface OpportunityInput {
  productProfile: ProductProfile;
  listings: CompetitorListing[];
  trafficKeywords: Record<string, TrafficKeyword[]>;
  abaReport: AbaReportFile | null;
  rufusScreenshotCount: number;
}

const OFF_INTENT_TOKENS = [
  "replacement",
  "refill",
  "parts",
  "cover",
  "case",
  "used",
  "free",
  "wholesale",
  "manual",
  "repair",
];

export function enrichDataAnalysisResult(
  result: DataAnalysisResult,
  input: OpportunityInput
): DataAnalysisResult {
  return {
    ...result,
    opportunityAssessment:
      result.opportunityAssessment ?? buildOpportunityAssessment(input),
    keywordStrategy: result.keywordStrategy ?? buildKeywordStrategy(input),
    rufusIntentLayer: result.rufusIntentLayer ?? buildRufusIntentLayer(input),
  };
}

export function buildOpportunityAssessment(
  input: OpportunityInput
): OpportunityAssessment {
  const keywords = selectTrafficKeywords(flattenKeywords(input.trafficKeywords), 20);
  const listings = input.listings;
  const averageSearchVolume = average(keywords.map((item) => item.searchVolume));
  const averageConversionShare = average(
    keywords.map((item) => normalizeConversionShare(item.conversionShare))
  );
  const averageMonthlySales = average(listings.map((item) => item.monthlySales));
  const averageReviews = average(listings.map((item) => item.reviews));
  const averageRating = average(listings.map((item) => item.rating));
  const sourceBonus =
    (input.abaReport ? 1 : 0) + Math.min(2, input.rufusScreenshotCount > 0 ? 1 : 0);
  const keywordCoverageScore = scoreKeywordCoverage(input.productProfile, keywords);

  const demandScore = clampScore(
    Math.round(
      Math.min(45, averageSearchVolume / 240) +
        Math.min(35, averageMonthlySales / 70) +
        sourceBonus * 10
    )
  );

  const competitionPressure =
    Math.min(50, averageReviews / 80) +
    Math.min(20, listings.length * 5) +
    Math.min(
      20,
      keywords.filter(
        (item) =>
          isStrongRank(item.organicRank, 20) || isStrongRank(item.sponsoredRank, 20)
      ).length * 4
    ) +
    Math.max(0, (averageRating - 4.2) * 15);
  const competitionScore = clampScore(Math.round(100 - competitionPressure));

  const conversionScore = clampScore(
    Math.round(
      Math.min(55, averageConversionShare * 5.5) +
        Math.min(20, averageRating * 4) +
        Math.min(
          25,
          keywords.filter((item) => normalizeConversionShare(item.conversionShare) >= 8)
            .length * 5
        )
    )
  );

  const intentScore = clampScore(
    Math.round(
      keywordCoverageScore * 0.55 +
        deriveUseCaseHints(input.productProfile).length * 10 +
        sourceBonus * 10
    )
  );

  const breakdown: OpportunityBreakdownItem[] = [
    {
      key: "demand",
      label: "需求强度",
      score: demandScore,
      rationale:
        demandScore >= 70
          ? "关键词搜索量与竞品销量都具备起盘空间。"
          : "需求存在，但需要用更细分角度验证起盘速度。",
      evidence: [
        `Top 关键词平均搜索量 ${formatInteger(averageSearchVolume)}`,
        `竞品平均月销 ${formatInteger(averageMonthlySales)}`,
        input.abaReport ? "已接入 ABA 搜索词报告" : "暂无 ABA 搜索词报告",
      ],
    },
    {
      key: "competition",
      label: "竞争压力",
      score: competitionScore,
      rationale:
        competitionScore >= 65
          ? "头部评论体量和排名压力尚可，适合继续打差异化。"
          : "评论护城河和排名占位偏强，需要更谨慎验证。",
      evidence: [
        `竞品平均评论量 ${formatInteger(averageReviews)}`,
        `竞品平均评分 ${averageRating.toFixed(1)}`,
        `${keywords.filter((item) => isStrongRank(item.organicRank, 20)).length} 个词已有较强自然位`,
      ],
    },
    {
      key: "conversion",
      label: "转化潜力",
      score: conversionScore,
      rationale:
        conversionScore >= 65
          ? "已有高转化词和较稳定口碑信号，适合围绕转化词做强承接。"
          : "转化信号一般，先做卖点验证和素材测试更稳。",
      evidence: [
        `Top 关键词平均转化份额 ${averageConversionShare.toFixed(1)}%`,
        `${keywords.filter((item) => normalizeConversionShare(item.conversionShare) >= 8).length} 个词具备较强转化信号`,
        `竞品平均评分 ${averageRating.toFixed(1)}`,
      ],
    },
    {
      key: "intent",
      label: "意图承接",
      score: intentScore,
      rationale:
        intentScore >= 65
          ? "关键词与场景/顾虑意图可以组织成完整转化路径。"
          : "意图层仍偏散，需要靠场景、对比和 FAQ 补承接。",
      evidence: [
        `${deriveUseCaseHints(input.productProfile).length} 个可承接场景`,
        `${input.rufusScreenshotCount} 张 Rufus 截图`,
        `核心关键词覆盖得分 ${keywordCoverageScore}/100`,
      ],
    },
  ];

  const score = clampScore(
    Math.round(
      demandScore * 0.35 +
        competitionScore * 0.25 +
        conversionScore * 0.2 +
        intentScore * 0.2
    )
  );
  const verdict = scoreToVerdict(score);

  return {
    score,
    verdict,
    summary:
      verdict === "priority"
        ? "这条线值得优先打，但需要把词路由、素材测试和转化承接一起上。"
        : verdict === "test"
          ? "建议先以小预算、小批量实验验证，再决定是否重投。"
          : "当前更适合谨慎观察，除非你有明显的产品差异化或供应链优势。",
    strengths: collectStrengths(breakdown, keywords),
    risks: collectRisks(breakdown, keywords),
    nextActions: buildNextActions(verdict),
    breakdown,
  };
}

export function buildKeywordStrategy(input: OpportunityInput): KeywordStrategy | null {
  const selectedKeywords = selectTrafficKeywords(
    flattenKeywords(input.trafficKeywords),
    20
  );

  if (selectedKeywords.length === 0) {
    return null;
  }

  const titleKeywords = mapKeywordItems(
    selectedKeywords
      .filter((keyword) => keyword.keyword.length <= 40)
      .slice(0, 5),
    "优先放在标题前半段，承担主类目相关性和首屏点击。"
  );
  const bulletKeywords = mapKeywordItems(
    selectedKeywords
      .filter((keyword) => !titleKeywords.some((item) => item.keyword === keyword.keyword))
      .slice(0, 6),
    "更适合放进 Bullet，配合卖点、场景和痛点承接。"
  );
  const searchTermKeywords = mapKeywordItems(
    selectedKeywords
      .filter(
        (keyword) =>
          !titleKeywords.some((item) => item.keyword === keyword.keyword) &&
          !bulletKeywords.some((item) => item.keyword === keyword.keyword)
      )
      .slice(0, 8),
    "更适合放入 Search Terms，补长尾覆盖而不挤占前台文案。"
  );

  const ppcCoreKeywords = mapKeywordItems(
    [...selectedKeywords]
      .sort((left, right) => scoreKeywordForPpc(right) - scoreKeywordForPpc(left))
      .slice(0, 6),
    "已有排名或转化信号，适合作为 PPC 主攻词。"
  );
  const ppcExploratoryKeywords = mapKeywordItems(
    selectedKeywords
      .filter(
        (keyword) =>
          !ppcCoreKeywords.some((item) => item.keyword === keyword.keyword) &&
          keyword.searchVolume >= 500
      )
      .slice(0, 6),
    "有量但证据还不够强，适合用 Phrase / Broad 探索。"
  );

  const competitorBrands = extractCompetitorBrandHints(
    input.listings,
    input.productProfile.brandName
  );
  const negativeKeywords = [
    ...selectedKeywords
      .filter((keyword) => containsAnyToken(keyword.keyword, OFF_INTENT_TOKENS))
      .map((keyword) =>
        createKeywordItem(
          keyword,
          "high",
          "词面上更像低意图或错配流量，优先加入否定词观察池。"
        )
      ),
    ...competitorBrands.slice(0, 4).map((brand) => ({
      keyword: brand,
      priority: "medium" as PriorityLevel,
      reason: "竞品品牌词更适合先否定，避免新品早期浪费预算。",
      evidence: "来源于竞品标题中的品牌提示。",
    })),
  ].slice(0, 8);

  return {
    titleKeywords,
    bulletKeywords,
    searchTermKeywords,
    ppcCoreKeywords,
    ppcExploratoryKeywords,
    negativeKeywords,
    campaignPlans: buildCampaignPlans(
      ppcCoreKeywords,
      ppcExploratoryKeywords,
      negativeKeywords
    ),
  };
}

export function buildRufusIntentLayer(input: OpportunityInput): RufusIntentLayer {
  const productName = input.productProfile.productName || "这个产品";
  const category = input.productProfile.productCategory || "当前品类";
  const scenarios = deriveUseCaseHints(input.productProfile);
  const seedKeywords = splitKeywords(input.productProfile.coreKeywords);
  const keywordHooks = seedKeywords.length > 0 ? seedKeywords : [category];

  return {
    scene: buildIntentItems(
      [
        `${productName} 更适合哪些场景使用？`,
        `${productName} 在 ${scenarios[0] || "日常使用"} 场景下有什么优势？`,
        `什么时候应该选 ${productName}，而不是普通 ${category} 产品？`,
      ],
      "场景意图",
      "回答里要先点明使用场景，再落到差异化卖点和体感收益。",
      keywordHooks
    ),
    audience: buildIntentItems(
      [
        `${productName} 适合什么类型的人群？`,
        `新手第一次买 ${productName} 需要注意什么？`,
        `${productName} 更适合送礼、自用还是家庭多成员共用？`,
      ],
      "人群意图",
      "回答里要把人群特征和使用门槛说清楚，避免泛泛而谈。",
      keywordHooks
    ),
    objections: buildIntentItems(
      [
        `${productName} 会不会不好用 / 不耐用 / 不值得买？`,
        `${productName} 和竞品相比，最容易被质疑的点是什么？`,
        `如果担心效果不明显，${productName} 应该怎么解释？`,
      ],
      "顾虑意图",
      "先接住顾虑，再给事实证据、使用建议和适用边界。",
      keywordHooks
    ),
    comparisons: buildIntentItems(
      [
        `${productName} 和普通款 / 低价款 / 热销款相比差在哪？`,
        `什么情况下应该升级到这款 ${productName}？`,
        `选择 ${productName} 时最值得比较的 3 个维度是什么？`,
      ],
      "对比意图",
      "回答里要给对比维度、适用对象和取舍逻辑，不要只说更好。",
      keywordHooks
    ),
  };
}

function buildCampaignPlans(
  ppcCoreKeywords: KeywordAllocationItem[],
  ppcExploratoryKeywords: KeywordAllocationItem[],
  negativeKeywords: KeywordAllocationItem[]
): KeywordCampaignPlan[] {
  const plans: KeywordCampaignPlan[] = [
    {
      name: "Exact Hero Capture",
      goal: "先吃掉最强购买意图词，观察点击率和首周转化。",
      matchType: "exact",
      budgetPriority: "high",
      keywords: ppcCoreKeywords.slice(0, 4).map((item) => item.keyword),
      negativeKeywords: negativeKeywords.slice(0, 4).map((item) => item.keyword),
      launchPlan: "预算优先给高转化词，先看点击率、CVR 和订单词，再决定放量。",
    },
    {
      name: "Phrase Scale Out",
      goal: "围绕强意图词放大相邻需求和变体搜索。",
      matchType: "phrase",
      budgetPriority: "medium",
      keywords: [
        ...ppcCoreKeywords.slice(0, 3).map((item) => item.keyword),
        ...ppcExploratoryKeywords.slice(0, 2).map((item) => item.keyword),
      ],
      negativeKeywords: negativeKeywords.slice(0, 5).map((item) => item.keyword),
      launchPlan: "用 Phrase 承接中长尾，再把出单词回收进 Exact。",
    },
    {
      name: "Broad Discovery",
      goal: "低风险试探新场景、新词根和潜在补量词。",
      matchType: "broad",
      budgetPriority: "low",
      keywords: ppcExploratoryKeywords.slice(0, 5).map((item) => item.keyword),
      negativeKeywords: negativeKeywords.slice(0, 6).map((item) => item.keyword),
      launchPlan: "预算从低开始，重点看搜索词报告里的错配流量和新增可收词。",
    },
  ];

  return plans.filter((plan) => plan.keywords.length > 0);
}

function buildIntentItems(
  questions: string[],
  intent: string,
  responseAngle: string,
  hooks: string[]
): RufusIntentItem[] {
  return questions.slice(0, 3).map((question, index) => ({
    intent,
    question,
    responseAngle,
    listingHooks: hooks.slice(index, index + 2).length
      ? hooks.slice(index, index + 2)
      : hooks.slice(0, 2),
  }));
}

function collectStrengths(
  breakdown: OpportunityBreakdownItem[],
  keywords: TrafficKeyword[]
): string[] {
  const strengths: string[] = [];

  if ((breakdown.find((item) => item.key === "demand")?.score ?? 0) >= 70) {
    strengths.push("关键词需求和竞品销量信号都够强，值得继续深挖。");
  }

  if ((breakdown.find((item) => item.key === "conversion")?.score ?? 0) >= 65) {
    strengths.push("高转化关键词不止一个，适合把文案和 PPC 做成同一条线。");
  }

  if (
    keywords.some(
      (item) =>
        isStrongRank(item.organicRank, 20) && normalizeConversionShare(item.conversionShare) >= 8
    )
  ) {
    strengths.push("存在自然位和转化份额同时较强的词，说明市场已有清晰购买意图。");
  }

  return strengths.length > 0 ? strengths : ["目前最大优势是仍有可测试空间。"];
}

function collectRisks(
  breakdown: OpportunityBreakdownItem[],
  keywords: TrafficKeyword[]
): string[] {
  const risks: string[] = [];

  if ((breakdown.find((item) => item.key === "competition")?.score ?? 0) < 60) {
    risks.push("竞品评论量和占位压力偏高，不能只靠标题改写硬打。");
  }

  if ((breakdown.find((item) => item.key === "intent")?.score ?? 0) < 60) {
    risks.push("用户为什么买、适合谁、和谁比这些问题还需要素材和 FAQ 承接。");
  }

  if (
    keywords.filter((item) => normalizeConversionShare(item.conversionShare) < 2).length >= 5
  ) {
    risks.push("词池里存在不少低转化噪音词，PPC 否定词要尽早建。");
  }

  return risks.length > 0 ? risks : ["当前风险主要在执行节奏，而不是市场空间本身。"];
}

function buildNextActions(verdict: OpportunityVerdict): string[] {
  if (verdict === "priority") {
    return [
      "先用 Exact + Phrase 建立首批 PPC 测试组。",
      "标题与 Bullet 先围绕 3-5 个主攻词重写，不要平均分散。",
      "同步准备 2-3 套主图 / A+ / FAQ 承接关键顾虑。",
    ];
  }

  if (verdict === "test") {
    return [
      "先做低预算词包测试，验证哪些搜索词能跑出稳定点击和转化。",
      "优先测试标题主词、首图卖点和价格带，而不是一次性重做全部素材。",
      "把用户顾虑和客服 FAQ 提前写好，避免试量阶段掉转化。",
    ];
  }

  return [
    "先缩小到更细的使用场景或人群切口，再重新评估。",
    "谨慎控制 PPC 探索预算，先筛掉明显错配流量。",
    "除非供应链和差异化明显占优，否则不要重资产投入素材。",
  ];
}

function flattenKeywords(
  trafficKeywords: Record<string, TrafficKeyword[]>
): TrafficKeyword[] {
  return Object.values(trafficKeywords).flat();
}

function mapKeywordItems(
  keywords: TrafficKeyword[],
  reason: string
): KeywordAllocationItem[] {
  return keywords.map((keyword) => createKeywordItem(keyword, inferPriority(keyword), reason));
}

function createKeywordItem(
  keyword: TrafficKeyword,
  priority: PriorityLevel,
  reason: string
): KeywordAllocationItem {
  return {
    keyword: keyword.keyword,
    priority,
    reason,
    evidence: buildKeywordEvidence(keyword),
  };
}

function scoreKeywordCoverage(
  productProfile: ProductProfile,
  keywords: TrafficKeyword[]
): number {
  const seeds = splitKeywords(productProfile.coreKeywords);
  if (seeds.length === 0 || keywords.length === 0) {
    return 45;
  }

  const coveredCount = seeds.filter((seed) =>
    keywords.some((keyword) => keyword.keyword.toLowerCase().includes(seed.toLowerCase()))
  ).length;

  return clampScore(Math.round((coveredCount / seeds.length) * 100));
}

function scoreKeywordForPpc(keyword: TrafficKeyword): number {
  return (
    Math.min(40, keyword.searchVolume / 250) +
    Math.min(35, normalizeConversionShare(keyword.conversionShare) * 3) +
    (isStrongRank(keyword.sponsoredRank, 20) ? 15 : 0) +
    (isStrongRank(keyword.organicRank, 20) ? 10 : 0)
  );
}

function inferPriority(keyword: TrafficKeyword): PriorityLevel {
  const score = scoreKeywordForPpc(keyword);
  if (score >= 60) {
    return "high";
  }
  if (score >= 35) {
    return "medium";
  }
  return "low";
}

function buildKeywordEvidence(keyword: TrafficKeyword): string {
  const parts = [`搜索量 ${formatInteger(keyword.searchVolume)}`];

  if (keyword.conversionShare > 0) {
    parts.push(`转化份额 ${normalizeConversionShare(keyword.conversionShare).toFixed(1)}%`);
  }

  if (isStrongRank(keyword.organicRank, 9999)) {
    parts.push(`自然位 #${keyword.organicRank}`);
  }

  if (isStrongRank(keyword.sponsoredRank, 9999)) {
    parts.push(`广告位 #${keyword.sponsoredRank}`);
  }

  return parts.join(" / ");
}

function extractCompetitorBrandHints(
  listings: CompetitorListing[],
  ownBrandName: string
): string[] {
  const ownBrandTokens = splitKeywords(ownBrandName).map((token) => token.toLowerCase());
  const brands = new Set<string>();

  for (const listing of listings) {
    const firstWord = listing.title.split(/\s+/)[0]?.trim();
    if (!firstWord || firstWord.length < 3) {
      continue;
    }

    const normalized = firstWord.replace(/[^a-z0-9-]/gi, "");
    if (!normalized) {
      continue;
    }

    if (ownBrandTokens.includes(normalized.toLowerCase())) {
      continue;
    }

    brands.add(normalized);
  }

  return Array.from(brands);
}

function deriveUseCaseHints(productProfile: ProductProfile): string[] {
  const normalized = `${productProfile.productDescription} ${productProfile.coreKeywords}`
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return [];
  }

  const segments = normalized
    .split(/[.,;，。；]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const hints = segments.filter((segment) =>
    /(for|during|while|travel|gift|home|office|outdoor|bath|kitchen|gym|baby|pet)/i.test(
      segment
    )
  );

  return Array.from(new Set((hints.length > 0 ? hints : segments).slice(0, 4)));
}

function splitKeywords(value: string): string[] {
  return value
    .split(/[,\n，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function containsAnyToken(value: string, tokens: string[]): boolean {
  const normalized = value.toLowerCase();
  return tokens.some((token) => normalized.includes(token));
}

function isStrongRank(rank: number | null, threshold: number): boolean {
  return typeof rank === "number" && rank > 0 && rank <= threshold;
}

function normalizeConversionShare(value: number): number {
  return value > 100 ? 100 : value < 0 ? 0 : value;
}

function scoreToVerdict(score: number): OpportunityVerdict {
  if (score >= 75) {
    return "priority";
  }
  if (score >= 55) {
    return "test";
  }
  return "watch";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}
