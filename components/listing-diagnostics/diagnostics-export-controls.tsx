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
    <Card className="obsidian-card">
      <CardHeader className="border-b border-white/10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Reporting export</Badge>
              <Badge variant="outline">{result.request.marketplace}</Badge>
              <Badge variant="outline">ASIN {result.request.targetAsin}</Badge>
            </div>
            <CardTitle className="text-xl text-[#f7f0e6]">
              Download the current diagnostics run
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-7 text-[#c5b9aa]">
              Export the current reporting layer as a Word summary, workbook, or
              structured JSON payload without rerunning the diagnostic engine. The
              exports preserve root-cause drilldown, verification labels, and the
              executable action plan.
            </CardDescription>
          </div>

          <div className="obsidian-soft-card px-4 py-3 text-sm text-[#c5b9aa]">
            <p className="font-semibold text-[#f7f0e6]">Generated</p>
            <p className="mt-1">{formatDateTime(result.generatedAt)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-3 md:grid-cols-3">
          <ExportButton
            title="Word report"
            description="Narrative report with score breakdown, root causes, action plan, benchmark summary, and evidence appendix."
            extension=".docx"
            icon={<FileText className="h-5 w-5 text-sky-200" />}
            iconWrapperClass="bg-sky-500/12"
            isLoading={exporting === "docx"}
            onExport={() => {
              void handleExport("docx");
            }}
          />
          <ExportButton
            title="Excel workbook"
            description="Workbook tabs for summary, score breakdown, coverage, enriched findings, action plan, benchmark, and evidence."
            extension=".xlsx"
            icon={<Table2 className="h-5 w-5 text-emerald-200" />}
            iconWrapperClass="obsidian-soft-card bg-emerald-500/10"
            isLoading={exporting === "xlsx"}
            onExport={() => {
              void handleExport("xlsx");
            }}
          />
          <ExportButton
            title="JSON payload"
            description="Machine-readable payload with verification labels, root causes, findings, action plan, source coverage, and benchmark summary."
            extension=".json"
            icon={<FileJson className="h-5 w-5 text-amber-200" />}
            iconWrapperClass="bg-amber-500/12"
            isLoading={exporting === "json"}
            onExport={() => {
              void handleExport("json");
            }}
          />
        </div>

        {exportError ? (
          <div className="rounded-[1.3rem] border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {exportError}
          </div>
        ) : null}

        {lastExportedFile ? (
          <div className="obsidian-inline-note rounded-[1.3rem] border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
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
    <div className="obsidian-soft-card p-4">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 ${iconWrapperClass}`}
        >
          {icon}
        </span>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[#f7f0e6]">{title}</p>
            <Badge variant="outline">{extension}</Badge>
          </div>
          <p className="text-sm leading-6 text-[#c5b9aa]">{description}</p>
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
