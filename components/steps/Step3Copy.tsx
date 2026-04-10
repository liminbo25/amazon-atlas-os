"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AiRequestErrorAlert,
  ApiRequestError,
  normalizeApiRequestError,
  parseApiRequestError,
} from "@/components/AiRequestErrorAlert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useListingStore } from "@/lib/store";
import type {
  AiRuntimeRequestConfig,
  CompetitorCopyAnalysis,
  PainPoint,
  ValuePoint,
} from "@/lib/types";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  MessagesSquare,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

function SectionEmpty({ description }: { description: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
      {description}
    </div>
  );
}

export function Step3Copy() {
  const {
    competitorListings,
    competitorReviews,
    positiveReviews,
    painPoints,
    valuePoints,
    competitorAnalysis,
    aiRuntimeSettings,
    setPainPoints,
    setValuePoints,
    setCompetitorAnalysis,
    setListingVersions,
    setComplianceResults,
    setCurrentStep,
  } = useListingStore();

  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<ApiRequestError | null>(null);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(
    painPoints.length > 0 || valuePoints.length > 0 || competitorAnalysis.length > 0
  );
  const inFlightRef = useRef(false);
  const lastAutoFetchKeyRef = useRef<string | null>(null);

  const reviewCount = Object.values(competitorReviews).reduce(
    (sum, reviews) => sum + reviews.length,
    0
  );
  const positiveReviewCount = Object.values(positiveReviews).reduce(
    (sum, reviews) => sum + reviews.length,
    0
  );
  const hasRequiredInput =
    competitorListings.length > 0 && (reviewCount > 0 || positiveReviewCount > 0);
  const hasAnalysisData =
    painPoints.length > 0 || valuePoints.length > 0 || competitorAnalysis.length > 0;
  const requestKey = [
    competitorListings.map((listing) => listing.asin).join("|"),
    reviewCount,
    positiveReviewCount,
  ].join("::");

  const fetchAnalysis = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }

    if (!hasRequiredInput) {
      setFetchError(
        new ApiRequestError(
          "请先在 Step 2 完成竞品 Listing 和评论采集，再进行 VOC 分析。",
          { status: 400 }
        )
      );
      return;
    }

    inFlightRef.current = true;
    setIsLoading(true);
    setFetchError(null);

    try {
      const vocRuntime: AiRuntimeRequestConfig = {
        task: "vocAnalysis",
        ...aiRuntimeSettings.vocAnalysis,
      };

      const response = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviews: competitorReviews,
          positiveReviews,
          listings: competitorListings,
          runtime: vocRuntime,
          runtimeConfig: aiRuntimeSettings,
        }),
      });

      if (!response.ok) {
        throw await parseApiRequestError(response, "VOC 分析失败");
      }

      const data = (await response.json()) as {
        painPoints?: PainPoint[];
        valuePoints?: ValuePoint[];
        competitorAnalysis?: CompetitorCopyAnalysis[];
      };

      setPainPoints(data.painPoints ?? []);
      setValuePoints(data.valuePoints ?? []);
      setCompetitorAnalysis(data.competitorAnalysis ?? []);
      setListingVersions([]);
      setComplianceResults({});
      setHasFetchedOnce(true);
    } catch (error) {
      setFetchError(normalizeApiRequestError(error, "VOC 分析失败"));
      setHasFetchedOnce(true);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [
    aiRuntimeSettings,
    competitorListings,
    competitorReviews,
    hasRequiredInput,
    positiveReviews,
    setCompetitorAnalysis,
    setComplianceResults,
    setListingVersions,
    setPainPoints,
    setValuePoints,
  ]);

  useEffect(() => {
    if (!hasRequiredInput || hasAnalysisData || lastAutoFetchKeyRef.current === requestKey) {
      return;
    }

    lastAutoFetchKeyRef.current = requestKey;
    void fetchAnalysis();
  }, [fetchAnalysis, hasAnalysisData, hasRequiredInput, requestKey]);

  if (!hasRequiredInput) {
    return (
      <div className="space-y-6">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <MessagesSquare className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-base font-medium">VOC 分析所需数据还不完整</p>
              <p className="text-sm text-muted-foreground">
                请先回到 Step 2 完成竞品 Listing、差评和好评采集，再进入评论洞察分析。
              </p>
            </div>
            <Button variant="outline" onClick={() => setCurrentStep(2)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回 Step 2
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF9900]" />
        <p className="text-sm text-muted-foreground">
          AI 正在分析评论、归纳痛点与价值点...
        </p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-6">
        <AiRequestErrorAlert
          heading="VOC 分析失败"
          error={fetchError}
          runtimeConfig={aiRuntimeSettings.vocAnalysis}
          actions={
            <>
              <Button variant="outline" onClick={() => void fetchAnalysis()}>
                重新尝试
              </Button>
              <Button variant="ghost" onClick={() => setCurrentStep(2)}>
                返回上一步
              </Button>
            </>
          }
        />
      </div>
    );
  }

  if (hasFetchedOnce && !hasAnalysisData) {
    return (
      <div className="space-y-6">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <MessagesSquare className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-base font-medium">这次没有提炼出可展示的 VOC 结果</p>
              <p className="text-sm text-muted-foreground">
                可以先回到 Step 2 检查评论样本，再重新发起分析。
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => void fetchAnalysis()}>
                重新分析
              </Button>
              <Button variant="ghost" onClick={() => setCurrentStep(2)}>
                返回 Step 2
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPainPoints = painPoints.reduce((sum, point) => sum + point.frequency, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Step 3: VOC 深度分析</CardTitle>
            <CardDescription>
              从 {totalPainPoints} 条负向反馈和 {positiveReviewCount} 条正向反馈中提炼
              痛点、价值点与竞品文案结构。
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => void fetchAnalysis()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重新分析
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-500" />
            <CardTitle className="text-base">差评痛点排行</CardTitle>
          </div>
          <CardDescription>
            竞品的高频弱点，往往就是后续 Listing 里最值得承接的突破口。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {painPoints.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">排名</TableHead>
                    <TableHead>痛点类型</TableHead>
                    <TableHead className="w-[100px]">频次</TableHead>
                    <TableHead className="w-[100px]">占比</TableHead>
                    <TableHead className="min-w-[220px]">典型原话</TableHead>
                    <TableHead className="min-w-[220px]">对应卖点建议</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {painPoints.map((point) => (
                    <TableRow key={`${point.rank}-${point.category}`}>
                      <TableCell>
                        <Badge
                          variant={point.rank <= 3 ? "destructive" : "secondary"}
                          className="flex h-8 w-8 items-center justify-center rounded-full"
                        >
                          {point.rank}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{point.category}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{point.frequency}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{point.percentage}%</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {point.typicalQuotes.slice(0, 2).map((quote) => (
                            <p
                              key={`${point.rank}-${quote}`}
                              className="text-xs italic text-muted-foreground"
                            >
                              {`"${quote}"`}
                            </p>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="rounded border-l-4 border-green-500 bg-green-50 p-2 text-xs text-green-900">
                          {point.sellingPointSuggestion}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <SectionEmpty description="本次分析没有提炼出明确的差评痛点，可补充更多评论样本后重试。" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            <CardTitle className="text-base">好评价值点提取</CardTitle>
          </div>
          <CardDescription>
            把用户反复认可的体验，沉淀成后续文案里的价值表达。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {valuePoints.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {valuePoints.map((point, index) => (
                <div key={`${point.category}-${index}`} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge>{point.category}</Badge>
                    <div className="text-sm text-muted-foreground">
                      {point.frequency} 次提及 ({point.percentage}%)
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">典型评价</p>
                    {point.typicalQuotes.slice(0, 2).map((quote) => (
                      <p
                        key={`${point.category}-${quote}`}
                        className="rounded bg-green-50 p-2 text-xs italic text-green-700"
                      >
                        {`"${quote}"`}
                      </p>
                    ))}
                  </div>

                  <div className="rounded border-l-4 border-blue-500 bg-blue-50 p-2 text-xs text-blue-900">
                    {point.leverageSuggestion}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <SectionEmpty description="本次分析没有提炼出明确的好评价值点，可补充更多正向评论后重试。" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">竞品文案结构分析</CardTitle>
          <CardDescription>
            学习值得保留的表达结构，同时避开竞品已经暴露出来的短板。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {competitorAnalysis.length > 0 ? (
            competitorAnalysis.map((analysis) => (
              <div key={analysis.asin} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {analysis.asin}
                  </Badge>
                </div>

                <div className="grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      标题结构
                    </p>
                    <p className="rounded bg-muted/50 p-2">{analysis.titleStructure}</p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      关键词覆盖
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {analysis.keywordCoverage.map((keyword) => (
                        <Badge key={`${analysis.asin}-${keyword}`} variant="secondary">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold text-green-700">优势</p>
                    <ul className="space-y-1 text-xs text-green-700">
                      {analysis.strengths.map((strength) => (
                        <li key={`${analysis.asin}-${strength}`}>• {strength}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold text-red-700">弱点</p>
                    <ul className="space-y-1 text-xs text-red-700">
                      {analysis.weaknesses.map((weakness) => (
                        <li key={`${analysis.asin}-${weakness}`}>• {weakness}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <SectionEmpty description="暂无可展示的竞品文案结构分析结果。" />
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setCurrentStep(2)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          上一步
        </Button>
        <Button
          onClick={() => setCurrentStep(4)}
          className="bg-[#FF9900] hover:bg-[#FF9900]/90"
        >
          下一步：生成 Listing
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
