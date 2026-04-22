"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Loader2,
  RotateCcw,
  Server,
  ShieldCheck,
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
import type {
  ListingDiagnosticsCapabilitiesResponse,
  ListingDiagnosticsSpApiConfig,
  ListingDiagnosticsSpApiMode,
  ListingDiagnosticsSpApiRuntimeCredentials,
  ListingDiagnosticsSpApiTestResponse,
} from "@/lib/listing-diagnostics/types";

interface SpApiRuntimePanelProps {
  targetAsin: string;
  marketplace: string;
  config: ListingDiagnosticsSpApiConfig;
  disabled: boolean;
  onModeChange: (mode: ListingDiagnosticsSpApiMode) => void;
  onRuntimeChange: (
    patch: Partial<ListingDiagnosticsSpApiRuntimeCredentials>
  ) => void;
  onReset: () => void;
}

type CapabilitiesState =
  | {
      status: "loading";
      payload: null;
      error: string;
    }
  | {
      status: "ready";
      payload: ListingDiagnosticsCapabilitiesResponse;
      error: string;
    }
  | {
      status: "error";
      payload: null;
      error: string;
    };

type SpApiTestResult =
  | {
      status: "idle";
      message?: string;
      detail?: string;
    }
  | {
      status: "testing" | "success" | "error";
      message?: string;
      detail?: string;
    };

const MODE_OPTIONS: Array<{
  value: ListingDiagnosticsSpApiMode;
  label: string;
  description: string;
}> = [
  {
    value: "off",
    label: "关闭",
    description:
      "跳过 Amazon SP-API 校验，保持当前仅 SellerSprite 的路径。",
  },
  {
    value: "server-default",
    label: "服务器默认",
    description:
      "如果服务器已配置共享的 SP-API 凭证，就使用它们。",
  },
  {
    value: "runtime",
    label: "运行时",
    description:
      "仅随本次请求发送凭证，并保存在浏览器本地存储中。",
  },
];

