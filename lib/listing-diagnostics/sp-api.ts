import {
  createAction,
  createFinding,
  getCoverageStatus,
} from "@/lib/listing-diagnostics/rules/shared";
import type {
  ListingDiagnosticsActionPlanItem,
  ListingDiagnosticsCapabilitiesResponse,
  ListingDiagnosticsFinding,
  ListingDiagnosticsSeverity,
  ListingDiagnosticsSourceCoverageItem,
  ListingDiagnosticsSourceStatus,
  ListingDiagnosticsSpApiConfig,
  ListingDiagnosticsSpApiMode,
  ListingDiagnosticsSpApiRuntimeCredentials,
  ListingDiagnosticsSpApiTestResponse,
  ListingDiagnosticsSpApiVerificationSummary,
} from "@/lib/listing-diagnostics/types";

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const SP_API_USER_AGENT = "listing-module/0.1.0 (listing diagnostics)";
const SP_API_TIMEOUT_MS = 20_000;
const RUNTIME_FIELDS: Array<keyof ListingDiagnosticsSpApiRuntimeCredentials> = [
  "clientId",
  "clientSecret",
  "refreshToken",
  "sellerId",
];
const SERVER_DEFAULT_ENV = {
  clientId: "AMAZON_SP_API_CLIENT_ID",
  clientSecret: "AMAZON_SP_API_CLIENT_SECRET",
  refreshToken: "AMAZON_SP_API_REFRESH_TOKEN",
  sellerId: "AMAZON_SP_API_SELLER_ID",
} as const;
const MARKETPLACE_CONFIG = {
  US: {
    marketplaceId: "ATVPDKIKX0DER",
    endpoint: "https://sellingpartnerapi-na.amazon.com",
    region: "NA",
  },
  CA: {
    marketplaceId: "A2EUQ1WTGCTBG2",
    endpoint: "https://sellingpartnerapi-na.amazon.com",
    region: "NA",
  },
  UK: {
    marketplaceId: "A1F83G8C2ARO7P",
    endpoint: "https://sellingpartnerapi-eu.amazon.com",
    region: "EU",
  },
  DE: {
    marketplaceId: "A1PA6795UKMFR9",
    endpoint: "https://sellingpartnerapi-eu.amazon.com",
    region: "EU",
  },
  FR: {
    marketplaceId: "A13V1IB3VIYZZH",
    endpoint: "https://sellingpartnerapi-eu.amazon.com",
    region: "EU",
  },
  IT: {
    marketplaceId: "APJ6JRA9NG5V4",
    endpoint: "https://sellingpartnerapi-eu.amazon.com",
    region: "EU",
  },
  ES: {
    marketplaceId: "A1RKKUPIHCS9HS",
    endpoint: "https://sellingpartnerapi-eu.amazon.com",
    region: "EU",
  },
  JP: {
    marketplaceId: "A1VC38T7YXB528",
    endpoint: "https://sellingpartnerapi-fe.amazon.com",
    region: "FE",
  },
} as const;

type ResolvedSpApiMode = Exclude<ListingDiagnosticsSpApiMode, "off">;

interface ResolvedSpApiCredentials {
  mode: ResolvedSpApiMode;
  credentials: ListingDiagnosticsSpApiRuntimeCredentials;
  sellerIdMasked: string;
}

interface CatalogVerification {
  itemName: string;
  brandName: string;
  productType: string;
  imageCount: number;
}

interface AccountIssue {
  code: string;
  message: string;
  severity: ListingDiagnosticsSeverity;
  attributeNames: string[];
}

interface AccountListingVerification {
  listingFound: boolean;
  sku: string;
  statuses: string[];
  issues: AccountIssue[];
}

interface RestrictionsVerification {
  restrictions: Array<{
    conditionType: string;
    reasonCode: string;
    message: string;
  }>;
}

interface ListingDiagnosticsSpApiEnhancement {
  coverageItems: ListingDiagnosticsSourceCoverageItem[];
  findings: ListingDiagnosticsFinding[];
  actions: ListingDiagnosticsActionPlanItem[];
  warnings: string[];
  summary: ListingDiagnosticsSpApiVerificationSummary;
  scoreCeiling: number | null;
  headline: string | null;
}

interface SpApiResolvedContext {
  marketplace: (typeof MARKETPLACE_CONFIG)[keyof typeof MARKETPLACE_CONFIG];
  credentials: ResolvedSpApiCredentials;
}

export class ListingDiagnosticsSpApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode = 502) {
    super(message);
    this.name = "ListingDiagnosticsSpApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function getListingDiagnosticsCapabilities(): ListingDiagnosticsCapabilitiesResponse {
  return {
    sellerSprite: {
      configured: Boolean(process.env.SELLERSPRITE_SECRET_KEY?.trim()),
    },
    spApi: {
      supported: true,
      serverDefaultConfigured: Boolean(readServerDefaultCredentials()),
      supportedModes: ["off", "server-default", "runtime"],
      requiredRuntimeFields: RUNTIME_FIELDS,
      marketplaces: Object.fromEntries(
        Object.entries(MARKETPLACE_CONFIG).map(([marketplace, config]) => [
          marketplace,
          {
            marketplaceId: config.marketplaceId,
            region: config.region,
          },
        ])
      ),
    },
  };
}

export async function testListingDiagnosticsSpApiConnection(params: {
  marketplace: string;
  config?: ListingDiagnosticsSpApiConfig;
  targetAsin?: string | null;
}): Promise<ListingDiagnosticsSpApiTestResponse> {
  const resolved = resolveSpApiContext(params.marketplace, params.config);
  if (!resolved) {
    throw new ListingDiagnosticsSpApiError(
      "SP-API server-default mode was selected, but the server does not have shared SP-API credentials configured.",
      "sp_api_server_default_missing",
      400
    );
  }
  const accessToken = await requestAccessToken(resolved.credentials.credentials);
  const normalizedTargetAsin =
    typeof params.targetAsin === "string" && /^[A-Z0-9]{10}$/i.test(params.targetAsin.trim())
      ? params.targetAsin.trim().toUpperCase()
      : null;

  if (!normalizedTargetAsin) {
    return {
      ok: true,
      mode: resolved.credentials.mode,
      sellerIdMasked: resolved.credentials.sellerIdMasked,
      marketplace: params.marketplace.trim().toUpperCase(),
      tokenExchange: "success",
      targetAsin: null,
      checks: {
        catalog: "skipped",
        account: "skipped",
      },
      message:
        "SP-API credentials are usable. Add a valid target ASIN to also test catalog and seller-account verification.",
    };
  }

  await Promise.all([
    fetchCatalogVerification(
      normalizedTargetAsin,
      resolved.marketplace.marketplaceId,
      resolved.marketplace.endpoint,
      accessToken
    ),
    fetchAccountListingVerification(
      normalizedTargetAsin,
      resolved.marketplace.marketplaceId,
      resolved.marketplace.endpoint,
      resolved.credentials.credentials.sellerId,
      accessToken
    ),
  ]);

  return {
    ok: true,
    mode: resolved.credentials.mode,
    sellerIdMasked: resolved.credentials.sellerIdMasked,
    marketplace: params.marketplace.trim().toUpperCase(),
    tokenExchange: "success",
    targetAsin: normalizedTargetAsin,
    checks: {
      catalog: "verified",
      account: "verified",
    },
    message:
      "SP-API credentials are usable, and the target ASIN completed both catalog and seller-account verification checks.",
  };
}

