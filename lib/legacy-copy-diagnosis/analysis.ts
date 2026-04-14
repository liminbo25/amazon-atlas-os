import { checkFieldCompliance } from "@/lib/compliance";
import type { CompetitorListing, ReviewData, TrafficKeyword } from "@/lib/types";
import type {
  LegacyAnalysisInput,
  LegacyCompetitorSnapshot,
  LegacyDiagnosisReport,
  LegacyFieldCoverage,
  LegacyKeywordGap,
  LegacyPillarScore,
  LegacyPriority,
  LegacyReviewTheme,
  LegacyStatus,
} from "./types";

type PillarDefinition = {
  id: string;
  title: string;
  maxScore: number;
};

type KeywordDiagnostic = LegacyKeywordGap & {
  intentful: boolean;
};

const PILLARS: PillarDefinition[] = [
  { id: "search", title: "搜索相关性与索引路径", maxScore: 18 },
  { id: "scene", title: "类目、场景与受众映射", maxScore: 12 },
  { id: "conversion", title: "转化卖点与证据链", maxScore: 14 },
  { id: "mobile", title: "移动端结构与可读性", maxScore: 10 },
  { id: "assets", title: "A+、图片与视频资产协同", maxScore: 10 },
  { id: "value", title: "口碑、价格与价值锚点", maxScore: 10 },
  { id: "traffic", title: "流量结构与广告依赖", maxScore: 10 },
  { id: "variation", title: "变体治理与运营健康", maxScore: 8 },
  { id: "compliance", title: "合规、时效与实验计划", maxScore: 8 },
];

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "have",
  "from",
  "your",
  "their",
  "just",
  "they",
  "them",
  "were",
  "when",
  "what",
  "which",
  "would",
  "about",
  "there",
  "really",
  "very",
  "into",
  "than",
  "then",
  "also",
  "been",
  "because",
  "much",
  "more",
  "most",
  "some",
  "only",
  "such",
  "like",
  "made",
  "make",
  "does",
  "did",
  "will",
  "still",
  "after",
  "before",
  "while",
  "wear",
  "dress",
  "women",
  "woman",
  "product",
  "item",
  "amazon",
  "purchase",
]);

const REVIEW_PATTERN_PHRASES = [
  "too small",
  "too big",
  "runs small",
  "runs large",
  "true to size",
  "fits well",
  "see through",
  "poor quality",
  "good quality",
  "well made",
  "cheap material",
  "soft material",
  "easy to use",
  "easy to assemble",
  "easy to install",
  "not worth",
  "strong smell",
  "comfortable",
  "hard to clean",
  "hard to use",
  "battery life",
];

const SCENE_HINT_TOKENS = [
  "wedding",
  "party",
  "formal",
  "cocktail",
  "work",
  "office",
  "travel",
  "vacation",
  "gift",
  "outdoor",
  "indoor",
  "daily",
  "church",
  "graduation",
  "birthday",
  "holiday",
  "summer",
  "winter",
  "spring",
  "fall",
];

const SEASON_TOKENS = ["spring", "summer", "fall", "autumn", "winter"];

export function buildLegacyDiagnosisReport(
  input: LegacyAnalysisInput
): LegacyDiagnosisReport {
  const resolvedTitle = input.currentTitle.trim() || input.targetListing.title.trim();
  const resolvedBullets =
    input.currentBullets.filter(Boolean).length > 0
      ? input.currentBullets.filter(Boolean)
      : input.targetListing.bulletPoints;
  const resolvedSearchTerms = input.currentSearchTerms.trim();
  const fullCopy = [resolvedTitle, ...resolvedBullets, resolvedSearchTerms]
    .filter(Boolean)
    .join("\n");

  const competitorSnapshots = buildCompetitorSnapshots(
    input.competitorListings,
    input.competitorKeywords
  );
  const keywordDiagnostics = buildKeywordDiagnostics({
    title: resolvedTitle,
    bullets: resolvedBullets,
    searchTerms: resolvedSearchTerms,
    targetKeywords: input.targetKeywords,
    competitorKeywords: input.competitorKeywords,
  });
  const keywordGaps = keywordDiagnostics.slice(0, 12).map(stripKeywordDiagnostic);
  const negativeThemes = extractReviewThemes(input.targetNegativeReviews, fullCopy, 5);
  const positiveThemes = extractReviewThemes(input.targetPositiveReviews, fullCopy, 5);

  const pillars = [
    buildSearchPillar(keywordDiagnostics),
    buildScenePillar(keywordDiagnostics, resolvedTitle, resolvedBullets, input.targetListing),
    buildConversionPillar(
      resolvedBullets,
      negativeThemes,
      positiveThemes,
      input.targetListing
    ),
    buildMobilePillar(resolvedTitle, resolvedBullets),
    buildAssetPillar(input.targetListing),
    buildValuePillar(input.targetListing, competitorSnapshots),
    buildTrafficPillar(keywordDiagnostics),
    buildVariationPillar(input.targetListing),
    buildCompliancePillar(resolvedTitle, resolvedBullets, resolvedSearchTerms),
  ];

  const totalScore = pillars.reduce((sum, pillar) => sum + pillar.score, 0);
  const scoreMeta = describeScore(totalScore);
  const actionPlan = buildActionPlan(pillars, keywordGaps, negativeThemes, positiveThemes);

  return {
    generatedAt: new Date().toISOString(),
    marketplace: input.marketplace,
    targetAsin: input.targetAsin,
    targetListing: input.targetListing,
    resolvedTitle,
    resolvedBullets,
    resolvedSearchTerms,
    targetKeywords: input.targetKeywords,
    competitorSnapshots,
    negativeThemes,
    positiveThemes,
    keywordGaps,
    score: {
      total: totalScore,
      max: 100,
      label: scoreMeta.label,
      headline: scoreMeta.headline,
    },
    pillars,
    actionPlan,
    ai: {
      used: false,
      provider: null,
      model: null,
      reason: null,
      output: null,
    },
  };
}

