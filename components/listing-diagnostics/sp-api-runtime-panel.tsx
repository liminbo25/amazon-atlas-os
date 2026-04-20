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
    label: "Off",
    description:
      "Skip Amazon SP-API verification and keep the current SellerSprite-only path.",
  },
  {
    value: "server-default",
    label: "Server default",
    description:
      "Use the server's shared SP-API credentials when they are configured.",
  },
  {
    value: "runtime",
    label: "Runtime",
    description:
      "Send credentials with this request only and keep them in browser local storage.",
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
          throw new Error("Failed to load listing diagnostics capabilities.");
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
              : "Failed to load listing diagnostics capabilities.",
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
        message: "Enable server-default or runtime mode before testing SP-API connectivity.",
      });
      return;
    }

    setTestResult({
      status: "testing",
      message: "Validating SP-API credentials...",
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
        throw await parseApiRequestError(response, "SP-API connectivity test failed.");
      }

      const payload = (await response.json()) as ListingDiagnosticsSpApiTestResponse;
      const detail =
        payload.targetAsin && payload.checks.catalog === "verified"
          ? `Verified catalog and account access for ASIN ${payload.targetAsin}.`
          : "Token exchange succeeded. Add a valid target ASIN to also verify catalog and account access.";

      setTestResult({
        status: "success",
        message: payload.message,
        detail,
      });
    } catch (error) {
      const normalizedError = normalizeApiRequestError(
        error,
        "SP-API connectivity test failed."
      );

      setTestResult({
        status: "error",
        message: normalizedError.message,
        detail: normalizedError.code ? `code: ${normalizedError.code}` : undefined,
      });
    }
  }

  return (
    <Card className="obsidian-filter-bar">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-[rgba(246,182,63,0.2)] bg-[rgba(246,182,63,0.12)] p-2 text-[#f6c26a]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <CardTitle>Amazon SP-API Verification</CardTitle>
            <Badge variant={config.mode === "off" ? "outline" : "secondary"}>
              {formatModeLabel(config.mode)}
            </Badge>
            <Badge variant="outline">Stored in this browser</Badge>
          </div>
          <CardDescription>
            Optional catalog and account verification for the target ASIN.
            SellerSprite remains the primary MVP data path, while SP-API adds
            verified Amazon-side status when you enable it.
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
            onClick={onReset}
            disabled={disabled}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            Clear runtime secrets
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="obsidian-soft-card grid gap-3 p-4 text-sm text-[#c5b9aa] lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-medium text-[#f7f0e6]">
              <Server className="h-4 w-4 text-[#FF9900]" />
              Capability status
            </div>
            <p>
              {capabilities.status === "loading"
                ? "Checking whether the server exposes a shared SP-API default..."
                : capabilities.status === "error"
                  ? capabilities.error
                  : serverDefaultConfigured
                    ? "Server-default SP-API credentials are available for this route."
                    : "No shared server-default SP-API credentials are configured right now."}
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-[#f7f0e6]">Runtime behavior</p>
            <p>
              Runtime mode keeps credentials in local storage only. They are sent
              with the analyze request and are never persisted by this app.
            </p>
            {marketplaceCount > 0 ? (
              <p className="text-xs text-[#998e82]">
                Marketplace mapping is ready for {marketplaceCount} listing-diagnostics
                markets.
              </p>
            ) : null}
          </div>
        </div>

        {isOpen ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="listing-diagnostics-sp-api-mode"
                className="text-[#dfd2c3]"
              >
                Verification mode
              </Label>
              <Select
                value={config.mode}
                onValueChange={(value) =>
                  onModeChange(value as ListingDiagnosticsSpApiMode)
                }
              >
                <SelectTrigger id="listing-diagnostics-sp-api-mode">
                  <SelectValue placeholder="Select verification mode" />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-[#998e82]">
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
              <div className="obsidian-inline-note p-4 text-sm leading-6 text-[#dfd2c3]">
                {serverDefaultConfigured
                  ? "The server default is ready. Analyze requests will try to verify Amazon catalog and seller-account status with the shared credentials."
                  : "The server default is not configured yet. The request will stay on the SellerSprite MVP path unless runtime credentials are supplied instead."}
              </div>
            ) : null}

            {config.mode === "off" ? (
              <div className="obsidian-soft-card p-4 text-sm leading-6 text-[#c5b9aa]">
                SP-API verification is disabled. This keeps the current deterministic
                SellerSprite flow unchanged.
              </div>
            ) : null}

            <div className="obsidian-soft-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#f7f0e6]">Connection test</p>
                  <p className="text-xs text-[#998e82]">
                    Validate the credentials before starting a full diagnosis.
                    When the current target ASIN is valid, the test also checks
                    catalog and account access.
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
                      Testing
                    </>
                  ) : (
                    "Test"
                  )}
                </Button>
              </div>

              {testResult.status !== "idle" ? (
                <div className="mt-3 rounded-[1rem] border border-white/10 bg-[rgba(8,12,20,0.72)] px-3 py-2 text-xs">
                  <div className="flex items-start gap-2">
                    {testResult.status === "success" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                    ) : testResult.status === "error" ? (
                      <XCircle className="mt-0.5 h-4 w-4 text-rose-300" />
                    ) : (
                      <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-[#998e82]" />
                    )}
                    <div className="space-y-1">
                      <p
                        className={
                          testResult.status === "success"
                            ? "font-medium text-emerald-200"
                            : testResult.status === "error"
                              ? "font-medium text-rose-200"
                              : "font-medium text-[#dfd2c3]"
                        }
                      >
                        {formatTestHeading(testResult)}
                      </p>
                      {testResult.message ? (
                        <p className="text-[#dfd2c3]">{testResult.message}</p>
                      ) : null}
                      {testResult.detail ? (
                        <p className="text-[#998e82]">{testResult.detail}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="obsidian-soft-card p-3 text-xs leading-5 text-[#998e82]">
          Sensitive fields are masked in UI responses and excluded from server
          logs. The only time runtime credentials leave the browser is when you
          deliberately submit an analyze request in{" "}
          <span className="font-mono">runtime</span> mode.
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
      <Label htmlFor={id} className="text-[#dfd2c3]">
        {label}
      </Label>
      <div className="relative">
        <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#998e82]" />
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
      return "Server default";
    case "runtime":
      return "Runtime";
    default:
      return "Off";
  }
}

function formatTestHeading(result: SpApiTestResult): string {
  switch (result.status) {
    case "testing":
      return "Testing connection...";
    case "success":
      return "Test passed";
    case "error":
      return "Test failed";
    default:
      return "Not tested";
  }
}