export async function buildListingDiagnosticsSpApiEnhancement(params: {
  targetAsin: string;
  marketplace: string;
  config?: ListingDiagnosticsSpApiConfig;
}): Promise<ListingDiagnosticsSpApiEnhancement | null> {
  if (!params.config || params.config.mode === "off") {
    return null;
  }

  const resolvedContext = resolveSpApiContext(params.marketplace, params.config);
  if (!resolvedContext) {
    return {
      coverageItems: [
        createCoverageItem({
          id: "sp-api-catalog",
          label: "Amazon catalog verification",
          entity: "catalog",
          status: "missing",
          detail:
            "SP-API server-default mode was selected, but no shared server credentials are configured.",
        }),
        createCoverageItem({
          id: "sp-api-account-listing",
          label: "Amazon account listing status",
          entity: "account",
          status: "missing",
          detail:
            "SP-API account verification could not start because the shared server default is missing.",
        }),
        createCoverageItem({
          id: "sp-api-account-restrictions",
          label: "Amazon account restrictions",
          entity: "account",
          status: "missing",
          detail:
            "SP-API restriction verification could not start because the shared server default is missing.",
        }),
      ],
      findings: [],
      actions: [],
      warnings: [
        "SP-API verification was requested in server-default mode, but the server does not have shared SP-API credentials configured.",
      ],
      summary: {
        enabled: true,
        mode: "server-default",
        sellerIdMasked: "",
        catalogStatus: "missing",
        accountStatus: "missing",
        verifiedFindingIds: [],
        blockingVerifiedFindingIds: [],
        scoreCeiling: null,
        scoreCapApplied: false,
      },
      scoreCeiling: null,
      headline: null,
    };
  }
  const marketplace = resolvedContext.marketplace;
  const resolvedCredentials = resolvedContext.credentials;

  try {
    const accessToken = await requestAccessToken(resolvedCredentials.credentials);
    const [catalogResult, accountListingResult, restrictionsResult] =
      await Promise.allSettled([
        fetchCatalogVerification(
          params.targetAsin,
          marketplace.marketplaceId,
          marketplace.endpoint,
          accessToken
        ),
        fetchAccountListingVerification(
          params.targetAsin,
          marketplace.marketplaceId,
          marketplace.endpoint,
          resolvedCredentials.credentials.sellerId,
          accessToken
        ),
        fetchRestrictionsVerification(
          params.targetAsin,
          marketplace.marketplaceId,
          marketplace.endpoint,
          resolvedCredentials.credentials.sellerId,
          accessToken
        ),
      ]);

    return buildEnhancementFromVerificationResults({
      mode: resolvedCredentials.mode,
      sellerIdMasked: resolvedCredentials.sellerIdMasked,
      catalogResult,
      accountListingResult,
      restrictionsResult,
    });
  } catch (error) {
    const normalizedError = normalizeSpApiError(
      error,
      "SP-API verification could not be completed."
    );

    logSpApiWarning("connection_failure", {
      code: normalizedError.code,
      status: normalizedError.statusCode,
      mode: resolvedCredentials.mode,
    });

    return {
      coverageItems: [
        createCoverageItem({
          id: "sp-api-catalog",
          label: "Amazon catalog verification",
          entity: "catalog",
          status: "missing",
          detail: normalizedError.message,
        }),
        createCoverageItem({
          id: "sp-api-account-listing",
          label: "Amazon account listing status",
          entity: "account",
          status: "missing",
          detail: normalizedError.message,
        }),
        createCoverageItem({
          id: "sp-api-account-restrictions",
          label: "Amazon account restrictions",
          entity: "account",
          status: "missing",
          detail: normalizedError.message,
        }),
      ],
      findings: [],
      actions: [],
      warnings: [normalizedError.message],
      summary: {
        enabled: true,
        mode: resolvedCredentials.mode,
        sellerIdMasked: resolvedCredentials.sellerIdMasked,
        catalogStatus: "missing",
        accountStatus: "missing",
        verifiedFindingIds: [],
        blockingVerifiedFindingIds: [],
        scoreCeiling: null,
        scoreCapApplied: false,
      },
      scoreCeiling: null,
      headline: null,
    };
  }
}

