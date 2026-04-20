import type {
  CompetitorCopyAnalysis,
  DataAnalysisResult,
  ExperimentPlanItem,
  ListingVersion,
  PainPoint,
  PriorityLevel,
  ProductProfile,
  RufusQaItem,
  SupportFaqItem,
  ValuePoint,
  VocActionItem,
  VocActionPlan,
} from "@/lib/types";

export interface VocActionInput {
  productProfile: ProductProfile;
  painPoints: PainPoint[];
  valuePoints: ValuePoint[];
  competitorAnalysis: CompetitorCopyAnalysis[];
}

export interface ListingOperatorInput {
  productProfile: ProductProfile;
  coreSellingPoints: string;
  painPoints: PainPoint[];
  valuePoints: ValuePoint[];
  dataAnalysis: DataAnalysisResult | null;
}

export function buildVocActionPlan(input: VocActionInput): VocActionPlan {
  const topPainPoints = input.painPoints.slice(0, 3);
  const topValuePoints = input.valuePoints.slice(0, 3);
  const topCompetitorWeaknesses = input.competitorAnalysis
    .flatMap((item) => item.weaknesses)
    .filter(Boolean)
    .slice(0, 3);

  return {
    product: topPainPoints.map((point) =>
      createActionItem({
        title: `修复 ${point.category} 类问题`,
        priority: rankToPriority(point.rank, point.percentage),
        owner: "产品 / 供应链",
        action: productActionByPainPoint(point),
        evidence: point.typicalQuotes,
      })
    ),
    copy: [
      ...topPainPoints.map((point) =>
        createActionItem({
          title: `把 ${point.category} 写清楚而不是一笔带过`,
          priority: rankToPriority(point.rank, point.percentage),
          owner: "Listing 运营",
          action: `在标题或前两条 Bullet 里把 ${point.sellingPointSuggestion || point.category} 写成用户能直接感知的结果和边界。`,
          evidence: point.typicalQuotes,
        })
      ),
      ...topValuePoints.slice(0, 2).map((point) =>
        createActionItem({
          title: `放大 ${point.category} 的转化表达`,
          priority: point.percentage >= 20 ? "high" : "medium",
          owner: "Listing 运营",
          action: `把 ${point.leverageSuggestion || point.category} 放进 Bullet 1-2 和描述首段，避免只在尾部轻描淡写。`,
          evidence: point.typicalQuotes,
        })
      ),
    ].slice(0, 5),
    aPlus: [
      ...topPainPoints.slice(0, 2).map((point) =>
        createActionItem({
          title: `用 A+ 单独拆解 ${point.category}`,
          priority: rankToPriority(point.rank, point.percentage),
          owner: "A+ / 设计",
          action: `做一块“问题 -> 解决方案 -> 使用结果”的 A+ 模块，把 ${point.category} 说透，并用细节图或结构图证明。`,
          evidence: point.typicalQuotes,
        })
      ),
      ...topValuePoints.slice(0, 2).map((point) =>
        createActionItem({
          title: `把 ${point.category} 变成素材证据`,
          priority: point.percentage >= 18 ? "high" : "medium",
          owner: "A+ / 设计",
          action: `给 ${point.category} 做前后对比、近景细节或使用场景模块，而不是只留在文字描述里。`,
          evidence: point.typicalQuotes,
        })
      ),
      ...topCompetitorWeaknesses.slice(0, 1).map((weakness) =>
        createActionItem({
          title: "用 A+ 反打竞品短板",
          priority: "medium",
          owner: "A+ / 设计",
          action: `竞品已经暴露出“${weakness}”短板，A+ 里要主动放结构差异、场景差异或配置差异来反打。`,
          evidence: [weakness],
        })
      ),
    ].slice(0, 5),
    support: topPainPoints.map((point) =>
      createActionItem({
        title: `客服先接住 ${point.category} 顾虑`,
        priority: rankToPriority(point.rank, point.percentage),
        owner: "客服",
        action: `把 ${point.category} 做成标准问答，先确认用户使用场景 / 批次 / 操作方式，再给排查步骤和补偿口径。`,
        evidence: point.typicalQuotes,
      })
    ),
  };
}

