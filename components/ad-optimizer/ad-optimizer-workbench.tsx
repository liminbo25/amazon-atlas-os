"use client";

import { startTransition, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  DatabaseZap,
  FileSpreadsheet,
  Play,
  Sparkles,
  Upload,
} from "lucide-react";
import { AdOptimizerCharts } from "@/components/ad-optimizer/ad-optimizer-charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  buildAdOptimizerAnalysisFromFiles,
  DEFAULT_ANALYSIS_CONTROLS,
  formatCurrency,
  formatRate,
} from "@/lib/ad-optimizer/analysis";
import type { AdOptimizerAnalysisResult } from "@/lib/ad-optimizer/types";
import {
  exportAdOptimizerBulkWorkbookXlsx,
  exportAdOptimizerWorkbookXlsx,
  type BulkOperationLanguage,
} from "@/lib/export/ad-optimizer-export";

type UploadCardProps = {
  title: string;
  description: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
};

function UploadCard({ title, description, hint, file, onChange }: UploadCardProps) {
  return (
    <label className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(16,32,51,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-kicker">{title}</p>
          <h3 className="mt-3 text-xl font-semibold text-slate-950">{description}</h3>
        </div>
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <Upload className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-4 text-sm leading-7 text-slate-500">{hint}</p>

      <div className="mt-5 rounded-[1.3rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-4">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
        <p className="mt-3 text-sm text-slate-500">
          {file ? `已选择：${file.name}` : "尚未选择文件"}
        </p>
      </div>
    </label>
  );
}

function SummaryCard({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5">
      <p className="section-kicker">{label}</p>
      <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
        {value}
      </h3>
      <p className="mt-2 text-sm leading-7 text-slate-500">{help}</p>
    </div>
  );
}

export function AdOptimizerWorkbench() {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [previousFile, setPreviousFile] = useState<File | null>(null);
  const [placementFile, setPlacementFile] = useState<File | null>(null);
  const [bulkIdentityFile, setBulkIdentityFile] = useState<File | null>(null);
  const [controls, setControls] = useState(DEFAULT_ANALYSIS_CONTROLS);
  const [bulkOperationLanguage, setBulkOperationLanguage] =
    useState<BulkOperationLanguage>("english");
  const [message, setMessage] = useState(
    "上传当前周期搜索词报告后即可开始分析；如果同时上传上周期和 bulk 身份表，结果会更完整。"
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState<"" | "report" | "draft" | "direct">(
    ""
  );
  const [result, setResult] = useState<AdOptimizerAnalysisResult | null>(null);

  const placementActionCount = result
    ? result.recommendations.filter((item) => item.type.includes("placement")).length
    : 0;
  const readyCount = result?.mappingCoverage?.readyRecommendations ?? 0;

  async function handleAnalyze() {
    if (!currentFile) {
      setMessage("请先上传当前周期搜索词报告。");
      return;
    }

    setIsRunning(true);
    setMessage("正在解析报表、汇总搜索词、回填 bulk 身份并生成动作建议...");

    try {
      const nextResult = await buildAdOptimizerAnalysisFromFiles({
        currentFile,
        previousFile,
        placementFile,
        bulkIdentityFile,
        controls,
      });

      startTransition(() => {
        setResult(nextResult);
        setMessage(
          `分析完成：共生成 ${nextResult.recommendations.length} 条动作建议，其中 ${nextResult.mappingCoverage?.readyRecommendations ?? 0} 条可直接写入 bulk。`
        );
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "广告优化分析失败。");
    } finally {
      setIsRunning(false);
    }
  }

  async function handleExport(mode: "report" | "draft" | "direct") {
    if (!result) {
      return;
    }

    setIsExporting(mode);
    try {
      if (mode === "report") {
        await exportAdOptimizerWorkbookXlsx(result);
      } else {
        await exportAdOptimizerBulkWorkbookXlsx(result, {
          mode,
          operationLanguage: bulkOperationLanguage,
        });
      }
      setMessage("导出已触发，你可以直接检查本地下传文件。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败。");
    } finally {
      setIsExporting("");
    }
  }

  return (
    <section className="page-shell mt-8 pb-10">
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="glass-panel p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-300 text-slate-950">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="section-kicker">执行路径</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                从搜索词报表直接生成可执行动作
              </h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <InfoTile
              index="01"
              title="本地分析"
              description="先把 Excel 上传、解析、规则和导出这条链路跑稳，不依赖 API。"
            />
            <InfoTile
              index="02"
              title="身份补齐"
              description="用 bulk 表回填 campaign、ad group、keyword、商品定向和 placement 调整。"
            />
            <InfoTile
              index="03"
              title="双轨导出"
              description="同时给建议工作簿和 bulk 导出，未补齐项会单独进入 Review。"
            />
          </div>
        </article>

        <article className="glass-panel p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <DatabaseZap className="h-5 w-5" />
            </div>
            <div>
              <p className="section-kicker">规则控制</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                先把策略阈值卡住
              </h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <ControlField
              label="目标 ACOS %"
              value={Math.round(controls.targetAcos * 100)}
              onChange={(value) =>
                setControls((current) => ({
                  ...current,
                  targetAcos: value / 100,
                }))
              }
            />
            <ControlField
              label="捞词最少订单"
              value={controls.minHarvestOrders}
              onChange={(value) =>
                setControls((current) => ({
                  ...current,
                  minHarvestOrders: value,
                }))
              }
            />
            <ControlField
              label="否词最少点击"
              value={controls.minNegateClicks}
              onChange={(value) =>
                setControls((current) => ({
                  ...current,
                  minNegateClicks: value,
                }))
              }
            />
            <ControlField
              label="调价最少点击"
              value={controls.minBidClicks}
              onChange={(value) =>
                setControls((current) => ({
                  ...current,
                  minBidClicks: value,
                }))
              }
            />
          </div>

          <Button
            onClick={() => void handleAnalyze()}
            disabled={isRunning}
            className="mt-6 h-11 w-full rounded-full bg-slate-950 text-white hover:bg-slate-800"
          >
            <Play className="mr-2 h-4 w-4" />
            {isRunning ? "分析中..." : "运行广告优化"}
          </Button>

          <p className="mt-4 rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-600">
            {message}
          </p>
        </article>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <UploadCard
          title="Current STR"
          description="当前周期搜索词"
          hint="必传。用于生成捞词、否词、调价和当前表现摘要。"
          file={currentFile}
          onChange={setCurrentFile}
        />
        <UploadCard
          title="Previous STR"
          description="上周期搜索词"
          hint="可选。用于对比 spend、sales、orders 趋势。"
          file={previousFile}
          onChange={setPreviousFile}
        />
        <UploadCard
          title="Placement"
          description="广告位报表"
          hint="可选。上传真实 placement 报表后，会额外触发广告位系数建议。"
          file={placementFile}
          onChange={setPlacementFile}
        />
        <UploadCard
          title="Bulk Identity"
          description="Bulk 身份表"
          hint="强烈建议上传。用于补齐 ID，并支持直接可上传的 bulk 导出。"
          file={bulkIdentityFile}
          onChange={setBulkIdentityFile}
        />
      </div>

      {result ? (
        <div className="mt-8 space-y-6">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="当前花费"
              value={formatCurrency(result.summary.current.cost)}
              help={`销售额 ${formatCurrency(result.summary.current.sales)}，订单 ${result.summary.current.orders}`}
            />
            <SummaryCard
              label="当前 ACOS"
              value={formatRate(result.summary.current.acos)}
              help={`ROAS ${result.summary.current.roas.toFixed(2)}，CTR ${formatRate(result.summary.current.ctr)}`}
            />
            <SummaryCard
              label="动作建议"
              value={`${result.recommendations.length} 条`}
              help={`可直接进 bulk ${readyCount} 条`}
            />
            <SummaryCard
              label="广告位动作"
              value={`${placementActionCount} 条`}
              help={
                result.topPlacements.length > 0
                  ? `识别到 ${result.topPlacements.length} 个 placement 聚合结果`
                  : "当前未识别到真实 placement 维度"
              }
            />
          </div>

          <div className="glass-panel p-6 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="section-kicker">导出</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                  把建议转成可交付文件
                </h2>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  “Bulk 草稿”保留全部动作；“可上传 Bulk”只保留已补齐关键身份字段的动作。
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
                <p className="section-kicker">Bulk 操作值</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ToggleChip
                    active={bulkOperationLanguage === "english"}
                    label="EN Create/Update"
                    onClick={() => setBulkOperationLanguage("english")}
                  />
                  <ToggleChip
                    active={bulkOperationLanguage === "chinese"}
                    label="中文 创建/更新"
                    onClick={() => setBulkOperationLanguage("chinese")}
                  />
                </div>
                <p className="mt-3 text-xs leading-6 text-slate-500">
                  默认建议使用英文操作值；中文模式属于兼容选项，先小批量抽样验证更稳。
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                onClick={() => void handleExport("report")}
                disabled={isExporting !== ""}
                variant="outline"
                className="h-11 rounded-full px-5"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {isExporting === "report" ? "导出中..." : "导出建议工作簿"}
              </Button>
              <Button
                onClick={() => void handleExport("draft")}
                disabled={isExporting !== ""}
                variant="outline"
                className="h-11 rounded-full px-5"
              >
                <ArrowDownToLine className="mr-2 h-4 w-4" />
                {isExporting === "draft" ? "导出中..." : "导出 Bulk 草稿"}
              </Button>
              <Button
                onClick={() => void handleExport("direct")}
                disabled={isExporting !== "" || readyCount === 0}
                className="h-11 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800"
              >
                <ArrowDownToLine className="mr-2 h-4 w-4" />
                {isExporting === "direct" ? "导出中..." : "导出可上传 Bulk"}
              </Button>
            </div>
          </div>

          <AdOptimizerCharts result={result} />

          <div className="glass-panel p-6 sm:p-7">
            <Tabs defaultValue="actions">
              <TabsList variant="line">
                <TabsTrigger value="actions">动作建议</TabsTrigger>
                <TabsTrigger value="terms">搜索词</TabsTrigger>
                <TabsTrigger value="targets">投放对象</TabsTrigger>
                <TabsTrigger value="placements">广告位</TabsTrigger>
                <TabsTrigger value="notes">说明</TabsTrigger>
              </TabsList>

              <TabsContent value="actions" className="mt-6">
                <DataTable
                  headers={[
                    "动作",
                    "优先级",
                    "状态",
                    "Campaign / Ad Group",
                    "Target",
                    "Search Term",
                    "建议",
                    "表现",
                  ]}
                  rows={result.recommendations.slice(0, 80).map((item) => [
                    item.actionLabel,
                    priorityLabel(item.priority),
                    item.status === "ready" ? "可执行" : "待复核",
                    <>
                      <p className="font-medium text-slate-950">{item.campaignName}</p>
                      <p className="mt-1 text-slate-500">{item.adGroupName || "-"}</p>
                    </>,
                    item.targetingText,
                    item.customerSearchTerm || "-",
                    renderSuggestion(item),
                    <>
                      <p>Clicks {item.current.clicks}</p>
                      <p>Orders {item.current.orders}</p>
                      <p>Spend {formatCurrency(item.current.cost)}</p>
                      <p>ACOS {formatRate(item.current.acos)}</p>
                    </>,
                  ])}
                />
              </TabsContent>

              <TabsContent value="terms" className="mt-6">
                <DataTable
                  headers={[
                    "Campaign / Ad Group",
                    "Target",
                    "Search Term",
                    "Clicks",
                    "Orders",
                    "Spend",
                    "Sales",
                    "Trend",
                  ]}
                  rows={result.topSearchTerms.slice(0, 80).map((item) => [
                    <>
                      <p className="font-medium text-slate-950">{item.campaignName}</p>
                      <p className="mt-1 text-slate-500">{item.adGroupName}</p>
                    </>,
                    item.targetingText,
                    item.customerSearchTerm,
                    item.current.clicks,
                    item.current.orders,
                    formatCurrency(item.current.cost),
                    formatCurrency(item.current.sales),
                    <>
                      <p>Spend {formatRate(item.deltaCostPct)}</p>
                      <p>Sales {formatRate(item.deltaSalesPct)}</p>
                      <p>
                        Orders {item.deltaOrders >= 0 ? "+" : ""}
                        {item.deltaOrders}
                      </p>
                    </>,
                  ])}
                />
              </TabsContent>

              <TabsContent value="targets" className="mt-6">
                <DataTable
                  headers={[
                    "Campaign / Ad Group",
                    "Target",
                    "Type",
                    "Bid",
                    "Clicks",
                    "Orders",
                    "Spend",
                    "Sales",
                  ]}
                  rows={result.topTargets.slice(0, 80).map((item) => [
                    <>
                      <p className="font-medium text-slate-950">{item.campaignName}</p>
                      <p className="mt-1 text-slate-500">{item.adGroupName}</p>
                    </>,
                    item.targetingText,
                    targetingLabel(item.targetingType),
                    item.currentBid !== null ? formatCurrency(item.currentBid) : "-",
                    item.current.clicks,
                    item.current.orders,
                    formatCurrency(item.current.cost),
                    formatCurrency(item.current.sales),
                  ])}
                />
              </TabsContent>

              <TabsContent value="placements" className="mt-6">
                <DataTable
                  headers={[
                    "Campaign",
                    "Placement",
                    "Current %",
                    "Clicks",
                    "Orders",
                    "Spend",
                    "Sales",
                    "ACOS",
                  ]}
                  rows={result.topPlacements.slice(0, 60).map((item) => [
                    item.campaignName,
                    item.placementName,
                    item.currentAdjustment !== null ? `${item.currentAdjustment}%` : "-",
                    item.current.clicks,
                    item.current.orders,
                    formatCurrency(item.current.cost),
                    formatCurrency(item.current.sales),
                    formatRate(item.current.acos),
                  ])}
                  emptyText="当前没有可展示的 placement 聚合数据。"
                />
              </TabsContent>

              <TabsContent value="notes" className="mt-6">
                <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                  <article className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                    <p className="section-kicker">运行提示</p>
                    <div className="mt-4 space-y-3">
                      {result.notices.length > 0 ? (
                        result.notices.map((notice, index) => (
                          <div
                            key={`${notice}-${index}`}
                            className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-600"
                          >
                            {notice}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-600">
                          当前没有额外提示。
                        </div>
                      )}
                    </div>
                  </article>

                  <article className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                    <p className="section-kicker">文件概况</p>
                    <div className="mt-4 space-y-3 text-sm text-slate-600">
                      <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
                        当前搜索词：{result.files.current.fileName} / {result.files.current.rowCount} 行
                      </div>
                      <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
                        上周期：{result.files.previous?.fileName ?? "未上传"} / {result.files.previous?.rowCount ?? 0} 行
                      </div>
                      <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
                        广告位：{result.files.placement?.fileName ?? "未上传"}
                      </div>
                      <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
                        Bulk 身份：{result.files.bulkIdentity?.fileName ?? "未上传"}
                      </div>
                      <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
                        Ready / Review：{result.mappingCoverage?.readyRecommendations ?? 0} / {result.mappingCoverage?.reviewRecommendations ?? result.reviewItems.length}
                      </div>
                    </div>
                  </article>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ControlField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
      <span className="section-kicker">{label}</span>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        className="mt-3 h-11 rounded-2xl border-slate-200 bg-white px-4"
      />
    </label>
  );
}

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"
      }`}
    >
      {label}
    </button>
  );
}

function InfoTile({
  index,
  title,
  description,
}: {
  index: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
      <p className="section-kicker">{index}</p>
      <p className="mt-3 text-lg font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-7 text-slate-500">{description}</p>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  emptyText = "当前没有数据。",
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
  emptyText?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={`${rowIndex}-${cellIndex}`} className="whitespace-normal">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={headers.length} className="py-8 text-center text-slate-500">
                {emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function renderSuggestion(item: AdOptimizerAnalysisResult["recommendations"][number]) {
  if (item.suggestedPlacementAdjustment !== null) {
    return `${item.currentPlacementAdjustment ?? 0}% -> ${item.suggestedPlacementAdjustment}%`;
  }
  if (item.suggestedTargetExpression) {
    return `${item.suggestedTargetExpression} / ${formatCurrency(item.suggestedBid ?? 0)}`;
  }
  if (item.suggestedBid !== null) {
    return `${item.currentBid !== null ? `${formatCurrency(item.currentBid)} -> ` : ""}${formatCurrency(item.suggestedBid)}`;
  }
  if (item.suggestedMatchType === "negative-exact") {
    return "加否定精准";
  }
  if (item.suggestedMatchType === "exact") {
    return "新建精准词";
  }
  return "-";
}

function priorityLabel(value: "high" | "medium" | "low") {
  if (value === "high") {
    return "高";
  }
  if (value === "medium") {
    return "中";
  }
  return "低";
}

function targetingLabel(value: "keyword" | "auto" | "product" | "unknown") {
  if (value === "keyword") {
    return "关键词";
  }
  if (value === "auto") {
    return "自动";
  }
  if (value === "product") {
    return "商品定向";
  }
  return "未知";
}