function buildEnhancementFromVerificationResults(params: {
  mode: ResolvedSpApiMode;
  sellerIdMasked: string;
  catalogResult: PromiseSettledResult<CatalogVerification>;
  accountListingResult: PromiseSettledResult<AccountListingVerification>;
  restrictionsResult: PromiseSettledResult<RestrictionsVerification>;
}): ListingDiagnosticsSpApiEnhancement {
  const coverageItems: ListingDiagnosticsSourceCoverageItem[] = [];
  const findings: ListingDiagnosticsFinding[] = [];
  const actions: ListingDiagnosticsActionPlanItem[] = [];
  const warnings: string[] = [];
  const verifiedFindingIds: string[] = [];
  const blockingVerifiedFindingIds: string[] = [];
  let scoreCeiling: number | null = null;
  let headline: string | null = null;

  const catalogStatus =
    params.catalogResult.status === "fulfilled" ? "covered" : "missing";
  const accountStatus = getCoverageStatus(
    Number(params.accountListingResult.status === "fulfilled") +
      Number(params.restrictionsResult.status === "fulfilled"),
    2,
    1
  );

  if (params.catalogResult.status === "fulfilled") {
    const catalog = params.catalogResult.value;
    coverageItems.push(
      createCoverageItem({
        id: "sp-api-catalog",
        label: "Amazon catalog verification",
        entity: "catalog",
        status: "covered",
        detail: `Catalog verified via SP-API with ${catalog.imageCount} image signal(s), brand ${catalog.brandName || "unknown"}, product type ${catalog.productType || "unknown"}, and title "${catalog.itemName || "n/a"}".`,
      })
    );

    if (!catalog.itemName) {
      addVerifiedFinding({
        finding: createFinding({
          id: "catalog-missing-title",
          title: "Amazon catalog record is missing a verified title",
          description:
            "The Catalog Items API returned this ASIN without an item title, which suggests the catalog record is incomplete and should be corrected before copy optimization.",
          severity: "high",
          dimensionId: "content-coverage",
          confidence: 0.99,
          evidence: ["Catalog Items API did not return an itemName for the target ASIN."],
        }),
        action: createAction({
          id: "catalog-fix-title",
          title: "Repair the catalog title in Seller Central or through contribution updates",
          description:
            "Correct the catalog contribution first so downstream listing copy changes are anchored to a valid Amazon catalog record.",
          priority: "now",
          confidence: 0.99,
          linkedFindingIds: ["catalog-missing-title"],
        }),
        scoreCap: 52,
      });
    }

    if (catalog.imageCount === 0) {
      addVerifiedFinding({
        finding: createFinding({
          id: "catalog-missing-images",
          title: "Amazon catalog record has no verified image coverage",
          description:
            "The Catalog Items API did not return product imagery for this ASIN, so catalog completeness needs attention before merchandising experiments can be trusted.",
          severity: "high",
          dimensionId: "content-coverage",
          confidence: 0.99,
          evidence: ["Catalog Items API returned zero product images for the target ASIN."],
        }),
        action: createAction({
          id: "catalog-add-images",
          title: "Restore the catalog image set before optimizing copy",
          description:
            "Upload or reprocess the required product images so the ASIN has a complete Amazon catalog presentation.",
          priority: "now",
          confidence: 0.99,
          linkedFindingIds: ["catalog-missing-images"],
        }),
        scoreCap: 54,
      });
    }
  } else {
    const error = normalizeSpApiError(
      params.catalogResult.reason,
      "Catalog verification was unavailable."
    );
    coverageItems.push(
      createCoverageItem({
        id: "sp-api-catalog",
        label: "Amazon catalog verification",
        entity: "catalog",
        status: "missing",
        detail: error.message,
      })
    );
    warnings.push(error.message);
  }

  if (params.accountListingResult.status === "fulfilled") {
    const accountListing = params.accountListingResult.value;
    const statusLabel =
      accountListing.statuses.length > 0
        ? accountListing.statuses.join(", ")
        : "no explicit status flags";

    coverageItems.push(
      createCoverageItem({
        id: "sp-api-account-listing",
        label: "Amazon account listing status",
        entity: "account",
        status: "covered",
        detail: accountListing.listingFound
          ? `Seller account ${params.sellerIdMasked} returned listing status ${statusLabel}${accountListing.sku ? ` for SKU ${accountListing.sku}.` : "."}`
          : `Seller account ${params.sellerIdMasked} did not return a listing item for the target ASIN.`,
      })
    );

    if (!accountListing.listingFound) {
      addVerifiedFinding({
        finding: createFinding({
          id: "account-listing-missing",
          title: "Seller account does not expose a listing item for this ASIN",
          description:
            "Amazon Listings Items search did not return a seller-owned listing record for the target ASIN under the supplied seller account.",
          severity: "high",
          dimensionId: "market-position",
          confidence: 0.99,
          evidence: [
            `Seller account ${params.sellerIdMasked} returned no listing item for the ASIN.`,
          ],
        }),
        action: createAction({
          id: "account-link-listing",
          title: "Confirm the ASIN is linked to an active seller SKU",
          description:
            "Verify that the seller account owns the correct SKU-ASIN mapping and that the listing has not been closed or archived.",
          priority: "now",
          confidence: 0.99,
          linkedFindingIds: ["account-listing-missing"],
        }),
        scoreCap: 45,
        blocking: true,
      });
    }

    if (
      accountListing.listingFound &&
      accountListing.statuses.length > 0 &&
      !accountListing.statuses.includes("BUYABLE")
    ) {
      addVerifiedFinding({
        finding: createFinding({
          id: "account-not-buyable",
          title: "Amazon does not currently mark the listing as buyable",
          description:
            "The seller-account listing record is active enough to resolve, but the SP-API status flags do not include BUYABLE for this ASIN.",
          severity: "high",
          dimensionId: "market-position",
          confidence: 0.99,
          evidence: [`Listings Items status flags: ${statusLabel}.`],
        }),
        action: createAction({
          id: "account-restore-buyable",
          title: "Resolve the buyable blocker before copy iteration",
          description:
            "Check offer, pricing, inventory, and compliance blockers in Seller Central so the ASIN can become buyable again.",
          priority: "now",
          confidence: 0.99,
          linkedFindingIds: ["account-not-buyable"],
        }),
        scoreCap: 48,
        blocking: true,
      });
    }

    if (
      accountListing.listingFound &&
      accountListing.statuses.length > 0 &&
      !accountListing.statuses.includes("DISCOVERABLE")
    ) {
      addVerifiedFinding({
        finding: createFinding({
          id: "account-not-discoverable",
          title: "Amazon does not currently mark the listing as discoverable",
          description:
            "The seller-account listing record resolved, but the SP-API status flags do not include DISCOVERABLE, which points to a retail-surface visibility issue.",
          severity: "high",
          dimensionId: "keyword-opportunity",
          confidence: 0.99,
          evidence: [`Listings Items status flags: ${statusLabel}.`],
        }),
        action: createAction({
          id: "account-restore-discoverable",
          title: "Fix the discoverability blocker before judging keyword gaps",
          description:
            "Review suppression, search visibility, and listing health signals in Seller Central so traffic diagnosis is based on a visible listing.",
          priority: "now",
          confidence: 0.99,
          linkedFindingIds: ["account-not-discoverable"],
        }),
        scoreCap: 54,
        blocking: true,
      });
    }

    if (accountListing.issues.length > 0) {
      const topIssues = accountListing.issues.slice(0, 3);
      const severity = topIssues.some((issue) => issue.severity === "high")
        ? "high"
        : topIssues.some((issue) => issue.severity === "medium")
          ? "medium"
          : "low";

      addVerifiedFinding({
        finding: createFinding({
          id: "account-active-issues",
          title: "Amazon reports active listing issues on the seller account",
          description:
            "The Listings Items API returned active issue signals for this ASIN, which means part of the listing health problem is verified rather than inferred.",
          severity,
          dimensionId: "content-coverage",
          confidence: 0.99,
          evidence: topIssues.map((issue) => {
            const attributes =
              issue.attributeNames.length > 0
                ? ` (${issue.attributeNames.join(", ")})`
                : "";
            return `${issue.code}: ${issue.message}${attributes}`;
          }),
        }),
        action: createAction({
          id: "account-resolve-issues",
          title: "Resolve the active Amazon listing issues before deeper optimization",
          description:
            "Work through the active Listings Items issues first so the listing is healthy before measuring copy and benchmark deltas.",
          priority: severity === "high" ? "now" : "next",
          confidence: 0.99,
          linkedFindingIds: ["account-active-issues"],
        }),
        scoreCap: severity === "high" ? 56 : 66,
        blocking: severity === "high",
      });
    }
  } else {
    const error = normalizeSpApiError(
      params.accountListingResult.reason,
      "Account listing verification was unavailable."
    );
    coverageItems.push(
      createCoverageItem({
        id: "sp-api-account-listing",
        label: "Amazon account listing status",
        entity: "account",
        status: "missing",
        detail: error.message,
      })
    );
    warnings.push(error.message);
  }

  if (params.restrictionsResult.status === "fulfilled") {
    const restrictions = params.restrictionsResult.value;
    coverageItems.push(
      createCoverageItem({
        id: "sp-api-account-restrictions",
        label: "Amazon account restrictions",
        entity: "account",
        status: "covered",
        detail:
          restrictions.restrictions.length > 0
            ? `${restrictions.restrictions.length} verified restriction reason(s) were returned for the target ASIN.`
            : "No active listing restrictions were returned for the target ASIN.",
      })
    );

    if (restrictions.restrictions.length > 0) {
      addVerifiedFinding({
        finding: createFinding({
          id: "account-restrictions",
          title: "Amazon returned active listing restrictions for this ASIN",
          description:
            "The Listings Restrictions API verified that this seller account still has restriction or approval blockers tied to the target ASIN.",
          severity: "high",
          dimensionId: "market-position",
          confidence: 0.99,
          evidence: restrictions.restrictions.slice(0, 3).map((restriction) => {
            return `${restriction.reasonCode || restriction.conditionType}: ${restriction.message || "Restriction reason returned by Amazon."}`;
          }),
        }),
        action: createAction({
          id: "account-clear-restrictions",
          title: "Clear the Amazon restriction or approval blocker",
          description:
            "Resolve the verified restriction first so pricing, traffic, and conversion work is not blocked by account-level approval status.",
          priority: "now",
          confidence: 0.99,
          linkedFindingIds: ["account-restrictions"],
        }),
        scoreCap: 45,
        blocking: true,
      });
    }
  } else {
    const error = normalizeSpApiError(
      params.restrictionsResult.reason,
      "Account restriction verification was unavailable."
    );
    coverageItems.push(
      createCoverageItem({
        id: "sp-api-account-restrictions",
        label: "Amazon account restrictions",
        entity: "account",
        status: "missing",
        detail: error.message,
      })
    );
    warnings.push(error.message);
  }

  return {
    coverageItems,
    findings,
    actions,
    warnings: Array.from(new Set(warnings)),
    summary: {
      enabled: true,
      mode: params.mode,
      sellerIdMasked: params.sellerIdMasked,
      catalogStatus,
      accountStatus,
      verifiedFindingIds,
      blockingVerifiedFindingIds,
      scoreCeiling,
      scoreCapApplied: false,
    },
    scoreCeiling,
    headline,
  };

  function addVerifiedFinding(params: {
    finding: ListingDiagnosticsFinding;
    action: ListingDiagnosticsActionPlanItem;
    scoreCap: number;
    blocking?: boolean;
  }) {
    findings.push(params.finding);
    actions.push(params.action);
    verifiedFindingIds.push(params.finding.id);
    if (params.blocking) {
      blockingVerifiedFindingIds.push(params.finding.id);
      scoreCeiling =
        scoreCeiling === null ? params.scoreCap : Math.min(scoreCeiling, params.scoreCap);
    }

    if (params.blocking) {
      headline =
        "Amazon has verified account or catalog blockers that should be resolved before deeper copy optimization.";
    } else if (!headline) {
      headline =
        "Amazon has verified catalog or account-side issues in addition to the SellerSprite diagnosis.";
    }
  }
}

