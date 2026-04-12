"use client";

import { useDeferredValue } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  LoaderCircle,
  Radar,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ListingDiagnosticsActionPlanItem,
  ListingDiagnosticsFinding,
  ListingDiagnosticsResult,
  ListingDiagnosticsSourceCoverageItem,
  ListingDiagnosticsStatus,
} from "@/lib/listing-diagnostics/types";

interface DiagnosticsResultsProps {
  status: ListingDiagnosticsStatus;
  result: ListingDiagnosticsResult | null;
  errorMessage: string | null;
  errorCode: string | null;
  onRetry: () => void;
  onClearError: () => void;
}

export function DiagnosticsResults({
  status,
  result,
  errorMessage,
  errorCode,
  onRetry,
  onClearError,
}: DiagnosticsResultsProps) {
  const deferredResult = useDeferredValue(result);
  const visibleResult = deferredResult ?? result;

  if (status === "loading") {
    return (
      <Card className="border-slate-200/80 bg-white/85">
        <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-4 pt-10 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white">
            <LoaderCircle className="h-6 w-6 animate-spin" />
          </span>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-slate-950">
              Building the diagnostic model
            </p>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">
              Pulling SellerSprite listing, review, and keyword sources, then running the
              deterministic scoring engine and action-plan rules.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card className="border-red-200 bg-red-50/85">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-red-600 shadow-sm">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-red-950">Listing diagnosis failed</p>
                {errorCode ? <Badge variant="outline">code: {errorCode}</Badge> : null}
              </div>
              <p className="text-sm text-red-900">{errorMessage}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={onRetry}>Retry</Button>
            <Button variant="outline" onClick={onClearError}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!visibleResult) {
    return (
      <Card className="border-dashed border-slate-300/90 bg-white/70">
        <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-4 pt-10 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <Radar className="h-6 w-6" />
          </span>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-slate-950">
              No diagnosis yet
            </p>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">
              Enter a target ASIN and optionally 2-3 competitor ASINs. The page will show
              score bands, findings, source coverage, confidence, and inferred tags once
              the Phase 1 run finishes.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {visibleResult.status === "partial" ? (
        <Card className="border-amber-200 bg-amber-50/90">
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-amber-700 shadow-sm">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-amber-950">Partial result</p>
                  <Badge variant="outline">confidence {visibleResult.confidence}%</Badge>
                  {visibleResult.inferredCount > 0 ? (
                    <Badge variant="secondary">
                      {visibleResult.inferredCount} inferred signals
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-amber-900">
                  At least one source was missing or benchmark logic had to fall back to
                  inferred signals. The warnings below explain where confidence is softer.
                </p>
              </div>
            </div>

            <div className="grid gap-2 rounded-2xl border border-amber-200/80 bg-white/80 p-4 text-sm text-slate-700">
              {visibleResult.warnings.map((warning) => (
                <p key={warning}>- {warning}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader className="border-b border-slate-200/80">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">{visibleResult.request.marketplace}</Badge>
              <Badge variant="outline">ASIN {visibleResult.request.targetAsin}</Badge>
              <Badge
                variant={visibleResult.status === "partial" ? "outline" : "secondary"}
              >
                {visibleResult.status}
              </Badge>
              {visibleResult.inferredCount > 0 ? (
                <Badge variant="outline">inferred labels on</Badge>
              ) : null}
            </div>
            <CardTitle className="text-2xl text-slate-950">
              {visibleResult.headline}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <p className="text-sm leading-7 text-slate-600">{visibleResult.summary}</p>

            <div className="grid gap-4 md:grid-cols-3">
              <SummaryMetric
                label="Overall score"
                value={`${visibleResult.overallScore}/100`}
                icon={<BarChart3 className="h-4 w-4" />}
              />
              <SummaryMetric
                label="Confidence"
                value={`${visibleResult.confidence}%`}
                icon={<Sparkles className="h-4 w-4" />}
              />
              <SummaryMetric
                label="Competitor set"
                value={String(visibleResult.benchmark.competitorCount)}
                icon={<Radar className="h-4 w-4" />}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {visibleResult.dimensions.map((dimension) => (
                <div
                  key={dimension.id}
                  className="rounded-[1.4rem] border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {dimension.label}
                    </p>
                    <Badge variant={dimension.coverage === "covered" ? "secondary" : "outline"}>
                      {dimension.score}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {dimension.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>weight {Math.round(dimension.weight * 100)}%</span>
                    <span>confidence {Math.round(dimension.confidence * 100)}%</span>
                    {dimension.inferred ? <Badge variant="outline">inferred</Badge> : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader className="border-b border-slate-200/80">
            <CardTitle className="text-xl text-slate-950">Benchmark snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <BenchmarkValue
                label="Average price"
                value={formatCurrency(visibleResult.benchmark.averagePrice)}
              />
              <BenchmarkValue
                label="Average rating"
                value={formatDecimal(visibleResult.benchmark.averageRating)}
              />
              <BenchmarkValue
                label="Average reviews"
                value={formatWhole(visibleResult.benchmark.averageReviews)}
              />
              <BenchmarkValue
                label="Average keyword count"
                value={formatWhole(visibleResult.benchmark.averageKeywordCount)}
              />
            </div>

            <div className="space-y-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">Top benchmark keywords</p>
              <div className="flex flex-wrap gap-2">
                {visibleResult.benchmark.topKeywords.length > 0 ? (
                  visibleResult.benchmark.topKeywords.map((keyword) => (
                    <Badge key={keyword} variant="outline">
                      {keyword}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No competitor keyword model yet.</p>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">Top benchmark themes</p>
              <div className="space-y-3">
                {visibleResult.benchmark.topThemes.length > 0 ? (
                  visibleResult.benchmark.topThemes.map((theme) => (
                    <div key={theme.id} className="rounded-2xl bg-white/90 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-900">{theme.label}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {(theme.share * 100).toFixed(0)}%
                          </Badge>
                          {theme.inferred ? <Badge variant="outline">inferred</Badge> : null}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {theme.mentions} negative-review mentions
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No competitor review clusters are available yet.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="findings" className="glass-panel rounded-[2rem] border border-white/70 bg-white/85 p-5">
        <TabsList variant="line">
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="actions">Action plan</TabsTrigger>
          <TabsTrigger value="coverage">Source coverage</TabsTrigger>
        </TabsList>

        <TabsContent value="findings" className="pt-5">
          <div className="grid gap-4">
            {visibleResult.findings.length > 0 ? (
              visibleResult.findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))
            ) : (
              <EmptyPanel
                title="No findings were generated"
                description="The current deterministic rules did not surface a dominant risk or opportunity in this pass."
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="actions" className="pt-5">
          <div className="grid gap-4">
            {visibleResult.actionPlan.map((item) => (
              <ActionCard key={item.id} action={item} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="coverage" className="pt-5">
          <Card className="border-slate-200/80 bg-white/90">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleResult.sourceCoverage.map((item) => (
                    <CoverageRow key={item.id} item={item} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
        {value}
      </p>
    </div>
  );
}

function BenchmarkValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function FindingCard({ finding }: { finding: ListingDiagnosticsFinding }) {
  return (
    <Card className="border-slate-200/80 bg-white/90">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={finding.severity === "high" ? "destructive" : "outline"}>
            {finding.severity}
          </Badge>
          <Badge variant="outline">{finding.dimensionId}</Badge>
          <Badge variant="outline">
            confidence {Math.round(finding.confidence * 100)}%
          </Badge>
          {finding.inferred ? <Badge variant="secondary">inferred</Badge> : null}
        </div>

        <div>
          <p className="text-lg font-semibold text-slate-950">{finding.title}</p>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            {finding.description}
          </p>
        </div>

        {finding.evidence.length > 0 ? (
          <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-sm font-semibold text-slate-900">Evidence</p>
            <div className="mt-3 grid gap-2 text-sm text-slate-600">
              {finding.evidence.map((item) => (
                <p key={item}>- {item}</p>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActionCard({ action }: { action: ListingDiagnosticsActionPlanItem }) {
  return (
    <Card className="border-slate-200/80 bg-white/90">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={action.priority === "now" ? "secondary" : "outline"}>
            {action.priority}
          </Badge>
          <Badge variant="outline">
            confidence {Math.round(action.confidence * 100)}%
          </Badge>
          {action.inferred ? <Badge variant="secondary">inferred</Badge> : null}
        </div>

        <div>
          <p className="text-lg font-semibold text-slate-950">{action.title}</p>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            {action.description}
          </p>
        </div>

        {action.linkedFindingIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <ArrowRight className="h-4 w-4" />
            <span>Linked findings: {action.linkedFindingIds.join(", ")}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CoverageRow({ item }: { item: ListingDiagnosticsSourceCoverageItem }) {
  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="font-medium text-slate-900">{item.label}</p>
          <p className="mt-1 text-xs text-slate-500">{item.source}</p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={item.status === "covered" ? "secondary" : "outline"}>
            {item.status}
          </Badge>
          {item.inferred ? <Badge variant="outline">inferred</Badge> : null}
        </div>
      </TableCell>
      <TableCell>
        {item.available} / {item.expected}
      </TableCell>
      <TableCell>{Math.round(item.confidence * 100)}%</TableCell>
      <TableCell className="whitespace-normal text-sm text-slate-600">
        {item.detail}
      </TableCell>
    </TableRow>
  );
}

function EmptyPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed border-slate-300/90 bg-white/70">
      <CardContent className="py-10 text-center">
        <p className="text-lg font-semibold text-slate-950">{title}</p>
        <p className="mt-2 text-sm leading-7 text-slate-600">{description}</p>
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return `$${value.toFixed(2)}`;
}

function formatDecimal(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return value.toFixed(2);
}

function formatWhole(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return Math.round(value).toLocaleString();
}