export function buildSupportFaqs(
  productName: string,
  painPoints: PainPoint[],
  valuePoints: ValuePoint[]
): SupportFaqItem[] {
  const painPointFaqs = painPoints.slice(0, 4).map((point) => ({
    question: `${productName || "这款产品"}会不会出现${point.category}？`,
    shortAnswer: point.sellingPointSuggestion || `不会刻意回避这个问题，核心是把${point.category}说清楚。`,
    supportGuidance:
      "客服先确认用户使用方式、收到的具体状态和时间节点，再按标准排查 / 补发 / 退款策略处理。",
    scenario: point.category,
  }));

  const valuePointFaqs = valuePoints.slice(0, 2).map((point) => ({
    question: `${productName || "这款产品"}最值得买的点是什么？`,
    shortAnswer: point.leverageSuggestion || `${point.category} 是这条线最值得强化的购买理由。`,
    supportGuidance:
      "客服回答时不要只说好评高，要直接引用可感知的使用收益和适合的人群 / 场景。",
    scenario: point.category,
  }));

  return [...painPointFaqs, ...valuePointFaqs].slice(0, 6);
}

export function enrichListingVersions(
  versions: ListingVersion[],
  input: ListingOperatorInput
): ListingVersion[] {
  return versions.map((version) => ({
    ...version,
    experiments:
      version.experiments.length > 0
        ? version.experiments
        : buildExperiments(version, input),
    rufusQa:
      version.rufusQa.length > 0 ? version.rufusQa : buildRufusQa(version, input),
    creativeBrief:
      version.creativeBrief ?? buildCreativeBrief(version, input),
  }));
}

function buildExperiments(
  version: ListingVersion,
  input: ListingOperatorInput
): ExperimentPlanItem[] {
  const topPain = input.painPoints[0];
  const topValue = input.valuePoints[0];
  const topTitleKeyword = input.dataAnalysis?.keywordStrategy?.titleKeywords[0]?.keyword;

  return [
    {
      variable: "标题主词顺序",
      hypothesis: `把 ${topTitleKeyword || input.productProfile.productCategory || "主类目词"} 前置后，相关性和点击率会更稳。`,
      successMetric: "CTR、Sessions、Search Query Performance 点击份额",
      executionNote: "保留其余结构不变，只测前 60 个字符的主词顺序。",
    },
    {
      variable: "首图卖点表达",
      hypothesis: `把 ${topPain?.category || "核心顾虑"} 对应解决点放到首图副文案，会提升点击后停留和转化。`,
      successMetric: "CVR、Unit Session Percentage、广告点击后转化",
      executionNote: "只改主图副文案或角标，不同时改价格和 Coupon。",
    },
    {
      variable: "Bullet 1 承接角度",
      hypothesis: `先讲 ${topValue?.category || "核心收益"} 而不是泛介绍，更容易承接高意图流量。`,
      successMetric: "CVR、买家问答关键词、Rufus 问法变化",
      executionNote: "保留 Bullet 数量不变，只调整前两条的排序和句式。",
    },
    {
      variable: "A+ / 视频证明模块",
      hypothesis: "把核心差异做成结构证明或场景演示，会降低用户顾虑并提升高客单转化。",
      successMetric: "CVR、页面停留、A+ 相关点击热区",
      executionNote: "优先测试对比模块、步骤演示或细节拆解，不要同时更换所有素材。",
    },
  ];
}

function buildRufusQa(
  version: ListingVersion,
  input: ListingOperatorInput
): RufusQaItem[] {
  const intentLayer = input.dataAnalysis?.rufusIntentLayer;
  const selectedIntents = [
    ...(intentLayer?.scene ?? []),
    ...(intentLayer?.audience ?? []),
    ...(intentLayer?.objections ?? []),
    ...(intentLayer?.comparisons ?? []),
  ].slice(0, 4);

  if (selectedIntents.length > 0) {
    return selectedIntents.map((item) => ({
      intent: item.intent,
      question: item.question,
      answer: `回答要贴合 ${version.versionName} 版本的表达，先给使用结论，再补边界、证据和适合人群。`,
      hook: item.listingHooks.join(" / "),
    }));
  }

  return [
    {
      intent: "场景意图",
      question: `${input.productProfile.productName || "这个产品"}最适合什么场景？`,
      answer: "先讲最典型的使用场景，再补不适合的边界。",
      hook: input.productProfile.coreKeywords || input.productProfile.productCategory,
    },
    {
      intent: "顾虑意图",
      question: `为什么这款 ${input.productProfile.productName || "产品"} 值得买？`,
      answer: "先接用户顾虑，再用结构差异、材质差异或体验差异回答。",
      hook: input.coreSellingPoints || "差异化卖点",
    },
  ];
}