function readServerDefaultCredentials():
  | ListingDiagnosticsSpApiRuntimeCredentials
  | null {
  const credentials = {
    clientId: process.env[SERVER_DEFAULT_ENV.clientId]?.trim() ?? "",
    clientSecret: process.env[SERVER_DEFAULT_ENV.clientSecret]?.trim() ?? "",
    refreshToken: process.env[SERVER_DEFAULT_ENV.refreshToken]?.trim() ?? "",
    sellerId: process.env[SERVER_DEFAULT_ENV.sellerId]?.trim() ?? "",
  };

  return hasAllRuntimeFields(credentials) ? credentials : null;
}

function resolveSpApiContext(
  marketplace: string,
  config?: ListingDiagnosticsSpApiConfig
): SpApiResolvedContext | null {
  if (!config || config.mode === "off") {
    throw new ListingDiagnosticsSpApiError(
      "SP-API is disabled for this request.",
      "sp_api_disabled",
      400
    );
  }

  const resolvedCredentials = resolveRequestedCredentials(config);

  if (!resolvedCredentials) {
    return null;
  }

  return {
    marketplace: resolveMarketplaceConfig(marketplace),
    credentials: resolvedCredentials,
  };
}

function resolveRequestedCredentials(
  config: ListingDiagnosticsSpApiConfig
): ResolvedSpApiCredentials | null {
  if (config.mode === "server-default") {
    const credentials = readServerDefaultCredentials();

    return credentials
      ? {
          mode: "server-default",
          credentials,
          sellerIdMasked: maskSellerId(credentials.sellerId),
        }
      : null;
  }

  if (!hasAllRuntimeFields(config.runtime)) {
    throw new ListingDiagnosticsSpApiError(
      "SP-API runtime mode requires client ID, client secret, refresh token, and seller ID.",
      "sp_api_runtime_incomplete",
      400
    );
  }

  return {
    mode: "runtime",
    credentials: {
      clientId: config.runtime.clientId.trim(),
      clientSecret: config.runtime.clientSecret.trim(),
      refreshToken: config.runtime.refreshToken.trim(),
      sellerId: config.runtime.sellerId.trim(),
    },
    sellerIdMasked: maskSellerId(config.runtime.sellerId),
  };
}

