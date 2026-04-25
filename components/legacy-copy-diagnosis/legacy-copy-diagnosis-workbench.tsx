"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Loader2,
  Radar,
  RefreshCw,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import {
  AiRequestErrorAlert,
  ApiRequestError,
  normalizeApiRequestError,
  parseApiRequestError,
} from "@/components/AiRequestErrorAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { LegacyDiagnosisReport } from "@/lib/legacy-copy-diagnosis/types";
import type {
  AiProvider,
  AiRuntimeServiceConfig,
  SellerSpriteRuntimeConfig,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const FORM_STORAGE_KEY = "legacy-copy-diagnosis-form";
const RUNTIME_STORAGE_KEY = "legacy-copy-diagnosis-runtime";
const SELLER_SPRITE_STORAGE_KEY = "legacy-copy-diagnosis-seller-sprite";
const DEFAULT_SELLER_SPRITE_BASE_URL = "https://mcp.sellersprite.com/mcp";

const DEFAULT_FORM = {
  marketplace: "US",
  targetAsin: "",
  competitorAsins: "",
  currentTitle: "",
  currentBullets: "",
  currentSearchTerms: "",
};

const DEFAULT_RUNTIME: AiRuntimeServiceConfig = {
  provider: "",
  baseUrl: "",
  model: "",
  apiKey: "",
};

const DEFAULT_SELLER_SPRITE_CONFIG = {
  baseUrl: DEFAULT_SELLER_SPRITE_BASE_URL,
  secretKey: "",
  requestTimeoutMs: "15000",
};

type OperatorPriority = "P0" | "P1" | "P2";

type OperatorTopRecommendation = {
  problem: string;
  why: string;
  changeNow: string;
  expectedOutcome: string;
  confidence: string;
};

type OperatorFieldDiagnostic = {
  field: string;
  priority: OperatorPriority;
  problem: string;
  fix: string;
  keywords: string[];
};

type OperatorValidationStep = {
  window: string;
  metric: string;
  target: string;
  rollbackSignal: string;
};

const MARKET_OPTIONS = ["US", "CA", "UK", "DE", "FR", "IT", "ES", "JP"];

const PROVIDER_OPTIONS: Array<{ value: AiProvider | "auto"; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI-compatible" },
];

export function LegacyCopyDiagnosisWorkbench() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [runtime, setRuntime] = useState<AiRuntimeServiceConfig>(DEFAULT_RUNTIME);
  const [sellerSpriteConfig, setSellerSpriteConfig] = useState(
    DEFAULT_SELLER_SPRITE_CONFIG
  );
  const [runtimeOpen, setRuntimeOpen] = useState(false);
  const [report, setReport] = useState<LegacyDiagnosisReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [runtimeTesting, setRuntimeTesting] = useState(false);
  const [runtimeTestResult, setRuntimeTestResult] =
    useState<RuntimeConnectivityResult | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawForm = window.localStorage.getItem(FORM_STORAGE_KEY);
    const rawRuntime = window.localStorage.getItem(RUNTIME_STORAGE_KEY);
    const rawSellerSprite = window.localStorage.getItem(SELLER_SPRITE_STORAGE_KEY);

    if (rawForm) {
      try {
        setForm({
          ...DEFAULT_FORM,
          ...(JSON.parse(rawForm) as typeof DEFAULT_FORM),
        });
      } catch {
        // Ignore local storage corruption and fall back to defaults.
      }
    }

    if (rawRuntime) {
      try {
        setRuntime({
          ...DEFAULT_RUNTIME,
          ...(JSON.parse(rawRuntime) as AiRuntimeServiceConfig),
        });
      } catch {
        // Ignore local storage corruption and fall back to defaults.
      }
    }

    if (rawSellerSprite) {
      try {
        setSellerSpriteConfig({
          ...DEFAULT_SELLER_SPRITE_CONFIG,
          ...(JSON.parse(rawSellerSprite) as typeof DEFAULT_SELLER_SPRITE_CONFIG),
        });
      } catch {
        // Ignore local storage corruption and fall back to defaults.
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(runtime));
  }, [runtime]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      SELLER_SPRITE_STORAGE_KEY,
      JSON.stringify(sellerSpriteConfig)
    );
  }, [sellerSpriteConfig]);

  useEffect(() => {
    setRuntimeTestResult(null);
  }, [runtime.provider, runtime.baseUrl, runtime.model, runtime.apiKey]);

  const handleTestRuntime = async () => {
    setRuntimeTesting(true);
    setRuntimeTestResult(null);

    try {
      const response = await fetch("/api/test-ai-runtime", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          runtime: {
            task: "legacyCopyDiagnosis",
            ...runtime,
          },
          runtimeConfig: {
            legacyCopyDiagnosis: runtime,
          },
        }),
      });

      if (!response.ok) {
        throw await parseApiRequestError(response, "分析模型 API 测试失败");
      }

      const payload = (await response.json()) as {
        provider?: string;
        baseURL?: string;
        model?: string;
        outputPreview?: string;
      };

      setRuntimeTestResult({
        status: "success",
        message: `已连接到 ${payload.provider || "AI"} / ${
          payload.model || runtime.model || "默认模型"
        }`,
        detail:
          payload.outputPreview ||
          `Base URL: ${formatPreviewBaseUrl(payload.baseURL || runtime.baseUrl)}`,
      });
    } catch (requestError) {
      const normalizedError = normalizeApiRequestError(
        requestError,
        "分析模型 API 测试失败"
      );
      setRuntimeTestResult({
        status: "error",
        message: normalizedError.message,
        detail: normalizedError.code
          ? `code: ${normalizedError.code}`
          : "请检查模型协议、Base URL、模型名和 API Key。",
      });
    } finally {
      setRuntimeTesting(false);
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/legacy-copy-diagnosis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketplace: form.marketplace,
          targetAsin: form.targetAsin,
          competitorAsins: splitCompetitorAsins(form.competitorAsins),
          currentTitle: form.currentTitle,
          currentBullets: splitBullets(form.currentBullets),
          currentSearchTerms: form.currentSearchTerms,
          runtime: {
            task: "legacyCopyDiagnosis",
            ...runtime,
          },
          runtimeConfig: {
            legacyCopyDiagnosis: runtime,
          },
          sellerSpriteConfig: buildSellerSpriteRequestConfig(sellerSpriteConfig),
        }),
      });

      if (!response.ok) {
        throw await parseApiRequestError(response, "老品文案诊断失败");
      }

      setReport((await response.json()) as LegacyDiagnosisReport);
    } catch (requestError) {
      setError(normalizeApiRequestError(requestError, "老品文案诊断失败"));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setForm(DEFAULT_FORM);
    setRuntime(DEFAULT_RUNTIME);
    setSellerSpriteConfig(DEFAULT_SELLER_SPRITE_CONFIG);
    setReport(null);
    setError(null);
    setRuntimeTestResult(null);
  };

  const fillSample = () => {
    setForm({
      marketplace: "US",
      targetAsin: "B0D5CFZ253",
      competitorAsins: "B0G3P62SJ7",
      currentTitle: "",
      currentBullets: "",
      currentSearchTerms: "",
    });
  };

  return (
    <section className="page-shell mt-8">
      <div className="glass-panel p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-6">
            <Card className="border-slate-200/80 bg-white/85 shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <Radar className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-slate-950">诊断输入</CardTitle>
                    <p className="mt-1 text-sm leading-7 text-slate-500">
                      数据来源已经切到卖家精灵 MCP。目标 ASIN、竞品 ASIN 必填，当前文案字段可留空后直接用卖家精灵抓取到的页面文案。
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="marketplace">站点</Label>
                    <Select
                      value={form.marketplace}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          marketplace: value || current.marketplace,
                        }))
                      }
                    >
                      <SelectTrigger id="marketplace">
                        <SelectValue placeholder="选择站点" />
                      </SelectTrigger>
                      <SelectContent>
                        {MARKET_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="target-asin">目标 ASIN</Label>
                    <Input
                      id="target-asin"
                      placeholder="例如 B0D5CFZ253"
                      value={form.targetAsin}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          targetAsin: event.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="competitor-asins">竞品 ASIN</Label>
                  <Textarea
                    id="competitor-asins"
                    placeholder="支持逗号、空格或换行分隔，例如：B0G3P62SJ7"
                    value={form.competitorAsins}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        competitorAsins: event.target.value.toUpperCase(),
                      }))
                    }
                    className="min-h-20"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="current-title">当前标题</Label>
                  <Textarea
                    id="current-title"
                    placeholder="可选。留空时使用卖家精灵抓到的当前标题。"
                    value={form.currentTitle}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        currentTitle: event.target.value,
                      }))
                    }
                    className="min-h-24"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="current-bullets">当前五点描述</Label>
                  <Textarea
                    id="current-bullets"
                    placeholder="可选。每行一条 bullet；留空时使用卖家精灵抓到的五点。"
                    value={form.currentBullets}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        currentBullets: event.target.value,
                      }))
                    }
                    className="min-h-36"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="current-search-terms">后台 Search Terms</Label>
                  <Textarea
                    id="current-search-terms"
                    placeholder="可选。这个字段卖家精灵拿不到，建议手动贴当前后台搜索词。"
                    value={form.currentSearchTerms}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        currentSearchTerms: event.target.value,
                      }))
                    }
                    className="min-h-24"
                  />
                </div>

                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">高级接入设置</p>
                      <p className="mt-1 text-sm leading-7 text-slate-500">
                        只在需要切换 SellerSprite MCP 或分析模型时展开；日常诊断直接填写 ASIN 后运行。
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRuntimeOpen((current) => !current)}
                    >
                      {runtimeOpen ? "收起" : "展开"}
                      {runtimeOpen ? (
                        <ChevronUp className="ml-1 h-4 w-4" />
                      ) : (
                        <ChevronDown className="ml-1 h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {runtimeOpen ? (
                    <div className="mt-4 grid gap-4">
                      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">SellerSprite MCP</Badge>
                          <p className="text-sm font-semibold text-slate-950">数据源接入</p>
                        </div>

                        <div className="mt-4 grid gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="seller-sprite-base-url">MCP Base URL</Label>
                            <Input
                              id="seller-sprite-base-url"
                              placeholder={DEFAULT_SELLER_SPRITE_BASE_URL}
                              value={sellerSpriteConfig.baseUrl}
                              onChange={(event) =>
                                setSellerSpriteConfig((current) => ({
                                  ...current,
                                  baseUrl: event.target.value,
                                }))
                              }
                            />
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="seller-sprite-secret-key">Secret Key</Label>
                              <Input
                                id="seller-sprite-secret-key"
                                type="password"
                                placeholder="留空则使用服务端 SELLERSPRITE_SECRET_KEY"
                                value={sellerSpriteConfig.secretKey}
                                onChange={(event) =>
                                  setSellerSpriteConfig((current) => ({
                                    ...current,
                                    secretKey: event.target.value,
                                  }))
                                }
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="seller-sprite-timeout">请求超时（毫秒）</Label>
                              <Input
                                id="seller-sprite-timeout"
                                inputMode="numeric"
                                placeholder="15000"
                                value={sellerSpriteConfig.requestTimeoutMs}
                                onChange={(event) =>
                                  setSellerSpriteConfig((current) => ({
                                    ...current,
                                    requestTimeoutMs: event.target.value.replace(/[^\d]/g, ""),
                                  }))
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
                        <Badge variant="secondary">Analysis Model</Badge>
                        <p className="text-sm font-semibold text-slate-950">分析模型 API</p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                              <Label htmlFor="runtime-provider">模型协议</Label>
                          <Select
                            value={runtime.provider || "auto"}
                            onValueChange={(value) =>
                              setRuntime((current) => ({
                                ...current,
                                provider:
                                  !value || value === "auto" ? "" : (value as AiProvider),
                              }))
                            }
                          >
                            <SelectTrigger id="runtime-provider">
                              <SelectValue placeholder="Auto" />
                            </SelectTrigger>
                            <SelectContent>
                              {PROVIDER_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                              <Label htmlFor="runtime-model">分析模型</Label>
                              <Input
                                id="runtime-model"
                                placeholder="gpt-5.4"
                                value={runtime.model}
                                onChange={(event) =>
                                  setRuntime((current) => ({
                                ...current,
                                model: event.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                            <Label htmlFor="runtime-base-url">模型 API Base URL</Label>
                        <Input
                          id="runtime-base-url"
                          placeholder="https://api.openai.com"
                          value={runtime.baseUrl}
                          onChange={(event) =>
                            setRuntime((current) => ({
                              ...current,
                              baseUrl: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                            <Label htmlFor="runtime-api-key">模型 API Key</Label>
                            <Input
                              id="runtime-api-key"
                              type="password"
                              placeholder="留空则使用服务端 AI 环境变量"
                              value={runtime.apiKey}
                          onChange={(event) =>
                            setRuntime((current) => ({
                              ...current,
                              apiKey: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 md:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">
                              API 可用性测试
                            </p>
                            <p className="mt-1 text-xs leading-6 text-slate-500">
                              用当前分析模型配置发送一条极小请求，快速确认接口是否可用。
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={runtimeTesting}
                            onClick={() => void handleTestRuntime()}
                          >
                            {runtimeTesting ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                测试中
                              </>
                            ) : (
                              "测试 API"
                            )}
                          </Button>
                        </div>

                        {runtimeTestResult ? (
                          <div
                            className={cn(
                              "mt-3 rounded-xl border px-3 py-3 text-sm",
                              runtimeTestResult.status === "success"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-rose-200 bg-rose-50 text-rose-800"
                            )}
                          >
                            <p className="font-medium">
                              {runtimeTestResult.status === "success"
                                ? "测试成功"
                                : "测试失败"}
                            </p>
                            <p className="mt-1">{runtimeTestResult.message}</p>
                            {runtimeTestResult.detail ? (
                              <p className="mt-1 text-xs opacity-80">
                                {runtimeTestResult.detail}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => void handleAnalyze()}
                    disabled={loading}
                    className="bg-slate-950 hover:bg-slate-800"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        诊断中
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        开始诊断
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={fillSample}>
                    填充示例
                  </Button>
                  <Button type="button" variant="ghost" onClick={handleReset}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    重置
                  </Button>
                </div>
              </CardContent>
            </Card>

            {error ? (
              <AiRequestErrorAlert
                heading="诊断请求失败"
                error={error}
                runtimeConfig={runtime}
              />
            ) : null}
          </div>

          <div className="space-y-6">
            {report ? (
              <ResultsPanel report={report} />
            ) : (
              <Card className="border-dashed border-slate-300 bg-slate-50/80 shadow-none">
                <CardContent className="flex min-h-[560px] flex-col items-center justify-center gap-4 text-center">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 text-white">
                    <ClipboardList className="h-7 w-7" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-semibold text-slate-950">诊断结果会显示在这里</p>
                    <p className="max-w-xl text-sm leading-7 text-slate-500">
                      模块会先调用卖家精灵 MCP 拉目标 ASIN、竞品 ASIN、评论和流量词，再输出总分、9 大支柱分、关键词缺口、评论主题和改写建议。
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Badge variant="secondary">卖家精灵 MCP</Badge>
                    <Badge variant="secondary">规则评分</Badge>
                    <Badge variant="secondary">P0 / P1 / P2</Badge>
                    <Badge variant="secondary">模型分析建议</Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ResultsPanel({ report }: { report: LegacyDiagnosisReport }) {
  const topRecommendation = getTopRecommendation(report);
  const fieldDiagnostics = buildFieldDiagnostics(report);
  const validationPlan = buildValidationPlan(report);
  const competitorDeltas = buildCompetitorDeltas(report);
  const rootCauseGroups = buildRootCauseGroups(report);
  const primaryBlocker = getPrimaryBlocker(report);
  const firstSurface = getFirstSurface(primaryBlocker.id);

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="overview">诊断结论</TabsTrigger>
        <TabsTrigger value="pillars">根因地图</TabsTrigger>
        <TabsTrigger value="keywords">字段缺口</TabsTrigger>
        <TabsTrigger value="rewrite">执行复盘</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard
            icon={Target}
            title="诊断总分"
            value={`${report.score.total}/100`}
            note={report.score.label}
          />
          <MetricCard
            icon={AlertTriangle}
            title="第一卡点"
            value={primaryBlocker.shortTitle}
            note={`${primaryBlocker.score}/${primaryBlocker.maxScore}`}
          />
          <MetricCard
            icon={FileText}
            title="先改字段"
            value={firstSurface}
            note="先打透一个面，再联动其他字段"
          />
          <MetricCard
            icon={CalendarCheck}
            title="复盘节奏"
            value="7/14/28天"
            note="索引、排名、转化分窗口验证"
          />
        </div>

        <Card className="border-slate-200/80 bg-white/85 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-xl text-slate-950">Top Recommendation</CardTitle>
                <p className="mt-1 text-sm leading-7 text-slate-500">
                  目标 ASIN：{report.targetAsin}。这里直接给第一优先级，不再展示方法论解释。
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[1.2rem] border border-rose-200 bg-rose-50/80 p-4">
              <p className="text-sm font-semibold text-rose-950">问题</p>
              <p className="mt-2 text-sm leading-7 text-rose-900">{topRecommendation.problem}</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <RecommendationBlock title="为什么优先" value={topRecommendation.why} />
              <RecommendationBlock title="现在怎么改" value={topRecommendation.changeNow} />
              <RecommendationBlock title="看什么结果" value={topRecommendation.expectedOutcome} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">置信度：{topRecommendation.confidence}</Badge>
              <Badge variant="secondary">{report.ai.used ? "模型 + 规则" : "规则诊断兜底"}</Badge>
              <Badge variant="secondary">竞品 {report.competitorSnapshots.length} 个</Badge>
              <Badge variant="secondary">缺口词 {report.keywordGaps.length} 个</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-slate-200/80 bg-white/85 shadow-none">
            <CardHeader>
              <CardTitle className="text-lg text-slate-950">Quick Wins / Watchouts</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <SignalColumn
                title="当天可改"
                items={report.ai.output?.quickWins.length ? report.ai.output.quickWins : report.actionPlan.p0}
              />
              <SignalColumn
                title="别踩坑"
                items={report.ai.output?.watchouts.length ? report.ai.output.watchouts : report.actionPlan.watchouts}
              />
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white/85 shadow-none">
            <CardHeader>
              <CardTitle className="text-lg text-slate-950">竞品差距</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SimpleList items={competitorDeltas} />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="pillars" className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          {rootCauseGroups.map((group) => (
            <Card key={group.title} className="border-slate-200/80 bg-white/85 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-slate-950">{group.title}</CardTitle>
                <p className="text-sm leading-7 text-slate-500">{group.summary}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.pillars.map((pillar) => (
                  <div
                    key={pillar.id}
                    className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">{pillar.title}</p>
                      <div className="flex items-center gap-2">
                        <Badge className={scoreBadgeClassName(pillar.status)}>
                          {statusLabel(pillar.status)}
                        </Badge>
                        <Badge variant="outline">
                          {pillar.score}/{pillar.maxScore}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{pillar.summary}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <DetailBlock title="症状" items={pillar.findings.slice(0, 3)} />
                      <DetailBlock title="修正面" items={pillar.recommendedActions.slice(0, 3)} />
                      <DetailBlock title="证据" items={pillar.evidence.slice(0, 3)} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="keywords" className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          {fieldDiagnostics.map((item) => (
            <FieldDiagnosticCard key={item.field} item={item} />
          ))}
        </div>

        <Card className="border-slate-200/80 bg-white/85 shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-slate-950">关键词证据</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.keywordGaps.map((gap) => (
              <div
                key={gap.keyword}
                className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{gap.keyword}</Badge>
                  <Badge className={priorityBadgeClassName(gap.opportunity)}>
                    {gap.opportunity.toUpperCase()}
                  </Badge>
                  <Badge variant="secondary">Search {gap.searchVolume}</Badge>
                  <Badge variant="secondary">
                    Target {gap.targetOrganicRank > 0 ? `#${gap.targetOrganicRank}` : "-"}
                  </Badge>
                  <Badge variant="secondary">
                    Competitor {gap.bestCompetitorOrganicRank ? `#${gap.bestCompetitorOrganicRank}` : "-"}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-600">{gap.reason}</p>
                <p className="mt-2 text-xs text-slate-500">
                  当前覆盖：{gap.coverage.title ? "标题 " : ""}
                  {gap.coverage.bullets ? "五点 " : ""}
                  {gap.coverage.searchTerms ? "ST " : ""}
                  {!gap.coverage.anywhere ? "未覆盖" : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="rewrite" className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <ActionColumn title="P0 今天处理" items={report.ai.output?.p0Actions.length ? report.ai.output.p0Actions : report.actionPlan.p0} />
          <ActionColumn title="P1 7-14天推进" items={report.ai.output?.p1Actions.length ? report.ai.output.p1Actions : report.actionPlan.p1} />
          <ActionColumn title="P2 观察/补强" items={report.ai.output?.p2Actions.length ? report.ai.output.p2Actions : report.actionPlan.p2} />
        </div>

        <Card className="border-slate-200/80 bg-white/85 shadow-none">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <CalendarCheck className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-950">7 / 14 / 28 天验证计划</CardTitle>
                <p className="mt-1 text-sm leading-7 text-slate-500">
                  改完不是等感觉，按窗口看指标；不达标就回滚或换方案。
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {validationPlan.map((item) => (
              <ValidationStepCard key={item.window} item={item} />
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/85 shadow-none">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <BrainCircuit className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-950">可直接改写的字段草案</CardTitle>
                <p className="mt-1 text-sm leading-7 text-slate-500">
                  {report.ai.used
                    ? `已使用 ${report.ai.provider} / ${report.ai.model}`
                    : report.ai.reason || "当前没有可用 AI 结果，已返回规则诊断与动作建议。"}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.ai.output ? (
              <>
                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-950">Title 草案</p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {report.ai.output.titleSuggestion}
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-950">五点草案</p>
                  <SimpleList items={report.ai.output.bulletSuggestions} />
                </div>
                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-950">Search Terms 草案</p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {report.ai.output.searchTermsSuggestion}
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-7 text-slate-500">
                当前没有追加模型分析输出。规则诊断已完成；如果要让模型基于数据进一步生成优化建议与英文标题、五点、Search Terms，请填写分析模型 API 配置，或在服务端补可用模型凭证。
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function RecommendationBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-7 text-slate-600">{value || "暂无明确结论"}</p>
    </div>
  );
}

function FieldDiagnosticCard({ item }: { item: OperatorFieldDiagnostic }) {
  return (
    <Card className="border-slate-200/80 bg-white/85 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg text-slate-950">{item.field}</CardTitle>
          <Badge className={operatorPriorityBadgeClassName(item.priority)}>
            {item.priority}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <RecommendationBlock title="字段问题" value={item.problem} />
        <RecommendationBlock title="怎么改" value={item.fix} />
        <div>
          <p className="text-sm font-semibold text-slate-950">优先承接</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.keywords.length ? (
              item.keywords.map((keyword) => (
                <Badge key={`${item.field}-${keyword}`} variant="secondary">
                  {keyword}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-slate-500">暂无明确词包</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <Card className="border-slate-200/80 bg-white/85 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-slate-950">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <SimpleList items={items} />
      </CardContent>
    </Card>
  );
}

function ValidationStepCard({ item }: { item: OperatorValidationStep }) {
  return (
    <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2">
        <Badge className="bg-slate-950 text-white hover:bg-slate-950">
          {item.window}
        </Badge>
        <p className="text-sm font-semibold text-slate-950">{item.metric}</p>
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-600">{item.target}</p>
      <p className="mt-3 text-xs leading-6 text-slate-500">
        回滚信号：{item.rollbackSignal}
      </p>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  note,
}: {
  icon: typeof Target;
  title: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="border-slate-200/80 bg-white/85 shadow-none">
      <CardContent className="flex items-start gap-4 pt-5">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
          <p className="mt-1 text-sm text-slate-500">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SignalColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <SimpleList items={items} />
    </div>
  );
}

function DetailBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <SimpleList items={items} />
    </div>
  );
}

function SimpleList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="mt-3 text-sm text-slate-500">暂无</p>;
  }

  return (
    <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-600">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function getTopRecommendation(report: LegacyDiagnosisReport): OperatorTopRecommendation {
  const aiRecommendation = report.ai.output?.topRecommendation;
  if (
    aiRecommendation &&
    (aiRecommendation.problem ||
      aiRecommendation.why ||
      aiRecommendation.changeNow ||
      aiRecommendation.expectedOutcome)
  ) {
    return {
      problem: aiRecommendation.problem || report.score.headline,
      why: aiRecommendation.why || getPrimaryBlocker(report).summary,
      changeNow:
        aiRecommendation.changeNow ||
        report.actionPlan.p0[0] ||
        getPrimaryBlocker(report).recommendedActions[0] ||
        "先修正第一弱项，再联动广告与资产。",
      expectedOutcome:
        aiRecommendation.expectedOutcome || "观察 CTR、自然排名、索引词数和 CVR 是否同步改善。",
      confidence: aiRecommendation.confidence || getConfidenceLabel(report),
    };
  }

  const blocker = getPrimaryBlocker(report);
  return {
    problem: blocker.summary || report.score.headline,
    why:
      blocker.evidence[0] ||
      blocker.findings[0] ||
      "规则诊断显示该项是当前得分最低的瓶颈。",
    changeNow:
      report.actionPlan.p0[0] ||
      blocker.recommendedActions[0] ||
      "先处理最高优先级字段，不要同时大改所有位置。",
    expectedOutcome: getExpectedOutcome(blocker.id),
    confidence: getConfidenceLabel(report),
  };
}

function buildFieldDiagnostics(report: LegacyDiagnosisReport): OperatorFieldDiagnostic[] {
  const aiDiagnostics = report.ai.output?.fieldDiagnostics ?? [];
  if (aiDiagnostics.length > 0) {
    return aiDiagnostics.map((item) => ({
      field: item.field,
      priority: item.priority,
      problem: item.problem,
      fix: item.fix,
      keywords: item.keywords,
    }));
  }

  const titleGaps = report.keywordGaps
    .filter((gap) => !gap.coverage.title)
    .slice(0, 5);
  const uncoveredGaps = report.keywordGaps
    .filter((gap) => !gap.coverage.anywhere)
    .slice(0, 5);
  const unhandledNegatives = report.negativeThemes
    .filter((theme) => !theme.addressedInCopy)
    .slice(0, 4);
  const assetPillar = findPillar(report, "assets");
  const scenePillar = findPillar(report, "scene");
  const variationPillar = findPillar(report, "variation");

  return [
    {
      field: "Title 前80字符",
      priority: hasCriticalGap(titleGaps) ? "P0" : "P1",
      problem: titleGaps.length
        ? `核心词没有进入标题高权重区：${titleGaps.map((gap) => gap.keyword).join(" / ")}。`
        : "标题已覆盖部分核心词，但仍需要控制重复和前置顺序。",
      fix: "按“类目词 + 主需求 + 高意图场景 + 关键材质/款式”重排标题前半段，低价值修饰词后置或删除。",
      keywords: titleGaps.map((gap) => gap.keyword),
    },
    {
      field: "Bullet 1-5",
      priority: unhandledNegatives.length ? "P0" : "P1",
      problem: unhandledNegatives.length
        ? `评论顾虑没有被五点提前回答：${unhandledNegatives.map((theme) => theme.phrase).join(" / ")}。`
        : "五点可以继续强化结果型卖点和证据链，而不是只承接关键词。",
      fix: "Bullet 1 先讲购买结果；Bullet 2-3 用材质/结构/评论证据打消顾虑；Bullet 4-5 承接场景、尺码和售后。",
      keywords: unhandledNegatives.map((theme) => theme.phrase),
    },
    {
      field: "后台 Search Terms",
      priority: uncoveredGaps.length ? "P0" : "P2",
      problem: uncoveredGaps.length
        ? `仍有词没有被任何可见字段承接：${uncoveredGaps.map((gap) => gap.keyword).join(" / ")}。`
        : "Search Terms 主要用于去重补漏，不应机械重复标题词。",
      fix: "把标题和五点放不自然的长尾词、同义词、场景词放到 ST，并清理已在标题高频出现的重复词。",
      keywords: uncoveredGaps.map((gap) => gap.keyword),
    },
    {
      field: "A+ / 图片 / 视频",
      priority: assetPillar?.status === "weak" ? "P1" : "P2",
      problem: assetPillar?.summary || "资产层需要和标题、五点讲同一个购买理由。",
      fix:
        assetPillar?.recommendedActions[0] ||
        "用 A+、辅图和视频补足标题/五点讲不透的材质、场景、尺码和对比证据。",
      keywords: report.keywordGaps.slice(0, 3).map((gap) => gap.keyword),
    },
    {
      field: "类目 / 属性 / 变体",
      priority:
        scenePillar?.status === "weak" || variationPillar?.status === "weak"
          ? "P1"
          : "P2",
      problem:
        scenePillar?.summary ||
        variationPillar?.summary ||
        "类目、场景、变体命名要和文案词包一致，否则权重会被稀释。",
      fix:
        scenePillar?.recommendedActions[0] ||
        variationPillar?.recommendedActions[0] ||
        "核对 browse node、occasion、颜色尺码命名和父子体结构，避免内容与运营结构互相打架。",
      keywords: report.keywordGaps
        .filter((gap) => !gap.coverage.anywhere)
        .slice(0, 3)
        .map((gap) => gap.keyword),
    },
  ];
}

function buildValidationPlan(report: LegacyDiagnosisReport): OperatorValidationStep[] {
  const aiPlan = report.ai.output?.validationPlan ?? [];
  if (aiPlan.length > 0) {
    return aiPlan.map((item) => ({
      window: item.window,
      metric: item.metric,
      target: item.target,
      rollbackSignal: item.rollbackSignal,
    }));
  }

  return [
    {
      window: "7天",
      metric: "索引词数 / CTR",
      target: "P0 词开始被收录，CTR 不低于改版前；若标题已改，重点看主图曝光后的点击变化。",
      rollbackSignal: "CTR 连续下滑且主词曝光没有恢复，说明标题前置或主图承接不匹配。",
    },
    {
      window: "14天",
      metric: "自然排名 / 广告依赖",
      target: "至少一批 P0/P1 关键词自然位改善，广告点击能被页面内容接住。",
      rollbackSignal: "广告点击增加但 CVR 不动，说明五点/A+证据链还没解决信任问题。",
    },
    {
      window: "28天",
      metric: "CVR / ACOS / 评论主题",
      target: "CVR、广告自然流量占比或转化成本出现明确改善，新增差评顾虑不再集中重复。",
      rollbackSignal: "CVR 低于改版前且负向评论主题扩大，需要回滚卖点表达或补资产。",
    },
  ];
}

function buildCompetitorDeltas(report: LegacyDiagnosisReport): string[] {
  const aiDeltas = report.ai.output?.competitorDeltas ?? [];
  if (aiDeltas.length > 0) {
    return aiDeltas;
  }

  const target = report.targetListing;
  const competitors = report.competitorSnapshots;
  const averagePrice = average(competitors.map((item) => item.price));
  const averageRating = average(competitors.map((item) => item.rating));
  const averageReviews = average(competitors.map((item) => item.reviews));
  const bestKeywordCompetitor = [...competitors].sort(
    (left, right) => right.keywordCount - left.keywordCount
  )[0];
  const deltas: string[] = [];

  if (bestKeywordCompetitor) {
    deltas.push(
      `${bestKeywordCompetitor.asin} 关键词覆盖约 ${bestKeywordCompetitor.keywordCount} 个，目标 ASIN 当前重点缺口 ${report.keywordGaps.length} 个，先补被竞品拿位的词。`
    );
  }

  if (averagePrice > 0 && target.price > 0) {
    deltas.push(
      `目标价格 ${formatMoney(target.price)}，竞品均价约 ${formatMoney(averagePrice)}；价格带是否能被材质、评分和资产证据托住，需要在五点/A+里说明。`
    );
  }

  if (averageRating > 0 && target.rating > 0) {
    deltas.push(
      `目标评分 ${target.rating.toFixed(1)}，竞品均分约 ${averageRating.toFixed(1)}；若评分不占优，文案要提前处理差评高频顾虑。`
    );
  }

  if (averageReviews > 0 && target.reviews > 0) {
    deltas.push(
      `目标评论 ${target.reviews}，竞品均值约 ${Math.round(averageReviews)}；口碑不够强时，不能只靠标题堆词，要补证据链。`
    );
  }

  return deltas.length ? deltas : ["竞品样本不足，当前以关键词缺口、评论信号和字段覆盖作为主要证据。"];
}

function buildRootCauseGroups(report: LegacyDiagnosisReport) {
  const groups = [
    {
      title: "找不到：搜索与自然流量",
      summary: "看核心词有没有被标题、ST、类目和广告词包真正接住。",
      ids: ["search", "scene", "traffic"],
    },
    {
      title: "点了不买：卖点与信任证据",
      summary: "看五点、评论顾虑、价格锚点和价值表达是否能完成说服。",
      ids: ["conversion", "value", "mobile"],
    },
    {
      title: "页面撑不住：资产与运营结构",
      summary: "看 A+、图片视频、变体、合规和实验节奏是否拖累改写效果。",
      ids: ["assets", "variation", "compliance"],
    },
  ];

  return groups.map((group) => ({
    ...group,
    pillars: group.ids
      .map((id) => findPillar(report, id))
      .filter((pillar): pillar is LegacyDiagnosisReport["pillars"][number] =>
        Boolean(pillar)
      ),
  }));
}

function getPrimaryBlocker(report: LegacyDiagnosisReport) {
  const pillar = [...report.pillars].sort(
    (left, right) => left.score / left.maxScore - right.score / right.maxScore
  )[0];

  return {
    ...pillar,
    shortTitle: shortPillarTitle(pillar.title),
  };
}

function getFirstSurface(pillarId: string): string {
  switch (pillarId) {
    case "search":
    case "traffic":
      return "标题 / ST";
    case "scene":
      return "标题 / 类目";
    case "conversion":
    case "mobile":
      return "五点";
    case "assets":
      return "A+ / 图片";
    case "value":
      return "五点 / 价格";
    case "variation":
      return "变体";
    case "compliance":
      return "合规";
    default:
      return "P0 字段";
  }
}

function getExpectedOutcome(pillarId: string): string {
  switch (pillarId) {
    case "search":
    case "traffic":
      return "优先看索引词数、P0 关键词自然位和广告依赖度是否改善。";
    case "conversion":
    case "value":
      return "优先看 CVR、加购率和评论顾虑是否改善。";
    case "mobile":
      return "优先看移动端 CTR 与首屏停留相关指标。";
    case "assets":
      return "优先看 CVR、页面停留和 A+ / 视频互动是否改善。";
    default:
      return "优先按 7/14/28 天窗口观察 CTR、CVR、自然位和广告成本。";
  }
}

function getConfidenceLabel(report: LegacyDiagnosisReport): string {
  if (report.ai.used && report.competitorSnapshots.length >= 2 && report.targetKeywords.length >= 10) {
    return "高：模型、竞品和关键词数据均可用";
  }

  if (report.competitorSnapshots.length > 0 || report.targetKeywords.length > 0) {
    return "中：已有规则证据，部分结论需复盘验证";
  }

  return "低：数据源不足，建议补竞品和关键词后复跑";
}

function findPillar(report: LegacyDiagnosisReport, id: string) {
  return report.pillars.find((pillar) => pillar.id === id);
}

function hasCriticalGap(gaps: LegacyDiagnosisReport["keywordGaps"]) {
  return gaps.some((gap) => gap.opportunity === "critical");
}

function shortPillarTitle(title: string): string {
  return title
    .replace("搜索相关性与索引路径", "搜索索引")
    .replace("类目、场景与受众映射", "场景类目")
    .replace("转化卖点与证据链", "卖点证据")
    .replace("移动端结构与可读性", "移动端")
    .replace("A+、图片与视频资产协同", "资产协同")
    .replace("口碑、价格与价值锚点", "价值锚点")
    .replace("流量结构与广告依赖", "广告依赖")
    .replace("变体治理与运营健康", "变体治理")
    .replace("合规、时效与实验计划", "合规实验");
}

function average(values: number[]): number {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  if (valid.length === 0) {
    return 0;
  }

  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
  }

  return `$${value.toFixed(2)}`;
}

function splitCompetitorAsins(value: string): string[] {
  return value
    .split(/[\s,，;；]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function splitBullets(value: string): string[] {
  return value
    .split(/\r?\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSellerSpriteRequestConfig(
  config: typeof DEFAULT_SELLER_SPRITE_CONFIG
): SellerSpriteRuntimeConfig | undefined {
  const nextConfig: SellerSpriteRuntimeConfig = {};
  const timeout = toPositiveInteger(config.requestTimeoutMs);

  if (config.baseUrl.trim()) {
    nextConfig.baseUrl = config.baseUrl.trim();
  }

  if (config.secretKey.trim()) {
    nextConfig.secretKey = config.secretKey.trim();
  }

  if (timeout !== undefined) {
    nextConfig.requestTimeoutMs = timeout;
  }

  return Object.keys(nextConfig).length > 0 ? nextConfig : undefined;
}

function toPositiveInteger(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

type RuntimeConnectivityResult = {
  status: "success" | "error";
  message: string;
  detail?: string;
};

function formatPreviewBaseUrl(baseUrl: string): string {
  if (!baseUrl.trim()) {
    return "server default";
  }

  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl.trim();
  }
}

function scoreBadgeClassName(status: "strong" | "watch" | "weak") {
  return cn(
    "text-white",
    status === "strong" && "bg-emerald-600 hover:bg-emerald-600",
    status === "watch" && "bg-amber-500 hover:bg-amber-500",
    status === "weak" && "bg-rose-600 hover:bg-rose-600"
  );
}

function priorityBadgeClassName(priority: "critical" | "high" | "medium") {
  return cn(
    "text-white",
    priority === "critical" && "bg-rose-600 hover:bg-rose-600",
    priority === "high" && "bg-amber-500 hover:bg-amber-500",
    priority === "medium" && "bg-slate-700 hover:bg-slate-700"
  );
}

function operatorPriorityBadgeClassName(priority: OperatorPriority) {
  return cn(
    "text-white",
    priority === "P0" && "bg-rose-600 hover:bg-rose-600",
    priority === "P1" && "bg-amber-500 hover:bg-amber-500",
    priority === "P2" && "bg-slate-700 hover:bg-slate-700"
  );
}

function statusLabel(status: "strong" | "watch" | "weak") {
  if (status === "strong") {
    return "强";
  }

  if (status === "watch") {
    return "观察";
  }

  return "弱";
}