function buildCompetitorSnapshots(
  listings: CompetitorListing[],
  competitorKeywords: Record<string, TrafficKeyword[]>
): LegacyCompetitorSnapshot[] {
  return listings.map((listing) => {
    const keywords = [...(competitorKeywords[listing.asin] ?? [])].sort(
      (left, right) => right.searchVolume - left.searchVolume
    );

    return {
      asin: listing.asin,
      title: listing.title,
      price: listing.price,
      rating: listing.rating,
      reviews: listing.reviews,
      monthlySales: listing.monthlySales,
      bsr: listing.bsr,
      keywordCount: keywords.length,
      topKeywords: keywords.slice(0, 5).map((item) => item.keyword),
      hasAPlus: getBooleanAttribute(listing, "hasAPlus"),
      hasVideo: getBooleanAttribute(listing, "hasVideo"),
      variationCount: getNumberAttribute(listing, "variationCount"),
    };
  });
}

function buildKeywordDiagnostics(input: {
  title: string;
  bullets: string[];
  searchTerms: string;
  targetKeywords: TrafficKeyword[];
  competitorKeywords: Record<string, TrafficKeyword[]>;
}): KeywordDiagnostic[] {
  const registry = new Map<
    string,
    {
      keyword: string;
      searchVolume: number;
      targetOrganicRank: number;
      targetSponsoredRank: number | null;
      bestCompetitorAsin: string | null;
      bestCompetitorOrganicRank: number | null;
    }
  >();

  for (const keyword of input.targetKeywords) {
    const normalized = normalizePhrase(keyword.keyword);
    if (!normalized) {
      continue;
    }

    const current = registry.get(normalized);
    registry.set(normalized, {
      keyword: keyword.keyword,
      searchVolume: Math.max(current?.searchVolume ?? 0, keyword.searchVolume),
      targetOrganicRank: pickBetterRank(current?.targetOrganicRank ?? 0, keyword.organicRank),
      targetSponsoredRank: pickBetterNullableRank(
        current?.targetSponsoredRank ?? null,
        keyword.sponsoredRank
      ),
      bestCompetitorAsin: current?.bestCompetitorAsin ?? null,
      bestCompetitorOrganicRank: current?.bestCompetitorOrganicRank ?? null,
    });
  }

  for (const [asin, keywords] of Object.entries(input.competitorKeywords)) {
    for (const keyword of keywords) {
      const normalized = normalizePhrase(keyword.keyword);
      if (!normalized) {
        continue;
      }

      const current = registry.get(normalized) ?? {
        keyword: keyword.keyword,
        searchVolume: keyword.searchVolume,
        targetOrganicRank: 0,
        targetSponsoredRank: null,
        bestCompetitorAsin: null,
        bestCompetitorOrganicRank: null,
      };
      const betterCompetitorRank = pickBetterNullableRank(
        current.bestCompetitorOrganicRank,
        keyword.organicRank > 0 ? keyword.organicRank : null
      );

      registry.set(normalized, {
        ...current,
        searchVolume: Math.max(current.searchVolume, keyword.searchVolume),
        bestCompetitorAsin:
          betterCompetitorRank !== current.bestCompetitorOrganicRank && keyword.organicRank > 0
            ? asin
            : current.bestCompetitorAsin,
        bestCompetitorOrganicRank: betterCompetitorRank,
      });
    }
  }

  return Array.from(registry.values())
    .map((item) => {
      const coverage = getFieldCoverage(
        item.keyword,
        input.title,
        input.bullets,
        input.searchTerms
      );

      return {
        ...item,
        coverage,
        opportunity: classifyKeywordOpportunity(item, coverage),
        reason: describeKeywordReason(item, coverage),
        intentful: isIntentfulKeyword(item.keyword),
      };
    })
    .sort((left, right) => {
      const priorityOrder = priorityToNumber(left.opportunity) - priorityToNumber(right.opportunity);
      if (priorityOrder !== 0) {
        return priorityOrder;
      }

      if (right.searchVolume !== left.searchVolume) {
        return right.searchVolume - left.searchVolume;
      }

      return compareRank(left.bestCompetitorOrganicRank, right.bestCompetitorOrganicRank);
    });
}

