import type {
  ListingDiagnosticsEntitySnapshot,
  ListingDiagnosticsFinding,
  ListingDiagnosticsResult,
} from "@/lib/listing-diagnostics/types";
import type { CompetitorListing, TrafficKeyword } from "@/lib/types";

const TEMPLATE_URL = "/templates/listing-diagnostics-template.xlsx";
const WORKSHEET_PATHS = {
  comparison: "xl/worksheets/sheet1.xml",
  traffic: "xl/worksheets/sheet2.xml",
  strengths: "xl/worksheets/sheet3.xml",
  plan: "xl/worksheets/sheet4.xml",
  matrix: "xl/worksheets/sheet5.xml",
  actions: "xl/worksheets/sheet6.xml",
} as const;

const STOP_WORDS = new Set([
  "for",
  "the",
  "and",
  "with",
  "from",
  "your",
  "that",
  "this",
  "women",
  "woman",
  "men",
  "man",
  "kids",
  "girls",
  "boys",
  "amazon",
  "product",
  "products",
  "new",
  "hot",
  "sale",
]);

const SCENE_HINTS = [
  "wedding",
  "formal",
  "cocktail",
  "party",
  "daily",
  "outdoor",
  "office",
  "travel",
  "vacation",
  "church",
  "graduation",
  "birthday",
  "holiday",
  "summer",
  "spring",
  "winter",
  "fall",
  "gym",
  "running",
  "camping",
  "hiking",
  "kitchen",
  "home",
  "office",
  "car",
  "baby",
  "pet",
];

const STYLE_HINTS = [
  "mesh",
  "cotton",
  "floral",
  "ruched",
  "sleeve",
  "maxi",
  "mini",
  "waterproof",
  "stainless",
  "portable",
  "wireless",
  "ergonomic",
  "slim",
  "fitted",
  "lightweight",
  "heavy duty",
  "double layer",
];

type CoverageMark = "✅" | "✅弱" | "❌" | "待补";

interface KeywordComparisonRow {
  keyword: string;
  searchVolume: number | null;
  targetOrganicRank: number;
  targetSponsoredRank: number | null;
  competitorOrganicRank: number;
  competitorSponsoredRank: number | null;
  purchaseRate: number | null;
  targetTitleFlag: CoverageMark;
  targetBulletFlag: CoverageMark;
  competitorTitleFlag: CoverageMark;
  competitorBulletFlag: CoverageMark;
  suggestedTitleFlag: CoverageMark;
  suggestedBulletFlag: CoverageMark;
  suggestedSearchTermsFlag: CoverageMark;
  suggestedAltFlag: CoverageMark;
  analysis: string;
}

interface ActionScheduleRow {
  priority: string;
  action: string;
  impact: string;
  time: string;
}

interface WorkbookContext {
  result: ListingDiagnosticsResult;
  targetListing: CompetitorListing | null;
  competitorSnapshot: ListingDiagnosticsEntitySnapshot | null;
  competitorListing: CompetitorListing | null;
  targetLabel: string;
  competitorLabel: string;
  keywordRows: KeywordComparisonRow[];
  highIntentKeywords: string[];
  missingKeywords: string[];
  sceneKeywords: string[];
  styleKeywords: string[];
  subjectKeywords: string[];
  suggestedTitle: string;
  suggestedBullets: string[];
  suggestedSearchTerms: string[];
  suggestedAltTexts: string[];
  actionRows: ActionScheduleRow[];
  focusFinding: ListingDiagnosticsFinding | null;
}

