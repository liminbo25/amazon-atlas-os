"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  FileText,
  KeyRound,
  Loader2,
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
import {
  DEFAULT_VIDEO_RUNTIME_SETTINGS,
  type VideoRuntimeServiceKey,
  useVideoRuntimeStore,
} from "@/lib/video-runtime-store";
import type { AiProvider, AiRuntimeServiceConfig } from "@/lib/types";

const runtimeSections: Array<{
  key: VideoRuntimeServiceKey;
  title: string;
  description: string;
  step: string;
  placeholderBaseUrl: string;
  placeholderModel: string;
  Icon: typeof Clapperboard;
}> = [
  {
    key: "frameAnalysis",
    title: "Frame Analysis",
    description: "Key-frame understanding used during video upload analysis",
    step: "POST /api/video-studio/upload-video",
    placeholderBaseUrl: "https://api.openai.com",
    placeholderModel: "gpt-5.4",
    Icon: Clapperboard,
  },
  {
    key: "copyGeneration",
    title: "Copy Generation",
    description: "Script rewrite and AI video prompt generation",
    step: "POST /api/video-studio/generate-copy",
    placeholderBaseUrl: "https://api.openai.com",
    placeholderModel: "gpt-5.4",
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

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

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

export interface VideoServerRuntimeStatus {
  configured: boolean;
  provider: AiProvider | null;
  base_url: string;
  model: string;
  timeout_seconds: number;
  has_api_key: boolean;
  api_key_masked: string;
  source: "file" | "env" | "none";
  storage: "local-file" | "vercel-tmp";
  config_error: string | null;
}

interface VideoRuntimeConfigPanelProps {
  useLegacyApi?: boolean;
  onServerStatusChange?: (status: VideoServerRuntimeStatus | null) => void;
}

type ServerSyncState = "idle" | "loading" | "saving";

export function VideoRuntimeConfigPanel({
  useLegacyApi = false,
  onServerStatusChange,
}: VideoRuntimeConfigPanelProps) {
  const { aiRuntimeSettings, updateAiRuntimeSettings, resetAiRuntimeSettings } =
    useVideoRuntimeStore();
  const [isOpen, setIsOpen] = useState(false);
  const [testResults, setTestResults] = useState<
    Partial<Record<VideoRuntimeServiceKey, RuntimeTestResult>>
  >({});
  const [serverStatus, setServerStatus] = useState<VideoServerRuntimeStatus | null>(
    null
  );
  const [serverSyncState, setServerSyncState] = useState<ServerSyncState>("idle");
  const [serverMessage, setServerMessage] = useState("");
  const [serverError, setServerError] = useState("");
  const onServerStatusChangeRef = useRef(onServerStatusChange);

  const customizedCount = useMemo(
    () =>
      runtimeSections.filter(({ key }) => isRuntimeCustomized(aiRuntimeSettings[key]))
        .length,
    [aiRuntimeSettings]
  );
  const localhostMismatchSections = useMemo(() => {
    if (typeof window === "undefined") {
      return [];
    }

    if (LOOPBACK_HOSTS.has(window.location.hostname)) {
      return [];
    }

    return runtimeSections.filter(({ key }) =>
      isLoopbackBaseUrl(aiRuntimeSettings[key].baseUrl)
    );
  }, [aiRuntimeSettings]);

  useEffect(() => {
    onServerStatusChangeRef.current = onServerStatusChange;
  }, [onServerStatusChange]);

  useEffect(() => {
    if (useLegacyApi) {
      setServerStatus(null);
      setServerMessage("");
      setServerError("");
      onServerStatusChangeRef.current?.(null);
      return;
    }

    let cancelled = false;

    async function loadInitialServerStatus() {
      setServerError("");

      try {
        const response = await fetch("/api/video-studio/runtime/config", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw await parseApiRequestError(
            response,
            "Failed to load video server runtime."
          );
        }

        const payload = (await response.json()) as unknown;
        const nextStatus = readServerRuntimeStatus(payload);
        if (cancelled) {
          return;
        }

        setServerStatus(nextStatus);
        setServerMessage(
          nextStatus?.configured
            ? `Shared default ready: ${formatServerStatusSummary(nextStatus)}`
            : "Shared server default is not configured yet."
        );
        onServerStatusChangeRef.current?.(nextStatus);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const normalizedError = normalizeApiRequestError(
          error,
          "Failed to load video server runtime."
        );
        setServerError(normalizedError.message);
        onServerStatusChangeRef.current?.(null);
      }
    }

    void loadInitialServerStatus();

    return () => {
      cancelled = true;
    };
  }, [useLegacyApi]);

  const updateServiceSettings = (
    service: VideoRuntimeServiceKey,
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

  const handleTest = async (service: VideoRuntimeServiceKey) => {
    setTestResults((current) => ({
      ...current,
      [service]: {
        status: "testing",
      },
    }));

    try {
      const response = await fetch("/api/video-studio/runtime/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runtime: {
            task: service,
            ...aiRuntimeSettings[service],
          },
          runtimeConfig: aiRuntimeSettings,
        }),
      });

      if (!response.ok) {
        throw await parseApiRequestError(response, "Video runtime test failed.");
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
      const normalizedError = normalizeApiRequestError(
        error,
        "Video runtime test failed."
      );
      setTestResults((current) => ({
        ...current,
        [service]: {
          status: "error",
          message: normalizedError.message,
          detail: normalizedError.code
            ? `code: ${normalizedError.code}`
            : "Check protocol, base URL, model, and credential. Frame analysis and copy generation can use different gateways.",
        },
      }));
    }
  };

  async function loadServerStatus(showSpinner = true) {
    if (useLegacyApi) {
      return;
    }

    if (showSpinner) {
      setServerSyncState("loading");
    }
    setServerError("");

    try {
      const response = await fetch("/api/video-studio/runtime/config", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw await parseApiRequestError(
          response,
          "Failed to load video server runtime."
        );
      }

      const payload = (await response.json()) as unknown;
      const nextStatus = readServerRuntimeStatus(payload);
      setServerStatus(nextStatus);
      setServerMessage(
        nextStatus?.configured
          ? `Shared default ready: ${formatServerStatusSummary(nextStatus)}`
          : "Shared server default is not configured yet."
      );
      onServerStatusChangeRef.current?.(nextStatus);
    } catch (error) {
      const normalizedError = normalizeApiRequestError(
        error,
        "Failed to load video server runtime."
      );
      setServerError(normalizedError.message);
      onServerStatusChangeRef.current?.(null);
    } finally {
      if (showSpinner) {
        setServerSyncState("idle");
      }
    }
  }

  const handleSaveServerDefault = async (service: VideoRuntimeServiceKey) => {
    if (useLegacyApi) {
      return;
    }

    setServerSyncState("saving");
    setServerError("");

    try {
      const runtime = aiRuntimeSettings[service];
      const body: {
        llm: {
          provider: AiProvider | "";
          base_url: string;
          model: string;
          preserve_api_key: boolean;
          api_key?: string;
        };
      } = {
        llm: {
          provider: runtime.provider,
          base_url: runtime.baseUrl.trim(),
          model: runtime.model.trim(),
          preserve_api_key: runtime.apiKey.trim().length === 0,
        },
      };

      if (runtime.apiKey.trim()) {
        body.llm.api_key = runtime.apiKey.trim();
      }

      const response = await fetch("/api/video-studio/runtime/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw await parseApiRequestError(
          response,
          "Failed to save video server runtime."
        );
      }

      const payload = (await response.json()) as unknown;
      const nextStatus = readServerRuntimeStatus(payload);
      setServerStatus(nextStatus);
      setServerMessage(
        `${runtimeSections.find((item) => item.key === service)?.title || service} settings are now the shared server default.`
      );
      onServerStatusChangeRef.current?.(nextStatus);
    } catch (error) {
      const normalizedError = normalizeApiRequestError(
        error,
        "Failed to save video server runtime."
      );
      setServerError(normalizedError.message);
    } finally {
      setServerSyncState("idle");
    }
  };

  const handleClearServerDefault = async () => {
    if (useLegacyApi) {
      return;
    }

    setServerSyncState("saving");
    setServerError("");

    try {
      const response = await fetch("/api/video-studio/runtime/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llm: {
            provider: "",
            base_url: "",
            model: "",
            api_key: "",
            preserve_api_key: false,
          },
        }),
      });
      if (!response.ok) {
        throw await parseApiRequestError(
          response,
          "Failed to clear video server runtime."
        );
      }

      const payload = (await response.json()) as unknown;
      const nextStatus = readServerRuntimeStatus(payload);
      setServerStatus(nextStatus);
      setServerMessage("Shared server default was cleared.");
      onServerStatusChangeRef.current?.(nextStatus);
    } catch (error) {
      const normalizedError = normalizeApiRequestError(
        error,
        "Failed to clear video server runtime."
      );
      setServerError(normalizedError.message);
    } finally {
      setServerSyncState("idle");
    }
  };

  const serverBusy = serverSyncState !== "idle";

  return (
    <Card className="border-dashed border-slate-300 bg-slate-50/70">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full bg-white p-2 text-slate-700 shadow-sm">
              <Settings2 className="h-4 w-4" />
            </div>
            <CardTitle>Video Runtime Settings</CardTitle>
            <Badge variant="outline">
              {customizedCount > 0
                ? `Customized ${customizedCount}/${runtimeSections.length}`
                : "Using server defaults"}
            </Badge>
            <Badge variant="secondary">Stored in this browser</Badge>
          </div>
          <CardDescription>
            Configure provider, base URL, model, and optional API key for
            frame analysis and copy generation. The upload flow and the script
            rewrite flow can use different AI endpoints.
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
          <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-1 h-4 w-4" />
            Reset
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {localhostMismatchSections.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            当前页面运行在远程站点，但你把{" "}
            {localhostMismatchSections.map((section) => section.title).join(" / ")}{" "}
            配到了 `127.0.0.1` 或 `localhost`。这些请求会从站点服务器发起，服务器访问不到你电脑本地网关，所以会连接失败。请改成公网 HTTPS 桥接地址，或改在本地页面中测试。
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {runtimeSections.map((section) => (
            <Badge key={section.key} variant="outline" className="gap-1">
              <section.Icon className="h-3 w-3" />
              {section.title}: {formatRuntimeSummary(aiRuntimeSettings[section.key])}
            </Badge>
          ))}
        </div>

        {useLegacyApi ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 p-4 text-sm leading-6 text-slate-600">
            Legacy video API mode is enabled. The fields below still work as
            per-request overrides, but the shared server default only applies to
            the built-in Next.js video runtime.
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white/90 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Shared Server Default
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Used whenever the browser-side overrides are blank. This is the
                  shared fallback for the built-in video runtime.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={serverStatus?.configured ? "secondary" : "outline"}
                >
                  {serverSyncState === "loading"
                    ? "Loading"
                    : serverStatus?.configured
                      ? "Configured"
                      : "Not configured"}
                </Badge>
                {serverStatus?.config_error ? (
                  <Badge variant="destructive">Config issue</Badge>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600 sm:grid-cols-2">
              <div>
                <span className="font-medium text-slate-700">Protocol:</span>{" "}
                <span className="font-mono break-all">
                  {serverStatus?.provider
                    ? formatProviderLabel(serverStatus.provider)
                    : "Auto / none"}
                </span>
              </div>
              <div>
                <span className="font-medium text-slate-700">Model:</span>{" "}
                <span className="font-mono break-all">
                  {serverStatus?.model || "Not set"}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="font-medium text-slate-700">Base URL:</span>{" "}
                <span className="font-mono break-all">
                  {serverStatus?.base_url || "Provider default"}
                </span>
              </div>
              <div>
                <span className="font-medium text-slate-700">Credential:</span>{" "}
                <span>
                  {serverStatus?.has_api_key
                    ? serverStatus.api_key_masked || "Configured"
                    : "No saved key"}
                </span>
              </div>
              <div>
                <span className="font-medium text-slate-700">Source:</span>{" "}
                <span>
                  {serverStatus
                    ? formatServerSource(serverStatus)
                    : "Not loaded yet"}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={serverBusy}
                onClick={() => void loadServerStatus(true)}
              >
                {serverSyncState === "loading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading
                  </>
                ) : (
                  "Reload server default"
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={serverBusy}
                onClick={() => void handleSaveServerDefault("frameAnalysis")}
              >
                {serverSyncState === "saving" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Use Frame Analysis"
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={serverBusy}
                onClick={() => void handleSaveServerDefault("copyGeneration")}
              >
                {serverSyncState === "saving" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Use Copy Generation"
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={serverBusy}
                onClick={() => void handleClearServerDefault()}
              >
                Clear default
              </Button>
            </div>

            {serverMessage ? (
              <p className="mt-3 text-xs leading-5 text-emerald-700">
                {serverMessage}
              </p>
            ) : null}
            {serverError ? (
              <p className="mt-3 text-xs leading-5 text-rose-700">{serverError}</p>
            ) : null}
            {serverStatus?.config_error ? (
              <p className="mt-3 text-xs leading-5 text-amber-700">
                {serverStatus.config_error}
              </p>
            ) : null}
          </div>
        )}

        {isOpen ? (
          <div className="grid gap-4 xl:grid-cols-2">
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
                      Auto will infer from the chosen model and base URL. Set a
                      provider explicitly if you use a custom gateway.
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
                      Leave blank to use the server default. Root URLs such as
                      `https://api.openai.com` and `https://api.anthropic.com`
                      are both supported.
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
                      Optional runtime override. If left blank, the server falls
                      back to the shared default and environment variables.
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          Connection test
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Sends one tiny real request with the current runtime
                          settings.
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
                              {formatTestHeading(
                                testResults[section.key] ?? { status: "idle" }
                              )}
                            </p>
                            {testResults[section.key]?.message ? (
                              <p className="text-slate-700">
                                {testResults[section.key]?.message}
                              </p>
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
          Runtime settings are sent in both <span className="font-mono">runtime</span>{" "}
          and <span className="font-mono">runtimeConfig</span> fields, so the
          video studio can use the same override contract as the Listing flow.
          Audio transcription is configured separately on the server with{" "}
          <span className="font-mono">OPENAI_TRANSCRIBE_API_KEY</span> /{" "}
          <span className="font-mono">OPENAI_TRANSCRIBE_BASE_URL</span>. It only
          falls back to <span className="font-mono">OPENAI_API_KEY</span> /{" "}
          <span className="font-mono">OPENAI_BASE_URL</span> when no dedicated
          transcription base URL is set.
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
    return DEFAULT_VIDEO_RUNTIME_SETTINGS.frameAnalysis.baseUrl || "Server default";
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

function readServerRuntimeStatus(value: unknown): VideoServerRuntimeStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const llm =
    record.llm && typeof record.llm === "object" && !Array.isArray(record.llm)
      ? (record.llm as Record<string, unknown>)
      : record;

  const provider = llm.provider;
  const source = llm.source;
  const storage = llm.storage;

  if (
    provider !== null &&
    provider !== undefined &&
    provider !== "anthropic" &&
    provider !== "openai"
  ) {
    return null;
  }

  if (source !== "file" && source !== "env" && source !== "none") {
    return null;
  }

  if (storage !== "local-file" && storage !== "vercel-tmp") {
    return null;
  }

  return {
    configured: Boolean(llm.configured),
    provider:
      provider === "anthropic" || provider === "openai" ? provider : null,
    base_url: typeof llm.base_url === "string" ? llm.base_url : "",
    model: typeof llm.model === "string" ? llm.model : "",
    timeout_seconds:
      typeof llm.timeout_seconds === "number" ? llm.timeout_seconds : 120,
    has_api_key: Boolean(llm.has_api_key),
    api_key_masked:
      typeof llm.api_key_masked === "string" ? llm.api_key_masked : "",
    source,
    storage,
    config_error:
      typeof llm.config_error === "string" ? llm.config_error : null,
  };
}

function formatServerSource(status: VideoServerRuntimeStatus): string {
  const sourceLabel =
    status.source === "file"
      ? "Saved file"
      : status.source === "env"
        ? "Environment"
        : "None";

  return `${sourceLabel} / ${status.storage}`;
}

function formatServerStatusSummary(status: VideoServerRuntimeStatus): string {
  const provider = status.provider ? formatProviderLabel(status.provider) : "Auto";
  const model = status.model || "model not set";
  return `${provider} / ${model}`;
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
