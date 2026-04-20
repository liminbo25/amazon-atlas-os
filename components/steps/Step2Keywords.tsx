"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useListingStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Database,
  FileSpreadsheet,
  Loader2,
  Megaphone,
  Radar,
  RefreshCw,
  ScanSearch,
  SearchCode,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import type {
  AiRuntimeRequestConfig,
  DataAnalysisResult,
  KeywordAllocationItem,
  KeywordCampaignPlan,
  OpportunityAssessment,
  RufusIntentItem,
} from "@/lib/types";

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6 text-center">
        <div className="text-2xl font-bold text-[#FF9900]">{value}</div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function SectionEmpty({ description }: { description: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
      {description}
    </div>
  );
}

function InsightBlock({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      {items.length > 0 ? (
        <ul className="space-y-2 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item} className="rounded-lg bg-muted/40 px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}

function OpportunityPanel({ assessment }: { assessment: OpportunityAssessment }) {
  const scoreTone =
    assessment.score >= 75
      ? "text-emerald-600"
      : assessment.score >= 55
        ? "text-amber-600"
        : "text-rose-600";

  const verdictLabel =
    assessment.verdict === "priority"
      ? "优先打"
      : assessment.verdict === "test"
        ? "先测试"
        : "先观察";

  return (
    <Card className="border-[#FF9900]/30 bg-orange-50/30">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-[#FF9900]" />
              <CardTitle className="text-base">机会评分层</CardTitle>
              <Badge
                className={
                  assessment.verdict === "priority"
                    ? "bg-emerald-600"
                    : assessment.verdict === "test"
                      ? "bg-amber-500"
                      : "bg-slate-700"
                }
              >
                {verdictLabel}
              </Badge>
            </div>
            <CardDescription>{assessment.summary}</CardDescription>
          </div>

          <div className="rounded-2xl border bg-white px-5 py-4 text-center shadow-sm">
            <p className={`text-4xl font-bold ${scoreTone}`}>{assessment.score}</p>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              opportunity score
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-4">
          {assessment.breakdown.map((item) => (
            <div key={item.key} className="rounded-2xl border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{item.label}</p>
                <Badge variant="outline">{item.score}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{item.rationale}</p>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                {item.evidence.map((evidence) => (
                  <p key={evidence} className="rounded-lg bg-muted/40 px-2 py-1">
                    {evidence}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 rounded-2xl border bg-white p-4">
            <p className="text-sm font-semibold text-emerald-700">可打优势</p>
            {assessment.strengths.length > 0 ? (
              assessment.strengths.map((item) => (
                <p key={item} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  {item}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">暂无额外优势总结。</p>
            )}
          </div>
          <div className="space-y-2 rounded-2xl border bg-white p-4">
            <p className="text-sm font-semibold text-rose-700">主要风险</p>
            {assessment.risks.length > 0 ? (
              assessment.risks.map((item) => (
                <p key={item} className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  {item}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">暂无额外风险总结。</p>
            )}
          </div>
          <div className="space-y-2 rounded-2xl border bg-white p-4">
            <p className="text-sm font-semibold text-sky-700">下一步动作</p>
            {assessment.nextActions.length > 0 ? (
              assessment.nextActions.map((item) => (
                <p key={item} className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  {item}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">暂无额外建议。</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KeywordBucketCard({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: KeywordAllocationItem[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.keyword} className="rounded-2xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.keyword}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                </div>
                <Badge variant="outline">{item.priority}</Badge>
              </div>
              {item.evidence ? (
                <p className="mt-2 rounded-lg bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                  {item.evidence}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <SectionEmpty description="当前没有可展示的关键词。" />
        )}
      </CardContent>
    </Card>
  );
}

function CampaignPlanCard({ plan }: { plan: KeywordCampaignPlan }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{plan.name}</p>
          <p className="text-sm text-muted-foreground">{plan.goal}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{plan.matchType}</Badge>
          <Badge>{plan.budgetPriority} budget</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            主攻词
          </p>
          <div className="flex flex-wrap gap-2">
            {plan.keywords.map((keyword) => (
              <Badge key={keyword}>{keyword}</Badge>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            否定词
          </p>
          <div className="flex flex-wrap gap-2">
            {plan.negativeKeywords.length > 0 ? (
              plan.negativeKeywords.map((keyword) => (
                <Badge key={keyword} variant="destructive">
                  {keyword}
                </Badge>
              ))
            ) : (
              <Badge variant="outline">待补充</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {plan.launchPlan}
      </div>
    </div>
  );
}

function IntentColumn({ title, items }: { title: string; items: RufusIntentItem[] }) {
  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      {items.length > 0 ? (
        items.map((item) => (
          <div key={`${title}-${item.question}`} className="rounded-2xl bg-muted/30 p-3">
            <p className="font-medium">{item.question}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.responseAngle}</p>
            {item.listingHooks.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {item.listingHooks.map((hook) => (
                  <Badge key={`${item.question}-${hook}`} variant="outline">
                    {hook}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ))
      ) : (
        <SectionEmpty description="当前没有可展示的意图条目。" />
      )}
    </div>
  );
}

export function Step2Keywords() {
  const {
    productProfile,
    targetMarket,
    competitorAsins,
    coreSellingPoints,
    supportAssets,
    competitorListings,
    competitorReviews,
    positiveReviews,
    trafficKeywords,
    dataAnalysis,
    aiRuntimeSettings,
    setCompetitorListings,
    setCompetitorReviews,
    setPositiveReviews,
    setTrafficKeywords,
    setDataAnalysis,
    setPainPoints,
    setValuePoints,
    setCompetitorAnalysis,
    setVocActionPlan,
    setSupportFaqs,
    setListingVersions,
    setComplianceResults,
    setCurrentStep,
  } = useListingStore();

  const [activeAsin, setActiveAsin] = useState(competitorAsins[0] || "");
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(competitorListings.length > 0);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const analysisInFlightRef = useRef(false);
  const lastAutoFetchKeyRef = useRef<string | null>(null);
  const lastAutoInsightKeyRef = useRef<string | null>(null);

  const hasRequiredInput = competitorAsins.length > 0;
  const fetchKey = `${targetMarket}:${competitorAsins.join("|")}`;
  const hasListingData =
    competitorListings.length > 0 &&
    competitorAsins.every((asin) =>
      competitorListings.some((listing) => listing.asin === asin)
    );

  const totalNegativeReviews = Object.values(competitorReviews).reduce(
    (sum, reviews) => sum + reviews.length,
    0
  );
  const totalPositiveReviews = Object.values(positiveReviews).reduce(
    (sum, reviews) => sum + reviews.length,
    0
  );
  const totalKeywords = Object.values(trafficKeywords).reduce(
    (sum, keywords) => sum + keywords.length,
    0
  );
  const abaRowCount = supportAssets.abaReport?.rows.length ?? 0;
  const rufusCount = supportAssets.rufusScreenshots.length;
  const opportunityScore = dataAnalysis?.opportunityAssessment?.score ?? "--";
  const insightKey = [
    fetchKey,
    competitorListings.length,
    totalKeywords,
    productProfile.productName,
    productProfile.productCategory,
    productProfile.coreKeywords,
    supportAssets.abaReport?.content.length ?? 0,
    supportAssets.abaReport?.fileName ?? "",
    rufusCount,
    supportAssets.rufusScreenshots.map((item) => item.name).join("|"),
  ].join("::");

  const runInsightAnalysis = useCallback(
    async (options?: {
      listings?: typeof competitorListings;
      keywords?: typeof trafficKeywords;
    }) => {
      if (analysisInFlightRef.current) {
        return;
      }

      const listings = options?.listings ?? competitorListings;
      const keywords = options?.keywords ?? trafficKeywords;
      const hasAnySource =
        listings.length > 0 ||
        Object.values(keywords).flat().length > 0 ||
        Boolean(supportAssets.abaReport) ||
        supportAssets.rufusScreenshots.length > 0;

      if (!hasAnySource) {
        setDataAnalysis(null);
        return;
      }

      analysisInFlightRef.current = true;
      setAnalysisLoading(true);
      setAnalysisError(null);

      try {
        const analysisRuntime: AiRuntimeRequestConfig = {
          task: "vocAnalysis",
          ...aiRuntimeSettings.vocAnalysis,
        };

        const response = await fetch("/api/data-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetMarket,
            productProfile,
            coreSellingPoints,
            competitorAsins,
            listings,
            trafficKeywords: keywords,
            abaReport: supportAssets.abaReport,
            rufusScreenshots: supportAssets.rufusScreenshots,
            runtime: analysisRuntime,
            runtimeConfig: aiRuntimeSettings,
          }),
        });

        const json = (await response.json()) as DataAnalysisResult & { error?: string };

        if (!response.ok) {
          throw new Error(json.error || "AI 数据分析失败");
        }

        setDataAnalysis(json);
      } catch (error) {
        setAnalysisError(error instanceof Error ? error.message : "AI 数据分析失败");
      } finally {
        analysisInFlightRef.current = false;
        setAnalysisLoading(false);
      }
    },
    [
      aiRuntimeSettings,
      competitorAsins,
      competitorListings,
      coreSellingPoints,
      productProfile,
      setDataAnalysis,
      supportAssets,
      targetMarket,
      trafficKeywords,
    ]
  );

  const fetchData = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }

    if (!hasRequiredInput) {
      setFetchError("请先在 Step 1 填写竞品 ASIN。");
      return;
    }

    inFlightRef.current = true;
    setIsLoading(true);
    setFetchError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asins: competitorAsins,
          marketplace: targetMarket,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "卖家精灵数据采集失败");
      }

      setCompetitorListings(data.listings ?? []);
      setCompetitorReviews(data.reviews ?? {});
      setPositiveReviews(data.positiveReviews ?? {});
      setTrafficKeywords(data.keywords ?? {});
      setDataAnalysis(null);
      setPainPoints([]);
      setValuePoints([]);
      setCompetitorAnalysis([]);
      setVocActionPlan(null);
      setSupportFaqs([]);
      setListingVersions([]);
      setComplianceResults({});
      setHasFetchedOnce(true);

      await runInsightAnalysis({
        listings: data.listings ?? [],
        keywords: data.keywords ?? {},
      });
    } catch (error) {
      setFetchError(
        error instanceof Error ? error.message : "卖家精灵数据采集失败"
      );
      setHasFetchedOnce(true);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [
    competitorAsins,
    hasRequiredInput,
    runInsightAnalysis,
    setCompetitorAnalysis,
    setCompetitorListings,
    setCompetitorReviews,
    setComplianceResults,
    setDataAnalysis,
    setListingVersions,
    setPainPoints,
    setPositiveReviews,
    setSupportFaqs,
    setTrafficKeywords,
    setValuePoints,
    setVocActionPlan,
    targetMarket,
  ]);

  useEffect(() => {
    if (competitorAsins.length === 0) {
      setActiveAsin("");
      return;
    }

    if (!competitorAsins.includes(activeAsin)) {
      setActiveAsin(competitorAsins[0]);
    }
  }, [activeAsin, competitorAsins]);

  useEffect(() => {
    if (!hasRequiredInput || hasListingData || lastAutoFetchKeyRef.current === fetchKey) {
      return;
    }

    lastAutoFetchKeyRef.current = fetchKey;
    void fetchData();
  }, [fetchData, fetchKey, hasListingData, hasRequiredInput]);

  useEffect(() => {
    if (
      !hasListingData ||
      analysisLoading ||
      dataAnalysis ||
      lastAutoInsightKeyRef.current === insightKey
    ) {
      return;
    }

    lastAutoInsightKeyRef.current = insightKey;
    void runInsightAnalysis();
  }, [analysisLoading, dataAnalysis, hasListingData, insightKey, runInsightAnalysis]);

  if (!hasRequiredInput) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Database className="h-10 w-10 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-base font-medium">还没有可分析的竞品</p>
            <p className="text-sm text-muted-foreground">
              请先返回 Step 1 填写产品信息和竞品 ASIN，再开始数据分析流程。
            </p>
          </div>
          <Button variant="outline" onClick={() => setCurrentStep(1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回 Step 1
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF9900]" />
        <p className="text-sm text-muted-foreground">
          正在拉取卖家精灵真实数据，并联动 AI 生成机会评分与关键词执行层...
        </p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="space-y-2 text-center text-red-500">
          <p className="font-semibold">卖家精灵数据采集失败</p>
          <p className="text-sm">{fetchError}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => void fetchData()}>
            重新采集
          </Button>
          <Button variant="ghost" onClick={() => setCurrentStep(1)}>
            返回上一步
          </Button>
        </div>
      </div>
    );
  }

  if (hasFetchedOnce && competitorListings.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Database className="h-10 w-10 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-base font-medium">这次没有采集到可展示的竞品数据</p>
            <p className="text-sm text-muted-foreground">
              请检查 ASIN 是否有效，或返回 Step 1 调整竞品后重试。
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => void fetchData()}>
              重新采集
            </Button>
            <Button variant="ghost" onClick={() => setCurrentStep(1)}>
              返回 Step 1
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const keywordStrategy = dataAnalysis?.keywordStrategy;
  const rufusIntentLayer = dataAnalysis?.rufusIntentLayer;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Step 2: 机会判断与词路由</CardTitle>
            <CardDescription>
              卖家精灵真实数据 + ABA + Rufus + AI 智能分析，统一沉淀为“值不值得打、词怎么打、流量怎么接”的操盘输入。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void fetchData()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新采集卖家精灵
            </Button>
            <Button variant="outline" onClick={() => void runInsightAnalysis()}>
              <Bot className="mr-2 h-4 w-4" />
              重新运行 AI 分析
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="卖家精灵竞品" value={competitorListings.length} />
        <SummaryCard label="关键词样本" value={totalKeywords} />
        <SummaryCard label="ABA 预览行数" value={abaRowCount} />
        <SummaryCard label="Rufus 截图" value={rufusCount} />
        <SummaryCard label="差评样本" value={totalNegativeReviews} />
        <SummaryCard label="机会分" value={opportunityScore} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">数据源状态</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">卖家精灵 {competitorListings.length > 0 ? "已接入" : "待采集"}</Badge>
          <Badge variant="outline">ABA {supportAssets.abaReport ? "已上传" : "未上传"}</Badge>
          <Badge variant="outline">Rufus {rufusCount > 0 ? `已上传 ${rufusCount} 张` : "未上传"}</Badge>
          <Badge variant="outline">
            AI 智能分析 {dataAnalysis ? "已生成" : analysisLoading ? "分析中" : "待生成"}
          </Badge>
        </CardContent>
      </Card>

      {analysisLoading ? (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-[#FF9900]" />
            AI 正在融合卖家精灵、ABA 和 Rufus 数据，生成机会评分、关键词路由和 Rufus 意图层...
          </CardContent>
        </Card>
      ) : null}

      {analysisError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {analysisError}
        </div>
      ) : null}

      {dataAnalysis?.opportunityAssessment ? (
        <OpportunityPanel assessment={dataAnalysis.opportunityAssessment} />
      ) : null}

      {keywordStrategy ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SearchCode className="h-5 w-5 text-sky-600" />
              <CardTitle className="text-base">关键词分工图</CardTitle>
            </div>
            <CardDescription>
              不再把关键词当成一个词桶，而是拆成标题词、Bullet 词、Search Terms、PPC 主攻词、探索词和否定词。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-3">
            <KeywordBucketCard title="标题词" description="承担相关性与点击入口。" items={keywordStrategy.titleKeywords} />
            <KeywordBucketCard title="Bullet 词" description="配合卖点和场景承接。" items={keywordStrategy.bulletKeywords} />
            <KeywordBucketCard title="Search Terms" description="补长尾和后台索引空间。" items={keywordStrategy.searchTermKeywords} />
            <KeywordBucketCard title="PPC 主攻词" description="优先放 Exact / Phrase。" items={keywordStrategy.ppcCoreKeywords} />
            <KeywordBucketCard title="PPC 探索词" description="适合 Broad / Phrase 探索。" items={keywordStrategy.ppcExploratoryKeywords} />
            <KeywordBucketCard title="否定词建议" description="先挡掉明显低意图或错配词。" items={keywordStrategy.negativeKeywords} />
          </CardContent>
        </Card>
      ) : null}

      {keywordStrategy?.campaignPlans.length ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-base">PPC 执行单</CardTitle>
            </div>
            <CardDescription>
              直接给出 campaign 结构、匹配方式、预算优先级和否定词建议。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {keywordStrategy.campaignPlans.map((plan) => (
              <CampaignPlanCard key={plan.name} plan={plan} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {rufusIntentLayer ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Radar className="h-5 w-5 text-violet-600" />
              <CardTitle className="text-base">Rufus 意图层</CardTitle>
            </div>
            <CardDescription>
              按场景、人群、顾虑、对比分组，方便后续写标题、FAQ、A+ 和客服话术。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-4">
            <IntentColumn title="场景" items={rufusIntentLayer.scene} />
            <IntentColumn title="人群" items={rufusIntentLayer.audience} />
            <IntentColumn title="顾虑" items={rufusIntentLayer.objections} />
            <IntentColumn title="对比" items={rufusIntentLayer.comparisons} />
          </CardContent>
        </Card>
      ) : null}

      {dataAnalysis ? (
        <Card className="border-[#FF9900]/20 bg-orange-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-[#FF9900]" />
              AI 多源策略洞察
            </CardTitle>
            <CardDescription>补充操盘视角的卖家精灵、ABA、Rufus 和 COSMO 导向总结。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border bg-white/80 p-4">
              <h4 className="text-sm font-semibold">多源市场总结</h4>
              <p className="mt-2 text-sm text-muted-foreground">{dataAnalysis.marketOverview}</p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <InsightBlock title="卖家精灵洞察" items={dataAnalysis.sellerSpriteInsights} emptyText="当前没有额外的卖家精灵洞察。" />
              <InsightBlock title="ABA 洞察" items={dataAnalysis.abaInsights} emptyText="尚未上传 ABA 数据，未生成额外洞察。" />
              <InsightBlock title="Rufus 洞察" items={dataAnalysis.rufusInsights} emptyText="尚未上传 Rufus 截图，未生成额外洞察。" />
              <InsightBlock title="AI 操盘建议" items={dataAnalysis.aiRecommendations} emptyText="当前没有额外的策略建议。" />
            </div>
            <InsightBlock title="COSMO 导向" items={dataAnalysis.cosmoFocus} emptyText="当前没有额外的 COSMO 导向建议。" />
          </CardContent>
        </Card>
      ) : null}

      {supportAssets.abaReport ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-base">ABA 数据预览</CardTitle>
            </div>
            <CardDescription>{supportAssets.abaReport.fileName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {supportAssets.abaReport.headers.map((header) => (
                <Badge key={header} variant="outline">
                  {header}
                </Badge>
              ))}
            </div>
            {supportAssets.abaReport.rows.length > 0 ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                {supportAssets.abaReport.rows.slice(0, 5).map((row, index) => (
                  <div key={index} className="rounded-lg bg-muted/40 px-3 py-2">
                    {row.join(" | ")}
                  </div>
                ))}
              </div>
            ) : (
              <SectionEmpty description="当前 ABA 文件没有可展示的预览行。" />
            )}
          </CardContent>
        </Card>
      ) : null}

      {supportAssets.rufusScreenshots.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ScanSearch className="h-5 w-5 text-sky-600" />
              <CardTitle className="text-base">Rufus 截图样本</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {supportAssets.rufusScreenshots.map((item) => (
              <div key={item.id} className="overflow-hidden rounded-xl border">
                <div className="relative aspect-[4/3] bg-slate-100">
                  <Image
                    src={item.preview}
                    alt={item.name}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                </div>
                <div className="truncate px-3 py-2 text-xs text-muted-foreground">
                  {item.name}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">竞品 Listing 对比</CardTitle>
          <CardDescription>
            底层仍然保留完整竞品标题、评分、月销和关键词样本，方便继续追根溯源。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[100px]">ASIN</TableHead>
                  <TableHead className="min-w-[250px]">标题</TableHead>
                  <TableHead>价格</TableHead>
                  <TableHead>评分</TableHead>
                  <TableHead>评论数</TableHead>
                  <TableHead>月销</TableHead>
                  <TableHead>BSR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitorListings.map((listing) => (
                  <TableRow key={listing.asin}>
                    <TableCell className="font-mono text-xs">{listing.asin}</TableCell>
                    <TableCell className="max-w-xs">
                      <p className="line-clamp-2 text-sm">{listing.title || "--"}</p>
                    </TableCell>
                    <TableCell>${listing.price}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{listing.rating}</Badge>
                    </TableCell>
                    <TableCell>{listing.reviews.toLocaleString()}</TableCell>
                    <TableCell>{listing.monthlySales.toLocaleString()}</TableCell>
                    <TableCell>#{listing.bsr.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="差评条数" value={totalNegativeReviews} />
        <SummaryCard label="好评条数" value={totalPositiveReviews} />
        <SummaryCard label="目标市场" value={targetMarket} />
      </div>

      <Tabs value={activeAsin} onValueChange={setActiveAsin}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          {competitorAsins.map((asin) => (
            <TabsTrigger key={asin} value={asin} className="font-mono text-xs">
              {asin}
            </TabsTrigger>
          ))}
        </TabsList>

        {competitorAsins.map((asin) => {
          const listing = competitorListings.find((item) => item.asin === asin);
          const negativeReviews = competitorReviews[asin] || [];
          const positive = positiveReviews[asin] || [];
          const keywords = trafficKeywords[asin] || [];

          return (
            <TabsContent key={asin} value={asin} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">五点描述</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {listing?.bulletPoints.length ? (
                    listing.bulletPoints.map((bulletPoint, index) => (
                      <div key={index} className="rounded-lg bg-muted/50 p-3 text-sm">
                        <span className="mr-2 font-semibold text-[#FF9900]">{index + 1}.</span>
                        {bulletPoint}
                      </div>
                    ))
                  ) : (
                    <SectionEmpty description="该竞品暂无可展示的五点描述。" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    差评样本
                    <Badge variant="destructive" className="ml-2">
                      {negativeReviews.length} 条
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {negativeReviews.length > 0 ? (
                    <div className="max-h-[360px] space-y-3 overflow-y-auto">
                      {negativeReviews.slice(0, 12).map((review) => (
                        <div key={review.id} className="space-y-1 rounded-lg border p-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={review.rating <= 2 ? "destructive" : "secondary"}>
                              {review.rating} star
                            </Badge>
                            <span className="ml-auto text-xs text-muted-foreground">{review.date}</span>
                          </div>
                          <p className="text-sm font-medium">{review.title}</p>
                          <p className="text-sm text-muted-foreground">{review.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <SectionEmpty description="该竞品暂无差评样本。" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    好评样本
                    <Badge className="ml-2 bg-green-500">{positive.length} 条</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {positive.length > 0 ? (
                    <div className="max-h-[360px] space-y-3 overflow-y-auto">
                      {positive.slice(0, 12).map((review) => (
                        <div key={review.id} className="space-y-1 rounded-lg border border-green-200 p-3">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-green-500">{review.rating} star</Badge>
                            <span className="ml-auto text-xs text-muted-foreground">{review.date}</span>
                          </div>
                          <p className="text-sm font-medium">{review.title}</p>
                          <p className="text-sm text-muted-foreground">{review.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <SectionEmpty description="该竞品暂无好评样本。" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-slate-500" />
                    <CardTitle className="text-base">关键词样本</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {keywords.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>关键词</TableHead>
                            <TableHead>月搜索量</TableHead>
                            <TableHead>自然位</TableHead>
                            <TableHead>广告位</TableHead>
                            <TableHead>转化份额</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {keywords.map((keyword, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{keyword.keyword}</TableCell>
                              <TableCell>{keyword.searchVolume.toLocaleString()}</TableCell>
                              <TableCell>#{keyword.organicRank}</TableCell>
                              <TableCell>{keyword.sponsoredRank ? `#${keyword.sponsoredRank}` : "-"}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{formatConversionShare(keyword.conversionShare)}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <SectionEmpty description="该竞品暂无可展示的关键词样本。" />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setCurrentStep(1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          上一步
        </Button>
        <Button onClick={() => setCurrentStep(3)} className="bg-[#FF9900] hover:bg-[#FF9900]/90">
          下一步：VOC 行动层
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function formatConversionShare(value: number): string {
  const normalized = value <= 1 && value > 0 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}
