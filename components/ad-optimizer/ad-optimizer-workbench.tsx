"use client";

import { startTransition, useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  CheckCheck,
  DatabaseZap,
  FileSpreadsheet,
  Filter,
  NotebookPen,
  Play,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import { AdOptimizerCharts } from "@/components/ad-optimizer/ad-optimizer-charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  buildAdOptimizerAnalysisFromFiles,
  DEFAULT_ANALYSIS_CONTROLS,
  formatCurrency,
  formatRate,
} from "@/lib/ad-optimizer/analysis";
import {
  buildControlsFromTemplate,
  STRATEGY_TEMPLATES,
} from "@/lib/ad-optimizer/strategy-templates";
import type {
  AdOptimizerAnalysisResult,
  AnalysisControls,
  RecommendationLifecycleMap,
  RecommendationLifecycleStatus,
  StrategyTemplateId,
} from "@/lib/ad-optimizer/types";
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

type WorkbenchLogEntry = {
  at: string;
  label: string;
  detail: string;
};

type DiagnosticCardItem = {
  key: string;
  label: string;
  fileName: string;
  sheetName: string;
  rowCount: number;
  status: string;
  tone: "high" | "medium" | "low";
  detail: string;
  warning: string;
};

type CoverageCardItem = {
  key: string;
  label: string;
  value: string;
  detail: string;
};

type RecommendationFilter =
  | "all"
  | "new"
  | "accepted"
  | "ignored"
  | "needs_review";

type PersistedWorkbenchState = {
  version: number;
  savedAt: string;
  result: AdOptimizerAnalysisResult | null;
  lifecycleMap: RecommendationLifecycleMap;
  activityLog: WorkbenchLogEntry[];
  filter: RecommendationFilter;
  bulkOperationLanguage: BulkOperationLanguage;
  controls: AnalysisControls;
};

const WORKBENCH_STORAGE_KEY = "ad-optimizer/workbench/v1";

