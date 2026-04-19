import {
  createAction,
  createFinding,
  getCoverageStatus,
} from "@/lib/listing-diagnostics/rules/shared";
import type {
  ListingDiagnosticsActionPlanItem,
  ListingDiagnosticsCapabilitiesResponse,
  ListingDiagnosticsFinding,
  ListingDiagnosticsImpactType,
  ListingDiagnosticsPriority,
  ListingDiagnosticsRootCauseCategory,
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
interface VerifiedOperationalEntry {
  finding: ListingDiagnosticsFinding;
  action: ListingDiagnosticsActionPlanItem;
  scoreCap: number;
  blocking: boolean;
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
          impactType: "visibility",
          priority: "P1",
          symptom:
            "Amazon's own catalog record does not expose a usable title for the ASIN.",
          rootCause:
            "The catalog contribution is incomplete, so the listing is missing one of the most important indexed retail surfaces.",
          rootCauseCategory: "missing-attributes",
          whatToChange:
            "Repair the catalog title contribution and verify the ASIN publishes a valid customer-facing title.",
          whereToChange:
            "Seller Central > Edit listing > Product name/title or contribution/case workflow",
          expectedImpact:
            "Should restore indexed title coverage and improve both discoverability and click quality.",
          verification: "verified",
          confidence: 0.99,
          evidence: ["Catalog Items API did not return an itemName for the target ASIN."],
        }),
        action: createAction({
          id: "catalog-fix-title",
          title: "Repair the catalog title in Seller Central or through contribution updates",
          description:
            "Correct the catalog contribution first so downstream listing copy changes are anchored to a valid Amazon catalog record.",
          priority: "P1",
          verification: "verified",
          confidence: 0.99,
          symptom: "The verified catalog record has no usable title.",
          rootCause:
            "Catalog completeness is broken, so downstream optimization is operating on an invalid retail record.",
          action:
            "Repair the catalog title contribution before running more copy experiments.",
          whereToChange:
            "Seller Central > Product name/title or contribution case workflow",
          expectedImpact:
            "Should restore the title surface Amazon uses for indexing and merchandising.",
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
          impactType: "click",
          priority: "P1",
          symptom:
            "Amazon's verified catalog record does not expose product images for the ASIN.",
          rootCause:
            "The catalog image set is incomplete, so shoppers and retail surfaces are missing critical visual proof.",
          rootCauseCategory: "missing-attributes",
          whatToChange:
            "Restore the hero image plus the required supporting gallery assets in the target marketplace.",
          whereToChange:
            "Seller Central > Images or catalog contribution workflow",
          expectedImpact:
            "Should improve click quality, PDP trust, and the reliability of downstream merchandising tests.",
          verification: "verified",
          confidence: 0.99,
          evidence: ["Catalog Items API returned zero product images for the target ASIN."],
        }),
        action: createAction({
          id: "catalog-add-images",
          title: "Restore the catalog image set before optimizing copy",
          description:
            "Upload or reprocess the required product images so the ASIN has a complete Amazon catalog presentation.",
          priority: "P1",
          verification: "verified",
          confidence: 0.99,
          symptom: "The verified Amazon catalog record has no image coverage.",
          rootCause:
            "Catalog merchandising is incomplete, so the ASIN is missing core visual assets.",
          action:
            "Upload or reprocess the required image set before testing deeper PDP changes.",
          whereToChange: "Seller Central > Images",
          expectedImpact:
            "Should restore visual merchandising quality and improve click-through confidence.",
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

  buildVerifiedOperationalEntries({
    sellerIdMasked: params.sellerIdMasked,
    accountListing:
      params.accountListingResult.status === "fulfilled"
        ? params.accountListingResult.value
        : null,
    restrictions:
      params.restrictionsResult.status === "fulfilled"
        ? params.restrictionsResult.value.restrictions
        : [],
  }).forEach((entry) => {
    addVerifiedFinding(entry);
  });

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

function buildVerifiedOperationalEntries(params: {
  sellerIdMasked: string;
  accountListing: AccountListingVerification | null;
  restrictions: RestrictionsVerification["restrictions"];
}): VerifiedOperationalEntry[] {
  const entries: VerifiedOperationalEntry[] = [];

  if (!params.accountListing) {
    if (params.restrictions.length > 0) {
      entries.push(
        buildVerifiedEntryForCategory({
          category: "restrictions",
          evidence: params.restrictions
            .slice(0, 3)
            .map((restriction) => formatRestrictionEvidence(restriction)),
          missingBuyable: false,
          missingDiscoverable: false,
          listingMissing: false,
          sellerIdMasked: params.sellerIdMasked,
        })
      );
    }

    return entries;
  }

  const accountListing = params.accountListing;
  const normalizedStatuses = accountListing.statuses.map((status) =>
    status.trim().toUpperCase()
  );
  const missingBuyable =
    accountListing.listingFound &&
    normalizedStatuses.length > 0 &&
    !normalizedStatuses.includes("BUYABLE");
  const missingDiscoverable =
    accountListing.listingFound &&
    normalizedStatuses.length > 0 &&
    !normalizedStatuses.includes("DISCOVERABLE");

  if (!accountListing.listingFound) {
    entries.push(
      buildVerifiedEntryForCategory({
        category: "listing-status",
        evidence: [
          `Seller account ${params.sellerIdMasked} returned no listing item for the target ASIN.`,
        ],
        missingBuyable: true,
        missingDiscoverable: false,
        listingMissing: true,
        sellerIdMasked: params.sellerIdMasked,
      })
    );
  }

  const groupedEvidence = new Map<ListingDiagnosticsRootCauseCategory, string[]>();

  for (const issue of accountListing.issues) {
    const category = classifyIssueRootCause(issue);
    const evidence = formatIssueEvidence(issue);
    appendGroupedEvidence(groupedEvidence, category, evidence);
  }

  if (params.restrictions.length > 0) {
    for (const restriction of params.restrictions.slice(0, 3)) {
      appendGroupedEvidence(
        groupedEvidence,
        "restrictions",
        formatRestrictionEvidence(restriction)
      );
    }
  }

  const hasBuyabilitySpecificCategory = Array.from(groupedEvidence.keys()).some((category) =>
    isBuyabilityCategory(category)
  );
  const hasDiscoverabilitySpecificCategory = Array.from(groupedEvidence.keys()).some(
    (category) => isDiscoverabilityCategory(category)
  );

  if (missingBuyable && !hasBuyabilitySpecificCategory) {
    appendGroupedEvidence(
      groupedEvidence,
      "listing-status",
      `Listings Items status flags: ${accountListing.statuses.join(", ") || "none"}.`
    );
  }

  if (missingDiscoverable && !hasDiscoverabilitySpecificCategory) {
    appendGroupedEvidence(
      groupedEvidence,
      "listing-status",
      `Listings Items status flags: ${accountListing.statuses.join(", ") || "none"}.`
    );
  }

  for (const [category, evidence] of groupedEvidence.entries()) {
    entries.push(
      buildVerifiedEntryForCategory({
        category,
        evidence,
        missingBuyable,
        missingDiscoverable,
        listingMissing: false,
        sellerIdMasked: params.sellerIdMasked,
      })
    );
  }

  return dedupeEntriesById(entries);
}

function buildVerifiedEntryForCategory(params: {
  category: ListingDiagnosticsRootCauseCategory;
  evidence: string[];
  missingBuyable: boolean;
  missingDiscoverable: boolean;
  listingMissing: boolean;
  sellerIdMasked: string;
}): VerifiedOperationalEntry {
  const evidence = Array.from(new Set(params.evidence)).slice(0, 4);

  switch (params.category) {
    case "inventory":
      return buildOperationalEntry({
        id: "verified-inventory-blocker",
        title: "Verified inventory blocker is preventing buyability",
        description:
          "Amazon issue payloads point to stock, quantity, or availability problems behind the current BUYABLE gap.",
        severity: "high",
        impactType: "buyability",
        priority: "P0",
        rootCauseCategory: "inventory",
        symptom:
          "BUYABLE status is missing and Amazon issue details point to inventory or fulfillment availability problems.",
        rootCause:
          "Inventory quantity or availability signals are preventing the offer from staying purchasable.",
        whatToChange:
          "Fix stock, quantity, or fulfillment availability issues before running more merchandising work.",
        whereToChange:
          "Seller Central > Manage All Inventory / FBA replenishment / fulfillment availability",
        expectedImpact:
          "Should restore buyability and recover lost sessions caused by stock or availability blockers.",
        actionTitle: "Resolve the inventory blocker before optimizing anything else",
        actionDescription:
          "Replenish stock, correct quantity feeds, and confirm the offer can stay purchasable end to end.",
        scoreCap: 46,
        blocking: true,
        evidence,
      });
    case "offer":
      return buildOperationalEntry({
        id: "verified-offer-blocker",
        title: "Verified offer configuration issue is limiting buyability",
        description:
          "Amazon returned offer-side issue details that point to a broken or incomplete purchasable offer.",
        severity: "high",
        impactType: "buyability",
        priority: "P0",
        rootCauseCategory: "offer",
        symptom:
          "The ASIN is failing buyability checks because the offer itself is incomplete or misconfigured.",
        rootCause:
          "Offer or fulfillment setup is preventing Amazon from treating the SKU as a healthy purchasable offer.",
        whatToChange:
          "Repair fulfillment, shipping, condition, or offer setup problems on the active SKU.",
        whereToChange:
          "Seller Central > Manage All Inventory > Offer / fulfillment settings",
        expectedImpact:
          "Should restore the ability for shoppers to purchase the ASIN and stabilize offer health.",
        actionTitle: "Repair the offer configuration on the active SKU",
        actionDescription:
          "Fix the offer setup first so the ASIN can become reliably purchasable again.",
        scoreCap: 47,
        blocking: true,
        evidence,
      });
    case "pricing":
      return buildOperationalEntry({
        id: "verified-pricing-blocker",
        title: "Verified pricing issue is blocking the retail path",
        description:
          "Amazon returned pricing-related issue details, which means offer economics are part of the current BUYABLE problem.",
        severity: "high",
        impactType: "buyability",
        priority: "P0",
        rootCauseCategory: "pricing",
        symptom:
          "The current offer is failing Amazon checks or competitiveness thresholds because of pricing.",
        rootCause:
          "Price, price rules, or related offer economics are keeping the ASIN from staying fully purchasable.",
        whatToChange:
          "Review price, min/max rules, currency, and promotional logic on the active SKU.",
        whereToChange:
          "Seller Central > Pricing / Automate Pricing / SKU offer settings",
        expectedImpact:
          "Should improve buyability and may also recover Buy Box competitiveness once the offer clears pricing blockers.",
        actionTitle: "Fix pricing first, then recheck BUYABLE status",
        actionDescription:
          "Correct the pricing blocker before judging traffic or conversion work.",
        scoreCap: 48,
        blocking: true,
        evidence,
      });
    case "buy-box":
      return buildOperationalEntry({
        id: "verified-buy-box-pressure",
        title: "Verified offer competitiveness points to Buy Box pressure",
        description:
          "Amazon issue details suggest the current offer is not competitive enough to hold the preferred purchase path consistently.",
        severity: params.missingBuyable ? "high" : "medium",
        impactType: "buyability",
        priority: params.missingBuyable ? "P0" : "P1",
        rootCauseCategory: "buy-box",
        symptom:
          "Offer competitiveness is weak enough that Buy Box or featured-offer health is likely constraining purchases.",
        rootCause:
          "The ASIN is losing purchase-path strength because the active offer is not competitive enough on the signals Amazon uses.",
        whatToChange:
          "Review landed price, shipping promise, fulfillment method, and offer competitiveness as one decision.",
        whereToChange:
          "Seller Central > Pricing / shipping / fulfillment / Buy Box eligibility",
        expectedImpact:
          "Should improve Buy Box health and restore a cleaner purchasable path if the offer is the hidden blocker.",
        actionTitle: "Audit Buy Box competitiveness on the active offer",
        actionDescription:
          "Tighten the offer so Amazon can route the shopper through a healthier purchase path.",
        scoreCap: 54,
        blocking: params.missingBuyable,
        evidence,
      });
    case "restrictions":
      return buildOperationalEntry({
        id: "verified-restriction-blocker",
        title: "Verified restriction or approval blocker is suppressing the listing",
        description:
          "Amazon Listings Restrictions confirmed that this ASIN still has approval, compliance, or gating blockers attached to the seller account.",
        severity: "high",
        impactType: "compliance",
        priority: "P0",
        rootCauseCategory: "restrictions",
        symptom:
          "The ASIN is blocked by an Amazon restriction or approval requirement on the seller account.",
        rootCause:
          "Compliance or gating rules are preventing the listing from surfacing and selling cleanly.",
        whatToChange:
          "Resolve the approval or restriction case before spending more effort on traffic or copy changes.",
        whereToChange:
          "Seller Central > Listing limitations / approvals / compliance case workflow",
        expectedImpact:
          "Should remove a hard blocker that can suppress both visibility and buyability.",
        actionTitle: "Clear the restriction or approval blocker",
        actionDescription:
          "Resolve the verified restriction case before doing deeper optimization work.",
        scoreCap: 45,
        blocking: true,
        evidence,
      });
    case "missing-attributes":
      return buildOperationalEntry({
        id: "verified-missing-attributes",
        title: params.missingDiscoverable
          ? "Verified attribute gaps are suppressing discoverability"
          : "Verified attribute gaps are degrading listing health",
        description:
          "Amazon issue details name missing or invalid attributes, so part of the visibility or merchandising gap is verified rather than inferred.",
        severity: params.missingDiscoverable ? "high" : "medium",
        impactType: params.missingDiscoverable ? "visibility" : "click",
        priority: params.missingDiscoverable ? "P1" : "P2",
        rootCauseCategory: "missing-attributes",
        symptom: params.missingDiscoverable
          ? "DISCOVERABLE status is missing and Amazon is pointing to missing or invalid attributes."
          : "Amazon is flagging missing or invalid attributes on the listing.",
        rootCause:
          "Critical listing attributes are incomplete or invalid, which weakens indexing, suppresses visibility, or degrades retail presentation.",
        whatToChange:
          "Correct the named attributes and republish the listing before doing more keyword or copy experiments.",
        whereToChange:
          "Seller Central > Edit listing > Vital Info / More Details / attributes / images",
        expectedImpact:
          "Should improve discoverability and remove attribute-driven suppression risk.",
        actionTitle: "Fix the missing or invalid attributes first",
        actionDescription:
          "Repair the named attribute gaps, then recheck discoverability and indexing.",
        scoreCap: params.missingDiscoverable ? 56 : 62,
        blocking: params.missingDiscoverable,
        evidence,
      });
    case "variation-issues":
      return buildOperationalEntry({
        id: "verified-variation-issue",
        title: params.missingDiscoverable
          ? "Verified variation issue is harming discoverability"
          : "Verified variation issue needs correction",
        description:
          "Amazon issue details point to parent-child or variation-theme problems on the listing family.",
        severity: params.missingDiscoverable ? "high" : "medium",
        impactType: params.missingDiscoverable ? "visibility" : "conversion",
        priority: params.missingDiscoverable ? "P1" : "P2",
        rootCauseCategory: "variation-issues",
        symptom:
          "Variation structure or child attributes are not healthy enough for Amazon's current listing checks.",
        rootCause:
          "Parent-child setup, variation theme, or child-specific attributes are introducing retail-surface confusion or suppression.",
        whatToChange:
          "Repair the variation relationship and the child attribute set before judging merchandising changes.",
        whereToChange:
          "Seller Central > Edit listing > Variations / child attributes",
        expectedImpact:
          "Should improve child discoverability and reduce confusion across the family.",
        actionTitle: "Fix the variation relationship and child attributes",
        actionDescription:
          "Correct the verified variation setup problem, then re-evaluate traffic and conversion signals.",
        scoreCap: params.missingDiscoverable ? 58 : 64,
        blocking: params.missingDiscoverable,
        evidence,
      });
    case "listing-status":
      return buildOperationalEntry({
        id: params.listingMissing
          ? "verified-listing-missing"
          : params.missingBuyable
            ? "verified-buyable-status-gap"
            : params.missingDiscoverable
              ? "verified-discoverable-status-gap"
              : "verified-listing-status-gap",
        title: params.listingMissing
          ? "Verified seller listing record is missing for the ASIN"
          : params.missingBuyable
            ? "Verified listing status is not BUYABLE"
            : params.missingDiscoverable
              ? "Verified listing status is not DISCOVERABLE"
              : "Verified listing status issue needs correction",
        description: params.listingMissing
          ? `Amazon did not return a seller-owned listing item for seller ${params.sellerIdMasked}, so the account itself is missing an active retail record for this ASIN.`
          : "Amazon status flags confirm the listing is not healthy on the retail surface even before deeper optimization is considered.",
        severity: params.listingMissing || params.missingBuyable ? "high" : "medium",
        impactType: params.listingMissing || params.missingBuyable ? "buyability" : "visibility",
        priority: params.listingMissing || params.missingBuyable ? "P0" : "P1",
        rootCauseCategory: "listing-status",
        symptom: params.listingMissing
          ? "The seller account does not expose an active listing item for this ASIN."
          : params.missingBuyable
            ? "Amazon status flags do not include BUYABLE for the ASIN."
            : params.missingDiscoverable
              ? "Amazon status flags do not include DISCOVERABLE for the ASIN."
              : "Amazon status flags show the listing is not fully healthy.",
        rootCause: params.listingMissing
          ? "The SKU-ASIN link may be missing, archived, or otherwise not active under the seller account."
          : params.missingBuyable
            ? "The listing is not currently healthy enough for Amazon to route shoppers through a purchasable offer."
            : "The listing is not currently healthy enough to stay visible on the retail surface.",
        whatToChange: params.listingMissing
          ? "Confirm the seller owns the correct SKU-ASIN mapping and that the listing has not been closed or archived."
          : params.missingBuyable
            ? "Fix the underlying offer or account blocker, then recheck BUYABLE status."
            : "Fix the underlying listing health blocker, then recheck DISCOVERABLE status.",
        whereToChange:
          "Seller Central > Manage All Inventory / Listing Quality Dashboard / Search Suppressed",
        expectedImpact: params.listingMissing || params.missingBuyable
          ? "Should restore the retail path so the ASIN can become purchasable again."
          : "Should restore discoverability and make traffic diagnosis trustworthy again.",
        actionTitle: params.listingMissing
          ? "Restore the seller-owned listing record"
          : params.missingBuyable
            ? "Restore BUYABLE status before more optimization work"
            : "Restore DISCOVERABLE status before judging keyword gaps",
        actionDescription: params.listingMissing
          ? "Confirm the listing is active under the seller account and mapped to the correct SKU."
          : params.missingBuyable
            ? "Resolve the blocking listing-status issue before doing deeper traffic or copy work."
            : "Resolve the visibility status issue before doing deeper keyword or copy work.",
        scoreCap: params.listingMissing ? 45 : params.missingBuyable ? 48 : 54,
        blocking: params.listingMissing || params.missingBuyable || params.missingDiscoverable,
        evidence,
      });
  }
}

function buildOperationalEntry(params: {
  id: string;
  title: string;
  description: string;
  severity: ListingDiagnosticsSeverity;
  impactType: ListingDiagnosticsImpactType;
  priority: ListingDiagnosticsPriority;
  rootCauseCategory: ListingDiagnosticsRootCauseCategory;
  symptom: string;
  rootCause: string;
  whatToChange: string;
  whereToChange: string;
  expectedImpact: string;
  actionTitle: string;
  actionDescription: string;
  scoreCap: number;
  blocking: boolean;
  evidence: string[];
}): VerifiedOperationalEntry {
  return {
    finding: createFinding({
      id: params.id,
      title: params.title,
      description: params.description,
      severity: params.severity,
      dimensionId: "listing-health",
      impactType: params.impactType,
      priority: params.priority,
      symptom: params.symptom,
      rootCause: params.rootCause,
      rootCauseCategory: params.rootCauseCategory,
      whatToChange: params.whatToChange,
      whereToChange: params.whereToChange,
      expectedImpact: params.expectedImpact,
      verification: "verified",
      confidence: 0.99,
      evidence: params.evidence,
    }),
    action: createAction({
      id: `${params.id}-action`,
      title: params.actionTitle,
      description: params.actionDescription,
      priority: params.priority,
      verification: "verified",
      confidence: 0.99,
      symptom: params.symptom,
      rootCause: params.rootCause,
      action: params.actionTitle,
      whereToChange: params.whereToChange,
      expectedImpact: params.expectedImpact,
      linkedFindingIds: [params.id],
    }),
    scoreCap: params.scoreCap,
    blocking: params.blocking,
  };
}

function appendGroupedEvidence(
  groupedEvidence: Map<ListingDiagnosticsRootCauseCategory, string[]>,
  category: ListingDiagnosticsRootCauseCategory,
  evidence: string
): void {
  const next = groupedEvidence.get(category) ?? [];
  next.push(evidence);
  groupedEvidence.set(category, next);
}

function classifyIssueRootCause(
  issue: AccountIssue
): ListingDiagnosticsRootCauseCategory {
  const haystack = `${issue.code} ${issue.message} ${issue.attributeNames.join(" ")}`.toLowerCase();

  if (/(inventory|quantity|stock|out.of.stock|availability|fulfillmentavailability)/.test(haystack)) {
    return "inventory";
  }

  if (/(buy.?box|featured offer|featured merchant|win the featured offer)/.test(haystack)) {
    return "buy-box";
  }

  if (/(price|pricing|min|max|map|sale price|currency|cost)/.test(haystack)) {
    return "pricing";
  }

  if (/(offer|fulfillment|shipping|merchant_shipping_group|condition type)/.test(haystack)) {
    return "offer";
  }

  if (/(variation|parent|child|theme|size_name|color_name|relationship)/.test(haystack)) {
    return "variation-issues";
  }

  if (/(restricted|approval|hazmat|compliance|dangerous|gating)/.test(haystack)) {
    return "restrictions";
  }

  if (
    issue.attributeNames.length > 0 ||
    /(attribute|missing|required|title|bullet|description|brand|material|size|color|image)/.test(
      haystack
    )
  ) {
    return "missing-attributes";
  }

  return "listing-status";
}

function formatIssueEvidence(issue: AccountIssue): string {
  const attributes =
    issue.attributeNames.length > 0
      ? ` (${issue.attributeNames.join(", ")})`
      : "";
  return `${issue.code}: ${issue.message}${attributes}`;
}

function formatRestrictionEvidence(
  restriction: RestrictionsVerification["restrictions"][number]
): string {
  return `${restriction.reasonCode || restriction.conditionType}: ${restriction.message || "Restriction reason returned by Amazon."}`;
}

function isBuyabilityCategory(
  category: ListingDiagnosticsRootCauseCategory
): boolean {
  return (
    category === "inventory" ||
    category === "offer" ||
    category === "pricing" ||
    category === "buy-box" ||
    category === "restrictions"
  );
}

function isDiscoverabilityCategory(
  category: ListingDiagnosticsRootCauseCategory
): boolean {
  return (
    category === "missing-attributes" ||
    category === "variation-issues" ||
    category === "listing-status" ||
    category === "restrictions"
  );
}

function dedupeEntriesById(entries: VerifiedOperationalEntry[]): VerifiedOperationalEntry[] {
  const seen = new Map<string, VerifiedOperationalEntry>();

  for (const entry of entries) {
    if (!seen.has(entry.finding.id)) {
      seen.set(entry.finding.id, entry);
    }
  }

  return Array.from(seen.values());
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