function buildSearchPillar(keywordDiagnostics: KeywordDiagnostic[]): LegacyPillarScore {
  const def = getPillar("search");
  const referenceKeywords = keywordDiagnostics.slice(0, 10);
  const coveredAnywhere = referenceKeywords.filter((item) => item.coverage.anywhere).length;
  const coveredInTitle = referenceKeywords.filter((item) => item.coverage.title).length;
  const criticalGaps = referenceKeywords.filter(
    (item) => item.opportunity === "critical"
  ).length;
  const score = clamp(
    Math.round(
      def.maxScore *
        ((coveredAnywhere / Math.max(referenceKeywords.length, 1)) * 0.62 +
          (coveredInTitle / Math.max(Math.min(referenceKeywords.length, 4), 1)) * 0.38)
    ) -
      criticalGaps * 2,
    0,
    def.maxScore
  );

  const topMissingKeywords = referenceKeywords
    .filter((item) => !item.coverage.anywhere)
    .slice(0, 3)
    .map((item) => item.keyword);

  return createPillarScore({
    def,
    score,
    summary:
      topMissingKeywords.length > 0
        ? `前排高流量词还有明显缺口，当前文案没有承接 ${topMissingKeywords.join(" / ")}。`
        : "主流量词在当前文案里已有基本承接，下一步重点是提炼字段分工。",
    findings: [
      `${coveredAnywhere}/${referenceKeywords.length} 个重点词已在当前文案任一字段出现。`,
      `${coveredInTitle}/${referenceKeywords.length} 个重点词进入了标题，高意图词前置能力仍有空间。`,
      criticalGaps > 0
        ? `${criticalGaps} 个关键词属于“竞品已拿位、当前未吃到”的关键缺口。`
        : "暂未出现大量“竞品已拿位、当前完全缺位”的红色缺口。",
    ],
    recommendedActions: [
      topMissingKeywords.length > 0
        ? `优先把 ${topMissingKeywords.join("、")} 这类词分配到标题前 80 字、五点主卖点和 Search Terms。`
        : "保留现有核心词框架，下一轮重点优化字段之间的去重与分工。",
      "避免 Search Terms 重复标题高频词，优先承接文案中无法自然塞入的长尾词。",
    ],
    evidence: referenceKeywords.slice(0, 5).map((item) =>
      `${item.keyword}: 自然位 ${formatRank(item.targetOrganicRank)} / 竞品最佳 ${formatRank(
        item.bestCompetitorOrganicRank
      )} / 覆盖 ${formatCoverage(item.coverage)}`
    ),
  });
}

function buildScenePillar(
  keywordDiagnostics: KeywordDiagnostic[],
  title: string,
  bullets: string[],
  listing: CompetitorListing
): LegacyPillarScore {
  const def = getPillar("scene");
  const intentKeywords = keywordDiagnostics.filter((item) => item.intentful).slice(0, 8);
  const intentCovered = intentKeywords.filter((item) => item.coverage.anywhere).length;
  const sceneTokenCount = countSceneHints([title, ...bullets].join(" "));
  const hasSubcategory = Boolean(listing.attributes.subcategoryLabel?.trim());
  const score = clamp(
    Math.round(
      def.maxScore *
        ((intentCovered / Math.max(intentKeywords.length || 3, 3)) * 0.7 +
          (Math.min(sceneTokenCount, 6) / 6) * 0.3)
    ) + (hasSubcategory ? 1 : 0),
    0,
    def.maxScore
  );

  const missingIntentKeywords = intentKeywords
    .filter((item) => !item.coverage.anywhere)
    .slice(0, 3)
    .map((item) => item.keyword);

  return createPillarScore({
    def,
    score,
    summary:
      missingIntentKeywords.length > 0
        ? `类目和场景映射还不够完整，像 ${missingIntentKeywords.join(" / ")} 这类高意图表达没有被当前文案承接。`
        : "类目、场景和需求词之间已有一定对齐度，可以继续补细分场景。",
    findings: [
      hasSubcategory
        ? `卖家精灵返回的子类目为 ${listing.attributes.subcategoryLabel}。`
        : "当前没有拿到清晰的子类目标签，场景映射需要结合后台进一步核对。",
      `当前文案命中了 ${sceneTokenCount} 个场景/季节提示词。`,
      `${intentCovered}/${intentKeywords.length || 0} 个高意图长尾词已被当前文案覆盖。`,
    ],
    recommendedActions: [
      missingIntentKeywords.length > 0
        ? `把 ${missingIntentKeywords.join("、")} 这类高意图词安排到标题或场景型 bullet，而不是只留给广告。`
        : "保留现有场景表达，继续扩展更细分的人群和 occasion 描述。",
      "让标题、五点、属性字段和类目节点讲同一类使用场景，避免内容割裂。",
    ],
    evidence: intentKeywords.slice(0, 4).map((item) =>
      `${item.keyword}: ${item.coverage.anywhere ? "当前已覆盖" : "当前未覆盖"}`
    ),
  });
}

