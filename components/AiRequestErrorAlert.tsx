"use client";

import type { ReactNode } from "react";
import { AlertTriangle, KeyRound, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AiRuntimeServiceConfig } from "@/lib/types";

export class ApiRequestError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
    } = {}
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.code = options.code;
    this.status = options.status;
  }
}

export async function parseApiRequestError(
  response: Response,
  fallbackMessage: string
): Promise<ApiRequestError> {
  const rawText = await response.text();
  const payload = parseJsonRecord(rawText);

  return new ApiRequestError(
    typeof payload?.error === "string" ? payload.error : rawText.trim() || fallbackMessage,
    {
      code: typeof payload?.code === "string" ? payload.code : undefined,
      status: response.status,
    }
  );
}

export function normalizeApiRequestError(
  error: unknown,
  fallbackMessage: string
): ApiRequestError {
  if (error instanceof ApiRequestError) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiRequestError(error.message || fallbackMessage);
  }

  return new ApiRequestError(fallbackMessage);
}

type RequestIssueKind = "configuration" | "authentication" | "interface" | "request";

interface RequestIssueMeta {
  icon: typeof Wrench;
  badge: string;
  badgeVariant: "secondary" | "destructive" | "outline";
  title: string;
  description: string;
  suggestion: string;
  kind: RequestIssueKind;
}

interface AiRequestErrorAlertProps {
  error: ApiRequestError;
  heading: string;
  runtimeConfig: AiRuntimeServiceConfig;
  className?: string;
  actions?: ReactNode;
}