export async function buildListingDiagnosticsTemplateWorkbookBlob(
  result: ListingDiagnosticsResult
): Promise<Blob> {
  const response = await fetch(TEMPLATE_URL);

  if (!response.ok) {
    throw new Error("无法加载诊断导出模板，请刷新页面后重试。");
  }

  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const context = buildWorkbookContext(result);
  const sheetMaps = buildSheetCellMaps(context);

  for (const [path, cells] of Object.entries(sheetMaps)) {
    const file = zip.file(path);

    if (!file) {
      throw new Error(`导出模板缺少工作表文件：${path}`);
    }

    const xml = await file.async("string");
    const nextXml = updateWorksheetXml(xml, cells);
    zip.file(path, nextXml);
  }

  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function buildListingDiagnosticsTemplateFileName(
  result: ListingDiagnosticsResult
): string {
  const asin = sanitizeSegment(result.request.targetAsin || "ASIN");
  const market = sanitizeSegment(result.request.marketplace || "US");
  const date = formatDate(new Date());

  return `Listing竞品分析_优化方案_${market}_${asin}_${date}.xlsx`;
}

function buildWorkbookContext(result: ListingDiagnosticsResult): WorkbookContext {
  const targetListing = result.target.listing;
  const competitorSnapshot = pickPrimaryCompetitor(result.competitors);
  const competitorListing = competitorSnapshot?.listing ?? null;
  const targetLabel = buildEntityLabel("目标商品", targetListing, result.request.targetAsin);
  const competitorLabel = buildEntityLabel(
    competitorListing ? "重点竞品" : "类目基准",
    competitorListing,
    competitorSnapshot?.asin ?? "BENCHMARK"
  );
  const baseKeywordRows = buildKeywordComparisonRows(
    result.target.keywords,
    competitorSnapshot?.keywords ?? []
  );
  const sceneKeywords = collectSceneKeywords([
    ...baseKeywordRows.map((item) => item.keyword),
    targetListing?.title ?? "",
    ...(targetListing?.bulletPoints ?? []),
    competitorListing?.title ?? "",
    ...(competitorListing?.bulletPoints ?? []),
  ]);
  const styleKeywords = collectStyleKeywords([
    targetListing?.title ?? "",
    ...(targetListing?.bulletPoints ?? []),
    competitorListing?.title ?? "",
    ...(competitorListing?.bulletPoints ?? []),
    getAttributeValue(targetListing, ["fabricType", "material", "style_name"]),
    getAttributeValue(competitorListing, ["fabricType", "material", "style_name"]),
  ]);
  const subjectKeywords = collectSubjectKeywords([
    targetListing?.title ?? "",
    ...(targetListing?.bulletPoints ?? []),
    ...baseKeywordRows.map((item) => item.keyword),
  ]);
  const missingKeywords = baseKeywordRows
    .filter(
      (item) =>
        item.targetTitleFlag === "❌" &&
        (item.competitorTitleFlag !== "❌" || item.competitorBulletFlag !== "❌")
    )
    .map((item) => item.keyword);
  const highIntentKeywords = baseKeywordRows
    .filter(
      (item) =>
        item.searchVolume !== null &&
        item.searchVolume > 0 &&
        (item.targetOrganicRank <= 0 ||
          (item.competitorOrganicRank > 0 &&
            item.competitorOrganicRank < item.targetOrganicRank))
    )
    .slice(0, 8)
    .map((item) => item.keyword);
  const focusFinding = result.findings[0] ?? null;
  const suggestedTitle = buildSuggestedTitle({
    targetListing,
    competitorListing,
    highIntentKeywords,
    missingKeywords,
    styleKeywords,
    subjectKeywords,
  });
  const suggestedBullets = buildSuggestedBullets({
    targetListing,
    focusFinding,
    highIntentKeywords,
    sceneKeywords,
    styleKeywords,
  });
  const suggestedSearchTerms = buildSuggestedSearchTerms({
    keywordRows: baseKeywordRows,
    suggestedTitle,
    suggestedBullets,
    sceneKeywords,
    styleKeywords,
    subjectKeywords,
  });
  const suggestedAltTexts = buildSuggestedAltTexts({
    suggestedTitle,
    keywordRows: baseKeywordRows,
    sceneKeywords,
    styleKeywords,
  });
  const targetTitleText = targetListing?.title ?? "";
  const targetBulletText = (targetListing?.bulletPoints ?? []).join("\n");
  const competitorTitleText = competitorListing?.title ?? "";
  const competitorBulletText = (competitorListing?.bulletPoints ?? []).join("\n");
  const keywordRows = baseKeywordRows.map((item) => ({
    ...item,
    targetTitleFlag: getCoverageFlag(targetTitleText, item.keyword),
    targetBulletFlag: getCoverageFlag(targetBulletText, item.keyword),
    competitorTitleFlag: getCoverageFlag(competitorTitleText, item.keyword),
    competitorBulletFlag: getCoverageFlag(competitorBulletText, item.keyword),
    suggestedTitleFlag: getCoverageFlag(suggestedTitle, item.keyword),
    suggestedBulletFlag: getCoverageFlag(suggestedBullets.join("\n"), item.keyword),
    suggestedSearchTermsFlag: getCoverageFlag(
      suggestedSearchTerms.join("\n"),
      item.keyword
    ),
    suggestedAltFlag: getCoverageFlag(suggestedAltTexts.join("\n"), item.keyword),
  }));
  const actionRows = buildActionScheduleRows({
    result,
    focusFinding,
    missingKeywords,
    highIntentKeywords,
    sceneKeywords,
  });

  return {
    result,
    targetListing,
    competitorSnapshot,
    competitorListing,
    targetLabel,
    competitorLabel,
    keywordRows,
    highIntentKeywords,
    missingKeywords,
    sceneKeywords,
    styleKeywords,
    subjectKeywords,
    suggestedTitle,
    suggestedBullets,
    suggestedSearchTerms,
    suggestedAltTexts,
    actionRows,
    focusFinding,
  };
}

function buildSheetCellMaps(
  context: WorkbookContext
): Record<string, Record<string, string>> {
  return {
    [WORKSHEET_PATHS.comparison]: buildComparisonSheetCells(context),
    [WORKSHEET_PATHS.traffic]: buildTrafficSheetCells(context),
    [WORKSHEET_PATHS.strengths]: buildStrengthSheetCells(context),
    [WORKSHEET_PATHS.plan]: buildPlanSheetCells(context),
    [WORKSHEET_PATHS.matrix]: buildMatrixSheetCells(context),
    [WORKSHEET_PATHS.actions]: buildActionSheetCells(context),
  };
}

function buildComparisonSheetCells(context: WorkbookContext): Record<string, string> {
  const target = context.targetListing;
  const competitor = context.competitorListing;

  return {
    A1: "指标",
    B1: context.targetLabel,
    C1: context.competitorLabel,
    D1: "对比分析",
    A2: "标题",
    B2: target?.title ?? "未获取到目标标题",
    C2: competitor?.title ?? "未获取到竞品标题",
    D2: buildTitleComparison(context),
    A3: "品牌",
    B3: getBrand(target) || "未获取",
    C3: getBrand(competitor) || "未获取",
    D3: buildBrandComparison(context),
    A4: "价格",
    B4: formatCurrency(target?.price ?? 0),
    C4: formatCurrency(competitor?.price ?? 0),
    D4: buildPriceComparison(context),
    A5: "BSR",
    B5: formatRank(target?.bsr ?? 0),
    C5: formatRank(competitor?.bsr ?? 0),
    D5: buildBsrComparison(context),
    A6: "类目/节点",
    B6: getNodeSummary(target),
    C6: getNodeSummary(competitor),
    D6: buildNodeComparison(context),
    A7: "评分/评论",
    B7: formatRatingSummary(target),
    C7: formatRatingSummary(competitor),
    D7: buildRatingComparison(context),
    A8: "变体数",
    B8: formatWhole(getVariationCount(target)),
    C8: formatWhole(getVariationCount(competitor)),
    D8: buildVariationComparison(context),
    A9: "诊断结论",
    B9: `${context.result.overallScore}/100`,
    C9: `置信度 ${context.result.confidence}%`,
    D9: context.result.headline,
    A10: "A+/EBC",
    B10: formatBooleanZh(getBooleanAttribute(target, "hasAPlus")),
    C10: formatBooleanZh(getBooleanAttribute(competitor, "hasAPlus")),
    D10: buildAssetComparison(context, "A+"),
    A11: "视频",
    B11: formatBooleanZh(getBooleanAttribute(target, "hasVideo")),
    C11: formatBooleanZh(getBooleanAttribute(competitor, "hasVideo")),
    D11: buildAssetComparison(context, "视频"),
    A12: "履约方式",
    B12: formatFulfillment(target),
    C12: formatFulfillment(competitor),
    D12: buildFulfillmentComparison(context),
    A13: "上架时间",
    B13: formatAvailableDate(target),
    C13: formatAvailableDate(competitor),
    D13: buildLaunchComparison(context),
    A14: "流量关键词数",
    B14: formatWhole(context.result.target.keywords.length),
    C14: formatWhole(context.competitorSnapshot?.keywords.length ?? 0),
    D14: buildKeywordCoverageComparison(context),
    A15: "材质/核心属性",
    B15: getAttributeSummary(target),
    C15: getAttributeSummary(competitor),
    D15: buildAttributeComparison(context),
    A16: "场景/用途推断",
    B16: joinCommaList(collectSceneKeywords([target?.title ?? "", ...(target?.bulletPoints ?? [])])),
    C16: joinCommaList(
      collectSceneKeywords([
        competitor?.title ?? "",
        ...(competitor?.bulletPoints ?? []),
      ])
    ),
    D16: buildSceneComparison(context),
  };
}

function buildTrafficSheetCells(context: WorkbookContext): Record<string, string> {
  const cells: Record<string, string> = {
    A1: "关键词",
    B1: "月搜索量",
    C1: "目标自然排名",
    D1: "目标广告排名",
    E1: "竞品自然排名",
    F1: "竞品广告排名",
    G1: "PPC竞价$",
    H1: "SPR",
    I1: "购买率%",
    J1: "竞争度分析",
  };

  const rows = fillToLength(context.keywordRows, 30);

  rows.forEach((row, index) => {
    const excelRow = index + 2;
    cells[`A${excelRow}`] = row?.keyword ?? "";
    cells[`B${excelRow}`] = formatSearchVolume(row?.searchVolume ?? null);
    cells[`C${excelRow}`] = formatRank(row?.targetOrganicRank ?? 0);
    cells[`D${excelRow}`] = formatRank(row?.targetSponsoredRank ?? null);
    cells[`E${excelRow}`] = formatRank(row?.competitorOrganicRank ?? 0);
    cells[`F${excelRow}`] = formatRank(row?.competitorSponsoredRank ?? null);
    cells[`G${excelRow}`] = "-";
    cells[`H${excelRow}`] = "-";
    cells[`I${excelRow}`] =
      row?.purchaseRate !== null && row?.purchaseRate !== undefined
        ? `${(row.purchaseRate * 100).toFixed(2)}%`
        : "-";
    cells[`J${excelRow}`] = row?.analysis ?? "";
  });

  return cells;
}

function buildStrengthSheetCells(context: WorkbookContext): Record<string, string> {
  const cells: Record<string, string> = {
    A1: "分析维度",
    B1: `${context.targetLabel} 优点`,
    C1: `${context.targetLabel} 缺点`,
    D1: `${context.competitorLabel} 优点`,
    E1: `${context.competitorLabel} 缺点`,
  };

  const rows = [
    {
      label: "标题",
      targetStrength: buildTitleStrengths(context, "target"),
      targetRisk: buildTitleRisks(context, "target"),
      competitorStrength: buildTitleStrengths(context, "competitor"),
      competitorRisk: buildTitleRisks(context, "competitor"),
    },
    {
      label: "五点描述",
      targetStrength: buildBulletStrengths(context, "target"),
      targetRisk: buildBulletRisks(context, "target"),
      competitorStrength: buildBulletStrengths(context, "competitor"),
      competitorRisk: buildBulletRisks(context, "competitor"),
    },
    {
      label: "A+ 内容",
      targetStrength: buildAssetStrengths(context, "target"),
      targetRisk: buildAssetRisks(context, "target"),
      competitorStrength: buildAssetStrengths(context, "competitor"),
      competitorRisk: buildAssetRisks(context, "competitor"),
    },
    {
      label: "类目放置",
      targetStrength: buildNodeStrengths(context, "target"),
      targetRisk: buildNodeRisks(context, "target"),
      competitorStrength: buildNodeStrengths(context, "competitor"),
      competitorRisk: buildNodeRisks(context, "competitor"),
    },
    {
      label: "关键词覆盖",
      targetStrength: buildKeywordStrengths(context, "target"),
      targetRisk: buildKeywordRisks(context, "target"),
      competitorStrength: buildKeywordStrengths(context, "competitor"),
      competitorRisk: buildKeywordRisks(context, "competitor"),
    },
    {
      label: "广告结构",
      targetStrength: buildAdStrengths(context, "target"),
      targetRisk: buildAdRisks(context, "target"),
      competitorStrength: buildAdStrengths(context, "competitor"),
      competitorRisk: buildAdRisks(context, "competitor"),
    },
    {
      label: "场景覆盖",
      targetStrength: buildSceneStrengths(context, "target"),
      targetRisk: buildSceneRisks(context, "target"),
      competitorStrength: buildSceneStrengths(context, "competitor"),
      competitorRisk: buildSceneRisks(context, "competitor"),
    },
    {
      label: "价格/价值",
      targetStrength: buildValueStrengths(context, "target"),
      targetRisk: buildValueRisks(context, "target"),
      competitorStrength: buildValueStrengths(context, "competitor"),
      competitorRisk: buildValueRisks(context, "competitor"),
    },
  ];

  rows.forEach((row, index) => {
    const excelRow = index + 2;
    cells[`A${excelRow}`] = row.label;
    cells[`B${excelRow}`] = row.targetStrength;
    cells[`C${excelRow}`] = row.targetRisk;
    cells[`D${excelRow}`] = row.competitorStrength;
    cells[`E${excelRow}`] = row.competitorRisk;
  });

  return cells;
}

function buildPlanSheetCells(context: WorkbookContext): Record<string, string> {
  const exactKeywords = joinCommaList(context.highIntentKeywords.slice(0, 10));
  const occasionKeywords = joinCommaList(context.sceneKeywords.slice(0, 16));
  const styleKeywords = joinCommaList(context.styleKeywords.slice(0, 12));
  const subjectKeywords = joinCommaList(context.subjectKeywords.slice(0, 6));
  const altStrategy =
    "每张 A+ Alt Text 用不同关键词组合覆盖搜索意图；避免重复堆同一短语，优先补标题和五点放不下的长尾词。";
  const attributeAdvice =
    "建议同步回填 Seller Central 后台属性：occasion_type、style_name、department、material、fit 或兼容性字段，确保场景词和属性词都有正式落点。";

  return {
    A1: `新Listing优化方案 - ${context.result.request.targetAsin}`,
    A3: "优化标题 (Title)",
    A4: "推荐标题",
    B4: context.suggestedTitle,
    A5: "标题逻辑",
    B5: buildTitleLogic(context),
    A6: "嵌入核心词",
    B6: exactKeywords,
    A7: "COSMO算法适配",
    B7: buildCosmoNarrative(context),
    A9: "五点描述 (Bullet Points)",
    A10: "Bullet 1 - 搜索定位",
    B10: context.suggestedBullets[0] ?? "",
    A11: "Bullet 2 - 材质/功能",
    B11: context.suggestedBullets[1] ?? "",
    A12: "Bullet 3 - 场景覆盖",
    B12: context.suggestedBullets[2] ?? "",
    A13: "Bullet 4 - 差异化证明",
    B13: context.suggestedBullets[3] ?? "",
    A14: "Bullet 5 - 尺寸/兼容/售后",
    B14: context.suggestedBullets[4] ?? "",
    A16: "后台 Search Terms (ST)",
    A17: "第1行 (核心补位词)",
    B17: context.suggestedSearchTerms[0] ?? "",
    A18: "第2行 (长尾属性词)",
    B18: context.suggestedSearchTerms[1] ?? "",
    A19: "第3行 (场景补充词)",
    B19: context.suggestedSearchTerms[2] ?? "",
    A20: "第4行 (风格/近义词)",
    B20: context.suggestedSearchTerms[3] ?? "",
    A21: "第5行 (补充词)",
    B21: context.suggestedSearchTerms[4] ?? "",
    A22: "ST策略说明",
    B22:
      "ST 不重复标题和五点里已经稳定承接的主词，优先补高流量缺失词、长尾场景词、同义词和后台属性词。",
    A24: "A+ Alt Text关键词策略",
    A25: "图片1 Alt Text",
    B25: context.suggestedAltTexts[0] ?? "",
    A26: "图片2 Alt Text",
    B26: context.suggestedAltTexts[1] ?? "",
    A27: "图片3 Alt Text",
    B27: context.suggestedAltTexts[2] ?? "",
    A28: "图片4 Alt Text",
    B28: context.suggestedAltTexts[3] ?? "",
    A29: "图片5 Alt Text",
    B29: context.suggestedAltTexts[4] ?? "",
    A30: "图片6 Alt Text",
    B30: context.suggestedAltTexts[5] ?? "",
    A31: "图片7 Alt Text",
    B31: context.suggestedAltTexts[6] ?? "",
    A32: "策略说明",
    B32: altStrategy,
    A34: "Occasion Type / Subject Keywords",
    A35: "occasion_type",
    B35: occasionKeywords,
    A36: "style_keywords",
    B36: styleKeywords,
    A37: "subject_keywords",
    B37: subjectKeywords,
    A38: "后台属性设置建议",
    B38: attributeAdvice,
    A40: "广告结构 (Ad Structure)",
    A41: "Phase 1 (前2周-冲核心词)",
    B41: buildAdPlanLine("SP 精准", context.highIntentKeywords.slice(0, 5), "先抢最缺的高意图词位。"),
    A42: "Phase 1 扩词测试",
    B42: buildAdPlanLine("SP 广泛", context.keywordRows.slice(5, 10).map((item) => item.keyword), "测试新词并验证转化承接。"),
    A43: "Phase 1 品牌承接",
    B43: buildAdPlanLine("SB / 品牌广告", context.sceneKeywords.slice(0, 4), "用场景词承接品牌曝光和高转化入口。"),
    A44: "Phase 2 (第3-6周)",
    B44: buildAdPlanLine("精准扩词", context.keywordRows.slice(10, 16).map((item) => item.keyword), "根据前两周数据扩更细的长尾词。"),
    A45: "Phase 2 视频广告",
    B45: buildAdPlanLine("SBV 视频", context.sceneKeywords.slice(0, 3), "把核心卖点和使用场景做成视频承接。"),
    A46: "Phase 3 (第7周+)",
    B46: buildAdPlanLine("长尾稳位", context.keywordRows.slice(16, 22).map((item) => item.keyword), "逐步降低对泛词的依赖，转向利润更稳的长尾词。"),
    A47: "ASIN定向广告",
    B47: buildAsinTargetingLine(context),
    A48: "广告预算建议",
    B48:
      "建议先按核心词验证节奏控制预算：前 7 天观察 CTR，14 天观察自然位和转化，28 天再决定是否放大预算。",
  };
}

function buildMatrixSheetCells(context: WorkbookContext): Record<string, string> {
  const cells: Record<string, string> = {
    A1: "核心关键词",
    B1: "月搜索量",
    C1: "目标标题",
    D1: "目标五点",
    E1: "目标 ST",
    F1: "竞品标题",
    G1: "竞品五点",
    H1: "竞品 ST",
    I1: "建议标题",
    J1: "建议五点",
    K1: "建议 ST",
    L1: "建议 A+ Alt",
  };

  const rows = fillToLength(context.keywordRows, 23);

  rows.forEach((row, index) => {
    const excelRow = index + 2;
    cells[`A${excelRow}`] = row?.keyword ?? "";
    cells[`B${excelRow}`] = formatSearchVolume(row?.searchVolume ?? null);
    cells[`C${excelRow}`] = row?.targetTitleFlag ?? "";
    cells[`D${excelRow}`] = row?.targetBulletFlag ?? "";
    cells[`E${excelRow}`] = "待补";
    cells[`F${excelRow}`] = row?.competitorTitleFlag ?? "";
    cells[`G${excelRow}`] = row?.competitorBulletFlag ?? "";
    cells[`H${excelRow}`] = "待补";
    cells[`I${excelRow}`] = row?.suggestedTitleFlag ?? "";
    cells[`J${excelRow}`] = row?.suggestedBulletFlag ?? "";
    cells[`K${excelRow}`] = row?.suggestedSearchTermsFlag ?? "";
    cells[`L${excelRow}`] = row?.suggestedAltFlag ?? "";
  });

  return cells;
}

function buildActionSheetCells(context: WorkbookContext): Record<string, string> {
  const cells: Record<string, string> = {
    A1: "优先级",
    B1: "行动项",
    C1: "预期效果",
    D1: "时间节点",
  };

  const rows = fillToLength(context.actionRows, 13);

  rows.forEach((row, index) => {
    const excelRow = index + 2;
    cells[`A${excelRow}`] = row?.priority ?? "";
    cells[`B${excelRow}`] = row?.action ?? "";
    cells[`C${excelRow}`] = row?.impact ?? "";
    cells[`D${excelRow}`] = row?.time ?? "";
  });

  return cells;
}

function buildKeywordComparisonRows(
  targetKeywords: TrafficKeyword[],
  competitorKeywords: TrafficKeyword[]
): KeywordComparisonRow[] {
  const registry = new Map<
    string,
    {
      keyword: string;
      searchVolume: number | null;
      targetOrganicRank: number;
      targetSponsoredRank: number | null;
      competitorOrganicRank: number;
      competitorSponsoredRank: number | null;
      purchaseRate: number | null;
    }
  >();

  for (const item of targetKeywords) {
    const key = normalizePhrase(item.keyword);
    if (!key) {
      continue;
    }

    const current = registry.get(key);
    registry.set(key, {
      keyword: item.keyword,
      searchVolume: pickLargerNumber(current?.searchVolume ?? null, item.searchVolume),
      targetOrganicRank: pickBetterRank(current?.targetOrganicRank ?? 0, item.organicRank),
      targetSponsoredRank: pickBetterNullableRank(
        current?.targetSponsoredRank ?? null,
        item.sponsoredRank
      ),
      competitorOrganicRank: current?.competitorOrganicRank ?? 0,
      competitorSponsoredRank: current?.competitorSponsoredRank ?? null,
      purchaseRate:
        current?.purchaseRate !== null && current?.purchaseRate !== undefined
          ? Math.max(current.purchaseRate, item.conversionShare)
          : item.conversionShare,
    });
  }

  for (const item of competitorKeywords) {
    const key = normalizePhrase(item.keyword);
    if (!key) {
      continue;
    }

    const current = registry.get(key);
    registry.set(key, {
      keyword: current?.keyword ?? item.keyword,
      searchVolume: pickLargerNumber(current?.searchVolume ?? null, item.searchVolume),
      targetOrganicRank: current?.targetOrganicRank ?? 0,
      targetSponsoredRank: current?.targetSponsoredRank ?? null,
      competitorOrganicRank: pickBetterRank(
        current?.competitorOrganicRank ?? 0,
        item.organicRank
      ),
      competitorSponsoredRank: pickBetterNullableRank(
        current?.competitorSponsoredRank ?? null,
        item.sponsoredRank
      ),
      purchaseRate:
        current?.purchaseRate !== null && current?.purchaseRate !== undefined
          ? Math.max(current.purchaseRate, item.conversionShare)
          : item.conversionShare,
    });
  }

  return Array.from(registry.values())
    .sort((left, right) => {
      const volumeDelta = (right.searchVolume ?? 0) - (left.searchVolume ?? 0);
      if (volumeDelta !== 0) {
        return volumeDelta;
      }

      const competitorRankDelta = compareRank(
        left.competitorOrganicRank || null,
        right.competitorOrganicRank || null
      );
      if (competitorRankDelta !== 0) {
        return competitorRankDelta;
      }

      return compareRank(left.targetOrganicRank || null, right.targetOrganicRank || null);
    })
    .map((item) => ({
      ...item,
      targetTitleFlag: "❌",
      targetBulletFlag: "❌",
      competitorTitleFlag: "❌",
      competitorBulletFlag: "❌",
      suggestedTitleFlag: "❌",
      suggestedBulletFlag: "❌",
      suggestedSearchTermsFlag: "❌",
      suggestedAltFlag: "❌",
      analysis: buildKeywordCompetitionAnalysis(item),
    }));
}

function buildSuggestedTitle(input: {
  targetListing: CompetitorListing | null;
  competitorListing: CompetitorListing | null;
  highIntentKeywords: string[];
  missingKeywords: string[];
  styleKeywords: string[];
  subjectKeywords: string[];
}): string {
  const brand = getBrand(input.targetListing) || getBrand(input.competitorListing) || "";
  const phrases = uniquePhrases([
    ...input.highIntentKeywords.slice(0, 4),
    ...input.missingKeywords.slice(0, 4),
    ...input.styleKeywords.slice(0, 3),
    ...input.subjectKeywords.slice(0, 2),
  ]).filter(Boolean);
  const body = phrases.map(toTitleCase).join(" ");
  const rawTitle = [brand, body].filter(Boolean).join(" ").trim();

  return trimToWordBoundary(rawTitle || input.targetListing?.title || "Suggested Listing", 175);
}

function buildSuggestedBullets(input: {
  targetListing: CompetitorListing | null;
  focusFinding: ListingDiagnosticsFinding | null;
  highIntentKeywords: string[];
  sceneKeywords: string[];
  styleKeywords: string[];
}): string[] {
  const primaryKeywords = uniquePhrases(input.highIntentKeywords.slice(0, 6));
  const sceneKeywords = uniquePhrases(input.sceneKeywords.slice(0, 8));
  const styleKeywords = uniquePhrases(input.styleKeywords.slice(0, 6));
  const material = getAttributeValue(input.targetListing, [
    "fabricType",
    "material",
    "mainMaterial",
  ]);
  const issueFocus = mapFindingToChinese(input.focusFinding);

  return [
    `【Search-Relevant Positioning】Lead with ${joinCommaList(primaryKeywords.slice(0, 3))} so shoppers instantly understand the product type, core use case, and main buying intent.`,
    `【Material / Build Confidence】Use concrete proof around ${material || joinCommaList(styleKeywords.slice(0, 3)) || "material, construction, and finish"} to answer trust questions before shoppers bounce.`,
    `【Occasion / Use Case Coverage】Expand usage coverage into ${joinCommaList(sceneKeywords.slice(0, 6)) || "the highest-intent shopper scenarios"} without repeating the same phrase across every line.`,
    `【Differentiation】Make the copy clearly explain why this ASIN wins on ${issueFocus.changeFocus} instead of relying on generic adjectives or broad claims.`,
    `【Fit / Compatibility / Care】Keep the last bullet for size, compatibility, care, usage notes, and after-sale guidance so premium keyword space stays focused on conversion drivers.`,
  ];
}

function buildSuggestedSearchTerms(input: {
  keywordRows: KeywordComparisonRow[];
  suggestedTitle: string;
  suggestedBullets: string[];
  sceneKeywords: string[];
  styleKeywords: string[];
  subjectKeywords: string[];
}): string[] {
  const visibleCopy = `${input.suggestedTitle}\n${input.suggestedBullets.join("\n")}`;
  const missingRows = input.keywordRows.filter(
    (item) => getCoverageFlag(visibleCopy, item.keyword) === "❌"
  );
  const primary = missingRows.slice(0, 8).map((item) => item.keyword);
  const secondary = uniquePhrases([
    ...missingRows.slice(8, 14).map((item) => item.keyword),
    ...input.styleKeywords.slice(0, 4),
  ]);
  const scenes = uniquePhrases(input.sceneKeywords.slice(0, 10));
  const subjects = uniquePhrases(input.subjectKeywords.slice(0, 4));
  const fallbacks = uniquePhrases(
    input.keywordRows.slice(0, 18).map((item) => item.keyword)
  ).filter((item) => !primary.includes(item) && !secondary.includes(item));

  return [
    trimToWordBoundary(primary.join(" "), 110),
    trimToWordBoundary(secondary.join(" "), 110),
    trimToWordBoundary(scenes.join(" "), 110),
    trimToWordBoundary(subjects.join(" "), 110),
    trimToWordBoundary(fallbacks.slice(0, 8).join(" "), 110),
  ];
}

function buildSuggestedAltTexts(input: {
  suggestedTitle: string;
  keywordRows: KeywordComparisonRow[];
  sceneKeywords: string[];
  styleKeywords: string[];
}): string[] {
  const anchor = uniquePhrases([
    ...input.keywordRows.slice(0, 10).map((item) => item.keyword),
    ...input.sceneKeywords.slice(0, 6),
    ...input.styleKeywords.slice(0, 6),
  ]);
  const lines: string[] = [];

  for (let index = 0; index < 7; index += 1) {
    const rotated = rotate(anchor, index).slice(0, 8);
    lines.push(trimToWordBoundary(rotated.map(toTitleCase).join(" "), 130));
  }

  return lines;
}

function buildActionScheduleRows(input: {
  result: ListingDiagnosticsResult;
  focusFinding: ListingDiagnosticsFinding | null;
  missingKeywords: string[];
  highIntentKeywords: string[];
  sceneKeywords: string[];
}): ActionScheduleRow[] {
  const issueFocus = mapFindingToChinese(input.focusFinding);
  const actions: ActionScheduleRow[] = [
    {
      priority: "P0-立即",
      action: `重写标题前 80 字符，补齐 ${joinCommaList(
        input.highIntentKeywords.slice(0, 4)
      ) || "缺失核心词"}`,
      impact: "先修搜索相关性，避免高流量词继续由竞品吃掉自然位。",
      time: "Day 1",
    },
    {
      priority: "P0-立即",
      action: "重排五点顺序：先结果与卖点，再材质/功能，再场景，再补充信息。",
      impact: "提升移动端可读性，让五点真正承接点击后的转化判断。",
      time: "Day 1",
    },
    {
      priority: "P0-立即",
      action: `补录后台 Search Terms，重点承接 ${joinCommaList(
        input.missingKeywords.slice(0, 5)
      ) || "标题和五点放不下的长尾词"}`,
      impact: "扩大索引覆盖面，避免后台字段继续空转。",
      time: "Day 1",
    },
    {
      priority: "P0-立即",
      action: `回填 Seller Central 后台属性，优先覆盖 ${joinCommaList(
        input.sceneKeywords.slice(0, 6)
      ) || "核心场景词和属性词"}`,
      impact: "让标题、五点、属性字段讲同一套场景，减少系统对产品定位的误判。",
      time: "Day 1",
    },
    {
      priority: "P1-本周",
      action: "按 7 张图思路补 A+ Alt Text / 图片文案，让长尾词进入非主文案资产位。",
      impact: "补充标题和五点承接不了的索引空间，同时提高素材协同。",
      time: "Day 1-3",
    },
    {
      priority: "P1-本周",
      action: `围绕“${issueFocus.shortLabel}”补强证据和价值表达，避免继续只讲泛卖点。`,
      impact: issueFocus.expectedImpact,
      time: "Day 1-3",
    },
    {
      priority: "P1-本周",
      action: "用 SP 精准 + SP 广泛 + SB 做第一轮关键词验证，不要只改文案不看回传数据。",
      impact: "更快确认哪些词该进标题，哪些词只适合广告承接。",
      time: "Day 1-7",
    },
    {
      priority: "P1-本周",
      action: "把高频差评点提前写进五点或 A+，把用户顾虑前置解决。",
      impact: "提升转化稳定性，减少点击后流失。",
      time: "Day 1-7",
    },
    {
      priority: "P2-两周内",
      action: "根据第一轮数据启动第二层长尾扩词，补更细的场景词和属性词。",
      impact: "把流量从几个大词，扩展到更稳定的长尾词盘。",
      time: "Day 14-42",
    },
    {
      priority: "P2-两周内",
      action: "同步检查视频、优惠券、变体结构和类目节点，不要让内容优化被运营短板拖住。",
      impact: "减少内容改完却依然起不来的结构性阻力。",
      time: "Day 7-14",
    },
    {
      priority: "P2-两周内",
      action: "复查竞品的自然位变化，观察竞品是否已经切走新的场景词或价格带。",
      impact: "让后续改版不是一次性动作，而是持续追位。",
      time: "Day 14-21",
    },
    {
      priority: "P3-一月内",
      action: "按 7 / 14 / 28 天复盘 CTR、CVR、自然位、索引词数和广告依赖度。",
      impact: "让优化形成闭环，而不是只看一版文案好不好看。",
      time: "Day 30+",
    },
    {
      priority: "P3-一月内",
      action: "清理低效词、低效广告位和重复表达，保留真正能带来搜索和转化的组合。",
      impact: "提高利润质量，避免无效覆盖继续消耗预算。",
      time: "Day 42+",
    },
  ];

  if (input.result.spApiVerification?.scoreCapApplied) {
    actions[0] = {
      priority: "P0-立即",
      action: "优先处理 Amazon 已验证的阻塞项，再继续做内容和流量放大。",
      impact: "先解除平台确认的硬阻塞，再放大内容优化收益。",
      time: "Day 1",
    };
  }

  return actions;
}

function buildTitleComparison(context: WorkbookContext): string {
  const targetTitle = context.targetListing?.title ?? "";
  const competitorTitle = context.competitorListing?.title ?? "";
  const targetCoverage = countKeywordHits(targetTitle, context.keywordRows.slice(0, 8));
  const competitorCoverage = countKeywordHits(
    competitorTitle,
    context.keywordRows.slice(0, 8)
  );
  const missing = context.missingKeywords.slice(0, 3);

  if (competitorCoverage > targetCoverage && missing.length > 0) {
    return `竞品标题对核心词的承接更完整，目标标题当前仍缺 ${joinCommaList(missing)}，这会直接拖慢搜索相关性和点击前置判断。`;
  }

  if (targetCoverage > competitorCoverage) {
    return "目标标题对核心词的承接并不弱，下一步更应该优化结构顺序和差异化表述，而不是盲目加词。";
  }

  return "两边标题承接度接近，但目标标题还需要把更高意图的词前置，减少信息分散。";
}

function buildBrandComparison(context: WorkbookContext): string {
  const targetBrand = getBrand(context.targetListing);
  const competitorBrand = getBrand(context.competitorListing);

  if (!targetBrand && !competitorBrand) {
    return "当前没有拿到可靠品牌字段，建议把品牌、系列和定位词一起回填，避免品牌信号缺失。";
  }

  if (targetBrand && competitorBrand && targetBrand !== competitorBrand) {
    return `两边品牌不同，内容策略不应只拼价格，更要强调 ${context.focusFinding ? mapFindingToChinese(context.focusFinding).shortLabel : "价值证明"}。`;
  }

  return "品牌字段本身不是主要差距，真正要拉开的还是关键词、场景和价值证明。";
}

function buildPriceComparison(context: WorkbookContext): string {
  const target = context.targetListing?.price ?? 0;
  const competitor = context.competitorListing?.price ?? 0;

  if (target <= 0 || competitor <= 0) {
    return "价格字段不完整，建议手动核对当前售价、促销和优惠券，避免错误的价值判断。";
  }

  const diff = Math.abs(target - competitor).toFixed(2);
  if (target < competitor) {
    return `目标 ASIN 当前价格更低，便于拿点击；但如果价值证明偏弱，低价也可能只换来流量、不换来转化。价差约 $${diff}。`;
  }

  if (target > competitor) {
    return `目标 ASIN 当前价格更高，必须用更强的材质、效果、场景或口碑去支撑溢价。价差约 $${diff}。`;
  }

  return "两边价格接近，胜负更取决于标题相关性、素材质量和卖点表达。";
}

function buildBsrComparison(context: WorkbookContext): string {
  const target = context.targetListing?.bsr ?? 0;
  const competitor = context.competitorListing?.bsr ?? 0;

  if (target <= 0 || competitor <= 0) {
    return "BSR 字段不完整，建议把自然位、广告位和销量表现一起联动判断，不只盯单一排名。";
  }

  if (target < competitor) {
    return "目标 ASIN 当前 BSR 更靠前，说明并非完全没有流量基础；更关键的是把流量结构做得更健康。";
  }

  if (target > competitor) {
    return "竞品 BSR 更靠前，通常意味着它在关键词承接、转化或价格带上已经形成了优势。";
  }

  return "两边 BSR 接近，下一步应重点看关键词覆盖和转化承接，而不是只看排名。";
}

function buildNodeComparison(context: WorkbookContext): string {
  const targetNode = getNodeSummary(context.targetListing);
  const competitorNode = getNodeSummary(context.competitorListing);

  if (targetNode === "未获取" && competitorNode === "未获取") {
    return "类目/节点字段没有拿全，建议手动补查 Seller Central 与前台节点路径。";
  }

  if (targetNode !== competitorNode && competitorNode !== "未获取") {
    return "目标 ASIN 的节点/类目路径和竞品并不完全一致，需确认是否错失了更高流量、更高转化的入口节点。";
  }

  return "类目路径差距不算大，但仍要确认后台属性和前台文案是否在讲同一类使用场景。";
}

function buildRatingComparison(context: WorkbookContext): string {
  const targetRating = context.targetListing?.rating ?? 0;
  const competitorRating = context.competitorListing?.rating ?? 0;
  const targetReviews = context.targetListing?.reviews ?? 0;
  const competitorReviews = context.competitorListing?.reviews ?? 0;

  if (targetReviews > competitorReviews && targetRating >= competitorRating) {
    return "目标 ASIN 的口碑底盘并不差，说明更大的问题可能在关键词承接和价值表达，而不是纯评论量。";
  }

  if (targetReviews < competitorReviews) {
    return "目标 ASIN 的评论深度更弱时，文案里必须更早给出材质、效果和使用证明，降低信任门槛。";
  }

  return "评分接近时，真正的转化差异通常来自页面表达是否把优势说透。";
}

function buildVariationComparison(context: WorkbookContext): string {
  const target = getVariationCount(context.targetListing);
  const competitor = getVariationCount(context.competitorListing);

  if (target <= 0 && competitor <= 0) {
    return "未拿到稳定的变体数据，建议额外检查父子体结构、颜色/尺寸命名和低销量子体。";
  }

  if (target > competitor && target >= 40) {
    return "目标 ASIN 的变体数偏大，容易把流量和评论稀释到多个子体，后续要同步做变体治理。";
  }

  if (competitor > target && competitor >= 40) {
    return "竞品虽然变体更多，但如果自然位依旧更强，说明它在标题、关键词和素材协同上更成熟。";
  }

  return "变体规模差距不算极端，但仍建议在内容优化前先确认父子体结构没有硬伤。";
}

function buildAssetComparison(context: WorkbookContext, assetLabel: string): string {
  const targetHasAsset =
    assetLabel === "A+"
      ? getBooleanAttribute(context.targetListing, "hasAPlus")
      : getBooleanAttribute(context.targetListing, "hasVideo");
  const competitorHasAsset =
    assetLabel === "A+"
      ? getBooleanAttribute(context.competitorListing, "hasAPlus")
      : getBooleanAttribute(context.competitorListing, "hasVideo");

  if (targetHasAsset && competitorHasAsset) {
    return `${assetLabel} 两边都有，差异不在“有没有”，而在有没有真正承接长尾词、场景词和证明素材。`;
  }

  if (!targetHasAsset && competitorHasAsset) {
    return `目标 ASIN 当前缺少 ${assetLabel}，会让转化承接和内容深度明显落后于竞品。`;
  }

  if (targetHasAsset && !competitorHasAsset) {
    return `目标 ASIN 已经有 ${assetLabel} 基础，下一步要把它从“存在”升级为“有效承接搜索和转化”。`;
  }

  return `${assetLabel} 两边都不足，属于后续能拉开差距的机会位。`;
}

function buildFulfillmentComparison(context: WorkbookContext): string {
  const target = formatFulfillment(context.targetListing);
  const competitor = formatFulfillment(context.competitorListing);

  if (target === competitor) {
    return "履约方式不是主要差距，内容、价格带和关键词结构才是优先级更高的问题。";
  }

  return "履约方式存在差异时，要同步核对配送承诺、库存稳定性和 Buy Box 风险。";
}

function buildLaunchComparison(context: WorkbookContext): string {
  const targetDays = getDaysSince(getAttributeValue(context.targetListing, ["availableDate"]));
  const competitorDays = getDaysSince(
    getAttributeValue(context.competitorListing, ["availableDate"])
  );

  if (targetDays <= 0 || competitorDays <= 0) {
    return "上架时间不完整，建议把改版节奏和最近一次重大调整时间一起记录。";
  }

  if (targetDays > competitorDays) {
    return "目标 ASIN 上架更久却还没把关键词和场景优势吃满，说明内容结构有老化迹象。";
  }

  if (targetDays < competitorDays) {
    return "目标 ASIN 上架更晚时，更要把核心词和高意图场景先前置，缩短爬坡时间。";
  }

  return "上架时间接近，接下来更应该看谁的内容结构和价值表达更有效。";
}

function buildKeywordCoverageComparison(context: WorkbookContext): string {
  const targetCount = context.result.target.keywords.length;
  const competitorCount = context.competitorSnapshot?.keywords.length ?? 0;

  if (targetCount < competitorCount) {
    return `竞品当前可见关键词盘更大，目标 ASIN 需要先补缺失主词，再逐步扩长尾词。`;
  }

  if (targetCount > competitorCount) {
    return "目标 ASIN 的词盘规模并不弱，问题更可能出在标题位置、五点排序或价值承接。";
  }

  return "两边词盘规模接近，但高流量词是否进入标题和前两条五点，才是更关键的差异。";
}

function buildAttributeComparison(context: WorkbookContext): string {
  const target = getAttributeSummary(context.targetListing);
  const competitor = getAttributeSummary(context.competitorListing);

  if (target === "未获取" && competitor === "未获取") {
    return "材质/属性字段不完整，建议手动补查 Seller Central 平铺属性。";
  }

  if (target !== competitor && competitor !== "未获取") {
    return "目标 ASIN 的材质/属性表达和竞品不一致时，必须确认差异是优势、短板，还是根本没说清。";
  }

  return "属性表达不算主要短板，但仍建议把最能驱动转化的属性前置到标题或前两条五点。";
}

function buildSceneComparison(context: WorkbookContext): string {
  const targetScenes = collectSceneKeywords([
    context.targetListing?.title ?? "",
    ...(context.targetListing?.bulletPoints ?? []),
  ]);
  const competitorScenes = collectSceneKeywords([
    context.competitorListing?.title ?? "",
    ...(context.competitorListing?.bulletPoints ?? []),
  ]);
  const missing = competitorScenes.filter((item) => !targetScenes.includes(item)).slice(0, 4);

  if (missing.length > 0) {
    return `竞品覆盖了 ${joinCommaList(missing)} 等场景，而目标 ASIN 当前承接不足，建议尽快补到标题/五点/属性字段。`;
  }

  if (targetScenes.length === 0 && competitorScenes.length === 0) {
    return "两边都没有形成清晰的场景表达，属于可以直接拉开差距的机会位。";
  }

  return "目标 ASIN 已经有一定场景表达，但仍需把高转化场景放在更靠前的位置。";
}

function buildTitleStrengths(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const title = side === "target" ? context.targetListing?.title ?? "" : context.competitorListing?.title ?? "";
  const rows = context.keywordRows.slice(0, 8);
  const exactHits = rows.filter((item) =>
    getCoverageFlag(title, item.keyword) === "✅"
  ).length;
  const lines = [];

  if (exactHits > 0) {
    lines.push(`✅标题已直接承接 ${exactHits} 个高流量词`);
  }
  if (title.length >= 90 && title.length <= 180) {
    lines.push("✅标题长度仍有搜索承接空间");
  }
  if (countSceneHints(title) > 0) {
    lines.push(`✅已包含 ${countSceneHints(title)} 个场景/季节提示词`);
  }

  return joinLines(lines.length > 0 ? lines : ["✅基础标题已存在，可继续前置更高意图词"]);
}

function buildTitleRisks(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const title = side === "target" ? context.targetListing?.title ?? "" : context.competitorListing?.title ?? "";
  const missing = context.keywordRows
    .filter((item) => getCoverageFlag(title, item.keyword) === "❌")
    .slice(0, 4)
    .map((item) => item.keyword);
  const lines = [];

  if (missing.length > 0) {
    lines.push(`❌标题仍缺 ${joinCommaList(missing)}`);
  }
  if (title.length > 180) {
    lines.push("❌标题偏长，移动端更容易被截断");
  }
  if (title.length < 80) {
    lines.push("❌标题偏短，主词承接空间不足");
  }

  return joinLines(lines.length > 0 ? lines : ["❌当前没看到明显标题硬伤，但仍应检查关键词顺序和重复度"]);
}

function buildBulletStrengths(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const listing = side === "target" ? context.targetListing : context.competitorListing;
  const bullets = listing?.bulletPoints ?? [];
  const covered = context.keywordRows
    .slice(0, 12)
    .filter((item) => getCoverageFlag(bullets.join("\n"), item.keyword) !== "❌").length;
  const lines = [];

  if (bullets.length > 0) {
    lines.push(`✅当前有 ${bullets.length} 条可用五点`);
  }
  if (covered > 0) {
    lines.push(`✅五点已承接 ${covered} 个重点关键词`);
  }
  if (countSceneHints(bullets.join(" ")) > 0) {
    lines.push("✅五点里已经出现明确场景词");
  }

  return joinLines(lines.length > 0 ? lines : ["✅当前五点基础可用，但需要更清晰的结构分工"]);
}

function buildBulletRisks(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const listing = side === "target" ? context.targetListing : context.competitorListing;
  const bullets = listing?.bulletPoints ?? [];
  const text = bullets.join("\n");
  const lines = [];

  if (bullets.length < 5) {
    lines.push("❌五点数量不足，承接空间偏窄");
  }
  if (getDuplicateTokenRatio(text) > 0.35) {
    lines.push("❌五点重复词偏多，可读性和信息密度都在下降");
  }
  if (countSceneHints(text) === 0) {
    lines.push("❌场景词不足，用户很难快速判断使用情境");
  }

  return joinLines(lines.length > 0 ? lines : ["❌五点没有明显硬伤，但仍应把结果、证明和补充信息分层"]);
}

function buildAssetStrengths(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const listing = side === "target" ? context.targetListing : context.competitorListing;
  const lines = [];

  if (getBooleanAttribute(listing, "hasAPlus")) {
    lines.push("✅已有 A+ / EBC 基础");
  }
  if (getBooleanAttribute(listing, "hasVideo")) {
    lines.push("✅已有视频承接位");
  }
  if (listing?.mainImage?.trim()) {
    lines.push("✅主图字段已返回，可继续做素材协同");
  }

  return joinLines(lines.length > 0 ? lines : ["✅当前资产位不算丰富，但仍可继续补强"]);
}

function buildAssetRisks(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const listing = side === "target" ? context.targetListing : context.competitorListing;
  const lines = [];

  if (!getBooleanAttribute(listing, "hasAPlus")) {
    lines.push("❌缺少 A+ / EBC，转化承接深度不足");
  }
  if (!getBooleanAttribute(listing, "hasVideo")) {
    lines.push("❌缺少视频位，无法用动态素材补强转化");
  }
  lines.push("❌即便有素材位，也要检查是否真正承接了长尾词和场景词");

  return joinLines(lines);
}

function buildNodeStrengths(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const listing = side === "target" ? context.targetListing : context.competitorListing;
  const node = getNodeSummary(listing);
  return joinLines(
    node !== "未获取"
      ? [`✅当前已识别类目/节点：${node}`]
      : ["✅节点信息暂未返回，建议补查后台路径"]
  );
}

function buildNodeRisks(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const listing = side === "target" ? context.targetListing : context.competitorListing;
  const node = getNodeSummary(listing);
  const lines = [];

  if (node === "未获取") {
    lines.push("❌类目/节点字段未回传，无法确认入口是否精准");
  }
  lines.push("❌需确认类目节点、属性字段和前台文案是否讲同一场景");

  return joinLines(lines);
}

function buildKeywordStrengths(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const rows = side === "target"
    ? context.keywordRows.filter((item) => item.targetTitleFlag !== "❌" || item.targetBulletFlag !== "❌")
    : context.keywordRows.filter((item) => item.competitorTitleFlag !== "❌" || item.competitorBulletFlag !== "❌");
  const exactTitleHits = side === "target"
    ? context.keywordRows.filter((item) => item.targetTitleFlag === "✅").length
    : context.keywordRows.filter((item) => item.competitorTitleFlag === "✅").length;

  return joinLines([
    `✅当前至少承接 ${rows.length} 个重点词`,
    `✅标题中已有 ${exactTitleHits} 个直接命中词`,
  ]);
}

function buildKeywordRisks(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const missing = context.keywordRows
    .filter((item) =>
      side === "target"
        ? item.targetTitleFlag === "❌" && item.targetBulletFlag === "❌"
        : item.competitorTitleFlag === "❌" && item.competitorBulletFlag === "❌"
    )
    .slice(0, 4)
    .map((item) => item.keyword);

  return joinLines(
    missing.length > 0
      ? [`❌仍缺 ${joinCommaList(missing)}`, "❌高流量词没进主文案时，自然位恢复会更慢"]
      : ["❌关键词基础不差，但仍要优化字段顺序和场景分配"]
  );
}

function buildAdStrengths(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const sponsoredHits = context.keywordRows.filter((item) =>
    side === "target"
      ? (item.targetSponsoredRank ?? 0) > 0
      : (item.competitorSponsoredRank ?? 0) > 0
  ).length;

  return joinLines(
    sponsoredHits > 0
      ? [`✅当前至少有 ${sponsoredHits} 个重点词存在广告位信号`]
      : ["✅当前广告位信号有限，后续更适合从精准验证开始"]
  );
}

function buildAdRisks(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const sponsoredOnly = context.keywordRows.filter((item) =>
    side === "target"
      ? item.targetOrganicRank <= 0 && (item.targetSponsoredRank ?? 0) > 0
      : item.competitorOrganicRank <= 0 && (item.competitorSponsoredRank ?? 0) > 0
  ).length;

  return joinLines(
    sponsoredOnly > 0
      ? [
          `❌有 ${sponsoredOnly} 个词更像“广告硬托住”，自然位并没同步起来`,
          "❌这类词必须回头修主文案，不然广告一停就掉。",
        ]
      : ["❌广告位不是主要问题，但仍要用广告验证文案改动是否有效"]
  );
}

function buildSceneStrengths(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const listing = side === "target" ? context.targetListing : context.competitorListing;
  const scenes = collectSceneKeywords([listing?.title ?? "", ...(listing?.bulletPoints ?? [])]);

  return joinLines(
    scenes.length > 0
      ? [`✅已覆盖 ${joinCommaList(scenes.slice(0, 6))}`]
      : ["✅当前未识别到明显场景词，后续可直接补成机会位"]
  );
}

function buildSceneRisks(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const listing = side === "target" ? context.targetListing : context.competitorListing;
  const text = `${listing?.title ?? ""}\n${(listing?.bulletPoints ?? []).join("\n")}`;

  return joinLines(
    countSceneHints(text) === 0
      ? ["❌场景覆盖弱，高意图人群很难快速判断是否匹配", "❌建议补婚礼/通勤/旅行/户外等真实使用场景"]
      : ["❌虽然已有场景词，但仍应确认是不是高转化场景，而不是泛泛堆词"]
  );
}

function buildValueStrengths(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const listing = side === "target" ? context.targetListing : context.competitorListing;
  const lines = [];

  if ((listing?.rating ?? 0) >= 4.3) {
    lines.push("✅评分基础可用");
  }
  if ((listing?.reviews ?? 0) > 100) {
    lines.push("✅评论量具备一定说服力");
  }
  if ((listing?.price ?? 0) > 0) {
    lines.push(`✅当前价格可见：${formatCurrency(listing?.price ?? 0)}`);
  }

  return joinLines(lines.length > 0 ? lines : ["✅当前价值信号有限，需要更多材质和效果证明"]);
}

function buildValueRisks(
  context: WorkbookContext,
  side: "target" | "competitor"
): string {
  const listing = side === "target" ? context.targetListing : context.competitorListing;
  const reviews = listing?.reviews ?? 0;
  const rating = listing?.rating ?? 0;

  if (reviews < 50 || rating < 4.2) {
    return joinLines([
      "❌口碑底盘偏弱时，必须把证明前置到标题以下的关键位置",
      "❌不能只讲卖点，不回应用户顾虑。",
    ]);
  }

  return joinLines([
    "❌即便口碑不差，也要确认文案有没有把价值理由讲清楚",
    "❌价格带与卖点不匹配时，点击和转化依旧会被压制。",
  ]);
}

function buildTitleLogic(context: WorkbookContext): string {
  const keywords = joinCommaList(context.highIntentKeywords.slice(0, 5));
  const styles = joinCommaList(context.styleKeywords.slice(0, 3));

  return `先放品牌与主类目词，再前置 ${keywords || "高流量主词"}，随后补 ${styles || "核心属性词"} 与高转化场景词，避免把补充信息挤进前 80 字符。`;
}

function buildCosmoNarrative(context: WorkbookContext): string {
  const frontLoaded = trimToWordBoundary(context.suggestedTitle, 80);
  return `建议让标题前 80 字符优先覆盖：${frontLoaded}。核心原则是先讲类目 + 主需求，再讲关键属性和场景。`;
}

function buildAdPlanLine(label: string, keywords: string[], objective: string): string {
  const joined = joinCommaList(keywords) || "按当前诊断结果补核心词";
  return `【${label}】${joined}\n目标：${objective}\n验证：7 天看 CTR，14 天看自然位与 CVR。`;
}

function buildAsinTargetingLine(context: WorkbookContext): string {
  const asins = uniquePhrases(
    [
      context.result.request.targetAsin,
      context.competitorSnapshot?.asin,
      ...context.result.competitors
        .map((item) => item.asin)
        .filter((item) => item !== context.competitorSnapshot?.asin),
    ].filter(Boolean) as string[]
  );

  return `【SP Product Targeting】${joinCommaList(asins)}\n目标：抢竞品流量入口，并验证当前卖点对比是否足够清晰。`;
}

function mapFindingToChinese(finding: ListingDiagnosticsFinding | null): {
  shortLabel: string;
  changeFocus: string;
  expectedImpact: string;
} {
  if (!finding) {
    return {
      shortLabel: "内容结构问题",
      changeFocus: "搜索相关性、价值证明和场景覆盖",
      expectedImpact: "优先修正结构问题，通常能同时改善点击和转化。",
    };
  }

  switch (finding.rootCauseCategory) {
    case "pricing":
      return {
        shortLabel: "价格与价值表达",
        changeFocus: "价格、优惠与价值证明",
        expectedImpact: "先把价格带与价值表达对齐，通常更有助于恢复点击后转化。",
      };
    case "buy-box":
      return {
        shortLabel: "Buy Box / 供给稳定性",
        changeFocus: "Buy Box、履约和可售性说明",
        expectedImpact: "先解除交易层阻力，再放大内容优化收益。",
      };
    case "missing-attributes":
      return {
        shortLabel: "后台属性缺口",
        changeFocus: "后台属性、类目节点和场景字段",
        expectedImpact: "补属性后，系统更容易理解产品，索引和类目相关性会更稳定。",
      };
    case "variation-issues":
      return {
        shortLabel: "变体结构",
        changeFocus: "父子体结构和子体治理",
        expectedImpact: "减少流量和评论被稀释，内容改动更容易真正起效。",
      };
    case "restrictions":
      return {
        shortLabel: "平台限制",
        changeFocus: "Amazon 已验证限制项",
        expectedImpact: "先排除平台硬阻塞，再推进内容和广告动作。",
      };
    case "inventory":
      return {
        shortLabel: "库存与供给",
        changeFocus: "库存稳定性和可售性",
        expectedImpact: "避免内容和广告起量后被库存问题卡住。",
      };
    case "offer":
      return {
        shortLabel: "Offer 层表达",
        changeFocus: "核心卖点和上层转化表达",
        expectedImpact: "把卖点说透后，点击后的成交效率通常会更高。",
      };
    case "listing-status":
      return {
        shortLabel: "Listing 健康度",
        changeFocus: "可售性、节点、属性和页面完整度",
        expectedImpact: "先把 listing 基础健康度修稳，再谈扩词和放量。",
      };
    default:
      return {
        shortLabel: "搜索与转化结构",
        changeFocus: "关键词、卖点和场景承接",
        expectedImpact: "优先修正结构问题，通常能同时改善点击和转化。",
      };
  }
}

function updateWorksheetXml(
  xml: string,
  cellMap: Record<string, string>
): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(xml, "application/xml");

  for (const [reference, value] of Object.entries(cellMap)) {
    const cell = ensureCell(document, reference);
    writeInlineString(document, cell, value);
  }

  return new XMLSerializer().serializeToString(document);
}