function buildConversionPillar(
  bullets: string[],
  negativeThemes: LegacyReviewTheme[],
  positiveThemes: LegacyReviewTheme[],
  listing: CompetitorListing
): LegacyPillarScore {
  const def = getPillar("conversion");
  const bulletCount = bullets.length;
  const positiveCovered = positiveThemes.filter((item) => item.addressedInCopy).length;
  const negativeAddressed = negativeThemes.filter((item) => item.addressedInCopy).length;
  const hasMaterialEvidence = Boolean(listing.attributes.fabricType?.trim());
  const score = clamp(
    Math.round(
      def.maxScore *
        ((Math.min(bulletCount, 5) / 5) * 0.35 +
          (positiveCovered / Math.max(positiveThemes.length || 2, 2)) * 0.35 +
          (negativeAddressed / Math.max(negativeThemes.length || 2, 2)) * 0.3)
    ) + (hasMaterialEvidence ? 1 : 0),
    0,
    def.maxScore
  );

  return createPillarScore({
    def,
    score,
    summary:
      negativeThemes.some((item) => !item.addressedInCopy)
        ? "评论里暴露出的关键顾虑，还没有被当前文案提前回答。"
        : "当前文案已经开始承接用户正负反馈，但证据表达还能继续强化。",
    findings: [
      `当前可用 bullet 数量为 ${bulletCount}。`,
      `${positiveCovered}/${positiveThemes.length || 0} 个正向口碑主题已在文案中得到承接。`,
      `${negativeAddressed}/${negativeThemes.length || 0} 个高频负向顾虑已被当前文案正面回应。`,
    ],
    recommendedActions: [
      ...negativeThemes
        .filter((item) => !item.addressedInCopy)
        .slice(0, 2)
        .map((item) => `在五点里提前回应评论高频顾虑“${item.phrase}”。`),
      ...positiveThemes
        .filter((item) => !item.addressedInCopy)
        .slice(0, 2)
        .map((item) => `把评论认可点“${item.phrase}”转成更具体的结果型卖点。`),
    ],
    evidence: [
      hasMaterialEvidence
        ? `当前有材质证据字段：${listing.attributes.fabricType}`
        : "当前未拿到明确材质字段，证据链还可以补强。",
      ...negativeThemes.slice(0, 2).map((item) => `负向主题: ${item.phrase} (${item.count})`),
      ...positiveThemes.slice(0, 2).map((item) => `正向主题: ${item.phrase} (${item.count})`),
    ],
  });
}

function buildMobilePillar(title: string, bullets: string[]): LegacyPillarScore {
  const def = getPillar("mobile");
  const titleLength = title.length;
  const semicolonCount = countOccurrences([title, ...bullets].join(" "), ";");
  const bulletLeads = bullets.map((item) => item.trim().split(/\s+/).slice(0, 8).join(" "));
  const weakLeads = bulletLeads.filter((item) => item.length < 18).length;
  const duplicateRatio = getDuplicateTokenRatio([title, ...bullets].join(" "));
  let score = def.maxScore;

  if (titleLength > 180) {
    score -= 3;
  } else if (titleLength > 150) {
    score -= 2;
  }

  if (semicolonCount >= 5) {
    score -= 2;
  }

  if (duplicateRatio > 0.38) {
    score -= 2;
  }

  if (weakLeads >= 2) {
    score -= 1;
  }

  return createPillarScore({
    def,
    score: clamp(score, 0, def.maxScore),
    summary:
      titleLength > 180 || semicolonCount >= 5
        ? "移动端可读性有明显风险，核心信息可能被截断或被关键词堆砌感稀释。"
        : "移动端结构整体可用，但 bullet 开头和重复词比例还有提效空间。",
    findings: [
      `标题长度 ${titleLength} 字符。`,
      `当前标题与 bullet 一共出现 ${semicolonCount} 个分号。`,
      `重复词比例约 ${(duplicateRatio * 100).toFixed(0)}%。`,
    ],
    recommendedActions: [
      "把最重要的类目词、主卖点和高意图场景词前置到标题前半段。",
      "把尺码、洗护和免责声明后置，避免占掉 bullet 1 或 bullet 2 的黄金位置。",
    ],
    evidence: bulletLeads.slice(0, 3).map((item, index) => `Bullet ${index + 1} 开头: ${item}`),
  });
}

function buildAssetPillar(listing: CompetitorListing): LegacyPillarScore {
  const def = getPillar("assets");
  const hasAPlus = getBooleanAttribute(listing, "hasAPlus");
  const hasVideo = getBooleanAttribute(listing, "hasVideo");
  const hasMainImage = Boolean(listing.mainImage.trim());
  const hasFabricType = Boolean(listing.attributes.fabricType?.trim());
  const score = clamp(
    (hasAPlus ? 4 : 0) + (hasVideo ? 3 : 0) + (hasMainImage ? 1 : 0) + (hasFabricType ? 2 : 0),
    0,
    def.maxScore
  );

  return createPillarScore({
    def,
    score,
    summary:
      hasAPlus && hasVideo
        ? "A+ 和视频资产已具备，下一步应把文案和资产叙事再对齐。"
        : "资产层还有缺口，文案优化不应只停留在标题和五点。",
    findings: [
      hasAPlus ? "卖家精灵标记该 listing 已有 A+ / EBC。" : "卖家精灵未标记到 A+ / EBC。",
      hasVideo ? "卖家精灵标记该 listing 已有视频。" : "卖家精灵未标记到视频资产。",
      hasFabricType ? `可用于资产讲述的材质字段：${listing.attributes.fabricType}` : "材质证据字段暂不充分。",
    ],
    recommendedActions: [
      hasAPlus
        ? "复查 A+ Alt Text 是否承接长尾词和场景词。"
        : "优先补齐 A+ 模块，把无法在 bullet 里讲透的证据放进图文资产。",
      hasVideo ? "让视频承担演示和场景带入，而不是重复主图。" : "补视频来放大核心卖点和使用场景。",
    ],
    evidence: [
      `A+ 状态: ${hasAPlus ? "已具备" : "缺失"}`,
      `视频状态: ${hasVideo ? "已具备" : "缺失"}`,
    ],
  });
}

