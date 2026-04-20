"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useListingStore } from "@/lib/store";
import {
  exportListingPayloadJson,
  exportListingReportDocx,
  exportListingWorkbookXlsx,
} from "@/lib/export/listing-export";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileJson,
  FileText,
  Loader2,
  RotateCcw,
  Table2,
} from "lucide-react";

type ExportFormat = "docx" | "xlsx" | "json";

export function Step5Export() {
  const {
    productProfile,
    targetMarket,
    competitorListings,
    dataAnalysis,
    painPoints,
    valuePoints,
    vocActionPlan,
    supportFaqs,
    listingVersions,
    complianceResults,
    setCurrentStep,
    reset,
  } = useListingStore();

  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExportedFile, setLastExportedFile] = useState<string | null>(null);

  const totalViolations = Object.values(complianceResults).reduce(
    (sum, results) =>
      sum + results.reduce((resultSum, result) => resultSum + result.violations.length, 0),
    0
  );

  const exportInput = {
    productProfile,
    targetMarket,
    competitorListings,
    dataAnalysis,
    painPoints,
    valuePoints,
    vocActionPlan,
    supportFaqs,
    listingVersions,
    complianceResults,
  };

  const handleExport = async (format: ExportFormat) => {
    setExportError(null);
    setLastExportedFile(null);
    setExporting(format);

    try {
      let fileName = "";

      if (format === "docx") {
        fileName = await exportListingReportDocx(exportInput);
      } else if (format === "xlsx") {
        fileName = await exportListingWorkbookXlsx(exportInput);
      } else {
        fileName = await exportListingPayloadJson(exportInput);
      }

      setLastExportedFile(fileName);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Export failed. Please try again."
      );
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-xl">Listing analysis is ready</CardTitle>
          <CardDescription>
            Export now supports real Word files, real Excel workbooks, and a JSON payload for host-system consumption.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          label="Target market"
          value={targetMarket || "Not set"}
          accentClass="text-[#FF9900]"
        />
        <SummaryCard
          label="Competitors"
          value={String(competitorListings.length)}
          accentClass="text-[#FF9900]"
        />
        <SummaryCard
          label="Pain points"
          value={String(painPoints.length)}
          accentClass="text-red-500"
        />
        <SummaryCard
          label="Versions / FAQ"
          value={`${listingVersions.length} / ${supportFaqs.length}`}
          accentClass="text-blue-500"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Opportunity score"
          value={
            dataAnalysis?.opportunityAssessment?.score !== undefined
              ? String(dataAnalysis.opportunityAssessment.score)
              : "--"
          }
          accentClass="text-emerald-600"
        />
        <SummaryCard
          label="VOC actions"
          value={
            String(
              (vocActionPlan?.product.length ?? 0) +
                (vocActionPlan?.copy.length ?? 0) +
                (vocActionPlan?.aPlus.length ?? 0) +
                (vocActionPlan?.support.length ?? 0)
            )
          }
          accentClass="text-violet-600"
        />
        <SummaryCard
          label="Versions"
          value={String(listingVersions.length)}
          accentClass="text-blue-500"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              {totalViolations === 0 ? (
                <>
                  <Badge className="bg-green-500">Compliance clean</Badge>
                  <span className="text-sm text-muted-foreground">
                    No prohibited terms were found in the current versions.
                  </span>
                </>
              ) : (
                <>
                  <Badge variant="destructive">{totalViolations} issues found</Badge>
                  <span className="text-sm text-muted-foreground">
                    Export is still available, but Step 4 should be reviewed before publishing.
                  </span>
                </>
              )}
            </div>
            <Badge variant="outline">JSON schema: listing-module.export.v1</Badge>
          </div>
        </CardContent>
      </Card>

      {exportError && (
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="pt-6 text-sm text-red-700">
            {exportError}
          </CardContent>
        </Card>
      )}

      {lastExportedFile && (
        <Card className="border-green-200 bg-green-50/60">
          <CardContent className="pt-6 text-sm text-green-700">
            Download generated: {lastExportedFile}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <ExportCard
          title="Word report"
          description="A real .docx report with opportunity scoring, VOC actions, FAQ, listing copy, experiments, creative brief, and compliance notes."
          extension=".docx"
          icon={<FileText className="h-6 w-6 text-blue-600" />}
          iconWrapperClass="bg-blue-100"
          isLoading={exporting === "docx"}
          onExport={() => handleExport("docx")}
          buttonLabel="Download .docx"
        />

        <ExportCard
          title="Excel workbook"
          description="A real .xlsx workbook with summary, opportunity routing, VOC actions, support FAQ, listings, and compliance."
          extension=".xlsx"
          icon={<Table2 className="h-6 w-6 text-green-600" />}
          iconWrapperClass="bg-green-100"
          isLoading={exporting === "xlsx"}
          onExport={() => handleExport("xlsx")}
          buttonLabel="Download .xlsx"
        />

        <ExportCard
          title="JSON payload"
          description="A structured .json export with opportunity, VOC action plan, FAQ, listing versions, and compliance results."
          extension=".json"
          icon={<FileJson className="h-6 w-6 text-amber-600" />}
          iconWrapperClass="bg-amber-100"
          isLoading={exporting === "json"}
          onExport={() => handleExport("json")}
          buttonLabel="Download .json"
        />
      </div>

      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          File names follow the pattern `listing-report|listing-data|listing-payload + market + date`, so the name, extension, and content type stay aligned for downstream automation.
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setCurrentStep(4)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to edits
        </Button>
        <Button variant="outline" onClick={reset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Start a new run
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accentClass,
}: {
  label: string;
  value: string;
  accentClass: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6 text-center">
        <div className={`text-2xl font-bold ${accentClass}`}>{value}</div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function ExportCard({
  title,
  description,
  extension,
  icon,
  iconWrapperClass,
  isLoading,
  onExport,
  buttonLabel,
}: {
  title: string;
  description: string;
  extension: string;
  icon: ReactNode;
  iconWrapperClass: string;
  isLoading: boolean;
  onExport: () => void;
  buttonLabel: string;
}) {
  return (
    <Card className="transition-colors hover:border-[#FF9900]">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${iconWrapperClass}`}>
            {icon}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{title}</CardTitle>
              <Badge variant="outline">{extension}</Badge>
            </div>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Button
          onClick={onExport}
          className="w-full bg-[#FF9900] hover:bg-[#FF9900]/90"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {isLoading ? "Generating..." : buttonLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
