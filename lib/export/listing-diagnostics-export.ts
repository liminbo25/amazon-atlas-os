import type {
  ListingDiagnosticsActionPlanItem,
  ListingDiagnosticsBenchmark,
  ListingDiagnosticsFinding,
  ListingDiagnosticsResult,
  ListingDiagnosticsSourceCoverageItem,
} from "@/lib/listing-diagnostics/types";
import {
  buildListingDiagnosticsEvidenceRows,
  formatEvidenceVerificationLabel,
  groupActionPlanByPriority,
  sortActionPlanByPriority,
  type ListingDiagnosticsActionPlanSection,
  type ListingDiagnosticsEvidenceRow,
} from "@/lib/listing-diagnostics/reporting";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const JSON_MIME = "application/json;charset=utf-8";
const EXPORT_SCHEMA_VERSION = "listing-diagnostics.report.v4";

type DocxModule = typeof import("docx");
type XlsxModule = typeof import("xlsx");
type SheetRow = Record<string, string | number>;

export interface ListingDiagnosticsExportPayload {
  schemaVersion: string;
  exportedAt: string;
  exportedAtLocal: string;
  generatedAt: string;
  generatedAtLocal: string;
  request: ListingDiagnosticsResult["request"];
  status: ListingDiagnosticsResult["status"];
  headline: string;
  summary: string;
  overallScore: number;
  confidence: number;
  scoreBreakdown: ListingDiagnosticsResult["dimensions"];
  rootCauseSummary: ListingDiagnosticsResult["rootCauseSummary"];
  impactSummary: ListingDiagnosticsResult["impactSummary"];
  sourceCoverage: ListingDiagnosticsSourceCoverageItem[];
  findings: ListingDiagnosticsFinding[];
  actionPlan: ListingDiagnosticsActionPlanItem[];
  actionPlanByPriority: ListingDiagnosticsActionPlanSection[];
  benchmarkSummary: ListingDiagnosticsBenchmark;
  evidenceTable: ListingDiagnosticsEvidenceRow[];
  warnings: string[];
  spApiVerification: ListingDiagnosticsResult["spApiVerification"];
  operatorReport: ListingDiagnosticsResult["operatorReport"];
}

export function buildListingDiagnosticsExportPayload(
  result: ListingDiagnosticsResult
): ListingDiagnosticsExportPayload {
  const exportedAt = new Date();
  const actionPlan = sortActionPlanByPriority(result.actionPlan);

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    exportedAtLocal: exportedAt.toLocaleString("zh-CN"),
    generatedAt: result.generatedAt,
    generatedAtLocal: new Date(result.generatedAt).toLocaleString("zh-CN"),
    request: result.request,
    status: result.status,
    headline: result.headline,
    summary: result.summary,
    overallScore: result.overallScore,
    confidence: result.confidence,
    scoreBreakdown: result.dimensions,
    rootCauseSummary: result.rootCauseSummary,
    impactSummary: result.impactSummary,
    sourceCoverage: result.sourceCoverage,
    findings: result.findings,
    actionPlan,
    actionPlanByPriority: groupActionPlanByPriority(actionPlan),
    benchmarkSummary: result.benchmark,
    evidenceTable: buildListingDiagnosticsEvidenceRows(result),
    warnings: result.warnings,
    spApiVerification: result.spApiVerification,
    operatorReport: result.operatorReport,
  };
}