function buildValuePillar(
  listing: CompetitorListing,
  competitors: LegacyCompetitorSnapshot[]
): LegacyPillarScore {
  const def = getPillar("value");
  const avgPrice = getAverage(competitors.map((item) => item.price));
  const avgRating = getAverage(competitors.map((item) => item.rating));
  const avgReviews = getAverage(competitors.map((item) => item.reviews));
  let score = def.maxScore;

  if (avgRating > 0 && listing.rating + 0.05 < avgRating) {
    score -= 3;
  }

  if (avgReviews > 0 && listing.reviews < avgReviews * 0.5) {
    score -= 2;
  }

  if (avgPrice > 0 && listing.price > avgPrice * 1.15 && listing.rating < avgRating) {
    score -= 2;
  }

  return createPillarScore({
    def,
    score: clamp(score, 0, def.maxScore),
    summary:
      avgPrice > 0 && listing.price > avgPrice
        ? "当前定价高于竞品均值，需要更强的文案证据和口碑支撑。"
        : "价格带相对可控，重点是把口碑和价值表达绑得更紧。",
    findings: [
      `当前价格 ${formatPrice(listing.price)}，竞品均价 ${formatPrice(avgPrice)}。`,
      `当前评分 ${listing.rating.toFixed(1)}，竞品均分 ${avgRating.toFixed(1)}。`,
      `当前评论量 ${listing.reviews}，竞品均评 ${Math.round(avgReviews)}。`,
    ],
    recommendedActions: [
      "如果价格高于竞品均值，文案里要更明确地解释材质、做工、使用结果或品牌理由。",
      "把已有口碑优势前置到 bullet 1-2，不要只留在评论区自然沉淀。",
    ],
    evidence: competitors.slice(0, 3).map((item) =>
      `${item.asin}: ${formatPrice(item.price)} / ${item.rating.toFixed(1)}★ / ${item.reviews} 评`
    ),
  });
}

function buildTrafficPillar(keywordDiagnostics: KeywordDiagnostic[]): LegacyPillarScore {
  const def = getPillar("traffic");
  const reference = keywordDiagnostics.slice(0, 15);
  const organicCount = reference.filter((item) => item.targetOrganicRank > 0).length;
  const sponsoredOnlyCount = reference.filter(
    (item) => item.targetOrganicRank === 0 && item.targetSponsoredRank !== null
  ).length;
  const firstPageOrganic = reference.filter(
    (item) => item.targetOrganicRank > 0 && item.targetOrganicRank <= 48
  ).length;
  const score = clamp(
    Math.round(
      def.maxScore *
        ((organicCount / Math.max(reference.length, 1)) * 0.55 +
          (firstPageOrganic / Math.max(reference.length, 1)) * 0.45)
    ) -
      sponsoredOnlyCount,
    0,
    def.maxScore
  );

  return createPillarScore({
    def,
    score,
    summary:
      sponsoredOnlyCount >= 3
        ? "当前流量结构对广告位依赖偏高，说明内容没有把自然位吃透。"
        : "自然位已有一定基础，接下来可以继续扩自然词盘。",
    findings: [
      `${organicCount}/${reference.length} 个重点词拿到了自然位。`,
      `${firstPageOrganic}/${reference.length} 个重点词进入自然首页范围。`,
      `${sponsoredOnlyCount} 个重点词目前是“广告有位、自然没位”。`,
    ],
    recommendedActions: [
      "优先把“广告有位、自然没位”的词回灌到标题、bullet 和 Search Terms。",
      "把广告词包和文案词包统一管理，避免投放词与页面表达脱节。",
    ],
    evidence: reference.slice(0, 5).map((item) =>
      `${item.keyword}: 自然 ${formatRank(item.targetOrganicRank)} / 广告 ${formatRank(
        item.targetSponsoredRank
      )}`
    ),
  });
}

function buildVariationPillar(listing: CompetitorListing): LegacyPillarScore {
  const def = getPillar("variation");
  const variationCount = getNumberAttribute(listing, "variationCount");
  const daysSinceAvailable = getDaysSince(listing.attributes.availableDate);
  const isFba = (listing.attributes.fulfillment ?? "").toUpperCase() === "FBA";
  let score = def.maxScore;

  if (variationCount > 80) {
    score -= 4;
  } else if (variationCount > 40) {
    score -= 2;
  }

  if (!isFba) {
    score -= 1;
  }

  if (daysSinceAvailable > 540) {
    score -= 1;
  }

  return createPillarScore({
    def,
    score: clamp(score, 0, def.maxScore),
    summary:
      variationCount > 40
        ? "变体数量偏大，老品权重和评论沉淀可能被父子体结构稀释。"
        : "变体规模相对可控，重点是做内容更新和结构治理。",
    findings: [
      `当前变体数约 ${variationCount || 0}。`,
      daysSinceAvailable > 0
        ? `距首次上架约 ${daysSinceAvailable} 天。`
        : "没有拿到可靠的上架时间。",
      isFba ? "当前由 FBA 履约。" : "当前未识别到 FBA 履约。",
    ],
    recommendedActions: [
      variationCount > 40
        ? "梳理父子体，避免过多颜色/尺码分支稀释权重。"
        : "继续监控变体扩张，避免后续为了上新把父子体做得过重。",
      "内容改版时同步检查低销量子体、断货子体和命名规范。",
    ],
    evidence: [
      `Parent ASIN: ${listing.attributes.parentAsin || "未返回"}`,
      `Node path: ${listing.attributes.nodeLabelPath || "未返回"}`,
    ],
  });
}