export function SpApiRuntimePanel({
  targetAsin,
  marketplace,
  config,
  disabled,
  onModeChange,
  onRuntimeChange,
  onReset,
}: SpApiRuntimePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<CapabilitiesState>({
    status: "loading",
    payload: null,
    error: "",
  });
  const [testResult, setTestResult] = useState<SpApiTestResult>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function loadCapabilities() {
      try {
        const response = await fetch("/api/listing-diagnostics/capabilities", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("加载 Listing 诊断能力信息失败。");
        }

        const payload =
          (await response.json()) as ListingDiagnosticsCapabilitiesResponse;

        if (cancelled) {
          return;
        }

        setCapabilities({
          status: "ready",
          payload,
          error: "",
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setCapabilities({
          status: "error",
          payload: null,
          error:
            error instanceof Error && error.message.trim()
              ? error.message.trim()
              : "加载 Listing 诊断能力信息失败。",
        });
      }
    }

    void loadCapabilities();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setTestResult({ status: "idle" });
  }, [
    config.mode,
    config.runtime.clientId,
    config.runtime.clientSecret,
    config.runtime.refreshToken,
    config.runtime.sellerId,
    targetAsin,
    marketplace,
  ]);

  const serverDefaultConfigured =
    capabilities.status === "ready"
      ? capabilities.payload.spApi.serverDefaultConfigured
      : false;

  const marketplaceCount =
    capabilities.status === "ready"
      ? Object.keys(capabilities.payload.spApi.marketplaces).length
      : 0;

  async function handleTest() {
    if (config.mode === "off") {
      setTestResult({
        status: "error",
        message: "请先启用服务器默认模式或运行时模式，再测试 SP-API 连通性。",
      });
      return;
    }

    setTestResult({
      status: "testing",
      message: "正在校验 SP-API 凭证...",
    });

    try {
      const normalizedTargetAsin = targetAsin.trim().toUpperCase();
      const response = await fetch("/api/listing-diagnostics/sp-api-test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          marketplace,
          targetAsin: /^[A-Z0-9]{10}$/.test(normalizedTargetAsin)
            ? normalizedTargetAsin
            : undefined,
          spApi: config,
        }),
      });

      if (!response.ok) {
        throw await parseApiRequestError(response, "SP-API 连通性测试失败。");
      }

      const payload = (await response.json()) as ListingDiagnosticsSpApiTestResponse;
      const detail =
        payload.targetAsin && payload.checks.catalog === "verified"
          ? `已验证 ASIN ${payload.targetAsin} 的目录与账户访问权限。`
          : "令牌交换成功。填写有效的目标 ASIN 后，还会校验目录和账户访问权限。";

      setTestResult({
        status: "success",
        message: payload.message,
        detail,
      });
    } catch (error) {
      const normalizedError = normalizeApiRequestError(error, "SP-API 连通性测试失败。");

      setTestResult({
        status: "error",
        message: normalizedError.message,
        detail: normalizedError.code ? `code: ${normalizedError.code}` : undefined,
      });
    }
  }

  return (
    <Card className="border-dashed border-slate-300 bg-slate-50/75">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full bg-white p-2 text-slate-700 shadow-sm">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <CardTitle>Amazon SP-API 校验</CardTitle>
              <Badge variant={config.mode === "off" ? "outline" : "secondary"}>
                {formatModeLabel(config.mode)}
              </Badge>
              <Badge variant="outline">存储于当前浏览器</Badge>
            </div>
            <CardDescription>
              针对目标 ASIN 的可选目录与账户校验。SellerSprite 仍是 MVP 主数据路径；
              启用后，SP-API 会补充 Amazon 侧的已验证状态。
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
                收起
                <ChevronUp className="ml-1 h-4 w-4" />
              </>
            ) : (
              <>
                展开
                <ChevronDown className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={disabled}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            清除运行时密钥
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm text-slate-600 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-medium text-slate-900">
              <Server className="h-4 w-4 text-[#FF9900]" />
              能力状态
            </div>
            <p>
              {capabilities.status === "loading"
                ? "正在检查服务器是否暴露共享 SP-API 默认配置..."
                : capabilities.status === "error"
                  ? capabilities.error
                  : serverDefaultConfigured
                    ? "当前路由可使用服务器默认 SP-API 凭证。"
                    : "当前未配置共享的服务器默认 SP-API 凭证。"}
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-slate-900">运行时行为</p>
            <p>
              运行时模式只会把凭证保存在本地存储中。它们会随分析请求发送，本应用不会持久化保存。
            </p>
            {marketplaceCount > 0 ? (
              <p className="text-xs text-slate-500">
                已为 {marketplaceCount} 个 Listing 诊断站点准备好站点映射。
              </p>
            ) : null}
          </div>
        </div>

        {isOpen ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="listing-diagnostics-sp-api-mode">
                校验模式
              </Label>
              <Select
                value={config.mode}
                onValueChange={(value) =>
                  onModeChange(value as ListingDiagnosticsSpApiMode)
                }
              >
                <SelectTrigger id="listing-diagnostics-sp-api-mode">
                  <SelectValue placeholder="选择校验模式" />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-slate-500">
                {MODE_OPTIONS.find((option) => option.value === config.mode)?.description}
              </p>
            </div>

            {config.mode === "runtime" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <CredentialInput
                  id="listing-diagnostics-sp-api-client-id"
                  label="LWA Client ID"
                  value={config.runtime.clientId}
                  placeholder="amzn1.application-oa2-client..."
                  disabled={disabled}
                  onChange={(value) => onRuntimeChange({ clientId: value })}
                />
                <CredentialInput
                  id="listing-diagnostics-sp-api-seller-id"
                  label="Seller ID"
                  value={config.runtime.sellerId}
                  placeholder="A2XXXXXXXXXXXX"
                  disabled={disabled}
                  onChange={(value) => onRuntimeChange({ sellerId: value })}
                />
                <CredentialInput
                  id="listing-diagnostics-sp-api-client-secret"
                  label="LWA Client Secret"
                  value={config.runtime.clientSecret}
                  placeholder="********"
                  type="password"
                  disabled={disabled}
                  onChange={(value) => onRuntimeChange({ clientSecret: value })}
                />
                <CredentialInput
                  id="listing-diagnostics-sp-api-refresh-token"
                  label="Refresh Token"
                  value={config.runtime.refreshToken}
                  placeholder="Atzr|IwEB..."
                  type="password"
                  disabled={disabled}
                  onChange={(value) => onRuntimeChange({ refreshToken: value })}
                />
              </div>
            ) : null}

            {config.mode === "server-default" ? (
              <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm leading-6 text-slate-600">
                {serverDefaultConfigured
                  ? "服务器默认配置已就绪。分析请求会尝试使用共享凭证校验 Amazon 目录与卖家账户状态。"
                  : "服务器默认配置尚未完成。在你提供运行时凭证前，请求会继续走 SellerSprite MVP 路径。"}
              </div>
            ) : null}

            {config.mode === "off" ? (
              <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm leading-6 text-slate-600">
                SP-API 校验已关闭。这样会保持当前确定性的 SellerSprite 流程不变。
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">连接测试</p>
                  <p className="text-xs text-slate-500">
                    在启动完整诊断前先校验凭证。当前目标 ASIN 有效时，测试也会校验目录与账户访问权限。
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled || testResult.status === "testing"}
                  onClick={() => void handleTest()}
                >
                  {testResult.status === "testing" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      测试中
                    </>
                  ) : (
                    "测试"
                  )}
                </Button>
              </div>

              {testResult.status !== "idle" ? (
                <div className="mt-3 rounded-md border bg-white px-3 py-2 text-xs">
                  <div className="flex items-start gap-2">
                    {testResult.status === "success" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                    ) : testResult.status === "error" ? (
                      <XCircle className="mt-0.5 h-4 w-4 text-red-600" />
                    ) : (
                      <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-slate-500" />
                    )}
                    <div className="space-y-1">
                      <p
                        className={
                          testResult.status === "success"
                            ? "font-medium text-green-700"
                            : testResult.status === "error"
                              ? "font-medium text-red-700"
                              : "font-medium text-slate-700"
                        }
                      >
                        {formatTestHeading(testResult)}
                      </p>
                      {testResult.message ? (
                        <p className="text-slate-700">{testResult.message}</p>
                      ) : null}
                      {testResult.detail ? (
                        <p className="text-slate-500">{testResult.detail}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-white/85 p-3 text-xs leading-5 text-slate-500">
          敏感字段会在界面响应里被遮罩，且不会写入服务器日志。运行时凭证只有在你主动以{" "}
          <span className="font-mono">runtime</span> mode.
          {" "}模式提交分析请求时才会离开浏览器。
        </div>
      </CardContent>
    </Card>
  );
}

function CredentialInput({
  id,
  label,
  value,
  placeholder,
  type = "text",
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  type?: "text" | "password";
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          type={type}
          disabled={disabled}
          className="pl-9"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

function formatModeLabel(mode: ListingDiagnosticsSpApiMode): string {
  switch (mode) {
    case "server-default":
      return "服务器默认";
    case "runtime":
      return "运行时";
    default:
      return "关闭";
  }
}

function formatTestHeading(result: SpApiTestResult): string {
  switch (result.status) {
    case "testing":
      return "正在测试连接...";
    case "success":
      return "测试通过";
    case "error":
      return "测试失败";
    default:
      return "未测试";
  }
}