export function AdOptimizerWorkbench() {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [previousFile, setPreviousFile] = useState<File | null>(null);
  const [placementFile, setPlacementFile] = useState<File | null>(null);
  const [bulkIdentityFile, setBulkIdentityFile] = useState<File | null>(null);
  const [controls, setControls] = useState(DEFAULT_ANALYSIS_CONTROLS);
  const [bulkOperationLanguage, setBulkOperationLanguage] =
    useState<BulkOperationLanguage>("english");
  const [message, setMessage] = useState(
    "上传当前搜索词报表后即可开始分析；如果同时上传上周期、bulk 身份表和 placement 报表，结果会更完整。"
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState<"" | "report" | "draft" | "direct">("");
  const [result, setResult] = useState<AdOptimizerAnalysisResult | null>(null);
  const [lifecycleMap, setLifecycleMap] = useState<RecommendationLifecycleMap>({});
  const [activityLog, setActivityLog] = useState<WorkbenchLogEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [filter, setFilter] = useState<RecommendationFilter>("all");
  const [restoredSessionAt, setRestoredSessionAt] = useState<string | null>(null);
  const [hasHydratedSession, setHasHydratedSession] = useState(false);

  const filteredRecommendations = result
    ? result.recommendations.filter((item) => matchesFilter(item.id, item.status, filter, lifecycleMap))
    : [];
  const selectedVisibleIds = filteredRecommendations
    .map((item) => item.id)
    .filter((id) => selectedIds.includes(id));
  const readyExportCount = result
    ? result.recommendations.filter(
        (item) =>
          item.bulkExportable &&
          item.type !== "watch_placement_modifier" &&
          lifecycleMap[item.id]?.status !== "ignored"
      ).length
    : 0;
  const placementActionCount = result
    ? result.recommendations.filter((item) => item.surface === "placement").length
    : 0;
  const governanceActionCount = result?.governanceRisks.length ?? 0;
  const budgetActionCount = result
    ? result.recommendations.filter((item) => item.surface === "budget").length
    : 0;
  const acceptedCount = Object.values(lifecycleMap).filter((item) => item.status === "accepted").length;
  const ignoredCount = Object.values(lifecycleMap).filter((item) => item.status === "ignored").length;

  useEffect(() => {
    const persisted = loadPersistedWorkbenchState();
    if (persisted) {
      setResult(persisted.result);
      setLifecycleMap(persisted.lifecycleMap);
      setActivityLog(persisted.activityLog);
      setFilter(persisted.filter);
      setBulkOperationLanguage(persisted.bulkOperationLanguage);
      setControls(persisted.controls);
      setRestoredSessionAt(persisted.result ? persisted.savedAt : null);
      if (persisted.result) {
        setMessage("已恢复最近一次分析记录，可继续处理建议或直接导出。");
      }
    }
    setHasHydratedSession(true);
  }, []);

  useEffect(() => {
    if (!hasHydratedSession) {
      return;
    }
    persistWorkbenchState({
      version: 1,
      savedAt: new Date().toISOString(),
      result,
      lifecycleMap,
      activityLog,
      filter,
      bulkOperationLanguage,
      controls,
    });
  }, [
    activityLog,
    bulkOperationLanguage,
    controls,
    filter,
    hasHydratedSession,
    lifecycleMap,
    result,
  ]);

  async function handleAnalyze() {
    if (!currentFile) {
      setMessage("请先上传当前周期搜索词报表。");
      return;
    }

    setIsRunning(true);
    setMessage("正在解析报表、聚合 campaign / ad group、识别 placement 并生成治理与预算建议...");

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
        setLifecycleMap(buildLifecycleMap(nextResult));
        setActivityLog([
          {
            at: nextResult.generatedAt,
            label: "生成建议",
            detail: `本次共生成 ${nextResult.recommendations.length} 条建议，Review ${nextResult.reviewItems.length} 条。`,
          },
        ]);
        setSelectedIds([]);
        setNoteDraft("");
        setFilter("all");
        setRestoredSessionAt(null);
        setMessage(
          `分析完成：共生成 ${nextResult.recommendations.length} 条建议，其中 ${nextResult.reviewItems.length} 条进入 Review。`
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
        await exportAdOptimizerWorkbookXlsx(result, {
          lifecycleMap,
          operationLog: activityLog,
        });
      } else {
        await exportAdOptimizerBulkWorkbookXlsx(result, {
          mode,
          operationLanguage: bulkOperationLanguage,
          lifecycleMap,
          operationLog: activityLog,
        });
      }
      setActivityLog((current) => [
        {
          at: new Date().toISOString(),
          label:
            mode === "report"
              ? "导出建议工作簿"
              : mode === "draft"
                ? "导出 Bulk 草稿"
                : "导出 Bulk Ready",
          detail: `导出模式：${mode}${mode === "report" ? "" : ` / 操作列语言：${bulkOperationLanguage}`}`,
        },
        ...current,
      ]);
      setMessage("导出已触发，你可以检查本地下载文件。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败。");
    } finally {
      setIsExporting("");
    }
  }

  function handleTemplateChange(templateId: StrategyTemplateId) {
    setControls(buildControlsFromTemplate(templateId));
  }

  function handleClearSavedSession() {
    clearPersistedWorkbenchState();
    setResult(null);
    setLifecycleMap({});
    setActivityLog([]);
    setSelectedIds([]);
    setNoteDraft("");
    setFilter("all");
    setRestoredSessionAt(null);
    setMessage("已清空最近一次分析记录。");
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  function toggleSelectVisible() {
    if (selectedVisibleIds.length === filteredRecommendations.length) {
      setSelectedIds((current) =>
        current.filter((id) => !filteredRecommendations.some((item) => item.id === id))
      );
      return;
    }
    setSelectedIds((current) => [
      ...new Set([...current, ...filteredRecommendations.map((item) => item.id)]),
    ]);
  }

  function updateLifecycleStatus(status: RecommendationLifecycleStatus, ids: string[]) {
    if (!result || ids.length === 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    const action = status === "accepted" ? "accepted" : "ignored";
    setLifecycleMap((current) => {
      const next = { ...current };
      for (const id of ids) {
        const previous = next[id];
        if (!previous) {
          continue;
        }
        next[id] = {
          ...previous,
          status,
          updatedAt: timestamp,
          history: [
            ...previous.history,
            {
              at: timestamp,
              action,
              detail: status === "accepted" ? "标记为已采纳" : "标记为已忽略",
            },
          ],
        };
      }
      return next;
    });
    setActivityLog((current) => [
      {
        at: timestamp,
        label: status === "accepted" ? "批量采纳" : "批量忽略",
        detail: `本次处理 ${ids.length} 条建议。`,
      },
      ...current,
    ]);
    setSelectedIds([]);
  }

  function applyNoteToSelection() {
    if (!noteDraft.trim() || selectedIds.length === 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    setLifecycleMap((current) => {
      const next = { ...current };
      for (const id of selectedIds) {
        const previous = next[id];
        if (!previous) {
          continue;
        }
        next[id] = {
          ...previous,
          note: noteDraft.trim(),
          updatedAt: timestamp,
          history: [
            ...previous.history,
            {
              at: timestamp,
              action: "note",
              detail: `备注：${noteDraft.trim()}`,
            },
          ],
        };
      }
      return next;
    });
    setActivityLog((current) => [
      {
        at: timestamp,
        label: "批量备注",
        detail: `为 ${selectedIds.length} 条建议添加备注。`,
      },
      ...current,
    ]);
    setNoteDraft("");
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
              title="真实报表接入"
              description="搜索词、bulk 身份和真实 placement 报表各自解析；误传 placement 时会清晰提示并安全降级。"
            />
            <InfoTile
              index="02"
              title="操盘策略"
              description="同一轮分析里统一输出收词、否词、竞价、placement、预算和防内耗治理建议。"
            />
            <InfoTile
              index="03"
              title="建议生命周期"
              description="批量采纳、批量忽略、备注和操作日志都在同一工作台里管理。"
            />
          </div>
        </article>

        <article className="glass-panel p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <DatabaseZap className="h-5 w-5" />
            </div>
            <div>
              <p className="section-kicker">策略控制</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                模板、利润与预算口径
              </h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
              <span className="section-kicker">策略模板</span>
              <Select
                value={controls.templateId}
                onValueChange={(value) => handleTemplateChange(value as StrategyTemplateId)}
              >
                <SelectTrigger className="mt-3 h-11 w-full rounded-2xl border-slate-200 bg-white px-4">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(STRATEGY_TEMPLATES).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {STRATEGY_TEMPLATES[controls.templateId].description}
              </p>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <PercentField
                label="目标 ACOS"
                value={controls.targetAcos}
                onChange={(value) =>
                  setControls((current) => ({
                    ...current,
                    targetAcos: value ?? current.targetAcos,
                  }))
                }
              />
              <PercentField
                label="毛利率"
                value={controls.grossMarginPct}
                placeholder="可留空"
                nullable
                onChange={(value) =>
                  setControls((current) => ({ ...current, grossMarginPct: value }))
                }
              />
              <PercentField
                label="利润安全缓冲"
                value={controls.profitSafetyMarginPct}
                onChange={(value) =>
                  setControls((current) => ({
                    ...current,
                    profitSafetyMarginPct: value ?? current.profitSafetyMarginPct,
                  }))
                }
              />
              <PercentField
                label="TACOS 目标"
                value={controls.tacosTarget}
                placeholder="可留空"
                nullable
                onChange={(value) =>
                  setControls((current) => ({ ...current, tacosTarget: value }))
                }
              />
              <IntegerField
                label="收词最少订单"
                value={controls.minHarvestOrders}
                onChange={(value) =>
                  setControls((current) => ({ ...current, minHarvestOrders: value }))
                }
              />
              <IntegerField
                label="否词最少点击"
                value={controls.minNegateClicks}
                onChange={(value) =>
                  setControls((current) => ({ ...current, minNegateClicks: value }))
                }
              />
            </div>
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
          {result ? (
            <div className="mt-4 flex flex-col gap-3 rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-950">
                  {restoredSessionAt ? "已恢复最近一次分析记录" : "最近一次分析会自动保存"}
                </p>
                <p className="mt-1 leading-6">
                  {restoredSessionAt
                    ? `最近保存时间 ${formatDateTime(restoredSessionAt)}，可以直接继续采纳、忽略、备注或导出。`
                    : "刷新页面后仍可继续处理建议，也可以手动清空这份最近记录。"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full px-4"
                onClick={handleClearSavedSession}
              >
                清空最近记录
              </Button>
            </div>
          ) : null}
        </article>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <UploadCard
          title="Current STR"
          description="当前周期搜索词"
          hint="必传。用于收词、否词、竞价、治理和总览汇总。"
          file={currentFile}
          onChange={setCurrentFile}
        />
        <UploadCard
          title="Previous STR"
          description="上周期搜索词"
          hint="可选。用于对比 spend、sales 和 orders 变化。"
          file={previousFile}
          onChange={setPreviousFile}
        />
        <UploadCard
          title="Placement"
          description="广告位报表"
          hint="可选。支持真实 placement 报表；如果上传的其实是搜索词报表，会给出明确降级提示。"
          file={placementFile}
          onChange={setPlacementFile}
        />
        <UploadCard
          title="Bulk Identity"
          description="Bulk 身份表"
          hint="强烈建议上传。用于补齐 campaign / ad group / target ID，并支持预算与 bulk-ready 导出。"
          file={bulkIdentityFile}
          onChange={setBulkIdentityFile}
        />
      </div>

      {result ? (
        <div className="mt-8 space-y-6">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="本期花费"
              value={formatCurrency(result.summary.current.cost)}
              help={`销售额 ${formatCurrency(result.summary.current.sales)} / 订单 ${result.summary.current.orders}`}
            />
            <SummaryCard
              label="ACOS / TACOS"
              value={`${formatRate(result.summary.current.acos)} / ${formatRate(
                result.summary.profitView.tacos
              )}`}
              help={result.summary.profitView.tacosIsEstimated ? "TACOS 为估算值" : "TACOS 使用显式目标"}
            />
            <SummaryCard
              label="估算利润"
              value={
                result.summary.profitView.estimatedProfit !== null
                  ? formatCurrency(result.summary.profitView.estimatedProfit)
                  : "未配置"
              }
              help={
                result.summary.profitView.profitSafeAcos !== null
                  ? `利润安全线 ${formatRate(result.summary.profitView.profitSafeAcos)}`
                  : "配置毛利率后可启用利润视角"
              }
            />
            <SummaryCard
              label="建议概况"
              value={`${result.recommendations.length} 条`}
              help={`已采纳 ${acceptedCount} / 已忽略 ${ignoredCount} / Ready ${readyExportCount}`}
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <SummaryCard
              label="Placement 动作"
              value={`${placementActionCount} 条`}
              help={
                result.placementDiagnostics.recognized
                  ? "真实 placement 报表已接入"
                  : result.placementDiagnostics.fallbackReason ?? "未上传 placement 报表"
              }
            />
            <SummaryCard
              label="预算动作"
              value={`${budgetActionCount} 条`}
              help={`${result.campaignRows.filter((item) => item.dailyBudget !== null).length} 个 campaign 有预算基线`}
            />
            <SummaryCard
              label="治理风险"
              value={`${governanceActionCount} 处`}
              help="覆盖重复抢词、结构重叠和防内耗否词场景"
            />
          </div>

          <div className="glass-panel p-6 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="section-kicker">导出</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                  把建议转成可交付文件
                </h2>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  报告工作簿会带上 lifecycle 和治理视图；bulk 草稿会排除 ignored 建议；bulk-ready 只保留可直接上传的动作。
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
                disabled={isExporting !== "" || readyExportCount === 0}
                className="h-11 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800"
              >
                <ArrowDownToLine className="mr-2 h-4 w-4" />
                {isExporting === "direct" ? "导出中..." : "导出 Bulk Ready"}
              </Button>
            </div>
          </div>

          <AdOptimizerCharts result={result} />

          <div className="glass-panel p-6 sm:p-7">
            <Tabs defaultValue="actions">
              <TabsList variant="line">
                <TabsTrigger value="actions">动作建议</TabsTrigger>
                <TabsTrigger value="campaigns">Campaign</TabsTrigger>
                <TabsTrigger value="adgroups">Ad Group</TabsTrigger>
                <TabsTrigger value="placements">Placement</TabsTrigger>
                <TabsTrigger value="governance">治理</TabsTrigger>
                <TabsTrigger value="notes">说明</TabsTrigger>
              </TabsList>

              <TabsContent value="actions" className="mt-6 space-y-6">
                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="section-kicker">建议管理</p>
                      <h3 className="mt-2 text-xl font-semibold text-slate-950">
                        批量采纳、忽略和备注
                      </h3>
                    </div>
                    <Button
                      variant="outline"
                      className="h-9 rounded-full px-4"
                      onClick={toggleSelectVisible}
                    >
                      <Filter className="mr-2 h-4 w-4" />
                      {selectedVisibleIds.length === filteredRecommendations.length && filteredRecommendations.length > 0
                        ? "取消当前筛选全选"
                        : "全选当前筛选"}
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      ["all", "全部"],
                      ["new", "待处理"],
                      ["accepted", "已采纳"],
                      ["ignored", "已忽略"],
                      ["needs_review", "需复核"],
                    ].map(([value, label]) => (
                      <ToggleChip
                        key={value}
                        active={filter === value}
                        label={label}
                        onClick={() => setFilter(value as RecommendationFilter)}
                      />
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                    <Textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="给已选建议添加备注，例如：先小批量验证、等本周库存回补后再执行。"
                      className="min-h-24 rounded-[1.2rem] border-slate-200"
                    />
                    <div className="flex flex-wrap gap-2 lg:w-64 lg:flex-col">
                      <Button
                        variant="outline"
                        className="h-10 rounded-full px-4"
                        disabled={selectedIds.length === 0}
                        onClick={() => updateLifecycleStatus("accepted", selectedIds)}
                      >
                        <CheckCheck className="mr-2 h-4 w-4" />
                        批量采纳
                      </Button>
                      <Button
                        variant="outline"
                        className="h-10 rounded-full px-4"
                        disabled={selectedIds.length === 0}
                        onClick={() => updateLifecycleStatus("ignored", selectedIds)}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        批量忽略
                      </Button>
                      <Button
                        className="h-10 rounded-full bg-slate-950 px-4 text-white hover:bg-slate-800"
                        disabled={selectedIds.length === 0 || noteDraft.trim() === ""}
                        onClick={applyNoteToSelection}
                      >
                        <NotebookPen className="mr-2 h-4 w-4" />
                        批量备注
                      </Button>
                    </div>
                  </div>
                </div>

                <DataTable
                  headers={[
                    "选择",
                    "动作",
                    "优先级",
                    "生命周期",
                    "Bulk",
                    "Campaign / Ad Group",
                    "Target / Search Term",
                    "当前值",
                    "建议值",
                    "备注",
                    "操作",
                  ]}
                  rows={filteredRecommendations.slice(0, 120).map((item) => {
                    const lifecycle = lifecycleMap[item.id];
                    return [
                      <Button
                        key={`${item.id}-select`}
                        size="sm"
                        variant={selectedIds.includes(item.id) ? "default" : "outline"}
                        className="rounded-full px-3"
                        onClick={() => toggleSelected(item.id)}
                      >
                        {selectedIds.includes(item.id) ? "已选" : "选择"}
                      </Button>,
                      <div key={`${item.id}-action`}>
                        <p className="font-medium text-slate-950">{item.actionLabel}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.reason}</p>
                      </div>,
                      <StatusPill key={`${item.id}-priority`} tone={item.priority}>
                        {priorityLabel(item.priority)}
                      </StatusPill>,
                      <StatusPill key={`${item.id}-lifecycle`} tone={lifecycleTone(lifecycle?.status ?? "new")}>
                        {lifecycleLabel(lifecycle?.status ?? "new")}
                      </StatusPill>,
                      <StatusPill key={`${item.id}-status`} tone={item.status === "ready" ? "medium" : "low"}>
                        {item.status === "ready" ? "Ready" : "Review"}
                      </StatusPill>,
                      <div key={`${item.id}-scope`}>
                        <p className="font-medium text-slate-950">{item.campaignName}</p>
                        <p className="mt-1 text-slate-500">{item.adGroupName || "-"}</p>
                      </div>,
                      <div key={`${item.id}-target`}>
                        <p className="font-medium text-slate-950">{item.targetingText}</p>
                        <p className="mt-1 text-slate-500">{item.customerSearchTerm || "-"}</p>
                      </div>,
                      describeCurrentValue(item),
                      describeSuggestedValue(item),
                      lifecycle?.note || "-",
                      <div key={`${item.id}-ops`} className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full px-3"
                          onClick={() => updateLifecycleStatus("accepted", [item.id])}
                        >
                          采纳
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full px-3"
                          onClick={() => updateLifecycleStatus("ignored", [item.id])}
                        >
                          忽略
                        </Button>
                      </div>,
                    ];
                  })}
                  emptyText="当前筛选条件下没有建议。"
                />

                <div className="grid gap-5 lg:grid-cols-2">
                  <DataTable
                    headers={["Campaign / Ad Group", "Search Term", "Orders", "Spend", "ACOS"]}
                    rows={result.topSearchTerms.slice(0, 12).map((item) => [
                      `${item.campaignName} / ${item.adGroupName}`,
                      item.customerSearchTerm,
                      item.current.orders,
                      formatCurrency(item.current.cost),
                      formatRate(item.current.acos),
                    ])}
                    emptyText="没有可展示的高价值搜索词。"
                  />
                  <DataTable
                    headers={["Campaign / Ad Group", "Target", "Clicks", "Spend", "ACOS"]}
                    rows={result.topTargets.slice(0, 12).map((item) => [
                      `${item.campaignName} / ${item.adGroupName}`,
                      item.targetingText,
                      item.current.clicks,
                      formatCurrency(item.current.cost),
                      formatRate(item.current.acos),
                    ])}
                    emptyText="没有可展示的重点投放对象。"
                  />
                </div>
              </TabsContent>

              <TabsContent value="campaigns" className="mt-6">
                <DataTable
                  headers={[
                    "Campaign",
                    "Spend",
                    "Sales",
                    "Orders",
                    "ACOS / TACOS",
                    "预算建议",
                    "Placement",
                    "治理风险",
                  ]}
                  rows={result.campaignRows.map((item) => [
                    item.campaignName,
                    formatCurrency(item.current.cost),
                    formatCurrency(item.current.sales),
                    item.current.orders,
                    `${formatRate(item.current.acos)} / ${formatRate(item.profitView.tacos)}`,
                    describeBudgetGuidance(item.budgetGuidance),
                    item.placementSuggestionCount,
                    item.governanceRiskCount,
                  ])}
                  emptyText="当前没有可展示的 campaign 汇总。"
                />
              </TabsContent>

              <TabsContent value="adgroups" className="mt-6">
                <DataTable
                  headers={[
                    "Campaign / Ad Group",
                    "Spend",
                    "Sales",
                    "Orders",
                    "ACOS / TACOS",
                    "父级预算信号",
                    "Placement",
                    "治理风险",
                  ]}
                  rows={result.adGroupRows.map((item) => [
                    `${item.campaignName} / ${item.adGroupName}`,
                    formatCurrency(item.current.cost),
                    formatCurrency(item.current.sales),
                    item.current.orders,
                    `${formatRate(item.current.acos)} / ${formatRate(item.profitView.tacos)}`,
                    describeBudgetGuidance(item.parentBudgetGuidance),
                    item.placementSuggestionCount,
                    item.governanceRiskCount,
                  ])}
                  emptyText="当前没有可展示的 ad group 汇总。"
                />
              </TabsContent>

              <TabsContent value="placements" className="mt-6 space-y-5">
                <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-600">
                  {result.placementDiagnostics.recognized
                    ? "已识别真实 placement 报表，以下按 Top of Search / Product Pages / Rest of Search 聚合。"
                    : result.placementDiagnostics.fallbackReason ?? "当前没有可展示的 placement 数据。"}
                </div>
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
                  rows={result.topPlacements.map((item) => [
                    item.campaignName,
                    item.placementName,
                    item.currentAdjustment !== null ? `${item.currentAdjustment}%` : "-",
                    item.current.clicks,
                    item.current.orders,
                    formatCurrency(item.current.cost),
                    formatCurrency(item.current.sales),
                    formatRate(item.current.acos),
                  ])}
                  emptyText="当前没有可展示的 placement 聚合结果。"
                />
              </TabsContent>

              <TabsContent value="governance" className="mt-6">
                <DataTable
                  headers={[
                    "Search Term",
                    "Winner",
                    "Overlap",
                    "风险级别",
                    "Spend At Risk",
                    "建议",
                    "Losers",
                  ]}
                  rows={result.governanceRisks.map((item) => [
                    item.searchTerm,
                    `${item.winningCampaignName} / ${item.winningAdGroupName}`,
                    item.overlapType === "cross_campaign" ? "跨 Campaign" : "同 Campaign 多广告组",
                    priorityLabel(item.severity),
                    formatCurrency(item.spendAtRisk),
                    `${item.suggestedScope === "campaign" ? "活动级" : "广告组级"} ${item.suggestedMatchType === "negative-phrase" ? "否定词组" : "否定精准"}`,
                    item.losers
                      .map((loser) => `${loser.campaignName} / ${loser.adGroupName}`)
                      .join(" | "),
                  ])}
                  emptyText="当前没有识别到搜索词内耗风险。"
                />
              </TabsContent>

              <TabsContent value="notes" className="mt-6">
                <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
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
                        Placement：{result.files.placement?.fileName ?? "未上传"}
                      </div>
                      <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
                        Bulk 身份：{result.files.bulkIdentity?.fileName ?? "未上传"}
                      </div>
                      <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
                        Ready / Review：{readyExportCount} / {result.reviewItems.length}
                      </div>
                    </div>
                  </article>

                  <article className="rounded-[1.5rem] border border-slate-200 bg-white p-5 lg:col-span-2">
                    <p className="section-kicker">操作日志</p>
                    <div className="mt-4 space-y-3">
                      {activityLog.length > 0 ? (
                        activityLog.map((entry, index) => (
                          <div
                            key={`${entry.at}-${index}`}
                            className="rounded-[1.2rem] bg-slate-50 px-4 py-3"
                          >
                            <p className="text-sm font-semibold text-slate-950">{entry.label}</p>
                            <p className="mt-1 text-sm text-slate-600">{entry.detail}</p>
                            <p className="mt-1 text-xs text-slate-400">{entry.at}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-600">
                          运行分析后会在这里记录建议生成、批量采纳、忽略和备注动作。
                        </div>
                      )}
                    </div>
                  </article>

                  <article className="rounded-[1.5rem] border border-slate-200 bg-white p-5 lg:col-span-2">
                    <p className="section-kicker">诊断与覆盖率</p>
                    <div className="mt-4 grid gap-5 lg:grid-cols-2">
                      <div className="space-y-3">
                        {buildFileDiagnostics(result).map((item) => (
                          <div
                            key={item.key}
                            className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-sm text-slate-600"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-slate-950">{item.label}</p>
                              <StatusPill tone={item.tone}>{item.status}</StatusPill>
                            </div>
                            <p className="mt-2 break-all">{item.fileName}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              Sheet {item.sheetName} / {item.rowCount} 行
                            </p>
                            <p className="mt-2 leading-6">{item.detail}</p>
                            {item.warning ? (
                              <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs leading-6 text-amber-700">
                                {item.warning}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3">
                        {buildCoverageCards(result, lifecycleMap).map((item) => (
                          <div
                            key={item.key}
                            className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-sm text-slate-600"
                          >
                            <p className="font-semibold text-slate-950">{item.label}</p>
                            <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                              {item.value}
                            </p>
                            <p className="mt-2 leading-6">{item.detail}</p>
                          </div>
                        ))}
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

function SummaryCard({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5">
      <p className="section-kicker">{label}</p>
      <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</h3>
      <p className="mt-2 text-sm leading-7 text-slate-500">{help}</p>
    </div>
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

function IntegerField({
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

function PercentField({
  label,
  value,
  onChange,
  placeholder,
  nullable = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  nullable?: boolean;
}) {
  return (
    <label className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
      <span className="section-kicker">{label}</span>
      <Input
        type="number"
        placeholder={placeholder}
        value={value === null ? "" : Math.round(value * 1000) / 10}
        onChange={(event) => {
          const nextValue = event.target.value.trim();
          if (nullable && nextValue === "") {
            onChange(null);
            return;
          }
          onChange(Number(nextValue || 0) / 100);
        }}
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

function StatusPill({
  tone,
  children,
}: {
  tone: "high" | "medium" | "low";
  children: ReactNode;
}) {
  const toneClass =
    tone === "high"
      ? "bg-rose-100 text-rose-700"
      : tone === "medium"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

function DataTable({
  headers,
  rows,
  emptyText,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
  emptyText: string;
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

function buildLifecycleMap(result: AdOptimizerAnalysisResult): RecommendationLifecycleMap {
  return Object.fromEntries(
    result.recommendations.map((item) => [
      item.id,
      {
        recommendationId: item.id,
        status: "new",
        note: "",
        generatedAt: result.generatedAt,
        updatedAt: null,
        history: [
          {
            at: result.generatedAt,
            action: "generated",
            detail: "初次分析生成",
          },
        ],
      },
    ])
  );
}

function matchesFilter(
  recommendationId: string,
  recommendationStatus: "ready" | "needs_review",
  filter: RecommendationFilter,
  lifecycleMap: RecommendationLifecycleMap
) {
  if (filter === "all") {
    return true;
  }
  if (filter === "needs_review") {
    return recommendationStatus === "needs_review";
  }
  return (lifecycleMap[recommendationId]?.status ?? "new") === filter;
}

function lifecycleLabel(status: RecommendationLifecycleStatus) {
  if (status === "accepted") {
    return "已采纳";
  }
  if (status === "ignored") {
    return "已忽略";
  }
  return "待处理";
}

function lifecycleTone(status: RecommendationLifecycleStatus) {
  if (status === "accepted") {
    return "medium" as const;
  }
  if (status === "ignored") {
    return "low" as const;
  }
  return "high" as const;
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

function describeCurrentValue(item: AdOptimizerAnalysisResult["recommendations"][number]) {
  if (item.currentPlacementAdjustment !== null) {
    return `${item.currentPlacementAdjustment}%`;
  }
  if (item.currentBudget !== null) {
    return formatCurrency(item.currentBudget);
  }
  if (item.currentBid !== null) {
    return formatCurrency(item.currentBid);
  }
  return "-";
}

function describeSuggestedValue(item: AdOptimizerAnalysisResult["recommendations"][number]) {
  if (item.suggestedPlacementAdjustment !== null) {
    return `${item.suggestedPlacementAdjustment}%`;
  }
  if (item.suggestedBudget !== null) {
    return formatCurrency(item.suggestedBudget);
  }
  if (item.suggestedTargetExpression) {
    return `${item.suggestedTargetExpression}${item.suggestedBid !== null ? ` / ${formatCurrency(item.suggestedBid)}` : ""}`;
  }
  if (item.suggestedMatchType) {
    return item.suggestedMatchType;
  }
  if (item.suggestedBid !== null) {
    return formatCurrency(item.suggestedBid);
  }
  return "-";
}

function describeBudgetGuidance(
  value:
    | AdOptimizerAnalysisResult["campaignRows"][number]["budgetGuidance"]
    | AdOptimizerAnalysisResult["adGroupRows"][number]["parentBudgetGuidance"]
) {
  if (!value.type || value.suggestedBudget === null) {
    return value.currentBudget !== null ? "观察" : "未配置";
  }
  return `${value.type === "increase_budget" ? "放量" : "收缩"} -> ${formatCurrency(
    value.suggestedBudget
  )}`;
}

function buildFileDiagnostics(result: AdOptimizerAnalysisResult): DiagnosticCardItem[] {
  const diagnostics: DiagnosticCardItem[] = [
    {
      key: "current",
      label: "当前搜索词",
      fileName: result.files.current.fileName,
      sheetName: result.files.current.sheetName,
      rowCount: result.files.current.rowCount,
      status: result.files.current.recognized ? "已识别" : "未识别",
      tone: result.files.current.recognized ? ("medium" as const) : ("high" as const),
      detail: "当前周期搜索词分析的主输入。",
      warning: result.files.current.warnings[0] ?? "",
    },
  ];

  if (result.files.previous) {
    diagnostics.push({
      key: "previous",
      label: "上周期搜索词",
      fileName: result.files.previous.fileName,
      sheetName: result.files.previous.sheetName,
      rowCount: result.files.previous.rowCount,
      status: result.files.previous.recognized ? "已识别" : "未识别",
      tone: result.files.previous.recognized ? ("medium" as const) : ("low" as const),
      detail: "用于计算环比变化和趋势信号。",
      warning: result.files.previous.warnings[0] ?? "",
    });
  }

  diagnostics.push({
    key: "placement",
    label: "Placement",
    fileName: result.files.placement?.fileName ?? "未上传",
    sheetName: result.files.placement?.sheetName ?? "-",
    rowCount: result.files.placement?.rowCount ?? 0,
    status: result.placementDiagnostics.recognized ? "真实 placement" : "已降级",
    tone: result.placementDiagnostics.recognized ? ("medium" as const) : ("low" as const),
    detail: result.placementDiagnostics.recognized
      ? `识别到 placement 列 ${result.placementDiagnostics.detectedPlacementColumn ?? "-"}，已归一 ${result.placementDiagnostics.normalizedPlacementCount} 条广告位记录。`
      : result.placementDiagnostics.fallbackReason ?? "未上传 placement 报表。",
    warning: result.files.placement?.warnings[0] ?? "",
  });

  diagnostics.push({
    key: "bulk",
    label: "Bulk Identity",
    fileName: result.files.bulkIdentity?.fileName ?? "未上传",
    sheetName: result.files.bulkIdentity?.sheetName ?? "-",
    rowCount: result.files.bulkIdentity?.rowCount ?? 0,
    status: result.files.bulkIdentity ? "已接入" : "缺少映射",
    tone: result.files.bulkIdentity ? ("medium" as const) : ("low" as const),
    detail: result.bulkIdentitySummary
      ? `Campaign ${result.bulkIdentitySummary.campaignCount} / Ad Group ${result.bulkIdentitySummary.adGroupCount} / Keyword ${result.bulkIdentitySummary.keywordCount} / Placement ${result.bulkIdentitySummary.placementAdjustmentCount}`
      : "未上传时仍可分析，但 bulk-ready 和预算/广告位映射会降级。",
    warning: result.files.bulkIdentity?.warnings[0] ?? "",
  });

  return diagnostics;
}

function buildCoverageCards(
  result: AdOptimizerAnalysisResult,
  lifecycleMap: RecommendationLifecycleMap
): CoverageCardItem[] {
  const lifecycleStates = Object.values(lifecycleMap);
  return [
    {
      key: "mapping",
      label: "映射覆盖率",
      value: result.mappingCoverage
        ? formatRate(result.mappingCoverage.targetCoverage)
        : "未计算",
      detail: result.mappingCoverage
        ? `Campaign ${formatRate(result.mappingCoverage.campaignCoverage)} / Ad Group ${formatRate(result.mappingCoverage.adGroupCoverage)} / Target ${formatRate(result.mappingCoverage.targetCoverage)}`
        : "缺少 bulk identity 时，这里会降级。",
    },
    {
      key: "ready-review",
      label: "Ready / Review",
      value: `${result.recommendations.filter((item) => item.bulkExportable).length} / ${result.reviewItems.length}`,
      detail: "Ready 可直接进入 bulk，Review 需要补字段或人工判断。",
    },
    {
      key: "lifecycle",
      label: "生命周期状态",
      value: `${lifecycleStates.filter((item) => item.status === "accepted").length} / ${lifecycleStates.filter((item) => item.status === "ignored").length}`,
      detail: "显示已采纳 / 已忽略的建议数量。",
    },
    {
      key: "placement-budget",
      label: "操盘重点",
      value: `${result.recommendations.filter((item) => item.surface === "placement").length} / ${result.recommendations.filter((item) => item.surface === "budget").length}`,
      detail: "显示当前 placement / budget 建议数。",
    },
  ];
}

function loadPersistedWorkbenchState(): PersistedWorkbenchState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WORKBENCH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedWorkbenchState;
    if (parsed.version !== 1) {
      return null;
    }

    return {
      version: 1,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
      result: parsed.result ?? null,
      lifecycleMap: parsed.lifecycleMap ?? {},
      activityLog: Array.isArray(parsed.activityLog) ? parsed.activityLog : [],
      filter: parsed.filter ?? "all",
      bulkOperationLanguage: parsed.bulkOperationLanguage ?? "english",
      controls: parsed.controls ?? DEFAULT_ANALYSIS_CONTROLS,
    };
  } catch {
    return null;
  }
}

function persistWorkbenchState(state: PersistedWorkbenchState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota or serialization failures and keep the live session usable.
  }
}

function clearPersistedWorkbenchState() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(WORKBENCH_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