function buildCompliancePillar(
  title: string,
  bullets: string[],
  searchTerms: string
): LegacyPillarScore {
  const def = getPillar("compliance");
  const titleViolations = checkFieldCompliance("title", title).violations.length;
  const bulletViolations = checkFieldCompliance("bulletPoints", bullets).violations.length;
  const searchTermViolations = checkFieldCompliance("searchTerms", searchTerms).violations.length;
  const duplicatedSeasonSignals = countDistinctMatches(title, SEASON_TOKENS);
  const explicitYears = Array.from(title.matchAll(/\b20\d{2}\b/g)).map((match) =>
    Number(match[0])
  );
  const currentYear = new Date().getFullYear();
  const staleYearCount = explicitYears.filter((year) => year < currentYear).length;
  let score = def.maxScore - titleViolations - bulletViolations - searchTermViolations;

  if (duplicatedSeasonSignals >= 2) {
    score -= 1;
  }

  if (staleYearCount > 0) {
    score -= 1;
  }

  if (searchTerms.length > 250) {
    score -= 1;
  }

  return createPillarScore({
    def,
    score: clamp(score, 0, def.maxScore),
    summary:
      titleViolations + bulletViolations + searchTermViolations > 0 || staleYearCount > 0
        ? "当前文案存在合规或时效风险，改版前应先把这些硬伤清掉。"
        : "合规和时效风险暂时可控，可以把实验重点放在提效动作上。",
    findings: [
      `标题/五点/Search Terms 违规词命中数：${titleViolations}/${bulletViolations}/${searchTermViolations}。`,
      duplicatedSeasonSignals >= 2
        ? `标题里同时出现了 ${duplicatedSeasonSignals} 个季节词，需检查是否造成语义冲突。`
        : "标题没有明显出现多季节混写问题。",
      staleYearCount > 0
        ? `标题出现了早于当前年份 ${currentYear} 的年份词。`
        : "标题未出现明显过期年份词。",
    ],
    recommendedActions: [
      "先清理绝对化、促销化和过期表达，再做 CTR / CVR 提升实验。",
      "为标题、五点、Search Terms 设 7 / 14 / 28 天复盘点，分别看索引、CTR、CVR 和自然位。",
    ],
    evidence: [
      `Search Terms 长度: ${searchTerms.length} 字符`,
      explicitYears.length > 0 ? `标题年份词: ${explicitYears.join(", ")}` : "标题未使用年份词",
    ],
  });
}

function buildActionPlan(
  pillars: LegacyPillarScore[],
  keywordGaps: LegacyKeywordGap[],
  negativeThemes: LegacyReviewTheme[],
  positiveThemes: LegacyReviewTheme[]
): LegacyDiagnosisReport["actionPlan"] {
  const p0 = new Set<string>();
  const p1 = new Set<string>();
  const p2 = new Set<string>();
  const watchouts = new Set<string>();

  for (const keywordGap of keywordGaps.slice(0, 4)) {
    if (keywordGap.opportunity === "critical") {
      p0.add(`优先补关键词 "${keywordGap.keyword}"，原因：${keywordGap.reason}`);
    } else if (keywordGap.opportunity === "high") {
      p1.add(`安排字段补位 "${keywordGap.keyword}"，避免继续被竞品吃掉自然位。`);
    } else {
      p2.add(`继续观察关键词 "${keywordGap.keyword}" 的自然位变化。`);
    }
  }

  for (const pillar of pillars) {
    const ratio = pillar.score / pillar.maxScore;
    const target = ratio < 0.55 ? p0 : ratio < 0.75 ? p1 : p2;
    for (const action of pillar.recommendedActions.slice(0, 2)) {
      if (action.trim()) {
        target.add(action.trim());
      }
    }
  }

  for (const theme of negativeThemes.filter((item) => !item.addressedInCopy).slice(0, 2)) {
    p0.add(`在 bullet 或 A+ 里正面回应评论高频顾虑 "${theme.phrase}"。`);
  }

  for (const theme of positiveThemes.filter((item) => !item.addressedInCopy).slice(0, 2)) {
    p1.add(`把正向口碑 "${theme.phrase}" 转为更具体的价值表达和证据链。`);
  }

  if (pillars.find((pillar) => pillar.id === "compliance")?.status !== "strong") {
    watchouts.add("先清理合规和过期表达，再推进大规模改版或广告放量。");
  }

  if (pillars.find((pillar) => pillar.id === "variation")?.status === "weak") {
    watchouts.add("变体结构偏重，文案优化可能会被父子体稀释，需要同步做运营治理。");
  }

  if (pillars.find((pillar) => pillar.id === "assets")?.status === "weak") {
    watchouts.add("如果只改文字不补资产，转化提效可能被主图/A+短板限制。");
  }

  return {
    p0: Array.from(p0).slice(0, 6),
    p1: Array.from(p1).slice(0, 6),
    p2: Array.from(p2).slice(0, 6),
    watchouts: Array.from(watchouts),
    metrics: [
      "标题改版后 7 天内看 CTR 变化",
      "14 天看目标关键词自然位恢复数量",
      "28 天看 CVR、广告自然流量占比和转化成本",
      "持续跟踪评论新增主题是否改善",
    ],
  };
}

