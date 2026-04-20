import { buildCompliancePlaybook } from "@/lib/compliance";
import type {
  ComplianceResult,
  CompetitorListing,
  DataAnalysisResult,
  ListingVersion,
  PainPoint,
  ProductProfile,
  SupportFaqItem,
  ValuePoint,
  VocActionPlan,
} from "@/lib/types";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const JSON_MIME = "application/json;charset=utf-8";
const EXPORT_SCHEMA_VERSION = "listing-module.export.v1";

type DocxModule = typeof import("docx");

export interface ListingExportInput {
  productProfile: ProductProfile;
  targetMarket: string;
  competitorListings: CompetitorListing[];
  dataAnalysis: DataAnalysisResult | null;
  painPoints: PainPoint[];
  valuePoints: ValuePoint[];
  vocActionPlan: VocActionPlan | null;
  supportFaqs: SupportFaqItem[];
  listingVersions: ListingVersion[];
  complianceResults: Record<string, ComplianceResult[]>;
}

export interface ListingExportPayload {
  schemaVersion: string;
  exportedAt: string;
  exportedAtLocal: string;
  targetMarket: string;
  summary: {
    competitorCount: number;
    opportunityScore: number | null;
    painPointCount: number;
    valuePointCount: number;
    supportFaqCount: number;
    listingVersionCount: number;
    totalViolations: number;
  };
  competitorListings: CompetitorListing[];
  dataAnalysis: DataAnalysisResult | null;
  painPoints: PainPoint[];
  valuePoints: ValuePoint[];
  vocActionPlan: VocActionPlan | null;
  supportFaqs: SupportFaqItem[];
  listingVersions: Array<
    ListingVersion & {
      totalViolations: number;
      complianceResults: ComplianceResult[];
      compliancePlaybook: ReturnType<typeof buildCompliancePlaybook>;
    }
  >;
  complianceResults: Record<string, ComplianceResult[]>;
}

export function buildListingExportPayload(
  input: ListingExportInput
): ListingExportPayload {
  const exportedAt = new Date();
  const listingVersions = input.listingVersions.map((version) => {
    const versionCompliance = input.complianceResults[version.versionName] || [];
    const totalViolations = versionCompliance.reduce(
      (sum, result) => sum + result.violations.length,
      0
    );

    return {
      ...version,
      totalViolations,
      complianceResults: versionCompliance,
      compliancePlaybook: buildCompliancePlaybook(
        input.productProfile.productCategory,
        version
      ),
    };
  });

  const totalViolations = listingVersions.reduce(
    (sum, version) => sum + version.totalViolations,
    0
  );

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    exportedAtLocal: exportedAt.toLocaleString("en-US"),
    targetMarket: input.targetMarket,
    summary: {
      competitorCount: input.competitorListings.length,
      opportunityScore: input.dataAnalysis?.opportunityAssessment?.score ?? null,
      painPointCount: input.painPoints.length,
      valuePointCount: input.valuePoints.length,
      supportFaqCount: input.supportFaqs.length,
      listingVersionCount: input.listingVersions.length,
      totalViolations,
    },
    competitorListings: input.competitorListings,
    dataAnalysis: input.dataAnalysis,
    painPoints: input.painPoints,
    valuePoints: input.valuePoints,
    vocActionPlan: input.vocActionPlan,
    supportFaqs: input.supportFaqs,
    listingVersions,
    complianceResults: input.complianceResults,
  };
}