function hasAllRuntimeFields(
  credentials: ListingDiagnosticsSpApiRuntimeCredentials
): boolean {
  return RUNTIME_FIELDS.every((field) => credentials[field].trim().length > 0);
}

function resolveMarketplaceConfig(marketplace: string) {
  const normalizedMarketplace =
    marketplace.trim().toUpperCase() as keyof typeof MARKETPLACE_CONFIG;
  const config = MARKETPLACE_CONFIG[normalizedMarketplace];

  if (!config) {
    throw new ListingDiagnosticsSpApiError(
      `Marketplace ${marketplace} is not supported by the current SP-API adapter.`,
      "sp_api_marketplace_unsupported",
      400
    );
  }

  return config;
}

async function requestAccessToken(
  credentials: ListingDiagnosticsSpApiRuntimeCredentials
): Promise<string> {
  const response = await withTimeout(LWA_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken.trim(),
      client_id: credentials.clientId.trim(),
      client_secret: credentials.clientSecret.trim(),
    }),
  });

  const payload = parseJsonValue(await response.text());

  if (!response.ok) {
    throw mapSpApiHttpError(response.status, payload);
  }

  const accessToken =
    isRecord(payload) && typeof payload.access_token === "string"
      ? payload.access_token.trim()
      : "";

  if (!accessToken) {
    throw new ListingDiagnosticsSpApiError(
      "Amazon SP-API did not return a usable access token.",
      "sp_api_token_missing",
      502
    );
  }

  return accessToken;
}