function extractReviewThemes(
  reviews: ReviewData[],
  fullCopy: string,
  limit: number
): LegacyReviewTheme[] {
  const counts = new Map<string, { count: number; sample: string }>();

  for (const review of reviews) {
    const reviewText = `${review.title} ${review.content}`.trim();
    if (!reviewText) {
      continue;
    }

    const phrases = new Set<string>();
    const normalizedReview = normalizePhrase(reviewText);

    for (const pattern of REVIEW_PATTERN_PHRASES) {
      if (normalizedReview.includes(pattern)) {
        phrases.add(pattern);
      }
    }

    const tokens = tokenize(reviewText);
    for (let index = 0; index < tokens.length; index += 1) {
      const first = tokens[index];
      const second = tokens[index + 1];

      if (first && !STOP_WORDS.has(first) && first.length >= 4) {
        phrases.add(first);
      }

      if (first && second && !STOP_WORDS.has(first) && !STOP_WORDS.has(second)) {
        phrases.add(`${first} ${second}`);
      }
    }

    for (const phrase of phrases) {
      if (phrase.length < 4) {
        continue;
      }

      const current = counts.get(phrase);
      counts.set(phrase, {
        count: (current?.count ?? 0) + 1,
        sample: current?.sample ?? truncateText(reviewText, 110),
      });
    }
  }

  return Array.from(counts.entries())
    .filter(([, value]) => value.count >= (reviews.length >= 8 ? 2 : 1))
    .sort((left, right) => {
      if (right[1].count !== left[1].count) {
        return right[1].count - left[1].count;
      }

      return right[0].length - left[0].length;
    })
    .slice(0, limit)
    .map(([phrase, value]) => ({
      phrase,
      count: value.count,
      sample: value.sample,
      addressedInCopy: containsPhrase(fullCopy, phrase),
    }));
}

function createPillarScore(params: {
  def: PillarDefinition;
  score: number;
  summary: string;
  findings: string[];
  recommendedActions: string[];
  evidence: string[];
}): LegacyPillarScore {
  return {
    id: params.def.id,
    title: params.def.title,
    score: params.score,
    maxScore: params.def.maxScore,
    status: getStatus(params.score, params.def.maxScore),
    summary: params.summary,
    findings: uniqueText(params.findings),
    recommendedActions: uniqueText(params.recommendedActions),
    evidence: uniqueText(params.evidence),
  };
}

function getPillar(id: string): PillarDefinition {
  const pillar = PILLARS.find((item) => item.id === id);
  if (!pillar) {
    throw new Error(`Unknown pillar: ${id}`);
  }

  return pillar;
}

function describeScore(total: number): { label: string; headline: string } {
  if (total >= 90) {
    return {
      label: "结构健康型",
      headline: "老品结构整体健康，优先做放大而不是推倒重来。",
    };
  }

  if (total >= 75) {
    return {
      label: "可提效型",
      headline: "当前有基础，但关键词、场景或证据链仍有明显提效空间。",
    };
  }

  if (total >= 60) {
    return {
      label: "停滞风险型",
      headline: "流量和转化都在吃老本，建议按模块化动作重构内容。",
    };
  }

  return {
    label: "重做优先型",
    headline: "当前 listing 存在系统性短板，建议按 P0 先修结构性问题。",
  };
}

function stripKeywordDiagnostic(item: KeywordDiagnostic): LegacyKeywordGap {
  return {
    keyword: item.keyword,
    searchVolume: item.searchVolume,
    targetOrganicRank: item.targetOrganicRank,
    targetSponsoredRank: item.targetSponsoredRank,
    bestCompetitorAsin: item.bestCompetitorAsin,
    bestCompetitorOrganicRank: item.bestCompetitorOrganicRank,
    coverage: item.coverage,
    opportunity: item.opportunity,
    reason: item.reason,
  };
}

function classifyKeywordOpportunity(
  item: {
    searchVolume: number;
    targetOrganicRank: number;
    targetSponsoredRank: number | null;
    bestCompetitorOrganicRank: number | null;
  },
  coverage: LegacyFieldCoverage
): LegacyPriority {
  const competitorAhead =
    item.bestCompetitorOrganicRank !== null &&
    (item.targetOrganicRank === 0 || item.bestCompetitorOrganicRank < item.targetOrganicRank);
  const sponsoredOnly = item.targetOrganicRank === 0 && item.targetSponsoredRank !== null;
  const highVolume = item.searchVolume >= 5000;
  const mediumVolume = item.searchVolume >= 1000;

  if ((!coverage.anywhere || sponsoredOnly) && competitorAhead && highVolume) {
    return "critical";
  }

  if ((!coverage.anywhere || competitorAhead || sponsoredOnly) && mediumVolume) {
    return "high";
  }

  return "medium";
}