export async function exportListingReportDocx(
  input: ListingExportInput
): Promise<string> {
  const payload = buildListingExportPayload(input);
  const fileName = buildFileName("listing-report", input.targetMarket, "docx");
  const docx = await import("docx");
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = docx;

  const children = [
    new Paragraph({
      text: "Listing Analysis Report",
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Exported At: ", bold: true }),
        new TextRun(payload.exportedAtLocal),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Target Market: ", bold: true }),
        new TextRun(payload.targetMarket || "Not set"),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Summary: ", bold: true }),
        new TextRun(
          `Competitors ${payload.summary.competitorCount}, pain points ${payload.summary.painPointCount}, value points ${payload.summary.valuePointCount}, listing versions ${payload.summary.listingVersionCount}, violations ${payload.summary.totalViolations}`
        ),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Competitor Overview",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildCompetitorParagraphs(docx, payload),
    new Paragraph({
      text: "Opportunity And Keyword Routing",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildOpportunityParagraphs(docx, payload),
    new Paragraph({
      text: "Pain Point Insights",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildPainPointParagraphs(docx, payload),
    new Paragraph({
      text: "Value Point Insights",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildValuePointParagraphs(docx, payload),
    new Paragraph({
      text: "VOC Action Plan",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildVocActionParagraphs(docx, payload),
    new Paragraph({
      text: "Support FAQs",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildSupportFaqParagraphs(docx, payload),
    new Paragraph({
      text: "Listing Versions",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildListingVersionParagraphs(docx, payload),
    new Paragraph({
      text: "Compliance Results",
      heading: HeadingLevel.HEADING_1,
    }),
    ...buildComplianceParagraphs(docx, payload),
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

export async function exportListingWorkbookXlsx(
  input: ListingExportInput
): Promise<string> {
  const payload = buildListingExportPayload(input);
  const fileName = buildFileName("listing-data", input.targetMarket, "xlsx");
  const XLSX = await import("xlsx");

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildSummaryRows(payload)),
    "Summary"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildCompetitorRows(payload)),
    "Competitors"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildOpportunityRows(payload)),
    "Opportunity"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildPainPointRows(payload)),
    "PainPoints"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildValuePointRows(payload)),
    "ValuePoints"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildVocActionRows(payload)),
    "VocActions"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildSupportFaqRows(payload)),
    "SupportFaqs"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildListingRows(payload)),
    "ListingVersions"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildComplianceRows(payload)),
    "Compliance"
  );

  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  triggerDownload(fileName, new Blob([buffer], { type: XLSX_MIME }));

  return fileName;
}

export async function exportListingPayloadJson(
  input: ListingExportInput
): Promise<string> {
  const payload = buildListingExportPayload(input);
  const fileName = buildFileName("listing-payload", input.targetMarket, "json");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: JSON_MIME });

  triggerDownload(fileName, blob);

  return fileName;
}

function buildCompetitorParagraphs(
  docx: DocxModule,
  payload: ListingExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;

  if (payload.competitorListings.length === 0) {
    return [new Paragraph("No competitor data available.")];
  }

  return payload.competitorListings.flatMap((listing, index) => [
    new Paragraph({
      text: `Competitor ${index + 1} | ${listing.asin}`,
      heading: HeadingLevel.HEADING_2,
    }),
    createLabelParagraph(docx, "Title", listing.title),
    createLabelParagraph(
      docx,
      "Price / Rating / Reviews",
      `${formatPrice(listing.price, payload.targetMarket)} / ${listing.rating} / ${listing.reviews}`
    ),
    createLabelParagraph(
      docx,
      "Monthly Sales / BSR",
      `${formatInteger(listing.monthlySales)} / ${formatInteger(listing.bsr)}`
    ),
    createLabelParagraph(
      docx,
      "Bullet Points",
      listing.bulletPoints.join(" ; ") || "None"
    ),
    createLabelParagraph(
      docx,
      "Attributes",
      formatAttributes(listing.attributes) || "None"
    ),
  ]);
}

function buildOpportunityParagraphs(
  docx: DocxModule,
  payload: ListingExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;
  const opportunity = payload.dataAnalysis?.opportunityAssessment;
  const keywordStrategy = payload.dataAnalysis?.keywordStrategy;

  if (!opportunity && !keywordStrategy) {
    return [new Paragraph("No opportunity or keyword strategy data available.")];
  }

  return [
    ...(opportunity
      ? [
          new Paragraph({
            text: "Opportunity Score",
            heading: HeadingLevel.HEADING_2,
          }),
          createLabelParagraph(
            docx,
            "Score / Verdict",
            `${opportunity.score} / ${opportunity.verdict}`
          ),
          createLabelParagraph(docx, "Summary", opportunity.summary),
          ...createBulletParagraphs(docx, opportunity.strengths, "Strengths"),
          ...createBulletParagraphs(docx, opportunity.risks, "Risks"),
          ...createBulletParagraphs(docx, opportunity.nextActions, "Next Actions"),
        ]
      : []),
    ...(keywordStrategy
      ? [
          new Paragraph({
            text: "Keyword Routing",
            heading: HeadingLevel.HEADING_2,
          }),
          createLabelParagraph(
            docx,
            "Title Keywords",
            keywordStrategy.titleKeywords.map((item) => item.keyword).join(" | ")
          ),
          createLabelParagraph(
            docx,
            "Bullet Keywords",
            keywordStrategy.bulletKeywords.map((item) => item.keyword).join(" | ")
          ),
          createLabelParagraph(
            docx,
            "Search Terms Keywords",
            keywordStrategy.searchTermKeywords.map((item) => item.keyword).join(" | ")
          ),
          createLabelParagraph(
            docx,
            "PPC Core Keywords",
            keywordStrategy.ppcCoreKeywords.map((item) => item.keyword).join(" | ")
          ),
          createLabelParagraph(
            docx,
            "Negative Keywords",
            keywordStrategy.negativeKeywords.map((item) => item.keyword).join(" | ")
          ),
        ]
      : []),
  ];
}

function buildPainPointParagraphs(
  docx: DocxModule,
  payload: ListingExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;

  if (payload.painPoints.length === 0) {
    return [new Paragraph("No pain point data available.")];
  }

  return payload.painPoints.flatMap((point) => [
    new Paragraph({
      text: `${point.rank}. ${point.category}`,
      heading: HeadingLevel.HEADING_2,
    }),
    createLabelParagraph(
      docx,
      "Frequency / Share",
      `${formatInteger(point.frequency)} / ${point.percentage.toFixed(1)}%`
    ),
    createLabelParagraph(docx, "Suggestion", point.sellingPointSuggestion),
    ...createBulletParagraphs(docx, point.typicalQuotes, "Quotes"),
  ]);
}

function buildValuePointParagraphs(
  docx: DocxModule,
  payload: ListingExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;

  if (payload.valuePoints.length === 0) {
    return [new Paragraph("No value point data available.")];
  }

  return payload.valuePoints.flatMap((point, index) => [
    new Paragraph({
      text: `${index + 1}. ${point.category}`,
      heading: HeadingLevel.HEADING_2,
    }),
    createLabelParagraph(
      docx,
      "Frequency / Share",
      `${formatInteger(point.frequency)} / ${point.percentage.toFixed(1)}%`
    ),
    createLabelParagraph(docx, "Suggestion", point.leverageSuggestion),
    ...createBulletParagraphs(docx, point.typicalQuotes, "Quotes"),
  ]);
}

function buildVocActionParagraphs(
  docx: DocxModule,
  payload: ListingExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;
  const plan = payload.vocActionPlan;

  if (!plan) {
    return [new Paragraph("No VOC action plan available.")];
  }

  return (
    [
      ["Product", plan.product],
      ["Copy", plan.copy],
      ["A+", plan.aPlus],
      ["Support", plan.support],
    ] as const
  ).flatMap(([title, items]) => [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2,
    }),
    ...(items.length > 0
      ? items.flatMap((item) => [
          createLabelParagraph(docx, "Action", `${item.title} | ${item.owner}`),
          createLabelParagraph(docx, "Details", item.action),
          ...createBulletParagraphs(docx, item.evidence, "Evidence"),
        ])
      : [new Paragraph("No actions.")]),
  ]);
}

function buildSupportFaqParagraphs(
  docx: DocxModule,
  payload: ListingExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;

  if (payload.supportFaqs.length === 0) {
    return [new Paragraph("No support FAQs available.")];
  }

  return payload.supportFaqs.flatMap((faq, index) => [
    new Paragraph({
      text: `FAQ ${index + 1}`,
      heading: HeadingLevel.HEADING_2,
    }),
    createLabelParagraph(docx, "Question", faq.question),
    createLabelParagraph(docx, "Short Answer", faq.shortAnswer),
    createLabelParagraph(docx, "Guidance", faq.supportGuidance),
    createLabelParagraph(docx, "Scenario", faq.scenario),
  ]);
}

function buildListingVersionParagraphs(
  docx: DocxModule,
  payload: ListingExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;

  if (payload.listingVersions.length === 0) {
    return [new Paragraph("No listing versions available.")];
  }

  return payload.listingVersions.flatMap((version, index) => [
    new Paragraph({
      text: `Version ${index + 1} | ${version.versionName}`,
      heading: HeadingLevel.HEADING_2,
    }),
    createLabelParagraph(docx, "Style", version.style),
    createLabelParagraph(docx, "Title", version.title),
    createLabelParagraph(docx, "Bullet Points", version.bulletPoints.join("\n")),
    createLabelParagraph(docx, "Description", version.description),
    createLabelParagraph(docx, "Search Terms", version.searchTerms),
    ...createBulletParagraphs(
      docx,
      version.experiments.map(
        (item) => `${item.variable} | ${item.hypothesis} | ${item.successMetric}`
      ),
      "Experiments"
    ),
    ...createBulletParagraphs(
      docx,
      version.rufusQa.map((item) => `${item.intent} | ${item.question} | ${item.answer}`),
      "Rufus QA"
    ),
    createLabelParagraph(
      docx,
      "Creative Positioning",
      version.creativeBrief?.positioning || "None"
    ),
    ...createBulletParagraphs(
      docx,
      version.creativeBrief?.deliverables || [],
      "Creative Deliverables"
    ),
  ]);
}

function buildComplianceParagraphs(
  docx: DocxModule,
  payload: ListingExportPayload
) {
  const { HeadingLevel, Paragraph } = docx;

  if (payload.listingVersions.length === 0) {
    return [new Paragraph("No compliance data available.")];
  }

  return payload.listingVersions.flatMap((version) => {
    const resultGroup = version.complianceResults;

    if (resultGroup.length === 0) {
      return [
        new Paragraph({
          text: version.versionName,
          heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph("No compliance results were generated for this version."),
      ];
    }

    const violationRows = resultGroup.filter(
      (result) => result.violations.length > 0
    );

    if (violationRows.length === 0) {
      return [
        new Paragraph({
          text: version.versionName,
          heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph("No prohibited terms were found."),
      ];
    }

    return [
      new Paragraph({
        text: version.versionName,
        heading: HeadingLevel.HEADING_2,
      }),
      ...violationRows.flatMap((result) => [
        createLabelParagraph(docx, "Field", mapFieldName(result.field)),
        ...result.violations.map((violation) =>
          new Paragraph({
            text: `[${violation.severity.toUpperCase()}] ${violation.word} | ${violation.reason} | ${violation.context}`,
            bullet: { level: 0 },
          })
        ),
      ]),
      ...version.compliancePlaybook.map((item) =>
        new Paragraph({
          text: `[${item.riskLevel.toUpperCase()}] ${item.area} | ${item.rule} | ${item.triggered ? `Triggered: ${item.triggeredExamples.join(", ")}` : "Preventive check"}`,
          bullet: { level: 0 },
        })
      ),
    ];
  });
}

function buildSummaryRows(payload: ListingExportPayload) {
  return [
    { item: "schemaVersion", value: payload.schemaVersion },
    { item: "exportedAt", value: payload.exportedAt },
    { item: "exportedAtLocal", value: payload.exportedAtLocal },
    { item: "targetMarket", value: payload.targetMarket },
    { item: "competitorCount", value: payload.summary.competitorCount },
    { item: "opportunityScore", value: payload.summary.opportunityScore ?? "" },
    { item: "painPointCount", value: payload.summary.painPointCount },
    { item: "valuePointCount", value: payload.summary.valuePointCount },
    { item: "supportFaqCount", value: payload.summary.supportFaqCount },
    { item: "listingVersionCount", value: payload.summary.listingVersionCount },
    { item: "totalViolations", value: payload.summary.totalViolations },
  ];
}

function buildCompetitorRows(payload: ListingExportPayload) {
  return payload.competitorListings.map((listing, index) => ({
    index: index + 1,
    asin: listing.asin,
    title: listing.title,
    price: listing.price,
    rating: listing.rating,
    reviews: listing.reviews,
    monthlySales: listing.monthlySales,
    bsr: listing.bsr,
    bulletPoints: listing.bulletPoints.join("\n"),
    attributes: formatAttributes(listing.attributes),
  }));
}

function buildOpportunityRows(payload: ListingExportPayload) {
  const opportunity = payload.dataAnalysis?.opportunityAssessment;
  const keywordStrategy = payload.dataAnalysis?.keywordStrategy;

  return [
    {
      section: "opportunity",
      key: "score",
      value: opportunity?.score ?? "",
      detail: opportunity?.summary ?? "",
    },
    {
      section: "opportunity",
      key: "verdict",
      value: opportunity?.verdict ?? "",
      detail: (opportunity?.nextActions ?? []).join(" | "),
    },
    {
      section: "keywordRouting",
      key: "titleKeywords",
      value: keywordStrategy?.titleKeywords.map((item) => item.keyword).join(" | ") ?? "",
      detail: "",
    },
    {
      section: "keywordRouting",
      key: "ppcCoreKeywords",
      value: keywordStrategy?.ppcCoreKeywords.map((item) => item.keyword).join(" | ") ?? "",
      detail: "",
    },
  ];
}

function buildPainPointRows(payload: ListingExportPayload) {
  return payload.painPoints.map((point) => ({
    rank: point.rank,
    category: point.category,
    frequency: point.frequency,
    percentage: point.percentage,
    suggestion: point.sellingPointSuggestion,
    quotes: point.typicalQuotes.join("\n"),
  }));
}

function buildValuePointRows(payload: ListingExportPayload) {
  return payload.valuePoints.map((point, index) => ({
    index: index + 1,
    category: point.category,
    frequency: point.frequency,
    percentage: point.percentage,
    suggestion: point.leverageSuggestion,
    quotes: point.typicalQuotes.join("\n"),
  }));
}

function buildVocActionRows(payload: ListingExportPayload) {
  if (!payload.vocActionPlan) {
    return [{ lane: "", title: "", owner: "", priority: "", action: "", evidence: "" }];
  }

  return (
    [
      ["product", payload.vocActionPlan.product],
      ["copy", payload.vocActionPlan.copy],
      ["aPlus", payload.vocActionPlan.aPlus],
      ["support", payload.vocActionPlan.support],
    ] as const
  ).flatMap(([lane, items]) =>
    items.map((item) => ({
      lane,
      title: item.title,
      owner: item.owner,
      priority: item.priority,
      action: item.action,
      evidence: item.evidence.join(" | "),
    }))
  );
}

function buildSupportFaqRows(payload: ListingExportPayload) {
  return payload.supportFaqs.length > 0
    ? payload.supportFaqs.map((item) => ({
        question: item.question,
        shortAnswer: item.shortAnswer,
        supportGuidance: item.supportGuidance,
        scenario: item.scenario,
      }))
    : [{ question: "", shortAnswer: "", supportGuidance: "", scenario: "" }];
}

function buildListingRows(payload: ListingExportPayload) {
  return payload.listingVersions.map((version) => ({
    versionName: version.versionName,
    style: version.style,
    title: version.title,
    bulletPoint1: version.bulletPoints[0] || "",
    bulletPoint2: version.bulletPoints[1] || "",
    bulletPoint3: version.bulletPoints[2] || "",
    bulletPoint4: version.bulletPoints[3] || "",
    bulletPoint5: version.bulletPoints[4] || "",
    description: version.description,
    searchTerms: version.searchTerms,
    experiments: version.experiments.map((item) => item.variable).join(" | "),
    rufusQa: version.rufusQa.map((item) => item.question).join(" | "),
    creativePositioning: version.creativeBrief?.positioning || "",
    totalViolations: version.totalViolations,
  }));
}

function buildComplianceRows(payload: ListingExportPayload) {
  const rows = payload.listingVersions.flatMap((version) => {
    const results = version.complianceResults;

    if (results.length === 0) {
      return [
        {
          versionName: version.versionName,
          field: "",
          passed: "",
          severity: "",
          word: "",
          reason: "No compliance result",
          context: "",
        },
      ];
    }

    return results.flatMap((result) => {
      if (result.violations.length === 0) {
        return [
          {
            versionName: version.versionName,
            field: mapFieldName(result.field),
            passed: "Yes",
            severity: "",
            word: "",
            reason: "",
            context: "",
          },
        ];
      }

      return result.violations.map((violation) => ({
        versionName: version.versionName,
        field: mapFieldName(result.field),
        passed: "No",
        severity: violation.severity,
        word: violation.word,
        reason: violation.reason,
        context: violation.context,
      }));
    });
  });

  const playbookRows = payload.listingVersions.flatMap((version) =>
    version.compliancePlaybook.map((item) => ({
      versionName: version.versionName,
      field: `Playbook:${item.area}`,
      passed: item.triggered ? "Triggered" : "Check",
      severity: item.riskLevel,
      word: item.triggeredExamples.join(" | "),
      reason: item.rule,
      context: item.suggestedAction,
    }))
  );

  const combinedRows = [...rows, ...playbookRows];

  return combinedRows.length > 0
    ? combinedRows
    : [
        {
          versionName: "",
          field: "",
          passed: "",
          severity: "",
          word: "",
          reason: "",
          context: "",
        },
      ];
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

function createBulletParagraphs(
  docx: DocxModule,
  items: string[],
  title: string
) {
  const { Paragraph } = docx;

  if (items.length === 0) {
    return [createLabelParagraph(docx, title, "None")];
  }

  return [
    new Paragraph(`${title}:`),
    ...items.map((item) =>
      new Paragraph({
        text: item,
        bullet: { level: 0 },
      })
    ),
  ];
}

function buildFileName(baseName: string, market: string, extension: string) {
  const marketSegment = sanitizeFileSegment(market || "global");
  const dateSegment = formatFileDate();

  return `${baseName}-${marketSegment}-${dateSegment}.${extension}`;
}

function triggerDownload(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  // Revoke after the browser has started the download to avoid racing the click.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function mapFieldName(field: ComplianceResult["field"]) {
  const fieldMap: Record<ComplianceResult["field"], string> = {
    title: "Title",
    bulletPoints: "Bullet Points",
    description: "Description",
    searchTerms: "Search Terms",
  };

  return fieldMap[field];
}

function formatAttributes(attributes: Record<string, string>) {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");
}

function formatFileDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
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

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPrice(value: number, market: string) {
  const currencyByMarket: Record<string, string> = {
    US: "USD",
    CA: "CAD",
    UK: "GBP",
    DE: "EUR",
    FR: "EUR",
    IT: "EUR",
    ES: "EUR",
    JP: "JPY",
  };

  const currency = currencyByMarket[market.toUpperCase()] || "USD";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(value);
}
