"use client";

import { useEffect, useState } from "react";
import {
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  ClipboardList,
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
const DEFAULT_RUNTIME_MODEL = "gpt-5.4";

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
  model: DEFAULT_RUNTIME_MODEL,
  apiKey: "",
};

const DEFAULT_SELLER_SPRITE_CONFIG = {
  baseUrl: DEFAULT_SELLER_SPRITE_BASE_URL,
  secretKey: "",
  requestTimeoutMs: "15000",
};

const MARKET_OPTIONS = ["US", "CA", "UK", "DE", "FR", "IT", "ES", "JP"];
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

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
  const [runtimeOpen, setRuntimeOpen] = useState(true);
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
        setRuntime(
          normalizeLegacyRuntimeConfig(JSON.parse(rawRuntime) as AiRuntimeServiceConfig)
        );
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
    const runtimeLoopbackWarning = getRuntimeLoopbackWarning(runtime.baseUrl);
    const effectiveRuntime = normalizeLegacyRuntimeConfig(runtime);

    if (runtimeLoopbackWarning) {
      setRuntimeTestResult({
        status: "error",
        message: runtimeLoopbackWarning,
        detail:
          "Use a local page such as http://localhost:3000/legacy-copy-diagnosis, or switch to a publicly reachable AI base URL.",
      });
      return;
    }

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
            ...effectiveRuntime,
          },
          runtimeConfig: {
            legacyCopyDiagnosis: effectiveRuntime,
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
    const effectiveRuntime = normalizeLegacyRuntimeConfig(runtime);
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
            ...effectiveRuntime,
          },
          runtimeConfig: {
            legacyCopyDiagnosis: effectiveRuntime,
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

  const runtimeLoopbackWarning = getRuntimeLoopbackWarning(runtime.baseUrl);

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
                      <p className="text-sm font-semibold text-slate-950">API 接入设置</p>
                      <p className="mt-1 text-sm leading-7 text-slate-500">
                        这里可以直接配置 SellerSprite MCP 和分析模型 API。这里的模型用于分析卖家精灵抓回的数据并生成诊断与优化建议，比如 gpt-5.4；密钥留空时会优先使用服务端环境变量。
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

                      {runtimeLoopbackWarning ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 md:col-span-2">
                          <p className="font-medium">
                            Loopback addresses only work from your own machine.
                          </p>
                          <p className="mt-1">
                            {runtimeLoopbackWarning} Open this tool from a local page, or replace
                            the AI base URL with a publicly reachable endpoint.
                          </p>
                        </div>
                      ) : null}

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
  const topBlockers = buildTopBlockers(report);

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <Card className="border-slate-200/80 bg-white/90 shadow-none">
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-slate-950 text-white hover:bg-slate-950">
              Structured diagnosis
            </Badge>
            <Badge variant="outline">ASIN {report.targetAsin}</Badge>
            <Badge variant="secondary">{report.marketplace}</Badge>
            <Badge variant={report.ai.used ? "secondary" : "outline"}>
              {report.ai.used ? `AI ${report.ai.model}` : "AI fallback"}
            </Badge>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-950">Top 3 blockers</p>
            <p className="mt-1 text-sm leading-7 text-slate-500">
              优先看这 3 条，它们是这次诊断里最该先动的具体问题。
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {topBlockers.map((item, index) => (
              <div
                key={`${index}-${item}`}
                className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Blocker {index + 1}
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <TabsList>
        <TabsTrigger value="overview">总览</TabsTrigger>
        <TabsTrigger value="pillars">支柱分</TabsTrigger>
        <TabsTrigger value="keywords">关键词缺口</TabsTrigger>
        <TabsTrigger value="rewrite">改写建议</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            icon={Target}
            title="诊断总分"
            value={`${report.score.total}/100`}
            note={report.score.label}
          />
          <MetricCard
            icon={Search}
            title="目标关键词数"
            value={String(report.targetKeywords.length)}
            note={`${report.keywordGaps.length} 个重点缺口`}
          />
          <MetricCard
            icon={Radar}
            title="竞品样本"
            value={String(report.competitorSnapshots.length)}
            note="基于卖家精灵 MCP"
          />
        </div>

        <Card className="border-slate-200/80 bg-white/85 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-xl text-slate-950">{report.score.headline}</CardTitle>
                <p className="mt-1 text-sm leading-7 text-slate-500">
                  目标 ASIN：{report.targetAsin}，当前标题与五点会优先用你手动输入的内容；没填的部分回退到卖家精灵抓取结果。
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-950">P0 动作</p>
              <SimpleList items={report.ai.output?.p0Actions ?? report.actionPlan.p0} />
            </div>
            <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-950">P1 / P2 动作</p>
              <SimpleList items={[...report.actionPlan.p1.slice(0, 3), ...report.actionPlan.p2.slice(0, 2)]} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-slate-200/80 bg-white/85 shadow-none">
            <CardHeader>
              <CardTitle className="text-lg text-slate-950">评论信号</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <SignalColumn
                title="负向主题"
                items={report.negativeThemes.map(
                  (item) =>
                    `${item.phrase} (${item.count})${item.addressedInCopy ? " · 文案已承接" : " · 文案未承接"}`
                )}
              />
              <SignalColumn
                title="正向主题"
                items={report.positiveThemes.map(
                  (item) =>
                    `${item.phrase} (${item.count})${item.addressedInCopy ? " · 文案已承接" : " · 仍可放大"}`
                )}
              />
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white/85 shadow-none">
            <CardHeader>
              <CardTitle className="text-lg text-slate-950">竞品快照</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.competitorSnapshots.map((item) => (
                <div
                  key={item.asin}
                  className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.asin}</Badge>
                    <Badge variant="secondary">{item.keywordCount} 词</Badge>
                    {item.hasAPlus ? <Badge variant="secondary">A+</Badge> : null}
                    {item.hasVideo ? <Badge variant="secondary">Video</Badge> : null}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.title}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    ${item.price.toFixed(2)} / {item.rating.toFixed(1)}★ / {item.reviews} 评 /
                    变体 {item.variationCount || 0}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="pillars" className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          {report.pillars.map((pillar) => (
            <Card key={pillar.id} className="border-slate-200/80 bg-white/85 shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-lg text-slate-950">{pillar.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge className={scoreBadgeClassName(pillar.status)}>{statusLabel(pillar.status)}</Badge>
                    <Badge variant="outline">
                      {pillar.score}/{pillar.maxScore}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm leading-7 text-slate-500">{pillar.summary}</p>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <DetailBlock title="发现" items={pillar.findings} />
                <DetailBlock title="建议" items={pillar.recommendedActions} />
                <DetailBlock title="证据" items={pillar.evidence} />
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="keywords" className="space-y-4">
        <Card className="border-slate-200/80 bg-white/85 shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-slate-950">重点关键词缺口</CardTitle>
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
        <Card className="border-slate-200/80 bg-white/85 shadow-none">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <BrainCircuit className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-950">模型分析与优化建议</CardTitle>
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
                  <p className="text-sm font-semibold text-slate-950">总评</p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {report.ai.output.executiveSummary}
                  </p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <DetailBlock title="Quick Wins" items={report.ai.output.quickWins} />
                  <DetailBlock title="Watchouts" items={report.ai.output.watchouts} />
                </div>
                <RewriteCompareBlock
                  title="Title Suggestion"
                  current={report.resolvedTitle}
                  suggested={report.ai.output.titleSuggestion}
                  report={report}
                />
                <div className="space-y-3">
                  {report.ai.output.bulletSuggestions.map((suggested, index) => (
                    <RewriteCompareBlock
                      key={`bullet-${index}-${suggested}`}
                      title={`Bullet ${index + 1}`}
                      current={report.resolvedBullets[index] ?? ""}
                      suggested={suggested}
                      report={report}
                    />
                  ))}
                </div>
                <RewriteCompareBlock
                  title="Search Terms Suggestion"
                  current={report.resolvedSearchTerms}
                  suggested={report.ai.output.searchTermsSuggestion}
                  report={report}
                />
              </>
            ) : (
              <>
              <div className="rounded-[1.2rem] border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm leading-7 text-slate-500">
                当前没有追加模型分析输出。规则诊断已完成；如果要让模型基于数据进一步生成优化建议与英文标题、五点、Search Terms，请填写分析模型 API 配置，或在服务端补可用模型凭证。
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <DetailBlock title="Title priorities" items={buildFallbackTitleTargets(report)} />
                <DetailBlock title="Bullet focus" items={buildFallbackBulletTargets(report)} />
                <DetailBlock
                  title="Search terms backlog"
                  items={buildFallbackSearchTermTargets(report)}
                />
              </div>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
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

type SuggestionEvidence = {
  keywordGaps: string[];
  reviewSignals: string[];
  competitorSignals: string[];
  impactLabels: string[];
};

function RewriteCompareBlock({
  title,
  current,
  suggested,
  report,
}: {
  title: string;
  current: string;
  suggested: string;
  report: LegacyDiagnosisReport;
}) {
  const evidence = buildSuggestionEvidence(suggested, report);

  return (
    <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        {evidence.impactLabels.map((label) => (
          <Badge key={`${title}-${label}`} variant="outline">
            {label}
          </Badge>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1rem] border border-slate-200 bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Current
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-500">
            {current || "No current copy provided."}
          </p>
        </div>

        <div className="rounded-[1rem] border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Suggested
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-700">
            {suggested || "No suggestion generated."}
          </p>
        </div>
      </div>

      <SuggestionEvidenceBadges evidence={evidence} />
    </div>
  );
}

function SuggestionEvidenceBadges({ evidence }: { evidence: SuggestionEvidence }) {
  const chips = [
    ...evidence.keywordGaps.map((item) => ({ key: `keyword-${item}`, label: `Keyword ${item}` })),
    ...evidence.reviewSignals.map((item) => ({
      key: `review-${item}`,
      label: `Review ${item}`,
    })),
    ...evidence.competitorSignals.map((item) => ({
      key: `competitor-${item}`,
      label: `Competitor ${item}`,
    })),
  ].slice(0, 6);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        Evidence anchors
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Badge key={chip.key} variant="secondary">
            {chip.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function buildTopBlockers(report: LegacyDiagnosisReport): string[] {
  const blockers = [
    ...(report.ai.output?.p0Actions ?? []),
    ...report.actionPlan.p0,
    ...report.keywordGaps
      .slice(0, 2)
      .map((gap) => `Keyword gap ${gap.keyword}: ${gap.reason}`),
    ...report.negativeThemes
      .filter((theme) => !theme.addressedInCopy)
      .slice(0, 1)
      .map((theme) => `Review objection ${theme.phrase}: ${theme.sample}`),
  ]
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(blockers)).slice(0, 3);
}

function buildSuggestionEvidence(
  text: string,
  report: LegacyDiagnosisReport
): SuggestionEvidence {
  const keywordGaps = report.keywordGaps
    .filter((item) => matchesSuggestionPhrase(text, item.keyword))
    .slice(0, 3)
    .map((item) => item.keyword);
  const reviewSignals = [...report.negativeThemes, ...report.positiveThemes]
    .filter((item) => matchesSuggestionPhrase(text, item.phrase))
    .slice(0, 2)
    .map((item) => item.phrase);
  const competitorSignals = report.competitorSnapshots
    .flatMap((item) =>
      item.topKeywords
        .filter((keyword) => matchesSuggestionPhrase(text, keyword))
        .slice(0, 1)
        .map((keyword) => `${item.asin}: ${keyword}`)
    )
    .slice(0, 2);

  const impactLabels = [
    keywordGaps.length > 0 ? "Search gap" : null,
    reviewSignals.length > 0 ? "Review objection" : null,
    competitorSignals.length > 0 ? "Competitor parity" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    keywordGaps,
    reviewSignals,
    competitorSignals,
    impactLabels,
  };
}

function buildFallbackTitleTargets(report: LegacyDiagnosisReport): string[] {
  return report.keywordGaps
    .filter((item) => !item.coverage.title)
    .slice(0, 4)
    .map((item) => `${item.keyword}: ${item.reason}`);
}

function buildFallbackBulletTargets(report: LegacyDiagnosisReport): string[] {
  const items = [
    ...report.negativeThemes
      .filter((item) => !item.addressedInCopy)
      .slice(0, 3)
      .map((item) => `Answer review objection "${item.phrase}" in bullets or A+.`),
    ...report.positiveThemes
      .filter((item) => !item.addressedInCopy)
      .slice(0, 2)
      .map((item) => `Turn positive signal "${item.phrase}" into a concrete proof point.`),
  ];

  return Array.from(new Set(items)).slice(0, 5);
}

function buildFallbackSearchTermTargets(report: LegacyDiagnosisReport): string[] {
  return report.keywordGaps
    .filter((item) => !item.coverage.searchTerms)
    .slice(0, 6)
    .map((item) => `${item.keyword}: uncovered in backend search terms`);
}

function matchesSuggestionPhrase(text: string, phrase: string): boolean {
  const normalizedText = normalizeSuggestionText(text);
  const normalizedPhrase = normalizeSuggestionText(phrase);

  return Boolean(normalizedText && normalizedPhrase && normalizedText.includes(normalizedPhrase));
}

function normalizeSuggestionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function normalizeLegacyRuntimeConfig(
  runtime: Partial<AiRuntimeServiceConfig> | null | undefined
): AiRuntimeServiceConfig {
  return {
    provider: typeof runtime?.provider === "string" ? runtime.provider : "",
    baseUrl: typeof runtime?.baseUrl === "string" ? runtime.baseUrl : "",
    model:
      typeof runtime?.model === "string" && runtime.model.trim()
        ? runtime.model
        : DEFAULT_RUNTIME_MODEL,
    apiKey: typeof runtime?.apiKey === "string" ? runtime.apiKey : "",
  };
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

function getRuntimeLoopbackWarning(baseUrl: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (LOOPBACK_HOSTS.has(window.location.hostname) || !isLoopbackBaseUrl(baseUrl)) {
    return null;
  }

  return "This page is running on a remote site, but the AI base URL points to 127.0.0.1 / localhost. Requests from the deployed server cannot reach your local proxy.";
}

function isLoopbackBaseUrl(baseUrl: string): boolean {
  const value = baseUrl.trim();

  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i.test(value);
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

function statusLabel(status: "strong" | "watch" | "weak") {
  if (status === "strong") {
    return "强";
  }

  if (status === "watch") {
    return "观察";
  }

  return "弱";
}
