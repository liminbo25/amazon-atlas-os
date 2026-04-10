"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Image,
  KeyRound,
  Loader2,
  MessagesSquare,
  RotateCcw,
  Settings2,
  XCircle,
} from "lucide-react";
import {
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_AI_RUNTIME_SETTINGS, useListingStore } from "@/lib/store";
import type {
  AiProvider,
  AiRuntimeServiceConfig,
  AiRuntimeServiceKey,
} from "@/lib/types";

const runtimeSections: Array<{
  key: AiRuntimeServiceKey;
  title: string;
  description: string;
  step: string;
  placeholderBaseUrl: string;
  placeholderModel: string;
  Icon: typeof Image;
}> = [
  {
    key: "imageAnalysis",
    title: "Image Analysis",
    description: "Step 1 image understanding request",
    step: "Step 1 /api/analyze-images",
    placeholderBaseUrl: "https://api.anthropic.com",
    placeholderModel: "claude-sonnet-4-20250514",
    Icon: Image,
  },
  {
    key: "vocAnalysis",
    title: "VOC Analysis",
    description: "Step 3 review and copy insight request",
    step: "Step 3 /api/keywords",
    placeholderBaseUrl: "https://api.openai.com",
    placeholderModel: "gpt-4.1",
    Icon: MessagesSquare,
  },
  {
    key: "listingGeneration",
    title: "Listing Generation",
    description: "Step 4 copy generation request",
    step: "Step 4 /api/generate-copy",
    placeholderBaseUrl: "https://api.openai.com",
    placeholderModel: "gpt-5.4-mini",
    Icon: FileText,
  },
];