function ensureCell(document: XMLDocument, reference: string): Element {
  const sheetData = document.getElementsByTagName("sheetData")[0];
  const namespace = document.documentElement.namespaceURI;
  const { rowNumber, columnLabel } = parseCellReference(reference);
  const rows = Array.from(sheetData.getElementsByTagName("row"));
  let row = rows.find((item) => Number(item.getAttribute("r")) === rowNumber);

  if (!row) {
    row = document.createElementNS(namespace, "row");
    row.setAttribute("r", String(rowNumber));
    const nextRow = rows.find((item) => Number(item.getAttribute("r")) > rowNumber);
    if (nextRow) {
      sheetData.insertBefore(row, nextRow);
    } else {
      sheetData.appendChild(row);
    }
  }

  const cells = Array.from(row.getElementsByTagName("c"));
  let cell = cells.find((item) => item.getAttribute("r") === reference);

  if (!cell) {
    cell = document.createElementNS(namespace, "c");
    cell.setAttribute("r", reference);
    const styleSource = cells[0];
    if (styleSource?.getAttribute("s")) {
      cell.setAttribute("s", styleSource.getAttribute("s") ?? "");
    }
    const nextCell = cells.find(
      (item) => columnLabelToIndex(getColumnLabel(item.getAttribute("r") ?? "")) > columnLabelToIndex(columnLabel)
    );
    if (nextCell) {
      row.insertBefore(cell, nextCell);
    } else {
      row.appendChild(cell);
    }
  }

  return cell;
}

