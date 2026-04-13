"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkFieldCompliance } from "@/lib/compliance";
import { useListingStore } from "@/lib/store";
import {
  AiRequestErrorAlert,
  ApiRequestError,
  normalizeApiRequestError,
  parseApiRequestError,
} from "@/components/AiRequestErrorAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  AiRuntimeRequestConfig,
  ComplianceResult,
  ListingVersion,
} from "@/lib/types";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  FileText,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

const TITLE_LIMIT = 200;
const SEARCH_TERM_LIMIT = 250;

function buildComplianceResults(version: ListingVersion): ComplianceResult[] {
  const titleCheck = checkFieldCompliance("title", version.title);
  const bulletCheck = checkFieldCompliance("bulletPoints", version.bulletPoints);
  const descriptionCheck = checkFieldCompliance("description", version.description);
  const searchCheck = checkFieldCompliance("searchTerms", version.searchTerms);

  return [
    { field: "title", ...titleCheck },
    { field: "bulletPoints", ...bulletCheck },
    { field: "description", ...descriptionCheck },
    { field: "searchTerms", ...searchCheck },
  ];
}

function LengthBadge({
  current,
  limit,
}: {
  current: number;
  limit: number;
}) {
  const exceeded = current > limit;

  return (
    <Badge variant={exceeded ? "destructive" : "outline"} className="mt-1">
      {current}/{limit}
    </Badge>
  );
}

function SourceSummaryCard({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge: string;
}) {
  return (
    <div className="rounded-2xl border bg-white/85 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline">{badge}</Badge>
      </div>
    </div>
  );
}