const providerOptions: Array<{
  value: AiProvider | "auto";
  label: string;
}> = [
  { value: "auto", label: "Auto" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI-compatible" },
];

export function RuntimeConfigPanel() {
  const {
    aiRuntimeSettings,
    updateAiRuntimeSettings,
    resetAiRuntimeSettings,
  } = useListingStore();
  const [isOpen, setIsOpen] = useState(false);
  const [testResults, setTestResults] = useState<
    Partial<Record<AiRuntimeServiceKey, RuntimeTestResult>>
  >({});

  const customizedCount = useMemo(
    () =>
      runtimeSections.filter(({ key }) => isRuntimeCustomized(aiRuntimeSettings[key])).length,
    [aiRuntimeSettings]
  );

  const updateServiceSettings = (
    service: AiRuntimeServiceKey,
    patch: Partial<AiRuntimeServiceConfig>
  ) => {
    updateAiRuntimeSettings(service, patch);
    setTestResults((current) => ({
      ...current,
      [service]: {
        status: "idle",
      },
    }));
  };

  const handleReset = () => {
    resetAiRuntimeSettings();
    setTestResults({});
  };

  const handleTest = async (service: AiRuntimeServiceKey) => {
    setTestResults((current) => ({
      ...current,
      [service]: {
        status: "testing",
      },
    }));

    try {
      const response = await fetch("/api/test-ai-runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runtime: {
            task: service,
            ...aiRuntimeSettings[service],
          },
        }),
      });

      if (!response.ok) {
        throw await parseApiRequestError(response, "AI runtime test failed.");
      }

      const payload = (await response.json()) as {
        provider?: string;
        baseURL?: string;
        model?: string;
        outputPreview?: string;
      };

      setTestResults((current) => ({
        ...current,
        [service]: {
          status: "success",
          message: `Connected to ${payload.provider || "AI"} at ${formatPreviewBaseUrl(
            payload.baseURL || aiRuntimeSettings[service].baseUrl
          )}`,
          detail: payload.outputPreview || "The model returned a valid response.",
          provider: payload.provider,
          model: payload.model,
        },
      }));
    } catch (error) {
      const normalizedError = normalizeApiRequestError(error, "AI runtime test failed.");
      setTestResults((current) => ({
        ...current,
        [service]: {
          status: "error",
          message: normalizedError.message,
          detail: normalizedError.code
            ? `code: ${normalizedError.code}`
            : "Check protocol, base URL, model, and credential.",
        },
      }));
    }
  };

  return (
    <Card className="border-dashed border-slate-300 bg-slate-50/70">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full bg-white p-2 text-slate-700 shadow-sm">
              <Settings2 className="h-4 w-4" />
            </div>
            <CardTitle>AI Runtime Settings</CardTitle>
            <Badge variant="outline">
              {customizedCount > 0
                ? `Customized ${customizedCount}/${runtimeSections.length}`
                : "Using server defaults"}
            </Badge>
            <Badge variant="secondary">Stored in this browser</Badge>
          </div>
          <CardDescription>
            Configure provider, base URL, model, and optional API key for image analysis,
            VOC analysis, and listing generation. Values are sent with Step 1, 3, and 4
            requests and persisted in local storage.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsOpen((value) => !value)}
          >
            {isOpen ? (
              <>
                Collapse
                <ChevronUp className="ml-1 h-4 w-4" />
              </>
            ) : (
              <>
                Expand
                <ChevronDown className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            Reset
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {runtimeSections.map((section) => (
            <Badge key={section.key} variant="outline" className="gap-1">
              <section.Icon className="h-3 w-3" />
              {section.title}: {formatRuntimeSummary(aiRuntimeSettings[section.key])}
            </Badge>
          ))}
        </div>

        {isOpen ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {runtimeSections.map((section) => (
              <Card key={section.key} className="border border-slate-200 bg-white/90">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <section.Icon className="h-4 w-4 text-[#FF9900]" />
                    <CardTitle className="text-sm">{section.title}</CardTitle>
                  </div>
                  <CardDescription className="space-y-1">
                    <span>{section.description}</span>
                    <span className="block text-xs">{section.step}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${section.key}-provider`}>Protocol</Label>
                    <Select
                      value={aiRuntimeSettings[section.key].provider || "auto"}
                      onValueChange={(value) =>
                        updateServiceSettings(section.key, {
                          provider: value === "auto" ? "" : (value as AiProvider),
                        })
                      }
                    >
                      <SelectTrigger id={`${section.key}-provider`}>
                        <SelectValue placeholder="Select protocol" />
                      </SelectTrigger>
                      <SelectContent>
                        {providerOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Auto will infer from model and base URL. Select a provider explicitly
                      if you are connecting to a custom gateway.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${section.key}-baseUrl`}>API Base URL</Label>
                    <Input
                      id={`${section.key}-baseUrl`}
                      type="url"
                      placeholder={section.placeholderBaseUrl}
                      value={aiRuntimeSettings[section.key].baseUrl}
                      onChange={(event) =>
                        updateServiceSettings(section.key, {
                          baseUrl: event.target.value,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use the server default. You can enter a root base URL
                      like `https://api.openai.com` or `https://api.anthropic.com`.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${section.key}-model`}>Model</Label>
                    <Input
                      id={`${section.key}-model`}
                      placeholder={section.placeholderModel}
                      value={aiRuntimeSettings[section.key].model}
                      onChange={(event) =>
                        updateServiceSettings(section.key, {
                          model: event.target.value,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Use the exact model id exposed by the upstream provider.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${section.key}-apiKey`}>API Key (optional)</Label>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id={`${section.key}-apiKey`}
                        type="password"
                        placeholder="sk-..."
                        className="pl-9"
                        value={aiRuntimeSettings[section.key].apiKey}
                        onChange={(event) =>
                          updateServiceSettings(section.key, {
                            apiKey: event.target.value,
                          })
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Optional runtime override. If left blank, the server falls back to
                      environment variables such as `ANTHROPIC_API_KEY` or
                      `OPENAI_API_KEY`.
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">Connection test</p>
                        <p className="text-xs text-muted-foreground">
                          Sends one tiny real request with the current runtime settings.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={testResults[section.key]?.status === "testing"}
                        onClick={() => void handleTest(section.key)}
                      >
                        {testResults[section.key]?.status === "testing" ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Testing
                          </>
                        ) : (
                          "Test"
                        )}
                      </Button>
                    </div>

                    {testResults[section.key] ? (
                      <div className="mt-3 rounded-md border bg-white px-3 py-2 text-xs">
                        <div className="flex items-start gap-2">
                          {testResults[section.key]?.status === "success" ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                          ) : testResults[section.key]?.status === "error" ? (
                            <XCircle className="mt-0.5 h-4 w-4 text-red-600" />
                          ) : (
                            <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-slate-500" />
                          )}
                          <div className="space-y-1">
                            <p
                              className={
                                testResults[section.key]?.status === "success"
                                  ? "font-medium text-green-700"
                                  : testResults[section.key]?.status === "error"
                                    ? "font-medium text-red-700"
                                    : "font-medium text-slate-700"
                              }
                            >
                              {formatTestHeading(testResults[section.key] ?? { status: "idle" })}
                            </p>
                            {testResults[section.key]?.message ? (
                              <p className="text-slate-700">{testResults[section.key]?.message}</p>
                            ) : null}
                            {testResults[section.key]?.detail ? (
                              <p className="text-muted-foreground">
                                {testResults[section.key]?.detail}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-white/80 p-3 text-xs leading-5 text-muted-foreground">
          Runtime settings are sent in both <span className="font-mono">runtime</span> and{" "}
          <span className="font-mono">runtimeConfig</span> fields so the module can be embedded
          into a larger host system without changing the request contract.
        </div>
      </CardContent>
    </Card>
  );
}

function isRuntimeCustomized(config: AiRuntimeServiceConfig): boolean {
  return (
    config.provider.trim().length > 0 ||
    config.baseUrl.trim().length > 0 ||
    config.model.trim().length > 0 ||
    config.apiKey.trim().length > 0
  );
}

type RuntimeTestResult =
  | {
      status: "idle";
      message?: string;
      detail?: string;
      provider?: string;
      model?: string;
    }
  | {
      status: "testing" | "success" | "error";
      message?: string;
      detail?: string;
      provider?: string;
      model?: string;
    };

function formatRuntimeSummary(config: AiRuntimeServiceConfig): string {
  if (!isRuntimeCustomized(config)) {
    return "Server default";
  }

  const parts = [
    config.provider ? formatProviderLabel(config.provider) : "Auto",
    config.model.trim() || formatBaseUrl(config.baseUrl),
  ].filter(Boolean);

  return parts.join(" / ");
}

function formatProviderLabel(provider: AiProvider): string {
  return provider === "openai" ? "OpenAI" : "Anthropic";
}

function formatBaseUrl(baseUrl: string): string {
  if (!baseUrl.trim()) {
    return DEFAULT_AI_RUNTIME_SETTINGS.imageAnalysis.baseUrl || "Server default";
  }

  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl.trim();
  }
}

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

function formatTestHeading(result: RuntimeTestResult): string {
  switch (result.status) {
    case "testing":
      return "Testing runtime connectivity...";
    case "success":
      return "Test succeeded";
    case "error":
      return "Test failed";
    default:
      return "Not tested yet";
  }
}
