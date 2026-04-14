"use client";

import { useState } from "react";
import {
  Download,
  FileJson,
  FileText,
  Loader2,
  Table2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  exportListingDiagnosticsPayloadJson,
  exportListingDiagnosticsReportDocx,
  exportListingDiagnosticsWorkbookXlsx,
} from "@/lib/export/listing-diagnostics-export";
import type { ListingDiagnosticsResult } from "@/lib/listing-diagnostics/types";

type ExportFormat = "docx" | "xlsx" | "json";

interface DiagnosticsExportControlsProps {
  result: ListingDiagnosticsResult;
}

export function DiagnosticsExportControls({
  result,
}: DiagnosticsExportControlsProps) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExportedFile, setLastExportedFile] = useState<string | null>(null);

  async function handleExport(format: ExportFormat) {
    setExportError(null);
    setLastExportedFile(null);
    setExporting(format);

    try {
      let fileName = "";

      if (format === "docx") {
        fileName = await exportListingDiagnosticsReportDocx(result);
      } else if (format === "xlsx") {
        fileName = await exportListingDiagnosticsWorkbookXlsx(result);
      } else {
        fileName = await exportListingDiagnosticsPayloadJson(result);
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
  }

  return (
    <Card className="border-slate-200/80 bg-white/90">
      <CardHeader className="border-b border-slate-200/80">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Reporting export</Badge>
              <Badge variant="outline">{result.request.marketplace}</Badge>
              <Badge variant="outline">ASIN {result.request.targetAsin}</Badge>
            </div>
            <CardTitle className="text-xl text-slate-950">
              Download the current diagnostics run
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-7 text-slate-600">
              Export the current reporting layer as a Word summary, workbook, or
              structured JSON payload without rerunning the diagnostic engine.
            </CardDescription>
          </div>

          <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Generated</p>
            <p className="mt-1">{formatDateTime(result.generatedAt)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-3 md:grid-cols-3">
          <ExportButton
            title="Word report"
            description="Narrative report with score breakdown, action plan, benchmark summary, and evidence appendix."
            extension=".docx"
            icon={<FileText className="h-5 w-5 text-blue-600" />}
            iconWrapperClass="bg-blue-100"
            isLoading={exporting === "docx"}
            onExport={() => {
              void handleExport("docx");
            }}
          />
          <ExportButton
            title="Excel workbook"
            description="Workbook tabs for summary, score breakdown, coverage, findings, action plan, benchmark, and evidence."
            extension=".xlsx"
            icon={<Table2 className="h-5 w-5 text-emerald-600" />}
            iconWrapperClass="bg-emerald-100"
            isLoading={exporting === "xlsx"}
            onExport={() => {
              void handleExport("xlsx");
            }}
          />
          <ExportButton
            title="JSON payload"
            description="Machine-readable payload with generatedAt, score breakdown, source coverage, findings, action plan, and benchmark summary."
            extension=".json"
            icon={<FileJson className="h-5 w-5 text-amber-600" />}
            iconWrapperClass="bg-amber-100"
            isLoading={exporting === "json"}
            onExport={() => {
              void handleExport("json");
            }}
          />
        </div>

        {exportError ? (
          <div className="rounded-[1.3rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {exportError}
          </div>
        ) : null}

        {lastExportedFile ? (
          <div className="rounded-[1.3rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Download generated: {lastExportedFile}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ExportButton({
  title,
  description,
  extension,
  icon,
  iconWrapperClass,
  isLoading,
  onExport,
}: {
  title: string;
  description: string;
  extension: string;
  icon: React.ReactNode;
  iconWrapperClass: string;
  isLoading: boolean;
  onExport: () => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${iconWrapperClass}`}
        >
          {icon}
        </span>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-950">{title}</p>
            <Badge variant="outline">{extension}</Badge>
          </div>
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>

      <Button
        onClick={onExport}
        className="mt-4 w-full"
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {isLoading ? "Generating..." : `Download ${extension}`}
      </Button>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US");
}