async function fetchCatalogVerification(
  asin: string,
  marketplaceId: string,
  endpoint: string,
  accessToken: string
): Promise<CatalogVerification> {
  const payload = await fetchSpApiJson(
    buildUrl(endpoint, `/catalog/2022-04-01/items/${encodeURIComponent(asin)}`, {
      marketplaceIds: marketplaceId,
      includedData: "summaries,images,productTypes",
    }),
    accessToken
  );
  const record = expectRecord(
    payload,
    "Amazon catalog verification returned malformed data."
  );

  const summary = getRecordArray(record.summaries)[0];
  const productTypeRecord = getRecordArray(record.productTypes)[0];
  const imageCount = getRecordArray(record.images).reduce((total, item) => {
    return (
      total +
      getRecordArray(item.images).filter((image) => getString(image.link)).length
    );
  }, 0);

  return {
    itemName: getString(summary?.itemName),
    brandName: getString(summary?.brandName),
    productType:
      getString(productTypeRecord?.productType) || getString(productTypeRecord?.name),
    imageCount,
  };
}

async function fetchAccountListingVerification(
  asin: string,
  marketplaceId: string,
  endpoint: string,
  sellerId: string,
  accessToken: string
): Promise<AccountListingVerification> {
  const payload = await fetchSpApiJson(
    buildUrl(
      endpoint,
      `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}`,
      {
        marketplaceIds: marketplaceId,
        identifiers: asin,
        identifiersType: "ASIN",
        includedData: "summaries,issues",
      }
    ),
    accessToken
  );
  const record = expectRecord(
    payload,
    "Amazon account listing verification returned malformed data."
  );
  const item = getRecordArray(record.items)[0];

  if (!item) {
    return {
      listingFound: false,
      sku: "",
      statuses: [],
      issues: [],
    };
  }

  const summary = getRecordArray(item.summaries)[0];

  return {
    listingFound: true,
    sku: getString(item.sku),
    statuses: getStringArray(summary?.status),
    issues: getRecordArray(item.issues).map(parseAccountIssue).filter((issue) => {
      return issue.code || issue.message;
    }),
  };
}

async function fetchRestrictionsVerification(
  asin: string,
  marketplaceId: string,
  endpoint: string,
  sellerId: string,
  accessToken: string
): Promise<RestrictionsVerification> {
  const payload = await fetchSpApiJson(
    buildUrl(endpoint, "/listings/2021-08-01/restrictions", {
      asin,
      sellerId,
      marketplaceIds: marketplaceId,
      conditionType: "new_new",
    }),
    accessToken
  );
  const record = expectRecord(
    payload,
    "Amazon restriction verification returned malformed data."
  );

  return {
    restrictions: getRecordArray(record.restrictions)
      .map((restriction) => {
        const reason = getRecordArray(restriction.reasons)[0];
        return {
          conditionType: getString(restriction.conditionType),
          reasonCode: getString(reason?.reasonCode),
          message: getString(reason?.message),
        };
      })
      .filter((restriction) => {
        return (
          restriction.conditionType ||
          restriction.reasonCode ||
          restriction.message
        );
      }),
  };
}

async function fetchSpApiJson(url: string, accessToken: string): Promise<unknown> {
  const response = await withTimeout(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-amz-access-token": accessToken,
      "user-agent": SP_API_USER_AGENT,
    },
    cache: "no-store",
  });
  const payload = parseJsonValue(await response.text());

  if (!response.ok) {
    throw mapSpApiHttpError(response.status, payload);
  }

  return payload;
}