function CompliancePanel({
  versionName,
  results,
  totalViolations,
}: {
  versionName: string;
  results: ComplianceResult[];
  totalViolations: number;
}) {
  const fieldNames: Record<string, string> = {
    title: "标题",
    bulletPoints: "五点",
    description: "描述",
    searchTerms: "Search Terms",
  };

  const passedFields = results.filter((result) => result.violations.length === 0);
  const failedFields = results.filter((result) => result.violations.length > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          {totalViolations === 0 ? (
            <ShieldCheck className="h-5 w-5 text-green-500" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-red-500" />
          )}
          <CardTitle className="text-base">合规检查</CardTitle>
          <Badge variant="outline">{versionName}</Badge>
          {totalViolations > 0 ? (
            <Badge variant="destructive">{totalViolations} 项问题</Badge>
          ) : null}
        </div>
        <CardDescription>编辑当前版本后，合规检测会即时刷新。</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {totalViolations === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">当前版本未发现明显禁用词风险。</p>
            <div className="flex flex-wrap gap-2">
              {passedFields.map((result) => (
                <Badge
                  key={result.field}
                  variant="outline"
                  className="border-green-200 bg-green-50 text-green-700"
                >
                  {fieldNames[result.field] || result.field} 已通过
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          failedFields.map((result) => (
            <div key={result.field} className="space-y-2">
              <p className="text-sm font-medium">{fieldNames[result.field] || result.field}</p>
              {result.violations.map((violation, index) => (
                <div
                  key={`${result.field}-${index}`}
                  className="flex items-start gap-2 rounded bg-red-50 p-3 text-sm"
                >
                  <AlertTriangle
                    className={[
                      "mt-0.5 h-4 w-4 flex-shrink-0",
                      violation.severity === "high"
                        ? "text-red-500"
                        : violation.severity === "medium"
                          ? "text-yellow-500"
                          : "text-blue-500",
                    ].join(" ")}
                  />
                  <div>
                    <span className="font-mono font-semibold">{`"${violation.word}"`}</span>
                    <span className="ml-2 text-muted-foreground">- {violation.reason}</span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      上下文: {violation.context}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function Step4Generate() {
  const {
    productProfile,
    coreSellingPoints,
    trafficKeywords,
    dataAnalysis,
    painPoints,
    valuePoints,
    listingVersions,
    complianceResults,
    aiRuntimeSettings,
    setListingVersions,
    setComplianceResults,
    setCurrentStep,
  } = useListingStore();

  const [copied, setCopied] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState("");
  const [fetchError, setFetchError] = useState<ApiRequestError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGeneratedOnce, setHasGeneratedOnce] = useState(listingVersions.length > 0);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [lightMode, setLightMode] = useState(false);
  const inFlightRef = useRef(false);
  const lastAutoGenerateKeyRef = useRef<string | null>(null);

  const totalKeywordCount = useMemo(
    () =>
      Object.values(trafficKeywords).reduce(
        (sum, keywords) => sum + keywords.length,
        0
      ),
    [trafficKeywords]
  );

  const hasGenerationInputs =
    Boolean(productProfile.productName.trim()) ||
    painPoints.length > 0 ||
    valuePoints.length > 0 ||
    coreSellingPoints.trim().length > 0 ||
    totalKeywordCount > 0 ||
    dataAnalysis !== null;

  const requestKey = [
    productProfile.productName.trim(),
    productProfile.productCategory.trim(),
    productProfile.coreKeywords.trim(),
    painPoints.length,
    valuePoints.length,
    coreSellingPoints.trim(),
    totalKeywordCount,
    dataAnalysis?.marketOverview ?? "",
    lightMode ? "light" : "standard",
  ].join("::");

  const generateListings = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }

    if (!hasGenerationInputs) {
      setFetchError(
        new ApiRequestError("请先补充产品、VOC、关键词或多源分析数据后再生成文案。", {
          status: 400,
        })
      );
      return;
    }

    inFlightRef.current = true;
    setIsLoading(true);
    setFetchError(null);
    setCopyError(null);

    try {
      const listingRuntime: AiRuntimeRequestConfig = {
        task: "listingGeneration",
        ...aiRuntimeSettings.listingGeneration,
      };

      const response = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productProfile,
          painPoints,
          valuePoints,
          coreSellingPoints,
          trafficKeywords,
          dataAnalysis,
          lightMode,
          runtime: listingRuntime,
          runtimeConfig: aiRuntimeSettings,
        }),
      });

      if (!response.ok) {
        throw await parseApiRequestError(response, "三源文案生成失败");
      }

      const data = (await response.json()) as {
        versions?: ListingVersion[];
        complianceResults?: Record<string, ComplianceResult[]>;
      };

      const versions = data.versions ?? [];
      const nextComplianceResults =
        data.complianceResults ??
        Object.fromEntries(
          versions.map((version) => [
            version.versionName,
            buildComplianceResults(version),
          ])
        );

      setListingVersions(versions);
      setComplianceResults(nextComplianceResults);
      setHasGeneratedOnce(true);
      setActiveVersion(versions[0]?.versionName ?? "");
    } catch (error) {
      setFetchError(normalizeApiRequestError(error, "三源文案生成失败"));
      setHasGeneratedOnce(true);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [
    aiRuntimeSettings,
    coreSellingPoints,
    dataAnalysis,
    hasGenerationInputs,
    lightMode,
    painPoints,
    productProfile,
    setComplianceResults,
    setListingVersions,
    trafficKeywords,
    valuePoints,
  ]);

  useEffect(() => {
    if (listingVersions.length === 0) {
      return;
    }

    if (!listingVersions.some((version) => version.versionName === activeVersion)) {
      setActiveVersion(listingVersions[0].versionName);
    }
  }, [activeVersion, listingVersions]);

  useEffect(() => {
    if (
      !hasGenerationInputs ||
      listingVersions.length > 0 ||
      lastAutoGenerateKeyRef.current === requestKey
    ) {
      return;
    }

    lastAutoGenerateKeyRef.current = requestKey;
    void generateListings();
  }, [generateListings, hasGenerationInputs, listingVersions.length, requestKey]);

  const resolvedActiveVersion =
    listingVersions.find((version) => version.versionName === activeVersion)?.versionName ||
    listingVersions[0]?.versionName ||
    "";

  const currentVersion = listingVersions.find(
    (version) => version.versionName === resolvedActiveVersion
  );

  const currentCompliance = currentVersion
    ? complianceResults[resolvedActiveVersion] ?? buildComplianceResults(currentVersion)
    : [];

  const totalViolations = currentCompliance.reduce(
    (sum, result) => sum + result.violations.length,
    0
  );

  const updateVersion = (
    versionName: string,
    updater: (version: ListingVersion) => ListingVersion
  ) => {
    const nextVersions = listingVersions.map((version) =>
      version.versionName === versionName ? updater(version) : version
    );
    const updatedVersion = nextVersions.find(
      (version) => version.versionName === versionName
    );

    if (!updatedVersion) {
      return;
    }

    setListingVersions(nextVersions);
    setComplianceResults({
      ...complianceResults,
      [versionName]: buildComplianceResults(updatedVersion),
    });
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setCopyError(null);
      window.setTimeout(() => setCopied(null), 1800);
    } catch (error) {
      console.error("copy_failed", error);
      setCopyError("复制失败，请手动选择内容后再复制。");
    }
  };

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-label="复制当前字段"
      onClick={() => void copyToClipboard(text, id)}
    >
      {copied === id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );

  if (!hasGenerationInputs) {
    return (
      <div className="space-y-6">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-base font-medium">三源文案生成所需输入还不完整</p>
              <p className="text-sm text-muted-foreground">
                请先补充产品输入、VOC、关键词数据或 Step 2 的多源分析结果。
              </p>
            </div>
            <Button variant="outline" onClick={() => setCurrentStep(3)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回 Step 3
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
          {lightMode
            ? "AI 正在以轻量模式生成三源文案..."
            : "AI 正在融合 COSMO、VOC 与关键词数据生成文案..."}
        </p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-6">
        <AiRequestErrorAlert
          heading="三源文案生成失败"
          error={fetchError}
          runtimeConfig={aiRuntimeSettings.listingGeneration}
          actions={
            <>
              <Button variant="outline" onClick={() => void generateListings()}>
                重试生成
              </Button>
              <Button
                variant={lightMode ? "default" : "outline"}
                className={lightMode ? "bg-slate-900 hover:bg-slate-800" : ""}
                onClick={() => setLightMode((current) => !current)}
              >
                {lightMode ? "轻量模式已开启" : "尝试轻量模式"}
              </Button>
              <Button variant="ghost" onClick={() => setCurrentStep(3)}>
                返回上一步
              </Button>
            </>
          }
        />
      </div>
    );
  }

  if (hasGeneratedOnce && listingVersions.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-base font-medium">这次没有生成出可展示的文案版本</p>
              <p className="text-sm text-muted-foreground">
                可以重试生成，或返回上一步补充 VOC / 关键词 / 多源分析输入。
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => void generateListings()}>
                重新生成
              </Button>
              <Button
                variant={lightMode ? "default" : "outline"}
                className={lightMode ? "bg-slate-900 hover:bg-slate-800" : ""}
                onClick={() => setLightMode((current) => !current)}
              >
                {lightMode ? "轻量模式已开启" : "尝试轻量模式"}
              </Button>
              <Button variant="ghost" onClick={() => setCurrentStep(3)}>
                返回 Step 3
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
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Step 4: 三源文案生成</CardTitle>
              <Badge variant={lightMode ? "default" : "outline"}>
                {lightMode ? "轻量模式" : "标准模式"}
              </Badge>
            </div>
            <CardDescription>
              将 COSMO 算法导向、VOC 诊断和关键词数据整合为可编辑的 Listing 文案版本。
            </CardDescription>
            <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              轻量模式会减少输入样本并压缩输出长度，适合网关易超时的环境。
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={lightMode ? "default" : "outline"}
              className={lightMode ? "bg-slate-900 hover:bg-slate-800" : ""}
              onClick={() => setLightMode((current) => !current)}
            >
              <Zap className="mr-2 h-4 w-4" />
              {lightMode ? "轻量模式已开启" : "开启轻量模式"}
            </Button>
            <Button variant="outline" onClick={() => void generateListings()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新生成
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SourceSummaryCard
          title="COSMO 导向"
          description={
            dataAnalysis?.cosmoFocus.join("；") ||
            "基于标题相关性、场景覆盖与语义一致性组织文案。"
          }
          badge={`${dataAnalysis?.cosmoFocus.length ?? 0} 条`}
        />
        <SourceSummaryCard
          title="VOC 诊断"
          description={`已提炼 ${painPoints.length} 个痛点、${valuePoints.length} 个价值点。`}
          badge={`${painPoints.length + valuePoints.length} 条`}
        />
        <SourceSummaryCard
          title="关键词数据"
          description={
            totalKeywordCount > 0
              ? `当前已接入 ${totalKeywordCount} 个关键词样本。`
              : "当前无关键词样本，将更多依赖产品与 VOC 输入。"
          }
          badge={`${totalKeywordCount} 个`}
        />
        <SourceSummaryCard
          title="数据分析"
          description={
            dataAnalysis?.marketOverview ||
            "暂无额外多源总结，将以产品输入、VOC 与关键词为主。"
          }
          badge={dataAnalysis ? "已接入" : "未接入"}
        />
      </div>

      {(coreSellingPoints.trim() || productProfile.productName.trim()) && (
        <Card className="border-[#FF9900]/20 bg-orange-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-[#FF9900]" />
              当前文案生成上下文
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">产品信息</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>品牌：{productProfile.brandName || "未填写"}</p>
                <p>产品：{productProfile.productName || "未填写"}</p>
                <p>品类：{productProfile.productCategory || "未填写"}</p>
                <p>核心词：{productProfile.coreKeywords || "未填写"}</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                差异化卖点
              </p>
              <p className="text-sm text-muted-foreground">
                {coreSellingPoints || "暂无额外卖点说明"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {copyError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {copyError}
        </div>
      ) : null}

      <Tabs value={resolvedActiveVersion} onValueChange={setActiveVersion}>
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:grid-cols-3">
          {listingVersions.map((version) => (
            <TabsTrigger key={version.versionName} value={version.versionName}>
              {version.versionName}
            </TabsTrigger>
          ))}
        </TabsList>

        {listingVersions.map((version) => (
          <TabsContent
            key={version.versionName}
            value={version.versionName}
            className="space-y-4"
          >
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <span className="font-medium">风格定位：</span>
              {version.style}
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">标题</CardTitle>
                  <LengthBadge current={version.title.length} limit={TITLE_LIMIT} />
                </div>
                <CopyBtn text={version.title} id={`${version.versionName}-title`} />
              </CardHeader>
              <CardContent>
                <Textarea
                  value={version.title}
                  onChange={(event) =>
                    updateVersion(version.versionName, (current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  rows={3}
                  className="font-mono text-sm"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">五点描述</CardTitle>
                <CopyBtn
                  text={version.bulletPoints.join("\n\n")}
                  id={`${version.versionName}-bullets`}
                />
              </CardHeader>
              <CardContent className="space-y-3">
                {version.bulletPoints.map((bulletPoint, index) => (
                  <div key={`${version.versionName}-bullet-${index}`}>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Bullet {index + 1}
                    </label>
                    <Textarea
                      value={bulletPoint}
                      onChange={(event) =>
                        updateVersion(version.versionName, (current) => {
                          const nextBulletPoints = [...current.bulletPoints];
                          nextBulletPoints[index] = event.target.value;
                          return {
                            ...current,
                            bulletPoints: nextBulletPoints,
                          };
                        })
                      }
                      rows={3}
                      className="font-mono text-sm"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">产品描述</CardTitle>
                <CopyBtn text={version.description} id={`${version.versionName}-desc`} />
              </CardHeader>
              <CardContent>
                <Textarea
                  value={version.description}
                  onChange={(event) =>
                    updateVersion(version.versionName, (current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={8}
                  className="font-mono text-sm"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">Search Terms</CardTitle>
                  <LengthBadge
                    current={version.searchTerms.length}
                    limit={SEARCH_TERM_LIMIT}
                  />
                </div>
                <CopyBtn
                  text={version.searchTerms}
                  id={`${version.versionName}-search`}
                />
              </CardHeader>
              <CardContent>
                <Textarea
                  value={version.searchTerms}
                  onChange={(event) =>
                    updateVersion(version.versionName, (current) => ({
                      ...current,
                      searchTerms: event.target.value,
                    }))
                  }
                  rows={3}
                  className="font-mono text-sm"
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {currentVersion ? (
        <CompliancePanel
          versionName={currentVersion.versionName}
          results={currentCompliance}
          totalViolations={totalViolations}
        />
      ) : null}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setCurrentStep(3)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          上一步
        </Button>
        <Button
          onClick={() => setCurrentStep(5)}
          className="bg-[#FF9900] hover:bg-[#FF9900]/90"
        >
          下一步：导出
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