function describeKeywordReason(
  item: {
    targetOrganicRank: number;
    targetSponsoredRank: number | null;
    bestCompetitorOrganicRank: number | null;
  },
  coverage: LegacyFieldCoverage
): string {
  if (!coverage.anywhere && item.bestCompetitorOrganicRank !== null) {
    return `当前文案未覆盖，且竞品已在自然位拿到 ${formatRank(
      item.bestCompetitorOrganicRank
    )}`;
  }

  if (item.targetOrganicRank === 0 && item.targetSponsoredRank !== null) {
    return "当前更像靠广告托词，没有拿到对应自然位";
  }

  if (!coverage.title && coverage.anywhere) {
    return "当前只在次级字段承接，标题前排仍可补位";
  }

  return "可继续扩大覆盖深度和字段位置";
}

function getFieldCoverage(
  keyword: string,
  title: string,
  bullets: string[],
  searchTerms: string
): LegacyFieldCoverage {
  const inTitle = containsPhrase(title, keyword);
  const inBullets = bullets.some((item) => containsPhrase(item, keyword));
  const inSearchTerms = containsPhrase(searchTerms, keyword);

  return {
    title: inTitle,
    bullets: inBullets,
    searchTerms: inSearchTerms,
    anywhere: inTitle || inBullets || inSearchTerms,
  };
}

function containsPhrase(text: string, phrase: string): boolean {
  const normalizedText = normalizePhrase(text);
  const normalizedPhrase = normalizePhrase(phrase);
  return normalizedPhrase.length > 0 && normalizedText.includes(normalizedPhrase);
}

function normalizePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizePhrase(value)
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getBooleanAttribute(listing: CompetitorListing, key: string): boolean {
  const value = listing.attributes[key]?.trim().toUpperCase();
  return value === "Y" || value === "YES" || value === "TRUE";
}

function getNumberAttribute(listing: CompetitorListing, key: string): number {
  const value = listing.attributes[key];
  if (!value) {
    return 0;
  }

  const normalized = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(normalized) ? normalized : 0;
}

function getDaysSince(isoDate: string | undefined): number {
  if (!isoDate) {
    return 0;
  }

  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  return Math.max(0, Math.round((Date.now() - timestamp) / 86_400_000));
}

function countSceneHints(text: string): number {
  const normalized = normalizePhrase(text);
  return SCENE_HINT_TOKENS.filter((token) => normalized.includes(token)).length;
}

function isIntentfulKeyword(keyword: string): boolean {
  const normalized = normalizePhrase(keyword);
  if (normalized.split(" ").length >= 4) {
    return true;
  }

  return SCENE_HINT_TOKENS.some((token) => normalized.includes(token));
}

function countOccurrences(text: string, target: string): number {
  return text.split(target).length - 1;
}

function getDuplicateTokenRatio(text: string): number {
  const tokens = tokenize(text).filter((item) => item.length >= 3 && !STOP_WORDS.has(item));
  if (tokens.length === 0) {
    return 0;
  }

  const uniqueCount = new Set(tokens).size;
  return 1 - uniqueCount / tokens.length;
}

function countDistinctMatches(text: string, words: string[]): number {
  const normalized = normalizePhrase(text);
  return words.filter((word) => normalized.includes(word)).length;
}

function getAverage(values: number[]): number {
  const valid = values.filter((item) => Number.isFinite(item) && item > 0);
  if (valid.length === 0) {
    return 0;
  }

  return valid.reduce((sum, item) => sum + item, 0) / valid.length;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
  }

  return `$${value.toFixed(2)}`;
}

function formatRank(value: number | null): string {
  if (!value || value <= 0) {
    return "-";
  }

  return `#${value}`;
}

function formatCoverage(coverage: LegacyFieldCoverage): string {
  const labels: string[] = [];

  if (coverage.title) {
    labels.push("标题");
  }
  if (coverage.bullets) {
    labels.push("五点");
  }
  if (coverage.searchTerms) {
    labels.push("ST");
  }

  return labels.length > 0 ? labels.join("/") : "未覆盖";
}

function getStatus(score: number, maxScore: number): LegacyStatus {
  const ratio = score / maxScore;

  if (ratio >= 0.78) {
    return "strong";
  }

  if (ratio >= 0.56) {
    return "watch";
  }

  return "weak";
}

function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function truncateText(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function pickBetterRank(current: number, next: number): number {
  if (current <= 0) {
    return next;
  }

  if (next <= 0) {
    return current;
  }

  return Math.min(current, next);
}

function pickBetterNullableRank(
  current: number | null,
  next: number | null
): number | null {
  if (!current || current <= 0) {
    return next && next > 0 ? next : null;
  }

  if (!next || next <= 0) {
    return current;
  }

  return Math.min(current, next);
}

function priorityToNumber(priority: LegacyPriority): number {
  switch (priority) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
  }
}

function compareRank(left: number | null, right: number | null): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left - right;
}