export function AiRequestErrorAlert({
  error,
  heading,
  runtimeConfig,
  className,
  actions,
}: AiRequestErrorAlertProps) {
  const meta = describeIssue(error, runtimeConfig);
  const Icon = meta.icon;

  return (
    <Card
      className={cn(
        "obsidian-soft-card border-rose-400/25 bg-[linear-gradient(145deg,rgba(80,28,34,0.52),rgba(28,22,24,0.96))] text-[#f8efe7]",
        className
      )}
    >
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start gap-3">
          <div className="obsidian-meta-pill bg-rose-500/16 p-2 text-rose-100 shadow-none">
            <Icon className="h-4 w-4" />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[#f8efe7]">{heading}</p>
              <Badge
                variant={meta.badgeVariant}
                className="obsidian-meta-pill border-rose-300/18 bg-rose-500/12 text-rose-100"
              >
                {meta.badge}
              </Badge>
              {error.code ? (
                <Badge
                  variant="outline"
                  className="obsidian-meta-pill border-white/10 bg-white/[0.04] text-stone-200/85"
                >
                  code: {error.code}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-rose-50/90">{meta.title}</p>
            <p className="text-sm text-rose-100/80">{error.message}</p>
          </div>
        </div>

        <div className="obsidian-inline-note rounded-lg border-rose-300/18 bg-white/[0.03] p-3 text-sm text-stone-200/80">
          <p>{meta.description}</p>
          <p className="mt-2">{meta.suggestion}</p>
        </div>

        <div className="obsidian-code-panel grid gap-2 rounded-lg p-3 text-xs text-stone-300/80 sm:grid-cols-2">
          <div>
            <span className="font-medium text-[#f3e8d2]">Protocol:</span>{" "}
            <span className="font-mono break-all">
              {runtimeConfig.provider.trim() || "Auto"}
            </span>
          </div>
          <div>
            <span className="font-medium text-[#f3e8d2]">Model:</span>{" "}
            <span className="font-mono break-all">
              {runtimeConfig.model.trim() || "Server default"}
            </span>
          </div>
          <div className="sm:col-span-2">
            <span className="font-medium text-[#f3e8d2]">Base URL:</span>{" "}
            <span className="font-mono break-all">
              {formatRuntimeBaseUrl(runtimeConfig.baseUrl)}
            </span>
          </div>
          <div className="sm:col-span-2">
            <span className="font-medium text-[#f3e8d2]">Credential source:</span>{" "}
            <span>{runtimeConfig.apiKey.trim() ? "Runtime key provided" : "Server env fallback"}</span>
          </div>
        </div>

        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}

function describeIssue(
  error: ApiRequestError,
  runtimeConfig: AiRuntimeServiceConfig
): RequestIssueMeta {
  const hasCustomRuntime =
    runtimeConfig.provider.trim().length > 0 ||
    runtimeConfig.baseUrl.trim().length > 0 ||
    runtimeConfig.model.trim().length > 0 ||
    runtimeConfig.apiKey.trim().length > 0;

  if (isConfigurationIssue(error)) {
    return {
      kind: "configuration",
      icon: Wrench,
      badge: "Configuration",
      badgeVariant: "secondary",
      title: "The current AI route is missing a usable provider, model, base URL, or server-side fallback.",
      description:
        "This usually means the runtime settings do not match the protocol expected by the upstream service, or the server does not have a valid default key and model.",
      suggestion: hasCustomRuntime
        ? "Check whether the selected protocol matches the upstream API, and whether the runtime key, base URL, and model belong to the same provider."
        : "Either fill runtime settings in the UI or configure server defaults such as ANTHROPIC_API_KEY / OPENAI_API_KEY and the matching model.",
    };
  }

  if (isAuthenticationIssue(error)) {
    return {
      kind: "authentication",
      icon: KeyRound,
      badge: "Authentication",
      badgeVariant: "destructive",
      title: "The upstream AI service rejected the credential used for this request.",
      description:
        "Common causes are an invalid API key, a provider mismatch, a base URL that expects a different auth header, or a proxy that is not the real model endpoint.",
      suggestion: hasCustomRuntime
        ? "Verify the protocol, base URL, and API key as one set. An OpenAI-compatible gateway usually expects Authorization: Bearer, while Anthropic expects x-api-key."
        : "Check the server-side credential and confirm the configured endpoint is the actual model API, not only a network proxy.",
    };
  }

  if (isRequestIssue(error)) {
    return {
      kind: "request",
      icon: AlertTriangle,
      badge: "Request",
      badgeVariant: "outline",
      title: "The request reached the module, but the payload or runtime override is not acceptable to the target API.",
      description:
        "This often happens when an image payload is malformed, the required step inputs are incomplete, or the selected model endpoint rejects the request schema.",
      suggestion:
        "Check the current step inputs first, then verify the selected provider and model really support the requested task.",
    };
  }

  return {
    kind: "interface",
    icon: AlertTriangle,
    badge: "Upstream",
    badgeVariant: "outline",
    title: "The upstream AI interface returned an invalid, empty, timed out, or unavailable response.",
    description:
      "This usually points to upstream instability, an incompatible proxy, or a model endpoint that can list models but cannot complete chat requests.",
    suggestion:
      "Retry once, then verify the chosen base URL with a direct API test outside the app. If /models works but /chat/completions or /messages fails, the endpoint is not fully usable for generation.",
  };
}

function isConfigurationIssue(error: ApiRequestError): boolean {
  return (
    error.code === "anthropic_credentials_missing" ||
    error.code === "anthropic_model_missing" ||
    error.code === "openai_credentials_missing" ||
    error.code === "openai_model_missing" ||
    error.code === "ai_provider_invalid" ||
    /missing|config|provider|model|base url|environment/i.test(error.message)
  );
}

function isAuthenticationIssue(error: ApiRequestError): boolean {
  return (
    error.code === "ai_auth_error" ||
    error.status === 401 ||
    error.status === 403 ||
    /auth|credential|unauthorized|forbidden|api key/i.test(error.message)
  );
}

function isRequestIssue(error: ApiRequestError): boolean {
  return Boolean(error.status && error.status >= 400 && error.status < 500);
}

function formatRuntimeBaseUrl(baseUrl: string): string {
  const value = baseUrl.trim();

  if (!value) {
    return "Server default";
  }

  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = normalizeRuntimePath(url.pathname);
    return url.toString().replace(/\/+$/, "");
  } catch {
    const normalized = normalizeRuntimePath(value);
    return normalized.replace(/\/+$/, "");
  }
}

function normalizeRuntimePath(path: string): string {
  return (
    path
      .replace(/\/+$/, "")
      .replace(/\/v1\/chat\/completions$/i, "")
      .replace(/\/chat\/completions$/i, "")
      .replace(/\/v1\/responses$/i, "")
      .replace(/\/responses$/i, "")
      .replace(/\/v1\/messages$/i, "")
      .replace(/\/messages$/i, "")
      .replace(/\/v1$/i, "") || "/"
  );
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  if (!value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
