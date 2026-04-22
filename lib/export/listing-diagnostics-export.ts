import type {
  ListingDiagnosticsActionPlanItem,
  ListingDiagnosticsBenchmark,
  ListingDiagnosticsFinding,
  ListingDiagnosticsResult,
  ListingDiagnosticsSourceCoverageItem,
} from "@/lib/listing-diagnostics/types";
import {
  buildListingDiagnosticsTemplateFileName,
  buildListingDiagnosticsTemplateWorkbookBlob,
} from "@/lib/export/listing-diagnostics-template-workbook";
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
const JSON_MIME = "application/json;charset=utf-8";
const EXPORT_SCHEMA_VERSION = "listing-diagnostics.report.v3";

type DocxModule = typeof import("docx");

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
  const fileName = buildListingDiagnosticsTemplateFileName(result);
  const blob = await buildListingDiagnosticsTemplateWorkbookBlob(result);

  triggerDownload(fileName, blob);

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
