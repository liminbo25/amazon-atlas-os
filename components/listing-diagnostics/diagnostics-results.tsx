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
import { DiagnosticsExportControls } from "@/components/listing-diagnostics/diagnostics-export-controls";
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
import {
  buildListingDiagnosticsEvidenceRows,
  formatEvidenceVerificationLabel,
  groupActionPlanByPriority,
  type ListingDiagnosticsActionPlanSection,
  type ListingDiagnosticsEvidenceRow,
} from "@/lib/listing-diagnostics/reporting";
import {
  formatDimensionLabel,
  formatImpactType,
  formatRootCauseCategory,
} from "@/lib/listing-diagnostics/rules/shared";
import type {
  ListingDiagnosticsActionPlanItem,
  ListingDiagnosticsFinding,
  ListingDiagnosticsImpactSummaryItem,
  ListingDiagnosticsResult,
  ListingDiagnosticsRootCauseSummaryItem,
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
  const verifiedFindingIds = new Set(
    visibleResult?.spApiVerification?.verifiedFindingIds ?? []
  );
  const actionSections = visibleResult
    ? groupActionPlanByPriority(visibleResult.actionPlan)
    : [];
  const evidenceRows = visibleResult
    ? buildListingDiagnosticsEvidenceRows(visibleResult)
    : [];
  const priorityCounts = visibleResult
    ? visibleResult.findings.reduce(
        (counts, finding) => {
          counts[finding.priority] += 1;
          return counts;
        },
        { P0: 0, P1: 0, P2: 0 }
      )
    : { P0: 0, P1: 0, P2: 0 };

  if (status === "loading") {
    return (
      <Card className="obsidian-empty-state">
        <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-4 pt-10 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(246,182,63,0.24)] bg-[rgba(246,182,63,0.12)] text-[#f6c26a]">
            <LoaderCircle className="h-6 w-6 animate-spin" />
          </span>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-[#f7f0e6]">
              Building the diagnostic model
            </p>
            <p className="max-w-2xl text-sm leading-7 text-[#c5b9aa]">
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
      <Card className="border-rose-400/25 bg-rose-500/10 text-rose-100">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-rose-400/20 bg-rose-500/12 text-rose-200">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-rose-100">Listing diagnosis failed</p>
                {errorCode ? <Badge variant="outline">code: {errorCode}</Badge> : null}
              </div>
              <p className="text-sm text-rose-100/90">{errorMessage}</p>
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
      <Card className="obsidian-empty-state">
        <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-4 pt-10 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-[rgba(255,255,255,0.05)] text-[#c5b9aa]">
            <Radar className="h-6 w-6" />
          </span>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-[#f7f0e6]">
              No diagnosis yet
            </p>
            <p className="max-w-2xl text-sm leading-7 text-[#c5b9aa]">
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
        <Card className="obsidian-inline-note border-[rgba(246,182,63,0.24)] bg-[rgba(246,182,63,0.1)]">
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(246,182,63,0.2)] bg-[rgba(246,182,63,0.12)] text-[#f6c26a]">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[#f3dfb6]">Partial result</p>
                  <Badge variant="outline">confidence {visibleResult.confidence}%</Badge>
                  {visibleResult.inferredCount > 0 ? (
                    <Badge variant="secondary">
                      {visibleResult.inferredCount} inferred signals
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-[#dfd2c3]">
                  At least one source was missing or benchmark logic had to fall back to
                  inferred signals. The warnings below explain where confidence is softer.
                </p>
              </div>
            </div>

            <div className="obsidian-soft-card grid gap-2 p-4 text-sm text-[#dfd2c3]">
              {visibleResult.warnings.map((warning) => (
                <p key={warning}>- {warning}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {visibleResult.spApiVerification?.scoreCapApplied ? (
        <Card className="border-rose-400/25 bg-rose-500/10 text-rose-100">
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-rose-400/20 bg-rose-500/12 text-rose-200">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-rose-100">Amazon verified blocker</p>
                  <Badge variant="outline">
                    score capped at {visibleResult.spApiVerification.scoreCeiling}/100
                  </Badge>
                  <Badge variant="secondary">
                    {visibleResult.spApiVerification.blockingVerifiedFindingIds.length} blocking
                  </Badge>
                </div>
                <p className="text-sm text-rose-100/90">
                  Amazon SP-API confirmed account or catalog blockers for this ASIN, so the
                  overall score is being held down until those verified issues are cleared.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="obsidian-card">
          <CardHeader className="border-b border-white/10">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">{visibleResult.request.marketplace}</Badge>
              <Badge variant="outline">ASIN {visibleResult.request.targetAsin}</Badge>
              <Badge
                variant={visibleResult.status === "partial" ? "outline" : "secondary"}
              >
                {visibleResult.status}
              </Badge>
              {visibleResult.spApiVerification?.enabled ? (
                <Badge variant="outline">
                  SP-API {visibleResult.spApiVerification.mode}
                </Badge>
              ) : null}
              {visibleResult.spApiVerification?.verifiedFindingIds.length ? (
                <Badge variant="secondary">
                  {visibleResult.spApiVerification.verifiedFindingIds.length} verified
                </Badge>
              ) : null}
              {visibleResult.inferredCount > 0 ? (
                <Badge variant="outline">inferred labels on</Badge>
              ) : null}
            </div>
            <CardTitle className="text-2xl text-[#f7f0e6]">
              {visibleResult.headline}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <p className="text-sm leading-7 text-[#c5b9aa]">{visibleResult.summary}</p>

            <div className="grid gap-4 md:grid-cols-4">
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
              <SummaryMetric
                label="Priority queue"
                value={`P0 ${priorityCounts.P0} / P1 ${priorityCounts.P1}`}
                icon={<AlertTriangle className="h-4 w-4" />}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <RootCauseQueueCard items={visibleResult.rootCauseSummary} />
              <ImpactQueueCard items={visibleResult.impactSummary} />
            </div>

            {visibleResult.spApiVerification?.enabled ? (
              <div className="obsidian-inline-note p-4 text-sm text-[#dfd2c3]">
                <p className="font-semibold text-[#f3dfb6]">Amazon verification</p>
                <p className="mt-2 leading-7">
                  Catalog coverage is {visibleResult.spApiVerification.catalogStatus} and
                  account coverage is {visibleResult.spApiVerification.accountStatus}.
                  {visibleResult.spApiVerification.sellerIdMasked
                    ? ` Seller ${visibleResult.spApiVerification.sellerIdMasked} was used for account checks.`
                    : ""}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {visibleResult.dimensions.map((dimension) => (
                <div
                  key={dimension.id}
                  className="obsidian-soft-card p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#f7f0e6]">
                      {dimension.label}
                    </p>
                    <Badge variant={dimension.coverage === "covered" ? "secondary" : "outline"}>
                      {dimension.score}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-[#c5b9aa]">
                    {dimension.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#998e82]">
                    <span>weight {Math.round(dimension.weight * 100)}%</span>
                    <span>confidence {Math.round(dimension.confidence * 100)}%</span>
                    {dimension.inferred ? <Badge variant="outline">inferred</Badge> : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="obsidian-card">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-xl text-[#f7f0e6]">Benchmark snapshot</CardTitle>
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

            <div className="obsidian-soft-card space-y-3 p-4">
              <p className="text-sm font-semibold text-[#f7f0e6]">Top benchmark keywords</p>
              <div className="flex flex-wrap gap-2">
                {visibleResult.benchmark.topKeywords.length > 0 ? (
                  visibleResult.benchmark.topKeywords.map((keyword) => (
                    <Badge key={keyword} variant="outline">
                      {keyword}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-[#998e82]">No competitor keyword model yet.</p>
                )}
              </div>
            </div>

            <div className="obsidian-soft-card space-y-3 p-4">
              <p className="text-sm font-semibold text-[#f7f0e6]">Top benchmark themes</p>
              <div className="space-y-3">
                {visibleResult.benchmark.topThemes.length > 0 ? (
                  visibleResult.benchmark.topThemes.map((theme) => (
                    <div key={theme.id} className="rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.04)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-[#f7f0e6]">{theme.label}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {(theme.share * 100).toFixed(0)}%
                          </Badge>
                          {theme.inferred ? <Badge variant="outline">inferred</Badge> : null}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-[#c5b9aa]">
                        {theme.mentions} negative-review mentions
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#998e82]">
                    No competitor review clusters are available yet.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DiagnosticsExportControls result={visibleResult} />

      <Tabs defaultValue="findings" className="obsidian-workbench p-5">
        <TabsList variant="line" className="rounded-full border border-white/8 bg-[rgba(255,255,255,0.04)] p-1">
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="actions">Action plan</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="coverage">Source coverage</TabsTrigger>
        </TabsList>

        <TabsContent value="findings" className="pt-5">
          <div className="grid gap-4">
            {visibleResult.findings.length > 0 ? (
              visibleResult.findings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  isVerified={verifiedFindingIds.has(finding.id)}
                />
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
          {actionSections.length > 0 ? (
            <div className="grid gap-4">
              {actionSections.map((section) => (
                <ActionPrioritySection
                  key={section.id}
                  section={section}
                  verifiedFindingIds={verifiedFindingIds}
                />
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="No action plan was generated"
              description="The current run did not return any sequenced next steps."
            />
          )}
        </TabsContent>

        <TabsContent value="evidence" className="pt-5">
          {evidenceRows.length > 0 ? (
            <Card className="obsidian-card">
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Signal</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Verification</TableHead>
                      <TableHead>Evidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evidenceRows.map((row) => (
                      <EvidenceTableRow key={row.id} row={row} />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <EmptyPanel
              title="No evidence rows are available"
              description="The current result did not expose any structured evidence rows."
            />
          )}
        </TabsContent>

        <TabsContent value="coverage" className="pt-5">
          <Card className="obsidian-card">
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
    <div className="obsidian-soft-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-[#998e82]">
        {icon}
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#f7f0e6]">
        {value}
      </p>
    </div>
  );
}

function BenchmarkValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="obsidian-soft-card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#998e82]">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-[#f7f0e6]">{value}</p>
    </div>
  );
}

function FindingCard({
  finding,
  isVerified,
}: {
  finding: ListingDiagnosticsFinding;
  isVerified: boolean;
}) {
  return (
    <Card className="obsidian-card">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={finding.priority === "P0" ? "destructive" : "outline"}>
            {finding.priority}
          </Badge>
          <Badge variant="outline">{finding.severity}</Badge>
          <Badge variant="outline">{formatImpactType(finding.impactType)}</Badge>
          <Badge variant="outline">{formatDimensionLabel(finding.dimensionId)}</Badge>
          <Badge variant="outline">
            {formatRootCauseCategory(finding.rootCauseCategory)}
          </Badge>
          <Badge variant="outline">
            confidence {Math.round(finding.confidence * 100)}%
          </Badge>
          {isVerified || finding.verification === "verified" ? (
            <Badge variant="secondary">verified</Badge>
          ) : null}
          {finding.verification === "direct" ? (
            <Badge variant="outline">direct</Badge>
          ) : null}
          {finding.verification === "inferred" ? (
            <Badge variant="secondary">inferred</Badge>
          ) : null}
        </div>

        <div>
          <p className="text-lg font-semibold text-[#f7f0e6]">{finding.title}</p>
          <p className="mt-2 text-sm leading-7 text-[#c5b9aa]">
            {finding.description}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DetailPanel label="Symptom" value={finding.symptom} />
          <DetailPanel label="Root Cause" value={finding.rootCause} />
          <DetailPanel label="What To Change" value={finding.whatToChange} />
          <DetailPanel label="Where To Change" value={finding.whereToChange} />
        </div>

        <div className="obsidian-inline-note rounded-[1.3rem] border-emerald-400/20 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-100">Expected impact</p>
          <p className="mt-2 text-sm leading-7 text-emerald-50/90">
            {finding.expectedImpact}
          </p>
        </div>

        {finding.evidence.length > 0 ? (
          <div className="obsidian-soft-card p-4">
            <p className="text-sm font-semibold text-[#f7f0e6]">Evidence</p>
            <div className="mt-3 grid gap-2 text-sm text-[#c5b9aa]">
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

function ActionCard({
  action,
  isVerified,
  showPriorityBadge = true,
}: {
  action: ListingDiagnosticsActionPlanItem;
  isVerified: boolean;
  showPriorityBadge?: boolean;
}) {
  return (
    <Card className="obsidian-card">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          {showPriorityBadge ? (
            <Badge variant={action.priority === "P0" ? "destructive" : "outline"}>
              {action.priority}
            </Badge>
          ) : null}
          <Badge variant="outline">
            confidence {Math.round(action.confidence * 100)}%
          </Badge>
          {isVerified || action.verification === "verified" ? (
            <Badge variant="secondary">verified</Badge>
          ) : null}
          {action.verification === "direct" ? (
            <Badge variant="outline">direct</Badge>
          ) : null}
          {action.verification === "inferred" ? (
            <Badge variant="secondary">inferred</Badge>
          ) : null}
        </div>

        <div>
          <p className="text-lg font-semibold text-[#f7f0e6]">{action.title}</p>
          <p className="mt-2 text-sm leading-7 text-[#c5b9aa]">
            {action.description}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DetailPanel label="Symptom" value={action.symptom} />
          <DetailPanel label="Root Cause" value={action.rootCause} />
          <DetailPanel label="Action" value={action.action} />
          <DetailPanel label="Where To Change" value={action.whereToChange} />
        </div>

        <div className="obsidian-inline-note rounded-[1.3rem] border-emerald-400/20 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-100">Expected impact</p>
          <p className="mt-2 text-sm leading-7 text-emerald-50/90">
            {action.expectedImpact}
          </p>
        </div>

        {action.linkedFindingIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-[#998e82]">
            <ArrowRight className="h-4 w-4" />
            <span>Linked findings: {action.linkedFindingIds.join(", ")}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActionPrioritySection({
  section,
  verifiedFindingIds,
}: {
  section: ListingDiagnosticsActionPlanSection;
  verifiedFindingIds: Set<string>;
}) {
  return (
    <Card className="obsidian-card">
      <CardHeader className="border-b border-white/10">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={section.id === "P0" ? "destructive" : "outline"}>
            {section.label}
          </Badge>
          <Badge variant="outline">{section.items.length} items</Badge>
        </div>
        <CardTitle className="text-lg text-[#f7f0e6]">
          {section.description}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {section.items.map((item) => (
          <ActionCard
            key={item.id}
            action={item}
            isVerified={item.linkedFindingIds.some((id) => verifiedFindingIds.has(id))}
            showPriorityBadge={false}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function DetailPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="obsidian-soft-card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#998e82]">
        {label}
      </p>
      <p className="mt-2 text-sm leading-7 text-[#dfd2c3]">{value}</p>
    </div>
  );
}

function CoverageRow({ item }: { item: ListingDiagnosticsSourceCoverageItem }) {
  const isVerifiedSource = item.source === "Amazon SP-API";

  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="font-medium text-[#f7f0e6]">{item.label}</p>
          <p className="mt-1 text-xs text-[#998e82]">{item.source}</p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={item.status === "covered" ? "secondary" : "outline"}>
            {item.status}
          </Badge>
          {isVerifiedSource ? <Badge variant="secondary">verified</Badge> : null}
          {item.inferred ? <Badge variant="outline">inferred</Badge> : null}
        </div>
      </TableCell>
      <TableCell>
        {item.available} / {item.expected}
      </TableCell>
      <TableCell>{Math.round(item.confidence * 100)}%</TableCell>
      <TableCell className="whitespace-normal text-sm text-[#c5b9aa]">
        {item.detail}
      </TableCell>
    </TableRow>
  );
}

function EvidenceTableRow({ row }: { row: ListingDiagnosticsEvidenceRow }) {
  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="font-medium text-[#f7f0e6]">{row.signal}</p>
          <p className="mt-1 text-xs text-[#998e82]">{row.category}</p>
        </div>
      </TableCell>
      <TableCell className="text-sm text-[#dfd2c3]">{row.source}</TableCell>
      <TableCell>{Math.round(row.confidence * 100)}%</TableCell>
      <TableCell>
        <Badge variant={getEvidenceBadgeVariant(row.verification)}>
          {formatEvidenceVerificationLabel(row.verification)}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-normal text-sm leading-7 text-[#c5b9aa]">
        {row.evidence}
      </TableCell>
    </TableRow>
  );
}

function RootCauseQueueCard({
  items,
}: {
  items: ListingDiagnosticsRootCauseSummaryItem[];
}) {
  return (
    <Card className="obsidian-card">
      <CardHeader className="border-b border-white/10">
        <CardTitle className="text-xl text-[#f7f0e6]">Root-cause queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {items.length > 0 ? (
          items.slice(0, 4).map((item) => (
            <div
              key={item.label}
              className="obsidian-soft-card p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.topPriority === "P0" ? "destructive" : "outline"}>
                  {item.topPriority}
                </Badge>
                <Badge variant="outline">{item.label}</Badge>
                <Badge variant="outline">{formatImpactType(item.primaryImpactType)}</Badge>
                <Badge variant="outline">{item.findingCount} findings</Badge>
                <Badge
                  variant={item.leadVerification === "verified" ? "secondary" : "outline"}
                >
                  {item.leadVerification}
                </Badge>
                {item.verifiedCount > 0 ? (
                  <Badge variant="secondary">{item.verifiedCount} verified</Badge>
                ) : null}
                {item.inferredCount > 0 ? (
                  <Badge variant="outline">{item.inferredCount} inferred</Badge>
                ) : null}
              </div>
              <p className="mt-3 text-sm font-semibold text-[#f7f0e6]">
                Lead issue: {item.leadFindingTitle}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <DetailPanel label="Symptom" value={item.symptom} />
                <DetailPanel label="Root Cause" value={item.rootCause} />
                <DetailPanel label="Next Move" value={item.nextMove} />
                <DetailPanel label="Where To Change" value={item.recommendedSurface} />
              </div>
              <div className="obsidian-inline-note mt-3 rounded-[1.2rem] border-emerald-400/20 bg-emerald-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
                  Expected impact
                </p>
                <p className="mt-2 text-sm leading-7 text-emerald-50/90">
                  {item.expectedImpact}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm leading-7 text-[#998e82]">
            No root-cause queue is available for this run.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ImpactQueueCard({
  items,
}: {
  items: ListingDiagnosticsImpactSummaryItem[];
}) {
  return (
    <Card className="obsidian-card">
      <CardHeader className="border-b border-white/10">
        <CardTitle className="text-xl text-[#f7f0e6]">Business impact queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item.impactType}
              className="obsidian-soft-card p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.topPriority === "P0" ? "destructive" : "outline"}>
                  {item.topPriority}
                </Badge>
                <Badge variant="outline">{item.label}</Badge>
                <Badge variant="outline">{item.findingCount} findings</Badge>
                <Badge
                  variant={item.leadVerification === "verified" ? "secondary" : "outline"}
                >
                  {item.leadVerification}
                </Badge>
                {item.verifiedCount > 0 ? (
                  <Badge variant="secondary">{item.verifiedCount} verified</Badge>
                ) : null}
                {item.inferredCount > 0 ? (
                  <Badge variant="outline">{item.inferredCount} inferred</Badge>
                ) : null}
              </div>
              <p className="mt-3 text-sm font-semibold text-[#f7f0e6]">
                Lead issue: {item.leadFindingTitle}
              </p>
              <p className="mt-3 text-sm leading-7 text-[#dfd2c3]">{item.headline}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <DetailPanel
                  label="Root-Cause Lead"
                  value={formatRootCauseCategory(item.topRootCauseCategory)}
                />
                <DetailPanel label="Next Move" value={item.nextMove} />
                <DetailPanel label="Where To Change" value={item.recommendedSurface} />
                <DetailPanel label="Expected Impact" value={item.expectedImpact} />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm leading-7 text-[#998e82]">
            No business impact queue is available for this run.
          </p>
        )}
      </CardContent>
    </Card>
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
    <Card className="obsidian-empty-state">
      <CardContent className="py-10 text-center">
        <p className="text-lg font-semibold text-[#f7f0e6]">{title}</p>
        <p className="mt-2 text-sm leading-7 text-[#c5b9aa]">{description}</p>
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

function getEvidenceBadgeVariant(
  verification: ListingDiagnosticsEvidenceRow["verification"]
) {
  switch (verification) {
    case "verified":
      return "secondary" as const;
    case "inferred":
      return "outline" as const;
    case "direct":
      return "outline" as const;
  }
}