function buildCreativeBrief(
  version: ListingVersion,
  input: ListingOperatorInput
): NonNullable<ListingVersion["creativeBrief"]> {
  const topPain = input.painPoints[0];
  const topValue = input.valuePoints[0];
  const headlineHook =
    input.dataAnalysis?.keywordStrategy?.titleKeywords[0]?.keyword ||
    input.productProfile.coreKeywords ||
    input.productProfile.productCategory;

  return {
    positioning: `${version.versionName} 版本主打 ${topValue?.category || "核心收益"}，同时主动化解 ${
      topPain?.category || "核心顾虑"
    }。`,
    aPlusModules: [
      "品牌 / 产品定位模块",
      `${topPain?.category || "用户顾虑"} 拆解模块`,
      `${topValue?.category || "关键收益"} 证据模块`,
      "对比 / 选购理由模块",
    ],
    imageAngles: [
      `主图先打 ${headlineHook || "核心主词"} 和主收益`,
      `用近景细节证明 ${topValue?.category || "材质或结构差异"}`,
      `用场景图承接 ${topPain?.category || "使用顾虑"} 的解决结果`,
    ],
    videoAngles: [
      "前 3 秒先给痛点和结果",
      "中段做使用步骤或结构拆解",
      "结尾补适合人群、场景和购买理由",
    ],
    deliverables: [
      "主图 1 套",
      "副图 5-7 张",
      "A+ 模块 3-4 块",
      "15-30 秒短视频脚本",
      "客服 FAQ 口径页",
    ],
    shotList: [
      {
        assetType: "image",
        title: "Hero benefit shot",
        objective: "让用户一眼知道它解决什么问题",
        scene: "纯净背景 + 单一主卖点",
        overlay: headlineHook || "核心主卖点",
        proof: topValue?.typicalQuotes[0] || "核心收益对应的视觉证据",
      },
      {
        assetType: "image",
        title: "Detail proof shot",
        objective: "证明材质、结构或工艺差异",
        scene: "局部放大 / 结构拆解",
        overlay: topValue?.category || "差异化结构",
        proof: input.coreSellingPoints || "差异化卖点",
      },
      {
        assetType: "image",
        title: "Pain point solve shot",
        objective: "正面回应用户最怕踩雷的问题",
        scene: "问题前后对比 / 使用结果",
        overlay: topPain?.category || "核心顾虑",
        proof: topPain?.sellingPointSuggestion || "解决方案",
      },
      {
        assetType: "a-plus",
        title: "Comparison module",
        objective: "把普通款和升级款差异讲清楚",
        scene: "参数 / 结构 / 场景对比表",
        overlay: "Why this version",
        proof: version.style || "版本定位",
      },
      {
        assetType: "video",
        title: "Routine demo",
        objective: "用短视频降低理解成本",
        scene: "真人上手或 3-step 演示",
        overlay: "How it works",
        proof: topValue?.leverageSuggestion || "使用收益",
      },
    ],
  };
}

function productActionByPainPoint(point: PainPoint): string {
  if (point.category === "质量问题") {
    return "先回看来料、耐久和关键节点质检，必要时补抽检标准和出厂照片。";
  }
  if (point.category === "功能缺陷") {
    return "重点核对结构、尺寸、适配性和真实使用动作，确认不是功能承诺写过头。";
  }
  if (point.category === "包装物流") {
    return "把内包、缓冲、说明书和封装强度一起优化，减少运输损伤和开箱落差。";
  }
  if (point.category === "与描述不符") {
    return "先统一尺寸、材质、适配范围和配件说明，避免参数口径前后不一致。";
  }

  return "围绕用户原话复盘使用旅程，确认问题是产品本身、说明不清还是预期管理不到位。";
}

function createActionItem(item: VocActionItem): VocActionItem {
  return item;
}

function rankToPriority(rank: number, percentage: number): PriorityLevel {
  if (rank <= 2 || percentage >= 20) {
    return "high";
  }
  if (rank <= 4 || percentage >= 10) {
    return "medium";
  }
  return "low";
}