export async function exportListingDiagnosticsReportDocx(
  result: ListingDiagnosticsResult
): Promise<string> {
  const payload = buildListingDiagnosticsExportPayload(result);
  const fileName = buildFileName(
    "listing-diagnostics-report",
    result.request.marketplace,
    result.request.targetAsin,
    "docx"
  );
  const docx = await import("docx");
  const { Document, HeadingLevel, Packer, Paragraph } = docx;

  const issues = payload.operatorReport.issues.slice(0, 6);
  const roadmap = payload.operatorReport.roadmap.slice(0, 6);
  const bullets = payload.operatorReport.optimizationPlan.bullets;

  const children = [
    new Paragraph({
      text: "Listing 运营诊断报告",
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph(`目标 ASIN：${payload.request.targetAsin}`),
    new Paragraph(`站点：${payload.request.marketplace}`),
    new Paragraph(`生成时间：${payload.generatedAtLocal}`),
    new Paragraph(`导出时间：${payload.exportedAtLocal}`),
    new Paragraph(""),
    new Paragraph({
      text: "诊断摘要",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph(payload.operatorReport.headline),
    new Paragraph(payload.operatorReport.summary),
    new Paragraph(`主诊断：${payload.operatorReport.leadingDiagnosis}`),
    new Paragraph(`数据质量：${payload.operatorReport.dataQuality}`),
    new Paragraph(""),
    new Paragraph({
      text: "关键结论",
      heading: HeadingLevel.HEADING_1,
    }),
    ...payload.operatorReport.keyTakeaways.map(
      (item) =>
        new Paragraph({
          text: item,
          bullet: { level: 0 },
        })
    ),
    new Paragraph(""),
    new Paragraph({
      text: "问题清单",
      heading: HeadingLevel.HEADING_1,
    }),
    ...issues.flatMap((issue) => [
      new Paragraph({
        text: `${issue.priority}｜${issue.title}`,
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph(`维度：${issue.dimension}`),
      new Paragraph(`状态：${issue.issueStatus} / ${issue.evidenceLevel}`),
      new Paragraph(`当前表现：${issue.symptom}`),
      new Paragraph(`根因诊断：${issue.rootCause}`),
      new Paragraph(`建议动作：${issue.recommendation}`),
      new Paragraph(`修改位置：${issue.whereToChange}`),
      new Paragraph(`验收动作：${issue.verificationAction}`),
    ]),
    new Paragraph(""),
    new Paragraph({
      text: "行动清单",
      heading: HeadingLevel.HEADING_1,
    }),
    ...roadmap.flatMap((row) => [
      new Paragraph({
        text: `${row.priority}｜${row.action}`,
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph(`预期效果：${row.expectedEffect}`),
      new Paragraph(`时间节点：${row.timeline}`),
      new Paragraph(`责任角色：${row.owner}`),
      new Paragraph(`验收方式：${row.verification}`),
    ]),
    new Paragraph(""),
    new Paragraph({
      text: "优化方向",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph(`推荐标题：${payload.operatorReport.optimizationPlan.recommendedTitle}`),
    new Paragraph(`标题逻辑：${payload.operatorReport.optimizationPlan.titleLogic}`),
    new Paragraph(
      `核心关键词：${payload.operatorReport.optimizationPlan.coreKeywords.join(", ")}`
    ),
    ...bullets.flatMap((bullet) => [
      new Paragraph({
        text: `${bullet.label}｜${bullet.focus}`,
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph(bullet.text),
    ]),
  ];

  const document = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(document);
  triggerDownload(fileName, new Blob([blob], { type: DOCX_MIME }));

  return fileName;
}

export async function exportListingDiagnosticsWorkbookXlsx(
  result: ListingDiagnosticsResult
): Promise<string> {
  const fileName = buildFileName(
    "listing-diagnostics-report",
    result.request.marketplace,
    result.request.targetAsin,
    "xlsx"
  );
  const buffer = await buildListingDiagnosticsWorkbookBuffer(result);
  const blobBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;

  triggerDownload(fileName, new Blob([blobBuffer], { type: XLSX_MIME }));

  return fileName;
}

export async function buildListingDiagnosticsWorkbookBuffer(
  result: ListingDiagnosticsResult
): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const workbook = await buildListingDiagnosticsWorkbook(result);
  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  return applyWorkbookStyleTemplate(new Uint8Array(buffer));
}

export async function buildListingDiagnosticsWorkbook(
  result: ListingDiagnosticsResult
) {
  const payload = buildListingDiagnosticsExportPayload(result);
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  appendJsonSheet(
    XLSX,
    workbook,
    "诊断总览",
    buildOverviewRows(payload),
    [18, 20, 24, 72]
  );
  appendJsonSheet(
    XLSX,
    workbook,
    "基础对比",
    buildComparisonRows(payload),
    [18, 40, 40, 60]
  );
  appendJsonSheet(
    XLSX,
    workbook,
    "流量关键词TOP30",
    buildKeywordRows(payload),
    [24, 14, 14, 14, 16, 16, 18, 12, 10, 12, 52]
  );
  appendJsonSheet(
    XLSX,
    workbook,
    "Listing优缺点",
    buildGapRows(payload),
    [18, 42, 42, 42, 42]
  );
  appendAoaSheet(
    XLSX,
    workbook,
    "新Listing优化方案",
    buildOptimizationRows(payload),
    [{ wch: 28 }, { wch: 132 }],
    [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
  );
  appendJsonSheet(
    XLSX,
    workbook,
    "关键词覆盖矩阵",
    buildCoverageRows(payload),
    [28, 14, 12, 12, 12, 12, 12, 12, 12, 12, 12, 48]
  );
  appendJsonSheet(
    XLSX,
    workbook,
    "行动清单",
    buildRoadmapRows(payload),
    [16, 64, 44, 18, 34, 20]
  );
  appendJsonSheet(
    XLSX,
    workbook,
    "问题清单",
    buildIssueRows(payload),
    [16, 16, 16, 16, 14, 14, 28, 28, 28, 28, 28, 32, 32, 28]
  );
  appendJsonSheet(
    XLSX,
    workbook,
    "证据明细",
    buildEvidenceRows(payload),
    [28, 20, 14, 14, 64]
  );
  appendJsonSheet(
    XLSX,
    workbook,
    "原始诊断数据",
    buildRawSummaryRows(payload),
    [24, 120]
  );

  return workbook;
}

export async function exportListingDiagnosticsPayloadJson(
  result: ListingDiagnosticsResult
): Promise<string> {
  const payload = buildListingDiagnosticsExportPayload(result);
  const fileName = buildFileName(
    "listing-diagnostics-payload",
    result.request.marketplace,
    result.request.targetAsin,
    "json"
  );
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: JSON_MIME });

  triggerDownload(fileName, blob);

  return fileName;
}

function buildOverviewRows(payload: ListingDiagnosticsExportPayload): SheetRow[] {
  const report = payload.operatorReport;
  const confirmedIssueCount = report.issues.filter(
    (item) => isConfirmedIssue(item)
  ).length;
  const hypothesisCount = report.issues.length - confirmedIssueCount;

  return [
    {
      模块: "报告标题",
      当前值: report.headline,
      对标值: report.primaryCompetitorLabel,
      结论: report.summary,
    },
    {
      模块: "目标 ASIN",
      当前值: payload.request.targetAsin,
      对标值: payload.request.marketplace,
      结论: report.leadingDiagnosis,
    },
    {
      模块: "综合评分",
      当前值: `${payload.overallScore}/100`,
      对标值: `证据可信度 ${payload.confidence}%`,
      结论: report.dataQuality,
    },
    {
      模块: "问题分层",
      当前值: `已确认问题 ${confirmedIssueCount} 个`,
      对标值: `待验证假设 ${hypothesisCount} 个`,
      结论: report.keyTakeaways.join("；"),
    },
  ];
}

function buildComparisonRows(payload: ListingDiagnosticsExportPayload): SheetRow[] {
  return payload.operatorReport.comparisonRows.map((row) => ({
    指标: row.metric,
    [`目标 ASIN ${payload.request.targetAsin}`]: row.targetValue,
    [`对标 ${payload.operatorReport.primaryCompetitorLabel}`]: row.competitorValue,
    对比分析: row.analysis,
  }));
}

function buildKeywordRows(payload: ListingDiagnosticsExportPayload): SheetRow[] {
  return payload.operatorReport.keywordRows.map((row) => ({
    keyword: row.keyword,
    月搜索量: row.monthlySearchVolume,
    目标自然排名: row.targetOrganicRank,
    目标广告排名: row.targetSponsoredRank,
    竞品池最佳自然位: row.competitorOrganicRank,
    竞品池最佳广告位: row.competitorSponsoredRank,
    抢位竞品ASIN: row.competitorAsin,
    建议竞价$: estimateSuggestedBid(row),
    SPR代理: estimateSprProxy(row),
    "购买率%": row.purchaseShare,
    竞争度分析: row.diagnosis,
  }));
}

function buildGapRows(payload: ListingDiagnosticsExportPayload): SheetRow[] {
  return payload.operatorReport.gapRows.map((row) => ({
    分析维度: row.dimension,
    [`目标 ASIN ${payload.request.targetAsin}`]: joinRowItems([
      "优势：",
      ...row.targetStrengths,
      "不足：",
      ...row.targetWeaknesses,
    ]),
    [`对标 ${payload.operatorReport.primaryCompetitorLabel}`]: joinRowItems([
      "优势：",
      ...row.competitorStrengths,
      "不足：",
      ...row.competitorWeaknesses,
    ]),
    目标优势: joinRowItems(row.targetStrengths),
    目标不足: joinRowItems(row.targetWeaknesses),
  }));
}

function buildOptimizationRows(
  payload: ListingDiagnosticsExportPayload
): Array<Array<string>> {
  const plan = payload.operatorReport.optimizationPlan;
  const keywordRows = payload.operatorReport.keywordRows;
  const titleKeywords = keywordRows.slice(0, 6).map((row) => row.keyword);
  const styleKeywords = keywordRows
    .slice(3, 9)
    .map((row) => row.keyword)
    .filter(Boolean);
  const subjectKeywords = keywordRows
    .slice(0, 12)
    .map((row) => row.keyword)
    .filter(Boolean);
  const rows: Array<Array<string>> = [
    [
      `新 Listing 优化方案 - ${payload.request.targetAsin} vs ${payload.operatorReport.primaryCompetitorLabel}`,
      "",
    ],
    ["报告结论", payload.operatorReport.summary],
    ["一、标题方案", ""],
    ["推荐标题 (Title)", plan.recommendedTitle],
    ["标题逻辑", plan.titleLogic],
    ["嵌入核心词", plan.coreKeywords.join(", ")],
    ["COSMO算法适配", buildCosmoAlignmentNote(payload)],
    ["标题取舍说明", `优先保留 ${titleKeywords.slice(0, 3).join(", ") || "核心词"} 的高权重入口，再让卖点、场景词和规格词按转化顺序展开。`],
    ["二、五点描述", ""],
  ];

  for (const bullet of plan.bullets) {
    rows.push([`${bullet.label} - ${bullet.focus}`, bullet.text]);
  }

  rows.push([
    "五点重排原则",
    "先讲主卖点，再讲使用场景和材质/规格，最后处理顾虑化解与信任证明，避免五条 Bullet 平均用力。",
  ]);
  rows.push(["三、Search Terms", ""]);
  rows.push(["Search Terms 策略", plan.searchTermStrategy]);
  for (const row of plan.searchTerms) {
    rows.push([row.label, row.text]);
  }

  rows.push(["Search Terms 补词原则", "只补标题和 Bullet 没有放进去的长尾词、场景词和同义词，不重复堆已有前台词。"]);
  rows.push(["四、A+ Alt Text", ""]);
  rows.push(["A+ Alt Text 策略", plan.altTextStrategy]);
  for (const row of plan.aPlusAltText) {
    rows.push([row.label, row.text]);
  }

  rows.push(["Alt Text 协同原则", "让图片语义和前台卖点保持同方向，优先承接高价值场景词、差异化卖点和评价证据。"]);
  rows.push(["五、后台属性与类目", ""]);
  rows.push(["occasion_type", plan.occasionType]);
  rows.push(["style_keywords", styleKeywords.join(", ")]);
  rows.push(["subject_keywords", subjectKeywords.join(", ")]);
  rows.push(["属性策略", "先补类目/材质/尺寸/适配类字段，再检查是否有影响搜索过滤与归档的缺失属性。"]);

  for (const item of plan.attributeRecommendations) {
    rows.push(["属性与后台建议", item]);
  }

  rows.push(["六、广告结构 (Ad Structure)", ""]);
  for (const row of buildAdStructureRows(payload)) {
    rows.push([row.label, row.text]);
  }

  rows.push(["七、执行备注", ""]);
  for (const item of plan.executionNotes) {
    rows.push(["执行备注", item]);
  }

  return rows;
}

function buildCoverageRows(payload: ListingDiagnosticsExportPayload): SheetRow[] {
  return payload.operatorReport.coverageRows.map((row) => ({
    keyword: row.keyword,
    月搜索量: row.monthlySearchVolume,
    目标标题: row.targetTitle,
    目标Bullet: row.targetBullets,
    目标ST: row.targetSearchTerms,
    竞品标题: row.competitorTitle,
    竞品Bullet: row.competitorBullets,
    新标题: row.optimizedTitle,
    新Bullet: row.optimizedBullets,
    新ST: row.optimizedSearchTerms,
    新AltText: row.optimizedAltText,
    覆盖结论: row.insight,
  }));
}

function buildRoadmapRows(payload: ListingDiagnosticsExportPayload): SheetRow[] {
  return payload.operatorReport.roadmap.map((row) => ({
    优先级: row.priority,
    行动项: row.action,
    预期效果: row.expectedEffect,
    时间节点: row.timeline,
    验收方式: row.verification,
    责任角色: row.owner,
  }));
}

function isConfirmedIssue(
  issue: ListingDiagnosticsExportPayload["operatorReport"]["issues"][number]
): boolean {
  return (
    issue.issueStatus === "已确认问题" ||
    (issue.evidenceLevel !== "待验证假设" && issue.evidenceLevel.trim() !== "")
  );
}

function estimateSuggestedBid(
  row: ListingDiagnosticsExportPayload["operatorReport"]["keywordRows"][number]
): string {
  const targetRank = parseRankNumber(row.targetOrganicRank);
  const competitorRank = parseRankNumber(row.competitorOrganicRank);
  const purchaseShare = parsePercentValue(row.purchaseShare);
  let bid = 0.45;

  if (row.monthlySearchVolume >= 20000) {
    bid += 0.95;
  } else if (row.monthlySearchVolume >= 10000) {
    bid += 0.7;
  } else if (row.monthlySearchVolume >= 5000) {
    bid += 0.45;
  } else {
    bid += 0.2;
  }

  if (!targetRank) {
    bid += 0.25;
  } else if (targetRank > 30) {
    bid += 0.18;
  }

  if (competitorRank && competitorRank <= 10) {
    bid += 0.22;
  } else if (competitorRank && competitorRank <= 20) {
    bid += 0.12;
  }

  if (purchaseShare >= 8) {
    bid += 0.18;
  } else if (purchaseShare >= 4) {
    bid += 0.08;
  }

  return `$${bid.toFixed(2)}`;
}

function estimateSprProxy(
  row: ListingDiagnosticsExportPayload["operatorReport"]["keywordRows"][number]
): string {
  const targetRank = parseRankNumber(row.targetOrganicRank);
  const competitorRank = parseRankNumber(row.competitorOrganicRank);

  if (!targetRank && competitorRank && competitorRank <= 10) {
    return "12-18";
  }

  if (!targetRank && competitorRank && competitorRank <= 20) {
    return "8-12";
  }

  if (targetRank && competitorRank && targetRank - competitorRank >= 20) {
    return "6-10";
  }

  if (targetRank && targetRank <= 20) {
    return "3-6";
  }

  return "4-8";
}

function parseRankNumber(value: string): number | null {
  const match = value.match(/\d+/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercentValue(value: string): number {
  const match = value.match(/[\d.]+/);
  if (!match) {
    return 0;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCosmoAlignmentNote(payload: ListingDiagnosticsExportPayload): string {
  const topKeywords = payload.operatorReport.keywordRows
    .slice(0, 5)
    .map((row) => row.keyword)
    .join(", ");
  const confirmedIssueCount = payload.operatorReport.issues.filter((issue) =>
    isConfirmedIssue(issue)
  ).length;

  return `把 ${topKeywords || "核心关键词"} 放进同一套“标题入口-五点承接-A+ 佐证-广告验证”链路里，先解决 ${confirmedIssueCount} 个已确认问题，再放大高价值词。`;
}

function buildAdStructureRows(
  payload: ListingDiagnosticsExportPayload
): Array<{ label: string; text: string }> {
  const rows = payload.operatorReport.keywordRows;
  const precisionKeywords = rows
    .filter((row) => row.competitorOrganicRank !== "-" && row.targetOrganicRank === "-")
    .slice(0, 4)
    .map((row) => row.keyword);
  const expansionKeywords = rows
    .filter((row) => row.targetOrganicRank !== "-")
    .slice(0, 4)
    .map((row) => row.keyword);
  const sceneKeywords = rows
    .slice(4, 10)
    .map((row) => row.keyword)
    .filter(Boolean);

  return [
    {
      label: "Phase 1 - SP精准",
      text: `围绕 ${precisionKeywords.join(", ") || "高价值缺口词"} 建精准词计划，优先验证高意图词能否抢到前排点击。`,
    },
    {
      label: "Phase 1 - SP广泛",
      text: `围绕 ${sceneKeywords.slice(0, 4).join(", ") || "场景词"} 建广泛词采词计划，为下一轮 Search Terms 和否词沉淀素材。`,
    },
    {
      label: "Phase 1 - SB品牌",
      text: "品牌广告重点讲品牌主张、主卖点和类目核心用途，别只复制 SP 关键词。",
    },
    {
      label: "Phase 2 - 精准扩词",
      text: `从表现好的精准词和广泛词里扩展到 ${expansionKeywords.join(", ") || "中高价值词"}，按 CTR/CVR 分层提价。`,
    },
    {
      label: "Phase 2 - SBV视频",
      text: "视频脚本优先解释主卖点、使用场景和顾虑化解，让广告内容和详情页承接逻辑一致。",
    },
    {
      label: "Phase 3 - 长尾精准",
      text: "把已验证转化的长尾词拆成独立小预算计划，降低泛流量浪费。",
    },
    {
      label: "ASIN 定向广告",
      text: "优先定向评价弱、卖点弱或价格带接近的竞品详情页，用差异化卖点抢回流量。",
    },
    {
      label: "广告预算建议",
      text: "前 7 天预算集中给精准词和采词计划，预算占比建议 50% 精准 / 25% 广泛 / 15% 品牌 / 10% ASIN 定向。",
    },
    {
      label: "否词策略",
      text: "每天清理低点击高花费词和低转化词，把无关词、低意图词、误触发词及时加入否词列表。",
    },
    {
      label: "复盘指标",
      text: "按 3 天、7 天、14 天三个节奏复盘 CTR、CVR、TACoS、自然位回升和高价值词覆盖，不只看单日花费。",
    },
  ];
}

function buildIssueRows(payload: ListingDiagnosticsExportPayload): SheetRow[] {
  return payload.operatorReport.issues.map((row) => ({
    问题ID: row.id,
    诊断维度: row.dimension,
    优先级: row.priority,
    证据等级: row.evidenceLevel,
    问题状态: row.issueStatus,
    影响面: row.impact,
    问题标题: row.title,
    当前表现: row.symptom,
    根因诊断: row.rootCause,
    建议动作: row.recommendation,
    修改位置: row.whereToChange,
    预期影响: row.expectedImpact,
    证据摘要: row.evidenceSummary,
    验收动作: row.verificationAction,
  }));
}

function buildEvidenceRows(payload: ListingDiagnosticsExportPayload): SheetRow[] {
  return payload.evidenceTable.map((row) => ({
    信号: row.signal,
    来源: localizeEvidenceSource(row.source),
    可信度: `${Math.round(row.confidence * 100)}%`,
    证据等级: formatEvidenceVerificationLabel(row.verification),
    证据内容: row.evidence,
  }));
}

function buildRawSummaryRows(payload: ListingDiagnosticsExportPayload): SheetRow[] {
  return [
    { 字段: "schemaVersion", 值: payload.schemaVersion },
    { 字段: "generatedAt", 值: payload.generatedAt },
    { 字段: "exportedAt", 值: payload.exportedAt },
    { 字段: "marketplace", 值: payload.request.marketplace },
    { 字段: "targetAsin", 值: payload.request.targetAsin },
    { 字段: "status", 值: payload.status },
    { 字段: "overallScore", 值: payload.overallScore },
    { 字段: "confidence", 值: payload.confidence },
    { 字段: "headline", 值: payload.headline },
    { 字段: "summary", 值: payload.summary },
    {
      字段: "warningCount",
      值: payload.warnings.length,
    },
    {
      字段: "findingCount",
      值: payload.findings.length,
    },
    {
      字段: "actionPlanCount",
      值: payload.actionPlan.length,
    },
  ];
}

function appendJsonSheet(
  XLSX: XlsxModule,
  workbook: import("xlsx").WorkBook,
  sheetName: string,
  rows: SheetRow[],
  widths?: number[]
) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  if (widths) {
    sheet["!cols"] = widths.map((wch) => ({ wch }));
  }
  decorateSheet(sheet, { headerRows: [0], freezeRowCount: 1, applyAutoFilter: true });
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
}

function appendAoaSheet(
  XLSX: XlsxModule,
  workbook: import("xlsx").WorkBook,
  sheetName: string,
  rows: Array<Array<string>>,
  columns?: Array<{ wch: number }>,
  merges?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>
) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (columns) {
    sheet["!cols"] = columns;
  }
  if (merges) {
    sheet["!merges"] = merges;
  }
  decorateSheet(sheet, {
    headerRows: [0],
    sectionRows: rows
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => index > 0 && row[1] === "" && Boolean(row[0]))
      .map(({ index }) => index),
    freezeRowCount: 1,
  });
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
}

function joinRowItems(items: string[]) {
  return items.filter(Boolean).join("\n");
}

function decorateSheet(
  sheet: import("xlsx").WorkSheet,
  options: {
    headerRows?: number[];
    sectionRows?: number[];
    freezeRowCount?: number;
    applyAutoFilter?: boolean;
  } = {}
) {
  const ref = sheet["!ref"];
  if (!ref) {
    return;
  }

  const range = decodeSheetRange(ref);
  const headerRows = new Set(options.headerRows ?? []);
  const sectionRows = new Set(options.sectionRows ?? []);

  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const cellRef = encodeCellRef(row, col);
      const cell = sheet[cellRef];
      if (!cell) {
        continue;
      }

      const isHeader = headerRows.has(row);
      const isSection = sectionRows.has(row);
      cell.s = {
        font: {
          bold: isHeader || isSection,
          sz: isHeader ? 12 : isSection ? 11 : 10,
          color: { rgb: isHeader ? "0F172A" : "334155" },
        },
        alignment: {
          vertical: "top",
          wrapText: true,
        },
        fill: isHeader
          ? { fgColor: { rgb: "E2E8F0" } }
          : isSection
            ? { fgColor: { rgb: "F8FAFC" } }
            : undefined,
      };
    }
  }

  if (options.applyAutoFilter) {
    sheet["!autofilter"] = { ref };
  }

  if (options.freezeRowCount) {
    sheet["!freeze"] = { xSplit: 0, ySplit: options.freezeRowCount };
  }
}

function decodeSheetRange(ref: string) {
  const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!match) {
    return { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
  }

  return {
    startCol: decodeColumnIndex(match[1]),
    startRow: Number.parseInt(match[2], 10) - 1,
    endCol: decodeColumnIndex(match[3]),
    endRow: Number.parseInt(match[4], 10) - 1,
  };
}

function decodeColumnIndex(value: string): number {
  let total = 0;

  for (const char of value.toUpperCase()) {
    total = total * 26 + (char.charCodeAt(0) - 64);
  }

  return total - 1;
}

function encodeCellRef(row: number, col: number): string {
  return `${encodeColumnName(col)}${row + 1}`;
}

function encodeColumnName(col: number): string {
  let current = col + 1;
  let output = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    current = Math.floor((current - 1) / 26);
  }

  return output;
}

const WORKBOOK_STYLE_TEMPLATE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="6">
    <font><sz val="11"/><color rgb="FF334155"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><color rgb="FF1E293B"/><name val="Calibri"/></font>
    <font><b/><sz val="12"/><color rgb="FF1E3A8A"/><name val="Calibri"/></font>
    <font><i/><sz val="11"/><color rgb="FF475569"/><name val="Calibri"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="13">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleMedium4"/>
</styleSheet>`;

async function applyWorkbookStyleTemplate(buffer: Uint8Array): Promise<Uint8Array> {
  const JSZipModule = await import("jszip");
  const JSZip = JSZipModule.default;
  const zip = await JSZip.loadAsync(buffer);
  zip.file("xl/styles.xml", WORKBOOK_STYLE_TEMPLATE);

  const generalSheetStyles: Array<{ path: string; accentStyle: number }> = [
    { path: "xl/worksheets/sheet1.xml", accentStyle: 2 },
    { path: "xl/worksheets/sheet2.xml", accentStyle: 4 },
    { path: "xl/worksheets/sheet3.xml", accentStyle: 5 },
    { path: "xl/worksheets/sheet4.xml", accentStyle: 4 },
    { path: "xl/worksheets/sheet6.xml", accentStyle: 2 },
    { path: "xl/worksheets/sheet7.xml", accentStyle: 5 },
    { path: "xl/worksheets/sheet8.xml", accentStyle: 6 },
    { path: "xl/worksheets/sheet9.xml", accentStyle: 2 },
    { path: "xl/worksheets/sheet10.xml", accentStyle: 4 },
  ];

  for (const sheetStyle of generalSheetStyles) {
    const file = zip.file(sheetStyle.path);
    if (!file) {
      continue;
    }

    const xml = await file.async("string");
    zip.file(sheetStyle.path, styleGeneralSheetXml(xml, sheetStyle.accentStyle));
  }

  const optimizationSheet = zip.file("xl/worksheets/sheet5.xml");
  if (optimizationSheet) {
    const xml = await optimizationSheet.async("string");
    zip.file("xl/worksheets/sheet5.xml", styleOptimizationSheetXml(xml));
  }

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function styleGeneralSheetXml(xml: string, accentStyle: number): string {
  return xml.replace(
    /<c r="([A-Z]+)(\d+)"([^>]*)>/g,
    (_match: string, col: string, row: string, attrs: string) => {
      const styleId = row === "1" ? 1 : col === "A" ? accentStyle : 3;
      return `<c r="${col}${row}"${withStyleAttribute(attrs, styleId)}>`;
    }
  );
}

function styleOptimizationSheetXml(xml: string): string {
  return xml.replace(
    /<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g,
    (_match: string, row: string, rowAttrs: string, cells: string) => {
      const columns = Array.from(
        cells.matchAll(/<c r="([A-Z]+)\d+"/g) as IterableIterator<RegExpMatchArray>
      ).map((match) => match[1]);
      const isTitleRow = row === "1";
      const isSectionRow = row !== "1" && columns.length === 1 && columns[0] === "A";
      const styledCells = cells.replace(
        /<c r="([A-Z]+)(\d+)"([^>]*)>/g,
        (_cellMatch: string, col: string, rowNum: string, attrs: string) => {
          let styleId = 3;

          if (isTitleRow) {
            styleId = 9;
          } else if (isSectionRow) {
            styleId = 10;
          } else if (col === "A") {
            styleId = 12;
          } else if (col === "B" && rowNum === "2") {
            styleId = 7;
          } else {
            styleId = 3;
          }

          return `<c r="${col}${rowNum}"${withStyleAttribute(attrs, styleId)}>`;
        }
      );

      return `<row r="${row}"${rowAttrs}>${styledCells}</row>`;
    }
  );
}

function withStyleAttribute(attrs: string, styleId: number): string {
  const cleaned = attrs.replace(/\s+s="\d+"/, "");
  return ` s="${styleId}"${cleaned}`;
}

function buildFileName(
  baseName: string,
  market: string,
  asin: string,
  extension: string
) {
  const marketSegment = sanitizeFileSegment(market || "global");
  const asinSegment = sanitizeFileSegment(asin || "asin");
  const dateSegment = formatFileDate();

  return `${baseName}-${marketSegment}-${asinSegment}-${dateSegment}.${extension}`;
}

function triggerDownload(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function sanitizeFileSegment(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "export"
  );
}

function formatFileDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function localizeEvidenceSource(source: string): string {
  if (source === "SellerSprite MCP") {
    return "SellerSprite";
  }

  if (source === "Amazon SP-API") {
    return "Amazon SP-API";
  }

  if (source === "Derived benchmark") {
    return "竞品基准推断";
  }

  return source;
}
