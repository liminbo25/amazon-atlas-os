import {
  fetchCompetitorData,
  isSellerSpriteClientError,
} from "@/lib/seller-sprite-client";

const DEFAULT_MARKETPLACE = "US";

class AnalyzeRequestError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
    } = {}
  ) {
    super(message);
    this.name = "AnalyzeRequestError";
    this.statusCode = options.statusCode ?? 400;
    this.code = options.code ?? "invalid_request";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function parseRequestBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AnalyzeRequestError("Request body must be valid JSON.", {
      code: "invalid_json_body",
    });
  }
}

function parseAsins(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AnalyzeRequestError("asins must be an array.", {
      code: "asins_invalid",
    });
  }

  const asins = value
    .filter((asin): asin is string => typeof asin === "string")
    .map((asin) => asin.trim().toUpperCase())
    .filter((asin) => asin.length > 0);

  if (asins.length === 0) {
    throw new AnalyzeRequestError("At least one ASIN is required.", {
      code: "asins_required",
    });
  }

  return asins;
}

function parseMarketplace(value: unknown): string {
  if (value === undefined) {
    return DEFAULT_MARKETPLACE;
  }

  if (typeof value !== "string") {
    throw new AnalyzeRequestError("marketplace must be a string.", {
      code: "marketplace_invalid",
    });
  }

  const marketplace = value.trim().toUpperCase();
  if (!marketplace) {
    throw new AnalyzeRequestError("marketplace cannot be empty.", {
      code: "marketplace_required",
    });
  }

  return marketplace;
}

function parseAnalyzeRequest(body: unknown): {
  asins: string[];
  marketplace: string;
} {
  if (!isRecord(body)) {
    throw new AnalyzeRequestError("Request body must be a JSON object.", {
      code: "invalid_json_body",
    });
  }

  return {
    asins: parseAsins(body.asins),
    marketplace: parseMarketplace(body.marketplace),
  };
}

function mapSellerSpriteError(error: Error): {
  error: string;
  code: string;
} {
  if (!isSellerSpriteClientError(error)) {
    return {
      error: "SellerSprite data collection failed.",
      code: "sellersprite_failed",
    };
  }

  switch (error.code) {
    case "configuration":
      return {
        error:
          "SellerSprite is not configured on the server. Set SELLERSPRITE_SECRET_KEY.",
        code: "sellersprite_configuration_error",
      };
    case "timeout":
      return {
        error: "SellerSprite request timed out.",
        code: "sellersprite_timeout",
      };
    case "upstream":
    case "bad-response":
      return {
        error: error.message,
        code: `sellersprite_${error.code}`,
      };
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseRequestBody(request);
    const { asins, marketplace } = parseAnalyzeRequest(body);
    const data = await fetchCompetitorData(asins, marketplace);
    return Response.json(data);
  } catch (error) {
    if (error instanceof AnalyzeRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    if (error instanceof Error && isSellerSpriteClientError(error)) {
      const mapped = mapSellerSpriteError(error);
      return Response.json(mapped, { status: error.statusCode });
    }

    console.error("[analyze] unexpected seller sprite error", error);
    return Response.json(
      {
        error: "SellerSprite data collection failed.",
        code: "unexpected_error",
      },
      { status: 500 }
    );
  }
}