function writeInlineString(
  document: XMLDocument,
  cell: Element,
  value: string
) {
  const namespace = document.documentElement.namespaceURI;
  while (cell.firstChild) {
    cell.removeChild(cell.firstChild);
  }

  cell.setAttribute("t", "inlineStr");
  const inlineString = document.createElementNS(namespace, "is");
  const text = document.createElementNS(namespace, "t");
  text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
  text.textContent = value;
  inlineString.appendChild(text);
  cell.appendChild(inlineString);
}

function parseCellReference(reference: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(reference);
  if (!match) {
    throw new Error(`非法单元格坐标：${reference}`);
  }

  return {
    columnLabel: match[1],
    rowNumber: Number(match[2]),
  };
}

function getColumnLabel(reference: string) {
  return reference.replace(/\d+/g, "");
}

function columnLabelToIndex(label: string): number {
  return label.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function pickPrimaryCompetitor(
  competitors: ListingDiagnosticsEntitySnapshot[]
): ListingDiagnosticsEntitySnapshot | null {
  return (
    [...competitors]
      .filter((item) => item.listing !== null)
      .sort((left, right) => {
        const leftScore =
          left.keywords.length * 1000 +
          (left.listing?.reviews ?? 0) +
          (left.listing?.rating ?? 0) * 100;
        const rightScore =
          right.keywords.length * 1000 +
          (right.listing?.reviews ?? 0) +
          (right.listing?.rating ?? 0) * 100;
        return rightScore - leftScore;
      })[0] ?? null
  );
}

function buildEntityLabel(
  prefix: string,
  listing: CompetitorListing | null,
  asin: string
): string {
  const brand = getBrand(listing);
  return brand ? `${brand} ${asin}` : `${prefix} ${asin}`;
}

function buildKeywordCompetitionAnalysis(item: {
  targetOrganicRank: number;
  targetSponsoredRank: number | null;
  competitorOrganicRank: number;
  competitorSponsoredRank: number | null;
}): string {
  const targetOrganic = item.targetOrganicRank > 0;
  const competitorOrganic = item.competitorOrganicRank > 0;
  const targetSponsored = (item.targetSponsoredRank ?? 0) > 0;
  const competitorSponsored = (item.competitorSponsoredRank ?? 0) > 0;

  if (!targetOrganic && competitorOrganic && competitorSponsored) {
    return "竞品自然位和广告位都有承接，目标 ASIN 当前缺口明显。";
  }

  if (!targetOrganic && competitorOrganic) {
    return "竞品已拿到自然位，目标 ASIN 仍未形成自然承接，属于优先补位词。";
  }

  if (targetOrganic && competitorOrganic && item.targetOrganicRank > item.competitorOrganicRank) {
    return "两边都有覆盖，但竞品自然位更前，目标 ASIN 仍有提升空间。";
  }

  if (targetOrganic && !competitorOrganic) {
    return "目标 ASIN 当前已有自然位，可继续稳位并补转化承接。";
  }

  if (targetSponsored && !targetOrganic) {
    return "当前更像广告在硬托，主文案和属性位还没真正把词吃住。";
  }

  return "两边都还没有形成稳定自然位，适合作为测试扩词或结构优化对象。";
}

function getBrand(listing: CompetitorListing | null): string {
  const brand = getAttributeValue(listing, ["brand", "brandName"]);
  if (brand) {
    return brand;
  }

  const title = listing?.title?.trim() ?? "";
  return title.split(/\s+/)[0] ?? "";
}

function getNodeSummary(listing: CompetitorListing | null): string {
  return (
    getAttributeValue(listing, ["subcategoryLabel", "nodeLabelPath", "browseNode"]) ||
    "未获取"
  );
}

function getAttributeSummary(listing: CompetitorListing | null): string {
  return (
    getAttributeValue(listing, [
      "fabricType",
      "material",
      "mainMaterial",
      "style_name",
      "specialFeature",
    ]) || "未获取"
  );
}

function getVariationCount(listing: CompetitorListing | null): number {
  const value = getAttributeValue(listing, ["variationCount"]);
  if (!value) {
    return 0;
  }

  const numeric = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatAvailableDate(listing: CompetitorListing | null): string {
  const value = getAttributeValue(listing, ["availableDate"]);
  if (!value) {
    return "未获取";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("zh-CN");
}

function getBooleanAttribute(listing: CompetitorListing | null, key: string): boolean {
  const value = getAttributeValue(listing, [key]).toUpperCase();
  return value === "Y" || value === "YES" || value === "TRUE";
}

function getAttributeValue(
  listing: CompetitorListing | null,
  keys: string[]
): string {
  if (!listing) {
    return "";
  }

  for (const key of keys) {
    const value = listing.attributes[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function formatCurrency(value: number | null): string {
  if (!value || value <= 0) {
    return "-";
  }

  return `$${value.toFixed(2)}`;
}

function formatRank(value: number | null): string {
  if (!value || value <= 0) {
    return "-";
  }

  return `#${Math.round(value)}`;
}

function formatWhole(value: number | null): string {
  if (!value || value <= 0) {
    return "-";
  }

  return Math.round(value).toLocaleString("en-US");
}

function formatSearchVolume(value: number | null): string {
  if (!value || value <= 0) {
    return "-";
  }

  return Math.round(value).toLocaleString("en-US");
}

function formatRatingSummary(listing: CompetitorListing | null): string {
  if (!listing) {
    return "未获取";
  }

  return `${listing.rating.toFixed(1)} (${formatWhole(listing.reviews)} ratings)`;
}

function formatBooleanZh(value: boolean): string {
  return value ? "有" : "无";
}

function formatFulfillment(listing: CompetitorListing | null): string {
  const value = getAttributeValue(listing, ["fulfillment", "fulfillmentChannel"]);
  if (!value) {
    return "未获取";
  }

  const upper = value.toUpperCase();
  if (upper.includes("FBA")) {
    return "FBA";
  }

  if (upper.includes("FBM")) {
    return "FBM";
  }

  return value;
}

function joinLines(lines: string[]): string {
  return lines.filter(Boolean).join("\n");
}

function joinCommaList(values: string[]): string {
  return values.filter(Boolean).join(", ");
}

function uniquePhrases(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = normalizePhrase(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    next.push(value.trim());
  }

  return next;
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
  return normalizePhrase(value).split(" ").filter(Boolean);
}

function getCoverageFlag(text: string, keyword: string): CoverageMark {
  if (!text.trim()) {
    return "❌";
  }

  const normalizedText = normalizePhrase(text);
  const normalizedKeyword = normalizePhrase(keyword);

  if (!normalizedKeyword) {
    return "❌";
  }

  if (normalizedText.includes(normalizedKeyword)) {
    return "✅";
  }

  const tokens = tokenize(keyword).filter((item) => item.length >= 3);
  if (tokens.length === 0) {
    return "❌";
  }

  const hitCount = tokens.filter((token) => normalizedText.includes(token)).length;
  if (hitCount >= Math.ceil(tokens.length * 0.6)) {
    return "✅弱";
  }

  return "❌";
}

function countKeywordHits(text: string, rows: Array<{ keyword: string }>): number {
  return rows.filter((item) => getCoverageFlag(text, item.keyword) !== "❌").length;
}

function collectSceneKeywords(values: string[]): string[] {
  const text = normalizePhrase(values.join(" "));
  return SCENE_HINTS.filter((item) => text.includes(item));
}

function collectStyleKeywords(values: string[]): string[] {
  const text = normalizePhrase(values.join(" "));
  const styleMatches = STYLE_HINTS.filter((item) => text.includes(item));
  const tokens = tokenize(values.join(" "))
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
    .slice(0, 20);

  return uniquePhrases([...styleMatches, ...tokens]).slice(0, 12);
}

function collectSubjectKeywords(values: string[]): string[] {
  const text = normalizePhrase(values.join(" "));
  const keywords: string[] = [];

  if (text.includes("women") || text.includes("womens") || text.includes("ladies")) {
    keywords.push("women", "womens", "ladies");
  }
  if (text.includes("men") || text.includes("mens")) {
    keywords.push("men", "mens");
  }
  if (text.includes("kids") || text.includes("girls") || text.includes("boys")) {
    keywords.push("kids", "girls", "boys");
  }

  return uniquePhrases(keywords.length > 0 ? keywords : ["shoppers"]);
}

function countSceneHints(value: string): number {
  const normalized = normalizePhrase(value);
  return SCENE_HINTS.filter((item) => normalized.includes(item)).length;
}

function getDuplicateTokenRatio(value: string): number {
  const tokens = tokenize(value).filter(
    (item) => item.length >= 3 && !STOP_WORDS.has(item)
  );
  if (tokens.length === 0) {
    return 0;
  }

  return 1 - new Set(tokens).size / tokens.length;
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) {
    return [];
  }

  const nextOffset = offset % items.length;
  return items.slice(nextOffset).concat(items.slice(0, nextOffset));
}

function trimToWordBoundary(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  const next = value.slice(0, limit);
  const lastSpace = next.lastIndexOf(" ");
  return (lastSpace > 40 ? next.slice(0, lastSpace) : next).trim();
}

function toTitleCase(value: string): string {
  return value.replace(/\b([a-z])/g, (match) => match.toUpperCase());
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

function pickLargerNumber(
  current: number | null,
  next: number | null
): number | null {
  if (current === null || current === undefined) {
    return next ?? null;
  }
  if (next === null || next === undefined) {
    return current;
  }

  return Math.max(current, next);
}

function getDaysSince(value: string): number {
  if (!value.trim()) {
    return 0;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  return Math.max(0, Math.round((Date.now() - timestamp) / 86_400_000));
}

function fillToLength<T>(items: T[], length: number): Array<T | null> {
  const next: Array<T | null> = [...items.slice(0, length)];
  while (next.length < length) {
    next.push(null);
  }

  return next;
}

function sanitizeSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "")
      .slice(0, 40) || "export"
  );
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}
