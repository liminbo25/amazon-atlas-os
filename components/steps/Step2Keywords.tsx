"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useListingStore } from "@/lib/store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, ArrowLeft, Loader2, RefreshCw, Database } from "lucide-react";

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
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

export function Step2Keywords() {
  const {
    targetMarket,
    competitorAsins,
    competitorListings,
    competitorReviews,
    positiveReviews,
    trafficKeywords,
    setCompetitorListings,
    setCompetitorReviews,
    setPositiveReviews,
    setTrafficKeywords,
    setPainPoints,
    setValuePoints,
    setCompetitorAnalysis,
    setListingVersions,
    setComplianceResults,
    setCurrentStep,
  } = useListingStore();

  const [activeAsin, setActiveAsin] = useState(competitorAsins[0] || "");
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(competitorListings.length > 0);
  const inFlightRef = useRef(false);
  const lastAutoFetchKeyRef = useRef<string | null>(null);

  const hasRequiredInput = competitorAsins.length > 0;
  const requestKey = `${targetMarket}:${competitorAsins.join("|")}`;
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

  const fetchData = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }

    if (!hasRequiredInput) {
      setFetchError("请先在 Step 1 至少填写 1 个竞品 ASIN。");
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
        throw new Error(data.error || "数据采集失败");
      }

      setCompetitorListings(data.listings ?? []);
      setCompetitorReviews(data.reviews ?? {});
      setPositiveReviews(data.positiveReviews ?? {});
      setTrafficKeywords(data.keywords ?? {});

      // 竞品源数据刷新后，后续分析和生成结果都需要重新计算。
      setPainPoints([]);
      setValuePoints([]);
      setCompetitorAnalysis([]);
      setListingVersions([]);
      setComplianceResults({});
      setHasFetchedOnce(true);
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : "数据采集失败");
      setHasFetchedOnce(true);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [
    competitorAsins,
    hasRequiredInput,
    setCompetitorAnalysis,
    setCompetitorListings,
    setCompetitorReviews,
    setComplianceResults,
    setListingVersions,
    setPainPoints,
    setPositiveReviews,
    setTrafficKeywords,
    setValuePoints,
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
    if (!hasRequiredInput || hasListingData || lastAutoFetchKeyRef.current === requestKey) {
      return;
    }

    lastAutoFetchKeyRef.current = requestKey;
    void fetchData();
  }, [fetchData, hasListingData, hasRequiredInput, requestKey]);

  if (!hasRequiredInput) {
    return (
      <div className="space-y-6">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <Database className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-base font-medium">还没有可采集的竞品</p>
              <p className="text-sm text-muted-foreground">
                请先返回 Step 1 填写竞品 ASIN，再开始采集 Listing、评论和关键词数据。
              </p>
            </div>
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回 Step 1
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
          正在采集 {competitorAsins.length} 个竞品在 {targetMarket} 站点的数据...
        </p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="space-y-2 text-center text-red-500">
          <p className="font-semibold">数据采集失败</p>
          <p className="text-sm">{fetchError}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => void fetchData()}>
            重试
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
      <div className="space-y-6">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <Database className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-base font-medium">这次没有采集到可展示的竞品数据</p>
              <p className="text-sm text-muted-foreground">
                你可以检查 ASIN 是否有效，或返回 Step 1 调整站点和竞品后再试。
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Step 2: 竞品数据采集</CardTitle>
            <CardDescription>
              已采集 {competitorListings.length} 个竞品的 Listing、差评、好评与流量关键词。
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => void fetchData()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重新采集
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="竞品数量" value={competitorListings.length} />
        <SummaryCard label="差评条数" value={totalNegativeReviews} />
        <SummaryCard label="好评条数" value={totalPositiveReviews} />
        <SummaryCard label="关键词数" value={totalKeywords} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">竞品 Listing 对比</CardTitle>
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
                  <TableHead>月销量</TableHead>
                  <TableHead>BSR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitorListings.map((listing) => (
                  <TableRow key={listing.asin}>
                    <TableCell className="font-mono text-xs">{listing.asin}</TableCell>
                    <TableCell className="max-w-xs">
                      <p className="line-clamp-2 text-sm">{listing.title}</p>
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
                      <div
                        key={index}
                        className="rounded-lg bg-muted/50 p-3 text-sm"
                      >
                        <span className="mr-2 font-semibold text-[#FF9900]">
                          {index + 1}.
                        </span>
                        {bulletPoint}
                      </div>
                    ))
                  ) : (
                    <SectionEmpty description="该竞品暂无可展示的五点描述数据。" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    差评分析
                    <Badge variant="destructive" className="ml-2">
                      {negativeReviews.length} 条
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {negativeReviews.length > 0 ? (
                    <div className="max-h-[400px] space-y-3 overflow-y-auto">
                      {negativeReviews.slice(0, 20).map((review) => (
                        <div key={review.id} className="space-y-1 rounded-lg border p-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                review.rating <= 2 ? "destructive" : "secondary"
                              }
                            >
                              {review.rating} star
                            </Badge>
                            {review.verifiedPurchase && (
                              <Badge variant="outline" className="text-xs">
                                VP
                              </Badge>
                            )}
                            <span className="ml-auto text-xs text-muted-foreground">
                              {review.date}
                            </span>
                          </div>
                          <p className="text-sm font-medium">{review.title}</p>
                          <p className="text-sm text-muted-foreground">{review.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <SectionEmpty description="该竞品暂无差评数据，建议更换 ASIN 或重新采集。" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    好评分析
                    <Badge className="ml-2 bg-green-500">{positive.length} 条</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {positive.length > 0 ? (
                    <div className="max-h-[400px] space-y-3 overflow-y-auto">
                      {positive.slice(0, 20).map((review) => (
                        <div
                          key={review.id}
                          className="space-y-1 rounded-lg border border-green-200 p-3"
                        >
                          <div className="flex items-center gap-2">
                            <Badge className="bg-green-500">{review.rating} star</Badge>
                            {review.verifiedPurchase && (
                              <Badge variant="outline" className="text-xs">
                                VP
                              </Badge>
                            )}
                            <span className="ml-auto text-xs text-muted-foreground">
                              {review.date}
                            </span>
                          </div>
                          <p className="text-sm font-medium">{review.title}</p>
                          <p className="text-sm text-muted-foreground">{review.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <SectionEmpty description="该竞品暂无好评数据，可重新采集或在下一步聚焦已有评论。" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">流量关键词</CardTitle>
                </CardHeader>
                <CardContent>
                  {keywords.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>关键词</TableHead>
                            <TableHead>月搜索量</TableHead>
                            <TableHead>自然排名</TableHead>
                            <TableHead>广告排名</TableHead>
                            <TableHead>转化份额</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {keywords.map((keyword, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">
                                {keyword.keyword}
                              </TableCell>
                              <TableCell>
                                {keyword.searchVolume.toLocaleString()}
                              </TableCell>
                              <TableCell>#{keyword.organicRank}</TableCell>
                              <TableCell>
                                {keyword.sponsoredRank
                                  ? `#${keyword.sponsoredRank}`
                                  : "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {(keyword.conversionShare * 100).toFixed(1)}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <SectionEmpty description="该竞品暂无可展示的关键词数据。" />
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
        <Button
          onClick={() => setCurrentStep(3)}
          className="bg-[#FF9900] hover:bg-[#FF9900]/90"
        >
          下一步：VOC深度分析
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
