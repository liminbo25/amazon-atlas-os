import {
  ListingDiagnosticsOrchestratorError,
  runListingDiagnostics,
} from "@/lib/listing-diagnostics/orchestrator";
import {
  ListingDiagnosticsSpApiError,
} from "@/lib/listing-diagnostics/sp-api";
import {
  isSellerSpriteClientError,
  SellerSpriteClientError,
} from "@/lib/seller-sprite-client";
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

function parseAsin(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ListingDiagnosticsRequestError(
      `${fieldName} must be a string.`,
      `${fieldName}_invalid`
    );
  }

  const asin = value.trim().toUpperCase();

  if (!ASIN_PATTERN.test(asin)) {
    throw new ListingDiagnosticsRequestError(
      `${fieldName} must be a valid 10-character ASIN.`,
      `${fieldName}_invalid`
    );
  }

  return asin;
}

function parseCompetitorAsins(value: unknown, targetAsin: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ListingDiagnosticsRequestError(
      "competitorAsins must be an array.",
      "competitor_asins_invalid"
    );
  }

  const normalized = value.map((asin) => {
    if (typeof asin !== "string") {
      throw new ListingDiagnosticsRequestError(
        "Each competitor ASIN must be a string.",
        "competitor_asins_invalid"
      );
    }

    return asin.trim().toUpperCase();
  });

  const invalidAsins = normalized.filter(
    (asin) => asin.length > 0 && !ASIN_PATTERN.test(asin)
  );

  if (invalidAsins.length > 0) {
    throw new ListingDiagnosticsRequestError(
      `Competitor ASINs must be valid 10-character ASINs. Invalid values: ${invalidAsins.join(", ")}.`,
      "competitor_asins_invalid"
    );
  }

  const duplicateWithTarget = normalized.find((asin) => asin === targetAsin);

  if (duplicateWithTarget) {
    throw new ListingDiagnosticsRequestError(
      "Competitor ASINs cannot include the target ASIN.",
      "competitor_asins_duplicate_target"
    );
  }

  const nonEmptyAsins = normalized.filter((asin) => asin.length > 0);
  const duplicateAsins = nonEmptyAsins.filter(
    (asin, index) => nonEmptyAsins.indexOf(asin) !== index
  );

  if (duplicateAsins.length > 0) {
    throw new ListingDiagnosticsRequestError(
      `Competitor ASINs must be unique. Duplicate values: ${Array.from(new Set(duplicateAsins)).join(", ")}.`,
      "competitor_asins_duplicate"
    );
  }

  const asins = Array.from(
    new Set(nonEmptyAsins)
  );

  if (asins.length > 5) {
    throw new ListingDiagnosticsRequestError(
      "competitorAsins supports up to 5 ASINs in Phase 1.",
      "competitor_asins_limit"
    );
  }

  return asins;
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
  const runtimeConfig = parseSpApiRuntime(value.runtime, mode);

  return {
    mode,
    runtime: runtimeConfig,
  };
}

function mapSellerSpriteError(error: SellerSpriteClientError): {
  message: string;
  code: string;
} {
  switch (error.code) {
    case "configuration":
      return {
        message:
          "SellerSprite is not configured on the server. Set SELLERSPRITE_SECRET_KEY.",
        code: "sellersprite_configuration_error",
      };
    case "timeout":
      return {
        message: "SellerSprite request timed out while collecting listing diagnostics.",
        code: "sellersprite_timeout",
      };
    case "upstream":
    case "bad-response":
      return {
        message: error.message,
        code: `sellersprite_${error.code}`,
      };
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseRequestBody(request);
    const targetAsin = parseAsin(body.targetAsin, "targetAsin");
    const competitorAsins = parseCompetitorAsins(body.competitorAsins, targetAsin);
    const marketplace = parseMarketplace(body.marketplace);
    const spApi = parseSpApiConfig(body.spApi);

    const response = await runListingDiagnostics({
      targetAsin,
      competitorAsins,
      marketplace,
      spApi,
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

    if (error instanceof ListingDiagnosticsOrchestratorError) {
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

    if (error instanceof Error && isSellerSpriteClientError(error)) {
      const mapped = mapSellerSpriteError(error);
      return Response.json(
        {
          error: mapped.message,
          code: mapped.code,
        },
        {
          status: error.statusCode,
        }
      );
    }

    console.error("[listing-diagnostics/analyze] unexpected error", {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json(
      {
        error: "Listing diagnostics failed unexpectedly.",
        code: "unexpected_error",
      },
      {
        status: 500,
      }
    );
  }
}
