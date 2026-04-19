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
import {
  formatDimensionLabel,
  formatImpactType,
  formatRootCauseCategory,
} from "@/lib/listing-diagnostics/rules/shared";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const JSON_MIME = "application/json;charset=utf-8";
const EXPORT_SCHEMA_VERSION = "listing-diagnostics.report.v3";

type DocxModule = typeof import("docx");
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
}

export function buildListingDiagnosticsExportPayload(
  result: ListingDiagnosticsResult
): ListingDiagnosticsExportPayload {
  const exportedAt = new Date();
  const actionPlan = sortActionPlanByPriority(result.actionPlan);

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    exportedAtLocal: exportedAt.toLocaleString("en-US"),
    generatedAt: result.generatedAt,
    generatedAtLocal: new Date(result.generatedAt).toLocaleString("en-US"),
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
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = docx;

  const children = [
    new Paragraph({
      text: "Listing Diagnostics Report",
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Target ASIN: ", bold: true }),
        new TextRun(payload.request.targetAsin),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Marketplace: ", bold: true }),
        new TextRun(payload.request.marketplace),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Generated At: ", bold: true }),
        new TextRun(payload.generatedAtLocal),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Exported At: ", bold: true }),
        new TextRun(payload.exportedAtLocal),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Executive Summary",
      heading: HeadingLevel.HEADING_1,
    }),
    createLabelParagraph(docx, "Status", payload.status),
    createLabelParagraph(docx, "Overall score", `${payload.overallScore}/100`),
    createLabelParagraph(docx, "Confidence", `${payload.confidence}%`),
    createLabelParagraph(docx, "Headline", payload.headline),
    createLabelParagraph(docx, "Summary", payload.summary),
    ...(payload.spApiVerification
      ? [
          createLabelParagraph(
            docx,
            "SP-API verification",
            `${payload.spApiVerification.mode}; catalog ${payload.spApiVerification.catalogStatus}; account ${payload.spApiVerification.accountStatus}`
          ),
        ]
      : []),
    ...(payload.warnings.length > 0
      ? [
          new Paragraph({
            text: "Warnings",
            heading: HeadingLevel.HEADING_2,
          }),
          ...createBulletParagraphs(docx, payload.warnings),
        ]
      : []),
    new Paragraph({
      text: "Operator Queue",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildOperatorQueueParagraphs(docx, payload),
    new Paragraph({
      text: "Score Breakdown",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildScoreBreakdownParagraphs(docx, payload),
    new Paragraph({
      text: "Source Coverage",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildSourceCoverageParagraphs(docx, payload),
    new Paragraph({
      text: "Findings",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildFindingParagraphs(docx, payload),
    new Paragraph({
      text: "Action Plan",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildActionPlanParagraphs(docx, payload),
    new Paragraph({
      text: "Benchmark Summary",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildBenchmarkParagraphs(docx, payload),
    new Paragraph({
      text: "Evidence Appendix",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildEvidenceParagraphs(docx, payload),
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
  const payload = buildListingDiagnosticsExportPayload(result);
  const fileName = buildFileName(
    "listing-diagnostics-data",
    result.request.marketplace,
    result.request.targetAsin,
    "xlsx"
  );
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildSummaryRows(payload)),
    "Summary"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildScoreBreakdownRows(payload)),
    "ScoreBreakdown"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildRootCauseSummaryRows(payload)),
    "RootCauseQueue"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildImpactSummaryRows(payload)),
    "ImpactQueue"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildSourceCoverageRows(payload)),
    "SourceCoverage"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildFindingsRows(payload)),
    "Findings"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildActionPlanRows(payload)),
    "ActionPlan"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildBenchmarkSummaryRows(payload)),
    "Benchmark"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildBenchmarkKeywordRows(payload)),
    "BenchmarkKeywords"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildBenchmarkThemeRows(payload)),
    "BenchmarkThemes"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildEvidenceRows(payload)),
    "Evidence"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildWarningRows(payload)),
    "Warnings"
  );

  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  triggerDownload(fileName, new Blob([buffer], { type: XLSX_MIME }));

  return fileName;
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

function buildScoreBreakdownParagraphs(
  docx: DocxModule,
  payload: ListingDiagnosticsExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;

  if (payload.scoreBreakdown.length === 0) {
    return [new Paragraph("No score breakdown is available.")];
  }

  return payload.scoreBreakdown.flatMap((dimension) => [
    new Paragraph({
      text: `${dimension.label} (${dimension.score}/100)`,
      heading: HeadingLevel.HEADING_2,
    }),
    createLabelParagraph(docx, "Summary", dimension.summary),
    createLabelParagraph(
      docx,
      "Weight / Confidence",
      `${Math.round(dimension.weight * 100)}% / ${Math.round(dimension.confidence * 100)}%`
    ),
    createLabelParagraph(
      docx,
      "Coverage / Inferred",
      `${dimension.coverage} / ${dimension.inferred ? "yes" : "no"}`
    ),
  ]);
}

function buildOperatorQueueParagraphs(
  docx: DocxModule,
  payload: ListingDiagnosticsExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;
  const rootCauseParagraphs =
    payload.rootCauseSummary.length > 0
      ? payload.rootCauseSummary.flatMap((item) => [
          new Paragraph({
            text: `${item.label} (${item.findingCount})`,
            heading: HeadingLevel.HEADING_2,
          }),
          createLabelParagraph(
            docx,
            "Priority / Impact",
            `${item.topPriority} / ${formatImpactType(item.primaryImpactType)}`
          ),
          createLabelParagraph(
            docx,
            "Verified / Inferred",
            `${item.verifiedCount} / ${item.inferredCount}`
          ),
          createLabelParagraph(docx, "Lead issue", item.leadFindingTitle),
          createLabelParagraph(docx, "Lead verification", item.leadVerification),
          createLabelParagraph(docx, "Symptom", item.symptom),
          createLabelParagraph(docx, "Root cause", item.rootCause),
          createLabelParagraph(docx, "Next move", item.nextMove),
          createLabelParagraph(
            docx,
            "Recommended surface",
            item.recommendedSurface
          ),
          createLabelParagraph(docx, "Expected impact", item.expectedImpact),
        ])
      : [new Paragraph("No root-cause queue is available.")];
  const impactParagraphs =
    payload.impactSummary.length > 0
      ? payload.impactSummary.flatMap((item) => [
          new Paragraph({
            text: item.label,
            heading: HeadingLevel.HEADING_2,
          }),
          createLabelParagraph(
            docx,
            "Priority / Findings",
            `${item.topPriority} / ${item.findingCount}`
          ),
          createLabelParagraph(
            docx,
            "Verified / Inferred",
            `${item.verifiedCount} / ${item.inferredCount}`
          ),
          createLabelParagraph(docx, "Lead issue", item.leadFindingTitle),
          createLabelParagraph(docx, "Lead verification", item.leadVerification),
          createLabelParagraph(docx, "Headline", item.headline),
          createLabelParagraph(docx, "Next move", item.nextMove),
          createLabelParagraph(
            docx,
            "Recommended surface",
            item.recommendedSurface
          ),
          createLabelParagraph(docx, "Expected impact", item.expectedImpact),
        ])
      : [new Paragraph("No impact queue is available.")];

  return [
    new Paragraph({
      text: "Root-cause queue",
      heading: HeadingLevel.HEADING_2,
    }),
    ...rootCauseParagraphs,
    new Paragraph({
      text: "Business impact queue",
      heading: HeadingLevel.HEADING_2,
    }),
    ...impactParagraphs,
  ];
}

function buildSourceCoverageParagraphs(
  docx: DocxModule,
  payload: ListingDiagnosticsExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;

  if (payload.sourceCoverage.length === 0) {
    return [new Paragraph("No source coverage rows are available.")];
  }

  return payload.sourceCoverage.flatMap((item) => [
    new Paragraph({
      text: item.label,
      heading: HeadingLevel.HEADING_2,
    }),
    createLabelParagraph(docx, "Source", item.source),
    createLabelParagraph(
      docx,
      "Status / Available",
      `${item.status} | ${item.available} of ${item.expected}`
    ),
    createLabelParagraph(
      docx,
      "Confidence / Inferred",
      `${Math.round(item.confidence * 100)}% / ${item.inferred ? "yes" : "no"}`
    ),
    createLabelParagraph(docx, "Evidence", item.detail),
  ]);
}

function buildFindingParagraphs(
  docx: DocxModule,
  payload: ListingDiagnosticsExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;
  const verifiedFindingIds = new Set(
    payload.spApiVerification?.verifiedFindingIds ?? []
  );

  if (payload.findings.length === 0) {
    return [new Paragraph("No findings were generated.")];
  }

  return payload.findings.flatMap((finding) => [
    new Paragraph({
      text: finding.title,
      heading: HeadingLevel.HEADING_2,
    }),
    createLabelParagraph(
      docx,
      "Priority / Impact",
      `${finding.priority} / ${formatImpactType(finding.impactType)}`
    ),
    createLabelParagraph(
      docx,
      "Severity / Dimension / Verification",
      `${finding.severity} / ${formatDimensionLabel(finding.dimensionId)} / ${finding.verification}`
    ),
    createLabelParagraph(
      docx,
      "Confidence / Verified / Inferred",
      `${Math.round(finding.confidence * 100)}% / ${verifiedFindingIds.has(finding.id) ? "yes" : "no"} / ${finding.inferred ? "yes" : "no"}`
    ),
    createLabelParagraph(docx, "Symptom", finding.symptom),
    createLabelParagraph(
      docx,
      "Root cause",
      `${formatRootCauseCategory(finding.rootCauseCategory)} - ${finding.rootCause}`
    ),
    createLabelParagraph(docx, "What to change", finding.whatToChange),
    createLabelParagraph(docx, "Where to change", finding.whereToChange),
    createLabelParagraph(docx, "Expected impact", finding.expectedImpact),
    createLabelParagraph(docx, "Description", finding.description),
    ...(finding.evidence.length > 0
      ? [new Paragraph("Evidence:"), ...createBulletParagraphs(docx, finding.evidence)]
      : []),
  ]);
}

function buildActionPlanParagraphs(
  docx: DocxModule,
  payload: ListingDiagnosticsExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;

  if (payload.actionPlanByPriority.length === 0) {
    return [new Paragraph("No action plan items were generated.")];
  }

  return payload.actionPlanByPriority.flatMap((section) => [
    new Paragraph({
      text: section.label,
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph(section.description),
    ...section.items.flatMap((item) => [
      new Paragraph({
        text: item.title,
        heading: HeadingLevel.HEADING_3,
      }),
      createLabelParagraph(
        docx,
        "Priority / Confidence / Verification",
        `${item.priority} / ${Math.round(item.confidence * 100)}% / ${item.verification}`
      ),
      createLabelParagraph(docx, "Symptom", item.symptom),
      createLabelParagraph(docx, "Root cause", item.rootCause),
      createLabelParagraph(docx, "Action", item.action),
      createLabelParagraph(docx, "Where to change", item.whereToChange),
      createLabelParagraph(docx, "Expected impact", item.expectedImpact),
      createLabelParagraph(docx, "Description", item.description),
      ...(item.linkedFindingIds.length > 0
        ? [
            createLabelParagraph(
              docx,
              "Linked findings",
              item.linkedFindingIds.join(", ")
            ),
          ]
        : []),
    ]),
  ]);
}

function buildBenchmarkParagraphs(
  docx: DocxModule,
  payload: ListingDiagnosticsExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;
  const benchmark = payload.benchmarkSummary;

  return [
    createLabelParagraph(
      docx,
      "Competitor count",
      String(benchmark.competitorCount)
    ),
    createLabelParagraph(
      docx,
      "Average price",
      formatNullableNumber(benchmark.averagePrice, 2, "$")
    ),
    createLabelParagraph(
      docx,
      "Average rating",
      formatNullableNumber(benchmark.averageRating, 2)
    ),
    createLabelParagraph(
      docx,
      "Average reviews",
      formatNullableWhole(benchmark.averageReviews)
    ),
    createLabelParagraph(
      docx,
      "Average keyword count",
      formatNullableWhole(benchmark.averageKeywordCount)
    ),
    new Paragraph({
      text: "Top benchmark keywords",
      heading: HeadingLevel.HEADING_2,
    }),
    ...(benchmark.topKeywords.length > 0
      ? createBulletParagraphs(docx, benchmark.topKeywords)
      : [new Paragraph("No benchmark keywords were available.")]),
    new Paragraph({
      text: "Top benchmark themes",
      heading: HeadingLevel.HEADING_2,
    }),
    ...(benchmark.topThemes.length > 0
      ? benchmark.topThemes.flatMap((theme) => [
          new Paragraph({
            text: theme.label,
            heading: HeadingLevel.HEADING_3,
          }),
          createLabelParagraph(
            docx,
            "Mentions / Share / Inferred",
            `${theme.mentions} / ${(theme.share * 100).toFixed(0)}% / ${theme.inferred ? "yes" : "no"}`
          ),
          ...(theme.keywords.length > 0
            ? [createLabelParagraph(docx, "Keywords", theme.keywords.join(", "))]
            : []),
        ])
      : [new Paragraph("No benchmark themes were available.")]),
  ];
}

function buildEvidenceParagraphs(
  docx: DocxModule,
  payload: ListingDiagnosticsExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;

  if (payload.evidenceTable.length === 0) {
    return [new Paragraph("No evidence rows are available.")];
  }

  return payload.evidenceTable.flatMap((row) => [
    new Paragraph({
      text: row.signal,
      heading: HeadingLevel.HEADING_2,
    }),
    createLabelParagraph(docx, "Source", row.source),
    createLabelParagraph(
      docx,
      "Confidence / Verification",
      `${Math.round(row.confidence * 100)}% / ${formatEvidenceVerificationLabel(row.verification)}`
    ),
    createLabelParagraph(docx, "Evidence", row.evidence),
  ]);
}

function buildSummaryRows(payload: ListingDiagnosticsExportPayload) {
  const p0Count = payload.findings.filter((finding) => finding.priority === "P0").length;
  const p1Count = payload.findings.filter((finding) => finding.priority === "P1").length;
  const topRootCause = payload.rootCauseSummary[0];
  const topImpact = payload.impactSummary[0];

  return [
    { item: "schemaVersion", value: payload.schemaVersion },
    { item: "exportedAt", value: payload.exportedAt },
    { item: "exportedAtLocal", value: payload.exportedAtLocal },
    { item: "generatedAt", value: payload.generatedAt },
    { item: "generatedAtLocal", value: payload.generatedAtLocal },
    { item: "marketplace", value: payload.request.marketplace },
    { item: "targetAsin", value: payload.request.targetAsin },
    { item: "status", value: payload.status },
    { item: "overallScore", value: payload.overallScore },
    { item: "confidence", value: payload.confidence },
    { item: "headline", value: payload.headline },
    { item: "summary", value: payload.summary },
    {
      item: "competitorCount",
      value: payload.benchmarkSummary.competitorCount,
    },
    { item: "warningCount", value: payload.warnings.length },
    { item: "findingCount", value: payload.findings.length },
    { item: "actionPlanCount", value: payload.actionPlan.length },
    { item: "p0FindingCount", value: p0Count },
    { item: "p1FindingCount", value: p1Count },
    { item: "topRootCause", value: topRootCause?.label ?? "" },
    { item: "topImpact", value: topImpact?.label ?? "" },
  ];
}

function buildScoreBreakdownRows(payload: ListingDiagnosticsExportPayload) {
  return payload.scoreBreakdown.map((dimension) => ({
    id: dimension.id,
    label: dimension.label,
    score: dimension.score,
    weight: dimension.weight,
    confidence: dimension.confidence,
    coverage: dimension.coverage,
    inferred: dimension.inferred ? "Yes" : "No",
    summary: dimension.summary,
  }));
}

function buildRootCauseSummaryRows(payload: ListingDiagnosticsExportPayload) {
  return ensureRows(
    payload.rootCauseSummary.map((item) => ({
      category: item.label,
      findingCount: item.findingCount,
      topPriority: item.topPriority,
      primaryImpactType: formatImpactType(item.primaryImpactType),
      verifiedCount: item.verifiedCount,
      inferredCount: item.inferredCount,
      leadFindingTitle: item.leadFindingTitle,
      leadVerification: item.leadVerification,
      symptom: item.symptom,
      rootCause: item.rootCause,
      nextMove: item.nextMove,
      recommendedSurface: item.recommendedSurface,
      expectedImpact: item.expectedImpact,
      topFindingIds: item.topFindingIds.join(", "),
    })),
    {
      category: "No root-cause queue",
      findingCount: "",
      topPriority: "",
      primaryImpactType: "",
      verifiedCount: "",
      inferredCount: "",
      leadFindingTitle: "",
      leadVerification: "",
      symptom: "",
      rootCause: "",
      nextMove: "",
      recommendedSurface: "",
      expectedImpact: "",
      topFindingIds: "",
    }
  );
}

function buildImpactSummaryRows(payload: ListingDiagnosticsExportPayload) {
  return ensureRows(
    payload.impactSummary.map((item) => ({
      impactType: item.label,
      findingCount: item.findingCount,
      topPriority: item.topPriority,
      verifiedCount: item.verifiedCount,
      inferredCount: item.inferredCount,
      leadFindingTitle: item.leadFindingTitle,
      leadVerification: item.leadVerification,
      topRootCauseCategory: formatRootCauseCategory(item.topRootCauseCategory),
      headline: item.headline,
      nextMove: item.nextMove,
      recommendedSurface: item.recommendedSurface,
      expectedImpact: item.expectedImpact,
      topFindingIds: item.topFindingIds.join(", "),
    })),
    {
      impactType: "No impact queue",
      findingCount: "",
      topPriority: "",
      verifiedCount: "",
      inferredCount: "",
      leadFindingTitle: "",
      leadVerification: "",
      topRootCauseCategory: "",
      headline: "",
      nextMove: "",
      recommendedSurface: "",
      expectedImpact: "",
      topFindingIds: "",
    }
  );
}

function buildSourceCoverageRows(payload: ListingDiagnosticsExportPayload) {
  return payload.sourceCoverage.map((item) => ({
    id: item.id,
    label: item.label,
    source: item.source,
    entity: item.entity,
    status: item.status,
    available: item.available,
    expected: item.expected,
    confidence: item.confidence,
    inferred: item.inferred ? "Yes" : "No",
    evidence: item.detail,
  }));
}

function buildFindingsRows(payload: ListingDiagnosticsExportPayload) {
  const verifiedFindingIds = new Set(
    payload.spApiVerification?.verifiedFindingIds ?? []
  );

  return ensureRows(
    payload.findings.map((finding) => ({
      id: finding.id,
      title: finding.title,
      priority: finding.priority,
      impactType: formatImpactType(finding.impactType),
      severity: finding.severity,
      tone: finding.tone,
      dimensionId: finding.dimensionId,
      confidence: finding.confidence,
      verification: finding.verification,
      verified: verifiedFindingIds.has(finding.id) ? "Yes" : "No",
      inferred: finding.inferred ? "Yes" : "No",
      symptom: finding.symptom,
      rootCauseCategory: formatRootCauseCategory(finding.rootCauseCategory),
      rootCause: finding.rootCause,
      whatToChange: finding.whatToChange,
      whereToChange: finding.whereToChange,
      expectedImpact: finding.expectedImpact,
      evidence: finding.evidence.join("\n"),
      description: finding.description,
    })),
    {
      id: "",
      title: "No findings",
      priority: "",
      impactType: "",
      severity: "",
      tone: "",
      dimensionId: "",
      confidence: "",
      verification: "",
      verified: "",
      inferred: "",
      symptom: "",
      rootCauseCategory: "",
      rootCause: "",
      whatToChange: "",
      whereToChange: "",
      expectedImpact: "",
      evidence: "",
      description: "",
    }
  );
}

function buildActionPlanRows(payload: ListingDiagnosticsExportPayload) {
  return ensureRows(
    payload.actionPlanByPriority.flatMap((section) =>
      section.items.map((item) => ({
        priorityRegion: section.label,
        priority: item.priority,
        verification: item.verification,
        title: item.title,
        confidence: item.confidence,
        inferred: item.inferred ? "Yes" : "No",
        symptom: item.symptom,
        rootCause: item.rootCause,
        action: item.action,
        whereToChange: item.whereToChange,
        expectedImpact: item.expectedImpact,
        linkedFindings: item.linkedFindingIds.join(", "),
        description: item.description,
      }))
    ),
    {
      priorityRegion: "",
      priority: "",
      verification: "",
      title: "No action plan items",
      confidence: "",
      inferred: "",
      symptom: "",
      rootCause: "",
      action: "",
      whereToChange: "",
      expectedImpact: "",
      linkedFindings: "",
      description: "",
    }
  );
}

function buildBenchmarkSummaryRows(payload: ListingDiagnosticsExportPayload) {
  return [
    {
      competitorCount: payload.benchmarkSummary.competitorCount,
      averagePrice: payload.benchmarkSummary.averagePrice ?? "",
      averageRating: payload.benchmarkSummary.averageRating ?? "",
      averageReviews: payload.benchmarkSummary.averageReviews ?? "",
      averageKeywordCount: payload.benchmarkSummary.averageKeywordCount ?? "",
    },
  ];
}

function buildBenchmarkKeywordRows(payload: ListingDiagnosticsExportPayload) {
  return ensureRows(
    payload.benchmarkSummary.topKeywords.map((keyword, index) => ({
      rank: index + 1,
      keyword,
    })),
    {
      rank: "",
      keyword: "No benchmark keywords",
    }
  );
}

function buildBenchmarkThemeRows(payload: ListingDiagnosticsExportPayload) {
  return ensureRows(
    payload.benchmarkSummary.topThemes.map((theme) => ({
      id: theme.id,
      label: theme.label,
      mentions: theme.mentions,
      share: theme.share,
      inferred: theme.inferred ? "Yes" : "No",
      keywords: theme.keywords.join(", "),
    })),
    {
      id: "",
      label: "No benchmark themes",
      mentions: "",
      share: "",
      inferred: "",
      keywords: "",
    }
  );
}

function buildEvidenceRows(payload: ListingDiagnosticsExportPayload) {
  return ensureRows(
    payload.evidenceTable.map((row) => ({
      signal: row.signal,
      category: row.category,
      source: row.source,
      confidence: row.confidence,
      verification: formatEvidenceVerificationLabel(row.verification),
      evidence: row.evidence,
    })),
    {
      signal: "No evidence rows",
      category: "",
      source: "",
      confidence: "",
      verification: "",
      evidence: "",
    }
  );
}

function buildWarningRows(payload: ListingDiagnosticsExportPayload) {
  return ensureRows(
    payload.warnings.map((warning) => ({ warning })),
    {
      warning: "No warnings",
    }
  );
}

function createLabelParagraph(
  docx: DocxModule,
  label: string,
  value: string
) {
  const { Paragraph, TextRun } = docx;
  const normalizedValue = value.trim() || "None";

  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun(normalizedValue),
    ],
  });
}

function createBulletParagraphs(docx: DocxModule, items: string[]) {
  const { Paragraph } = docx;

  return items.map((item) =>
    new Paragraph({
      text: item,
      bullet: { level: 0 },
    })
  );
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

function formatNullableNumber(
  value: number | null,
  decimals = 2,
  prefix = ""
) {
  if (value === null) {
    return "n/a";
  }

  return `${prefix}${value.toFixed(decimals)}`;
}

function formatNullableWhole(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  return Math.round(value).toLocaleString("en-US");
}

function ensureRows<T extends SheetRow>(
  rows: T[],
  fallbackRow: SheetRow
): SheetRow[] {
  return rows.length > 0 ? rows : [fallbackRow];
}
