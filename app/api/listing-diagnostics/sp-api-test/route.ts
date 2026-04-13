import {
  ListingDiagnosticsSpApiError,
  testListingDiagnosticsSpApiConnection,
} from "@/lib/listing-diagnostics/sp-api";
import type {
  ListingDiagnosticsSpApiConfig,
  ListingDiagnosticsSpApiMode,
  ListingDiagnosticsSpApiRuntimeCredentials,
} from "@/lib/listing-diagnostics/types";

const DEFAULT_MARKETPLACE = "US";
const ASIN_PATTERN = /^[A-Z0-9]{10}$/;
const SP_API_RUNTIME_FIELDS: Array<keyof ListingDiagnosticsSpApiRuntimeCredentials> = [
  "clientId",
  "clientSecret",
  "refreshToken",
  "sellerId",
];

export const runtime = "nodejs";

class ListingDiagnosticsRequestError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = "ListingDiagnosticsRequestError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseRequestBody(request);
    const marketplace = parseMarketplace(body.marketplace);
    const spApi = parseSpApiConfig(body.spApi);
    const targetAsin = parseOptionalAsin(body.targetAsin);

    const response = await testListingDiagnosticsSpApiConnection({
      marketplace,
      config: spApi,
      targetAsin,
    });

    return Response.json(response);
  } catch (error) {
    if (error instanceof ListingDiagnosticsRequestError) {
      return Response.json(
        {
          error: error.message,
          code: error.code,
        },
        {
          status: error.statusCode,
        }
      );
    }

    if (error instanceof ListingDiagnosticsSpApiError) {
      return Response.json(
        {
          error: error.message,
          code: error.code,
        },
        {
          status: error.statusCode,
        }
      );
    }

    console.error("[listing-diagnostics/sp-api-test] unexpected error", {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return Response.json(
      {
        error: "SP-API connectivity test failed unexpectedly.",
        code: "unexpected_error",
      },
      {
        status: 500,
      }
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function parseRequestBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ListingDiagnosticsRequestError(
      "Request body must be valid JSON.",
      "invalid_json_body"
    );
  }

  if (!isRecord(body)) {
    throw new ListingDiagnosticsRequestError(
      "Request body must be a JSON object.",
      "invalid_json_body"
    );
  }

  return body;
}

function parseMarketplace(value: unknown): string {
  if (value === undefined) {
    return DEFAULT_MARKETPLACE;
  }

  if (typeof value !== "string") {
    throw new ListingDiagnosticsRequestError(
      "marketplace must be a string.",
      "marketplace_invalid"
    );
  }

  const marketplace = value.trim().toUpperCase();

  if (!/^[A-Z]{2,4}$/.test(marketplace)) {
    throw new ListingDiagnosticsRequestError(
      "marketplace must be a marketplace code such as US, CA, or UK.",
      "marketplace_invalid"
    );
  }

  return marketplace;
}

function parseOptionalAsin(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ListingDiagnosticsRequestError(
      "targetAsin must be a string.",
      "targetAsin_invalid"
    );
  }

  const asin = value.trim().toUpperCase();

  if (!ASIN_PATTERN.test(asin)) {
    throw new ListingDiagnosticsRequestError(
      "targetAsin must be a valid 10-character ASIN.",
      "targetAsin_invalid"
    );
  }

  return asin;
}

function parseSpApiMode(value: unknown): ListingDiagnosticsSpApiMode {
  if (value === undefined) {
    return "off";
  }

  if (value === "off" || value === "server-default" || value === "runtime") {
    return value;
  }

  throw new ListingDiagnosticsRequestError(
    'spApi.mode must be "off", "server-default", or "runtime".',
    "sp_api_mode_invalid"
  );
}

function parseSpApiRuntime(
  value: unknown,
  mode: ListingDiagnosticsSpApiMode
): ListingDiagnosticsSpApiRuntimeCredentials {
  if (!isRecord(value)) {
    if (mode === "runtime") {
      throw new ListingDiagnosticsRequestError(
        "spApi.runtime must be an object in runtime mode.",
        "sp_api_runtime_invalid"
      );
    }

    return {
      clientId: "",
      clientSecret: "",
      refreshToken: "",
      sellerId: "",
    };
  }

  const runtimeConfig = {
    clientId: typeof value.clientId === "string" ? value.clientId.trim() : "",
    clientSecret:
      typeof value.clientSecret === "string" ? value.clientSecret.trim() : "",
    refreshToken:
      typeof value.refreshToken === "string" ? value.refreshToken.trim() : "",
    sellerId: typeof value.sellerId === "string" ? value.sellerId.trim() : "",
  };

  if (mode === "runtime") {
    const missingFields = SP_API_RUNTIME_FIELDS.filter(
      (field) => runtimeConfig[field].length === 0
    );

    if (missingFields.length > 0) {
      throw new ListingDiagnosticsRequestError(
        `spApi.runtime is missing ${missingFields.join(", ")}.`,
        "sp_api_runtime_invalid"
      );
    }
  }

  return runtimeConfig;
}

function parseSpApiConfig(value: unknown): ListingDiagnosticsSpApiConfig | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new ListingDiagnosticsRequestError(
      "spApi must be an object.",
      "sp_api_invalid"
    );
  }

  const mode = parseSpApiMode(value.mode);
  const runtime = parseSpApiRuntime(value.runtime, mode);

  return {
    mode,
    runtime,
  };
}
