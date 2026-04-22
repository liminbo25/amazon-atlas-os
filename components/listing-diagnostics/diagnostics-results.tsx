"use client";

import { useDeferredValue, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  DatabaseZap,
  LoaderCircle,
  Radar,
  Sparkles,
} from "lucide-react";
import { DiagnosticsExportControls } from "@/components/listing-diagnostics/diagnostics-export-controls";
import { OperatorReportView } from "@/components/listing-diagnostics/operator-report-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildListingDiagnosticsEvidenceRows } from "@/lib/listing-diagnostics/reporting";
import type {
  ListingDiagnosticsResult,
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
            <p className="text-lg font-semibold text-slate-950">正在生成诊断报告</p>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">
              正在拉取 SellerSprite 的 Listing、评论和关键词信号，并重组为中文运营诊断、优化方案与可导出的工作表。
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
                {errorCode ? <Badge variant="outline">code: {errorCode}</Badge> : null}
              </div>
              <p className="text-sm text-red-900">{errorMessage}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={onRetry}>重新分析</Button>
            <Button variant="outline" onClick={onClearError}>
              清空错误
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
            <p className="text-lg font-semibold text-slate-950">还没有诊断结果</p>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">
              输入目标 ASIN 和 2-3 个竞品 ASIN 后开始分析，我会直接输出中文诊断、关键词竞争、优化方案和行动清单。
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const report = visibleResult.operatorReport;
  const evidenceRows = buildListingDiagnosticsEvidenceRows(visibleResult);
  const confirmedIssueCount = report.issues.filter(
    (item) => item.issueStatus === "已确认问题" || item.evidenceLevel !== "待验证假设"
  ).length;
  const hypothesisIssueCount = report.issues.length - confirmedIssueCount;
  const verifiedFindingCount =
    visibleResult.spApiVerification?.verifiedFindingIds.length ?? 0;
  const benchmarkMetrics = [
    {
      label: "竞品均价",
      value: formatCurrency(visibleResult.benchmark.averagePrice),
    },
    {
      label: "竞品均分",
      value: formatDecimal(visibleResult.benchmark.averageRating),
    },
    {
      label: "竞品均评数",
      value: formatWhole(visibleResult.benchmark.averageReviews),
    },
    {
      label: "竞品关键词均值",
      value: formatWhole(visibleResult.benchmark.averageKeywordCount),
    },
  ];

  return (
    <div className="space-y-6">
      {visibleResult.status === "partial" ? (
        <WarningCard
          title="当前结果包含待验证信号"
          description="部分数据源覆盖不完整，或某些判断依赖竞品代理信号，因此我已经把这类问题单列成“待验证假设”，不会和已确认问题混写。"
          tone="amber"
          badges={[
            `证据可信度 ${visibleResult.confidence}%`,
            `待验证假设 ${hypothesisIssueCount} 个`,
          ]}
          lines={visibleResult.warnings}
        />
      ) : null}

      {visibleResult.spApiVerification?.scoreCapApplied ? (
        <WarningCard
          title="存在 Amazon 已验证阻塞项"
          description="Amazon SP-API 已确认当前 ASIN 存在目录或账号侧阻塞，这类问题需要优先处理，否则继续扩流量或重写文案的收益会被明显削弱。"
          tone="red"
          badges={[
            `规则分上限 ${visibleResult.spApiVerification.scoreCeiling ?? "-"}/100`,
            `已验证问题 ${verifiedFindingCount} 个`,
          ]}
        />
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
                {visibleResult.status === "partial" ? "部分结果" : "结果完整"}
              </Badge>
              {visibleResult.spApiVerification?.enabled ? (
                <Badge variant="outline">
                  SP-API {visibleResult.spApiVerification.mode}
                </Badge>
              ) : null}
              {verifiedFindingCount > 0 ? (
                <Badge variant="secondary">Amazon 已验证 {verifiedFindingCount} 项</Badge>
              ) : null}
            </div>
            <CardTitle className="text-2xl text-slate-950">{report.headline}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <p className="text-sm leading-7 text-slate-600">{report.summary}</p>

            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard
                label="综合评分"
                value={`${visibleResult.overallScore}/100`}
                icon={<BarChart3 className="h-4 w-4" />}
              />
              <MetricCard
                label="证据可信度"
                value={`${visibleResult.confidence}%`}
                icon={<Sparkles className="h-4 w-4" />}
              />
              <MetricCard
                label="竞品样本"
                value={String(visibleResult.benchmark.competitorCount)}
                icon={<Radar className="h-4 w-4" />}
              />
              <MetricCard
                label="已确认问题"
                value={`${confirmedIssueCount} 个`}
                icon={<DatabaseZap className="h-4 w-4" />}
              />
            </div>

            <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/75 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">主诊断</p>
              <p className="mt-2 leading-7">{report.leadingDiagnosis}</p>
              <p className="mt-4 font-semibold text-slate-900">数据质量说明</p>
              <p className="mt-2 leading-7">{report.dataQuality}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader className="border-b border-slate-200/80">
            <CardTitle className="text-xl text-slate-950">对标摘要</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {benchmarkMetrics.map((item) => (
                <BenchmarkValue key={item.label} label={item.label} value={item.value} />
              ))}
            </div>

            <div className="space-y-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">核心结论</p>
              <div className="grid gap-2 text-sm leading-7 text-slate-700">
                {report.keyTakeaways.map((item) => (
                  <p key={item}>- {item}</p>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">竞品高频关键词</p>
              <div className="flex flex-wrap gap-2">
                {visibleResult.benchmark.topKeywords.length > 0 ? (
                  visibleResult.benchmark.topKeywords.map((keyword) => (
                    <Badge key={keyword} variant="outline">
                      {keyword}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">当前竞品关键词样本不足。</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DiagnosticsExportControls result={visibleResult} />

      <OperatorReportView result={visibleResult} evidenceRows={evidenceRows} />
    </div>
  );
}

function WarningCard({
  title,
  description,
  tone,
  badges,
  lines = [],
}: {
  title: string;
  description: string;
  tone: "amber" | "red";
  badges: string[];
  lines?: string[];
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50/90 text-red-900"
      : "border-amber-200 bg-amber-50/90 text-amber-900";
  const iconClass = tone === "red" ? "text-red-700" : "text-amber-700";

  return (
    <Card className={toneClass}>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start gap-3">
          <span
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ${iconClass}`}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{title}</p>
              {badges.map((badge) => (
                <Badge key={badge} variant="outline">
                  {badge}
                </Badge>
              ))}
            </div>
            <p className="text-sm">{description}</p>
          </div>
        </div>

        {lines.length > 0 ? (
          <div className="grid gap-2 rounded-2xl border border-black/5 bg-white/80 p-4 text-sm text-slate-700">
            {lines.map((line) => (
              <p key={line}>- {line}</p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
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

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "待补充";
  }

  return `$${value.toFixed(2)}`;
}

function formatDecimal(value: number | null): string {
  if (value === null) {
    return "待补充";
  }

  return value.toFixed(2);
}

function formatWhole(value: number | null): string {
  if (value === null) {
    return "待补充";
  }

  return Math.round(value).toLocaleString("en-US");
}
