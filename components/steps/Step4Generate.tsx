"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
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
      {current}/{limit} chars
    </Badge>
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
    title: "Title",
    bulletPoints: "Bullet Points",
    description: "Description",
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
          <CardTitle className="text-base">Compliance Check</CardTitle>
          <Badge variant="outline">Version: {versionName}</Badge>
          {totalViolations > 0 ? (
            <Badge variant="destructive">{totalViolations} issue(s)</Badge>
          ) : null}
        </div>
        <CardDescription>
          Compliance results refresh immediately when you edit the current version.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {totalViolations === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No obvious prohibited claims were found in the current version.
            </p>
            <div className="flex flex-wrap gap-2">
              {passedFields.map((result) => (
                <Badge
                  key={result.field}
                  variant="outline"
                  className="border-green-200 bg-green-50 text-green-700"
                >
                  {fieldNames[result.field] || result.field} passed
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
                    <span className="ml-2 text-muted-foreground">
                      - {violation.reason}
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Context: {violation.context}
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
    painPoints,
    valuePoints,
    coreSellingPoints,
    trafficKeywords,
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

  const totalKeywordCount = Object.values(trafficKeywords).reduce(
    (sum, keywords) => sum + keywords.length,
    0
  );
  const hasGenerationInputs =
    painPoints.length > 0 ||
    valuePoints.length > 0 ||
    coreSellingPoints.trim().length > 0 ||
    totalKeywordCount > 0;
  const requestKey = [
    painPoints.length,
    valuePoints.length,
    coreSellingPoints.trim(),
    totalKeywordCount,
    lightMode ? "light" : "standard",
  ].join("::");

  const generateListings = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }

    if (!hasGenerationInputs) {
      setFetchError(
        new ApiRequestError(
          "Complete VOC analysis or provide core selling points before generating listing copy.",
          { status: 400 }
        )
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
          painPoints,
          valuePoints,
          coreSellingPoints,
          trafficKeywords,
          lightMode,
          runtime: listingRuntime,
          runtimeConfig: aiRuntimeSettings,
        }),
      });

      if (!response.ok) {
        throw await parseApiRequestError(response, "Listing generation failed");
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
      setFetchError(normalizeApiRequestError(error, "Listing generation failed"));
      setHasGeneratedOnce(true);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [
    aiRuntimeSettings,
    coreSellingPoints,
    hasGenerationInputs,
    lightMode,
    painPoints,
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
      window.setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error("copy_failed", error);
      setCopyError("Copy failed. Please select the text manually and try again.");
    }
  };

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-label="Copy current field"
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
              <p className="text-base font-medium">Not enough input for generation</p>
              <p className="text-sm text-muted-foreground">
                Complete Step 3 or add core selling points before generating listing copy.
              </p>
            </div>
            <Button variant="outline" onClick={() => setCurrentStep(3)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Step 3
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
            ? "AI is generating a lighter, faster listing set..."
            : "AI is generating listing versions and compliance checks..."}
        </p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-6">
        <AiRequestErrorAlert
          heading="Listing generation failed"
          error={fetchError}
          runtimeConfig={aiRuntimeSettings.listingGeneration}
          actions={
            <>
              <Button variant="outline" onClick={() => void generateListings()}>
                Retry
              </Button>
              <Button
                variant={lightMode ? "default" : "outline"}
                className={lightMode ? "bg-slate-900 hover:bg-slate-800" : ""}
                onClick={() => setLightMode((current) => !current)}
              >
                {lightMode ? "Light mode on" : "Try light mode"}
              </Button>
              <Button variant="ghost" onClick={() => setCurrentStep(3)}>
                Back
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
              <p className="text-base font-medium">No listing version was generated</p>
              <p className="text-sm text-muted-foreground">
                Retry generation or go back and refine the VOC inputs.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => void generateListings()}>
                Retry
              </Button>
              <Button
                variant={lightMode ? "default" : "outline"}
                className={lightMode ? "bg-slate-900 hover:bg-slate-800" : ""}
                onClick={() => setLightMode((current) => !current)}
              >
                {lightMode ? "Light mode on" : "Try light mode"}
              </Button>
              <Button variant="ghost" onClick={() => setCurrentStep(3)}>
                Back to Step 3
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
              <CardTitle>Step 4: Listing Generation</CardTitle>
              <Badge variant={lightMode ? "default" : "outline"}>
                {lightMode ? "Light mode" : "Standard mode"}
              </Badge>
            </div>
            <CardDescription>
              Generate multiple listing versions from VOC insights, then keep editing with
              live compliance feedback.
            </CardDescription>
            <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Light mode sends fewer VOC points and keywords and asks the model for a
              shorter response. Use it when third-party gateways time out.
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
              {lightMode ? "Light mode on" : "Enable light mode"}
            </Button>
            <Button variant="outline" onClick={() => void generateListings()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Regenerate
            </Button>
          </div>
        </CardHeader>
      </Card>

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
              <span className="font-medium">Style:</span> {version.style}
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">Product Title</CardTitle>
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
                <CardTitle className="text-base">Bullet Points</CardTitle>
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
                <CardTitle className="text-base">Description</CardTitle>
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
          Previous
        </Button>
        <Button
          onClick={() => setCurrentStep(5)}
          className="bg-[#FF9900] hover:bg-[#FF9900]/90"
        >
          Next: Export
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
