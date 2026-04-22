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
  groupActionPlanByPriority,
  type ListingDiagnosticsActionPlanSection,
  type ListingDiagnosticsEvidenceRow,
} from "@/lib/listing-diagnostics/reporting";
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
      <Card className="border-slate-200/80 bg-white/85">
        <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-4 pt-10 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white">
            <LoaderCircle className="h-6 w-6 animate-spin" />
          </span>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-slate-950">
              正在构建诊断模型
            </p>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">
              正在拉取 SellerSprite 的 Listing、评价和关键词数据源，并运行确定性评分引擎与行动计划规则。
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
                <p className="font-semibold text-red-950">Listing 诊断失败</p>
                {errorCode ? <Badge variant="outline">代码：{errorCode}</Badge> : null}
              </div>
              <p className="text-sm text-red-900">{errorMessage}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={onRetry}>重试</Button>
            <Button variant="outline" onClick={onClearError}>
              清除
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
              暂无诊断结果
            </p>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">
              输入目标 ASIN，并按需补充 2-3 个竞品 ASIN。第一阶段完成后，页面会展示分数带、诊断发现、来源覆盖率、置信度和推断标签。
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
                  <p className="font-semibold text-amber-950">部分结果</p>
                  <Badge variant="outline">置信度 {visibleResult.confidence}%</Badge>
                  {visibleResult.inferredCount > 0 ? (
                    <Badge variant="secondary">
                      {visibleResult.inferredCount} 个推断信号
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-amber-900">
                  至少有一个来源缺失，或基准逻辑回退到了推断信号。下面的告警说明了哪些位置的置信度较弱。
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

      {visibleResult.spApiVerification?.scoreCapApplied ? (
        <Card className="border-red-200 bg-red-50/90">
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-red-700 shadow-sm">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-red-950">Amazon 已验证阻塞项</p>
                  <Badge variant="outline">
                    总分上限 {visibleResult.spApiVerification.scoreCeiling}/100
                  </Badge>
                  <Badge variant="secondary">
                    {visibleResult.spApiVerification.blockingVerifiedFindingIds.length} 个阻塞项
                  </Badge>
                </div>
                <p className="text-sm text-red-900">
                  Amazon SP-API 已确认这个 ASIN 存在账户或目录阻塞项，因此在这些已验证问题清除前，总分会被压低。
                </p>
              </div>
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
                {formatResultStatusLabel(visibleResult.status)}
              </Badge>
              {visibleResult.spApiVerification?.enabled ? (
                <Badge variant="outline">
                  SP-API {formatSpApiModeLabel(visibleResult.spApiVerification.mode)}
                </Badge>
              ) : null}
              {visibleResult.spApiVerification?.verifiedFindingIds.length ? (
                <Badge variant="secondary">
                  {visibleResult.spApiVerification.verifiedFindingIds.length} 个已验证
                </Badge>
              ) : null}
              {visibleResult.inferredCount > 0 ? (
                <Badge variant="outline">含推断标签</Badge>
              ) : null}
            </div>
            <CardTitle className="text-2xl text-slate-950">
              {visibleResult.headline}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <p className="text-sm leading-7 text-slate-600">{visibleResult.summary}</p>

            <div className="grid gap-4 md:grid-cols-4">
              <SummaryMetric
                label="总分"
                value={`${visibleResult.overallScore}/100`}
                icon={<BarChart3 className="h-4 w-4" />}
              />
              <SummaryMetric
                label="置信度"
                value={`${visibleResult.confidence}%`}
                icon={<Sparkles className="h-4 w-4" />}
              />
              <SummaryMetric
                label="竞品组"
                value={String(visibleResult.benchmark.competitorCount)}
                icon={<Radar className="h-4 w-4" />}
              />
              <SummaryMetric
                label="优先级队列"
                value={`P0 ${priorityCounts.P0} / P1 ${priorityCounts.P1}`}
                icon={<AlertTriangle className="h-4 w-4" />}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <RootCauseQueueCard items={visibleResult.rootCauseSummary} />
              <ImpactQueueCard items={visibleResult.impactSummary} />
            </div>

            {visibleResult.spApiVerification?.enabled ? (
              <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/75 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Amazon 校验</p>
                <p className="mt-2 leading-7">
                  目录覆盖状态为{" "}
                  {formatSourceStatusLabel(visibleResult.spApiVerification.catalogStatus)}，
                  账户覆盖状态为{" "}
                  {formatSourceStatusLabel(visibleResult.spApiVerification.accountStatus)}。
                  {visibleResult.spApiVerification.sellerIdMasked
                    ? ` Seller ${visibleResult.spApiVerification.sellerIdMasked} 用于账户校验。`
                    : ""}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {visibleResult.dimensions.map((dimension) => (
                <div
                  key={dimension.id}
                  className="rounded-[1.4rem] border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatDimensionLabelZh(dimension.id)}
                    </p>
                    <Badge variant={dimension.coverage === "covered" ? "secondary" : "outline"}>
                      {dimension.score}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {dimension.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>权重 {Math.round(dimension.weight * 100)}%</span>
                    <span>置信度 {Math.round(dimension.confidence * 100)}%</span>
                    {dimension.inferred ? <Badge variant="outline">推断</Badge> : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader className="border-b border-slate-200/80">
            <CardTitle className="text-xl text-slate-950">基准快照</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <BenchmarkValue
                label="平均价格"
                value={formatCurrency(visibleResult.benchmark.averagePrice)}
              />
              <BenchmarkValue
                label="平均评分"
                value={formatDecimal(visibleResult.benchmark.averageRating)}
              />
              <BenchmarkValue
                label="平均评价数"
                value={formatWhole(visibleResult.benchmark.averageReviews)}
              />
              <BenchmarkValue
                label="平均关键词数"
                value={formatWhole(visibleResult.benchmark.averageKeywordCount)}
              />
            </div>

            <div className="space-y-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">基准关键词</p>
              <div className="flex flex-wrap gap-2">
                {visibleResult.benchmark.topKeywords.length > 0 ? (
                  visibleResult.benchmark.topKeywords.map((keyword) => (
                    <Badge key={keyword} variant="outline">
                      {keyword}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">暂未生成竞品关键词模型。</p>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">基准主题</p>
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
                          {theme.inferred ? <Badge variant="outline">推断</Badge> : null}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {theme.mentions} 条差评提及
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    暂未获取竞品评价聚类。
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DiagnosticsExportControls result={visibleResult} />

      <Tabs defaultValue="findings" className="glass-panel rounded-[2rem] border border-white/70 bg-white/85 p-5">
        <TabsList variant="line">
          <TabsTrigger value="findings">诊断发现</TabsTrigger>
          <TabsTrigger value="actions">行动计划</TabsTrigger>
          <TabsTrigger value="evidence">证据</TabsTrigger>
          <TabsTrigger value="coverage">来源覆盖</TabsTrigger>
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
                title="未生成诊断发现"
                description="当前这次运行里，确定性规则没有识别出明显的主要风险或机会。"
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
              title="未生成行动计划"
              description="当前这次运行没有返回排好顺序的下一步动作。"
            />
          )}
        </TabsContent>

        <TabsContent value="evidence" className="pt-5">
          {evidenceRows.length > 0 ? (
            <Card className="border-slate-200/80 bg-white/90">
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>信号</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead>置信度</TableHead>
                      <TableHead>校验方式</TableHead>
                      <TableHead>证据</TableHead>
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
              title="暂无证据行"
              description="当前结果没有暴露结构化证据行。"
            />
          )}
        </TabsContent>

        <TabsContent value="coverage" className="pt-5">
          <Card className="border-slate-200/80 bg-white/90">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>来源</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>可用数</TableHead>
                    <TableHead>置信度</TableHead>
                    <TableHead>备注</TableHead>
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

function FindingCard({
  finding,
  isVerified,
}: {
  finding: ListingDiagnosticsFinding;
  isVerified: boolean;
}) {
  return (
    <Card className="border-slate-200/80 bg-white/90">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={finding.priority === "P0" ? "destructive" : "outline"}>
            {finding.priority}
          </Badge>
          <Badge variant="outline">{formatSeverityLabel(finding.severity)}</Badge>
          <Badge variant="outline">{formatImpactTypeLabel(finding.impactType)}</Badge>
          <Badge variant="outline">{formatDimensionLabelZh(finding.dimensionId)}</Badge>
          <Badge variant="outline">{formatRootCauseCategoryLabel(finding.rootCauseCategory)}</Badge>
          <Badge variant="outline">
            置信度 {Math.round(finding.confidence * 100)}%
          </Badge>
          {isVerified || finding.verification === "verified" ? (
            <Badge variant="secondary">已验证</Badge>
          ) : null}
          {finding.verification === "direct" ? (
            <Badge variant="outline">直接</Badge>
          ) : null}
          {finding.verification === "inferred" ? (
            <Badge variant="secondary">推断</Badge>
          ) : null}
        </div>

        <div>
          <p className="text-lg font-semibold text-slate-950">{finding.title}</p>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            {finding.description}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DetailPanel label="症状" value={finding.symptom} />
          <DetailPanel label="根因" value={finding.rootCause} />
          <DetailPanel label="需要调整什么" value={finding.whatToChange} />
          <DetailPanel label="调整位置" value={finding.whereToChange} />
        </div>

        <div className="rounded-[1.3rem] border border-emerald-200 bg-emerald-50/80 p-4">
          <p className="text-sm font-semibold text-emerald-900">预期影响</p>
          <p className="mt-2 text-sm leading-7 text-emerald-800">
            {finding.expectedImpact}
          </p>
        </div>

        {finding.evidence.length > 0 ? (
          <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-sm font-semibold text-slate-900">证据</p>
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
    <Card className="border-slate-200/80 bg-white/90">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          {showPriorityBadge ? (
            <Badge variant={action.priority === "P0" ? "destructive" : "outline"}>
              {action.priority}
            </Badge>
          ) : null}
          <Badge variant="outline">
            置信度 {Math.round(action.confidence * 100)}%
          </Badge>
          {isVerified || action.verification === "verified" ? (
            <Badge variant="secondary">已验证</Badge>
          ) : null}
          {action.verification === "direct" ? (
            <Badge variant="outline">直接</Badge>
          ) : null}
          {action.verification === "inferred" ? (
            <Badge variant="secondary">推断</Badge>
          ) : null}
        </div>

        <div>
          <p className="text-lg font-semibold text-slate-950">{action.title}</p>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            {action.description}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DetailPanel label="症状" value={action.symptom} />
          <DetailPanel label="根因" value={action.rootCause} />
          <DetailPanel label="动作" value={action.action} />
          <DetailPanel label="调整位置" value={action.whereToChange} />
        </div>

        <div className="rounded-[1.3rem] border border-emerald-200 bg-emerald-50/80 p-4">
          <p className="text-sm font-semibold text-emerald-900">预期影响</p>
          <p className="mt-2 text-sm leading-7 text-emerald-800">
            {action.expectedImpact}
          </p>
        </div>

        {action.linkedFindingIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <ArrowRight className="h-4 w-4" />
            <span>关联发现：{action.linkedFindingIds.join(", ")}</span>
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
    <Card className="border-slate-200/80 bg-white/90">
      <CardHeader className="border-b border-slate-200/80">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={section.id === "P0" ? "destructive" : "outline"}>
            {section.label}
          </Badge>
          <Badge variant="outline">{section.items.length} 项</Badge>
        </div>
        <CardTitle className="text-lg text-slate-950">
          {formatActionPriorityDescription(section.id)}
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
    <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm leading-7 text-slate-700">{value}</p>
    </div>
  );
}

function CoverageRow({ item }: { item: ListingDiagnosticsSourceCoverageItem }) {
  const isVerifiedSource = item.source === "Amazon SP-API";

  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="font-medium text-slate-900">{item.label}</p>
          <p className="mt-1 text-xs text-slate-500">{formatSourceLabel(item.source)}</p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={item.status === "covered" ? "secondary" : "outline"}>
            {formatSourceStatusLabel(item.status)}
          </Badge>
          {isVerifiedSource ? <Badge variant="secondary">已验证</Badge> : null}
          {item.inferred ? <Badge variant="outline">推断</Badge> : null}
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

function EvidenceTableRow({ row }: { row: ListingDiagnosticsEvidenceRow }) {
  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="font-medium text-slate-900">{row.signal}</p>
          <p className="mt-1 text-xs text-slate-500">{formatEvidenceCategoryLabel(row.category)}</p>
        </div>
      </TableCell>
      <TableCell className="text-sm text-slate-700">{formatSourceLabel(row.source)}</TableCell>
      <TableCell>{Math.round(row.confidence * 100)}%</TableCell>
      <TableCell>
        <Badge variant={getEvidenceBadgeVariant(row.verification)}>
          {formatVerificationLabel(row.verification)}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-normal text-sm leading-7 text-slate-600">
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
    <Card className="border-slate-200/80 bg-white/90">
      <CardHeader className="border-b border-slate-200/80">
        <CardTitle className="text-xl text-slate-950">根因队列</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {items.length > 0 ? (
          items.slice(0, 4).map((item) => (
            <div
              key={item.label}
              className="rounded-[1.4rem] border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.topPriority === "P0" ? "destructive" : "outline"}>
                  {item.topPriority}
                </Badge>
                <Badge variant="outline">{formatRootCauseCategoryLabel(item.category)}</Badge>
                <Badge variant="outline">{formatImpactTypeLabel(item.primaryImpactType)}</Badge>
                <Badge variant="outline">{item.findingCount} 条发现</Badge>
                <Badge
                  variant={item.leadVerification === "verified" ? "secondary" : "outline"}
                >
                  {formatVerificationLabel(item.leadVerification)}
                </Badge>
                {item.verifiedCount > 0 ? (
                  <Badge variant="secondary">{item.verifiedCount} 个已验证</Badge>
                ) : null}
                {item.inferredCount > 0 ? (
                  <Badge variant="outline">{item.inferredCount} 个推断</Badge>
                ) : null}
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900">
                主导问题：{item.leadFindingTitle}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <DetailPanel label="症状" value={item.symptom} />
                <DetailPanel label="根因" value={item.rootCause} />
                <DetailPanel label="下一步动作" value={item.nextMove} />
                <DetailPanel label="调整位置" value={item.recommendedSurface} />
              </div>
              <div className="mt-3 rounded-[1.2rem] border border-emerald-200 bg-emerald-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                  预期影响
                </p>
                <p className="mt-2 text-sm leading-7 text-emerald-800">
                  {item.expectedImpact}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm leading-7 text-slate-500">
            本次运行暂无根因队列。
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
    <Card className="border-slate-200/80 bg-white/90">
      <CardHeader className="border-b border-slate-200/80">
        <CardTitle className="text-xl text-slate-950">业务影响队列</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item.impactType}
              className="rounded-[1.4rem] border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.topPriority === "P0" ? "destructive" : "outline"}>
                  {item.topPriority}
                </Badge>
                <Badge variant="outline">{formatImpactTypeLabel(item.impactType)}</Badge>
                <Badge variant="outline">{item.findingCount} 条发现</Badge>
                <Badge
                  variant={item.leadVerification === "verified" ? "secondary" : "outline"}
                >
                  {formatVerificationLabel(item.leadVerification)}
                </Badge>
                {item.verifiedCount > 0 ? (
                  <Badge variant="secondary">{item.verifiedCount} 个已验证</Badge>
                ) : null}
                {item.inferredCount > 0 ? (
                  <Badge variant="outline">{item.inferredCount} 个推断</Badge>
                ) : null}
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900">
                主导问题：{item.leadFindingTitle}
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-700">{item.headline}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <DetailPanel
                  label="主导根因"
                  value={formatRootCauseCategoryLabel(item.topRootCauseCategory)}
                />
                <DetailPanel label="下一步动作" value={item.nextMove} />
                <DetailPanel label="调整位置" value={item.recommendedSurface} />
                <DetailPanel label="预期影响" value={item.expectedImpact} />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm leading-7 text-slate-500">
            本次运行暂无业务影响队列。
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
    return "暂无";
  }

  return `$${value.toFixed(2)}`;
}

function formatDecimal(value: number | null): string {
  if (value === null) {
    return "暂无";
  }

  return value.toFixed(2);
}

function formatWhole(value: number | null): string {
  if (value === null) {
    return "暂无";
  }

  return Math.round(value).toLocaleString();
}

function formatResultStatusLabel(status: string): string {
  switch (status) {
    case "success":
      return "成功";
    case "partial":
      return "部分结果";
    case "loading":
      return "加载中";
    case "error":
      return "失败";
    default:
      return "未开始";
  }
}

function formatSpApiModeLabel(mode: string): string {
  switch (mode) {
    case "server-default":
      return "服务器默认";
    case "runtime":
      return "运行时";
    default:
      return "关闭";
  }
}

function formatSeverityLabel(severity: string): string {
  switch (severity) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    default:
      return severity;
  }
}

function formatImpactTypeLabel(impactType: string): string {
  switch (impactType) {
    case "visibility":
      return "曝光";
    case "click":
      return "点击";
    case "conversion":
      return "转化";
    case "buyability":
      return "可购买性";
    case "compliance":
      return "合规";
    default:
      return impactType;
  }
}

function formatDimensionLabelZh(dimensionId: string): string {
  switch (dimensionId) {
    case "content-coverage":
      return "内容覆盖";
    case "keyword-opportunity":
      return "关键词机会";
    case "review-signal":
      return "评价信号";
    case "buyability-discoverability":
      return "可购买性与可发现性";
    case "market-position":
      return "市场位置";
    default:
      return dimensionId;
  }
}

function formatRootCauseCategoryLabel(category: string | null): string {
  switch (category) {
    case "inventory":
      return "库存";
    case "offer":
      return "报价";
    case "pricing":
      return "定价";
    case "buy-box":
      return "Buy Box";
    case "restrictions":
      return "限制";
    case "missing-attributes":
      return "缺失属性";
    case "variation-issues":
      return "变体问题";
    case "listing-status":
      return "Listing 状态";
    case null:
      return "通用";
    default:
      return category;
  }
}

function formatVerificationLabel(verification: string): string {
  switch (verification) {
    case "verified":
      return "已验证";
    case "inferred":
      return "推断";
    case "direct":
      return "直接";
    default:
      return verification;
  }
}

function formatSourceStatusLabel(status: string): string {
  switch (status) {
    case "covered":
      return "已覆盖";
    case "partial":
      return "部分";
    case "missing":
      return "缺失";
    default:
      return status;
  }
}

function formatSourceLabel(source: string): string {
  switch (source) {
    case "Derived benchmark":
      return "推导基准";
    default:
      return source;
  }
}

function formatEvidenceCategoryLabel(category: ListingDiagnosticsEvidenceRow["category"]): string {
  switch (category) {
    case "finding":
      return "诊断发现";
    case "coverage":
      return "覆盖情况";
  }
}

function formatActionPriorityDescription(priority: ListingDiagnosticsActionPlanSection["id"]): string {
  switch (priority) {
    case "P0":
      return "立即处理。这些项目正在阻塞可购买性、合规或其他关键结果。";
    case "P1":
      return "下一步处理。P0 阻塞项受控后，应尽快推进这些项目。";
    case "P2":
      return "持续观察或后续批量处理。这些项目重要，但不应挤占更高影响的问题。";
  }
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
