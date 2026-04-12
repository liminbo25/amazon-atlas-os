import {
  ListingDiagnosticsOrchestratorError,
  runListingDiagnostics,
} from "@/lib/listing-diagnostics/orchestrator";
import {
  isSellerSpriteClientError,
  SellerSpriteClientError,
} from "@/lib/seller-sprite-client";

const DEFAULT_MARKETPLACE = "US";
const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

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

    const response = await runListingDiagnostics({
      targetAsin,
      competitorAsins,
      marketplace,
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

    console.error("[listing-diagnostics/analyze] unexpected error", error);
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