async function withTimeout(
  input: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SP_API_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ListingDiagnosticsSpApiError(
        "Amazon SP-API verification timed out.",
        "sp_api_timeout",
        504
      );
    }

    throw new ListingDiagnosticsSpApiError(
      "Amazon SP-API verification could not reach the upstream service.",
      "sp_api_connection_error",
      503
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildUrl(
  endpoint: string,
  path: string,
  query: Record<string, string>
): string {
  const url = new URL(path, endpoint);
  Object.entries(query).forEach(([key, value]) => {
    if (value.trim()) {
      url.searchParams.set(key, value.trim());
    }
  });
  return url.toString();
}

function mapSpApiHttpError(
  status: number,
  payload: unknown
): ListingDiagnosticsSpApiError {
  const upstreamCode = extractUpstreamCode(payload);

  if (status === 401 || status === 403) {
    return new ListingDiagnosticsSpApiError(
      "Amazon SP-API authentication failed. Check the LWA client, refresh token, seller account, and app permissions.",
      "sp_api_auth_error",
      502
    );
  }

  if (status === 429) {
    return new ListingDiagnosticsSpApiError(
      "Amazon SP-API rate limits were reached while verifying the listing.",
      "sp_api_rate_limited",
      503
    );
  }

  if (status >= 500) {
    return new ListingDiagnosticsSpApiError(
      "Amazon SP-API is temporarily unavailable.",
      "sp_api_upstream_error",
      503
    );
  }

  return new ListingDiagnosticsSpApiError(
    upstreamCode
      ? `Amazon SP-API rejected the request with ${upstreamCode}.`
      : "Amazon SP-API rejected the verification request.",
    "sp_api_bad_request",
    502
  );
}

function normalizeSpApiError(
  error: unknown,
  fallbackMessage: string
): ListingDiagnosticsSpApiError {
  if (error instanceof ListingDiagnosticsSpApiError) {
    return error;
  }

  return new ListingDiagnosticsSpApiError(
    fallbackMessage,
    "sp_api_unexpected_error",
    500
  );
}

function parseAccountIssue(value: Record<string, unknown>): AccountIssue {
  return {
    code:
      getString(value.code) ||
      getString(value.issueCode) ||
      getString(value.attributeName) ||
      "issue",
    message:
      getString(value.message) ||
      getString(value.description) ||
      "Amazon reported an active listing issue.",
    severity: mapIssueSeverity(getString(value.severity)),
    attributeNames: getStringArray(value.attributeNames),
  };
}

function mapIssueSeverity(value: string): ListingDiagnosticsSeverity {
  const normalized = value.trim().toUpperCase();

  if (normalized === "ERROR" || normalized === "FATAL") {
    return "high";
  }

  if (normalized === "WARNING") {
    return "medium";
  }

  return "low";
}

function createCoverageItem(params: {
  id: string;
  label: string;
  entity: ListingDiagnosticsSourceCoverageItem["entity"];
  status: ListingDiagnosticsSourceStatus;
  detail: string;
}): ListingDiagnosticsSourceCoverageItem {
  return {
    id: params.id,
    label: params.label,
    source: "Amazon SP-API",
    entity: params.entity,
    status: params.status,
    available: params.status === "missing" ? 0 : 1,
    expected: 1,
    detail: params.detail,
    confidence: params.status === "covered" ? 0.99 : params.status === "partial" ? 0.72 : 0,
    inferred: false,
  };
}

function maskSellerId(value: string): string {
  const normalized = value.trim();

  if (normalized.length <= 4) {
    return normalized ? "****" : "";
  }

  return `${"*".repeat(Math.max(4, normalized.length - 4))}${normalized.slice(-4)}`;
}

function logSpApiWarning(event: string, details: Record<string, unknown>): void {
  console.warn("[listing-diagnostics/sp-api]", {
    event,
    ...details,
  });
}

function expectRecord(
  value: unknown,
  message: string
): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  throw new ListingDiagnosticsSpApiError(message, "sp_api_bad_response", 502);
}

function extractUpstreamCode(payload: unknown): string {
  if (!isRecord(payload)) {
    return "";
  }

  if (Array.isArray(payload.errors)) {
    const firstError = payload.errors.find((item) => isRecord(item));

    if (firstError && typeof firstError.code === "string") {
      return firstError.code.trim();
    }
  }

  if (isRecord(payload.error) && typeof payload.error.code === "string") {
    return payload.error.code.trim();
  }

  if (typeof payload.code === "string") {
    return payload.code.trim();
  }

  return "";
}

function parseJsonValue(value: string): unknown {
  if (!value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}
