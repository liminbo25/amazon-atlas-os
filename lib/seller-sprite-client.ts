import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ErrorCode,
  McpError,
  type ContentBlock,
  type TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  CompetitorListing,
  ReviewData,
  SellerSpriteRuntimeConfig,
  TrafficKeyword,
} from "./types";
import {
  DEFAULT_MAX_SELECTED_KEYWORDS,
  selectTrafficKeywords,
} from "./traffic-keyword-helpers";

type SellerSpriteErrorCode =
  | "configuration"
  | "timeout"
  | "upstream"
  | "bad-response";

interface SellerSpriteApiEnvelope {
  code: string;
  message?: string;
  data?: unknown;
}

interface ReviewApiItem {
  star: number;
  title: string;
  content: string;
  date: string;
}

interface TrafficKeywordApiItem {
  keyword: string;
  searches: number;
  rankPosition: {
    position: number;
  } | null;
  adPosition: {
    position: number;
  } | null;
  trafficPercentage: number;
}

interface AsinFamilyResolution {
  parentAsin: string | null;
  variantAsins: string[];
  source:
    | "single-asin"
    | "asin-detail-variants"
    | "parent-detail-variants"
    | "parent-asin-fallback";
}

interface ResolvedSellerSpriteRuntimeConfig {
  baseUrl: string;
  secretKey: string;
  requestTimeoutMs: number;
  cacheKey: string;
}

interface SellerSpriteToolOptions {
  asin?: string;
  runtimeConfig?: SellerSpriteRuntimeConfig;
}

const DEFAULT_MCP_BASE_URL = "https://mcp.sellersprite.com/mcp";
const DEFAULT_MARKETPLACE = "US";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 4;
const REVIEW_PAGE_SIZE = 10;
const REVIEW_FETCH_LIMIT = 100;
const MAX_REVIEW_PAGES = 5;
const REVIEW_DEDUP_DATE_PRECISION = 10;

const mcpClientPromiseCache = new Map<string, Promise<Client>>();
let activeRequestCount = 0;
const queuedRequestResolvers: Array<() => void> = [];

export class SellerSpriteClientError extends Error {
  readonly code: SellerSpriteErrorCode;
  readonly statusCode: number;
  readonly toolName?: string;
  readonly asin?: string;
  readonly cause?: unknown;

  constructor(params: {
    code: SellerSpriteErrorCode;
    message: string;
    toolName?: string;
    asin?: string;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "SellerSpriteClientError";
    this.code = params.code;
    this.statusCode = getStatusCodeForError(params.code);
    this.toolName = params.toolName;
    this.asin = params.asin;
    this.cause = params.cause;
  }
}

export function isSellerSpriteClientError(
  error: unknown
): error is SellerSpriteClientError {
  return error instanceof SellerSpriteClientError;
}

function getStatusCodeForError(code: SellerSpriteErrorCode): number {
  switch (code) {
    case "configuration":
      return 500;
    case "timeout":
      return 504;
    case "upstream":
    case "bad-response":
      return 502;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTextContent(block: ContentBlock): block is TextContent {
  return block.type === "text";
}

function isContentBlock(value: unknown): value is ContentBlock {
  return isRecord(value) && typeof value.type === "string";
}

function parsePositiveIntegerEnv(
  rawValue: string | undefined,
  fallback: number
): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const requestTimeoutMs = parsePositiveIntegerEnv(
  process.env.SELLERSPRITE_REQUEST_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS
);

const maxConcurrentRequests = parsePositiveIntegerEnv(
  process.env.SELLERSPRITE_MAX_CONCURRENCY,
  DEFAULT_MAX_CONCURRENT_REQUESTS
);

function normalizePositiveInteger(
  value: unknown,
  fallback: number
): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeMcpBaseUrl(rawValue: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawValue);
  } catch {
    throw new SellerSpriteClientError({
      code: "configuration",
      message: `Invalid SellerSprite MCP base URL: ${rawValue}.`,
    });
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new SellerSpriteClientError({
      code: "configuration",
      message: "SellerSprite MCP base URL must start with http:// or https://.",
    });
  }

  parsedUrl.hash = "";
  parsedUrl.search = "";
  parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";

  return parsedUrl.toString().replace(/\/+$/, "");
}

function resolveSellerSpriteRuntimeConfig(
  runtimeConfig?: SellerSpriteRuntimeConfig
): ResolvedSellerSpriteRuntimeConfig {
  const secretKey =
    runtimeConfig?.secretKey?.trim() ||
    process.env.SELLERSPRITE_SECRET_KEY?.trim() ||
    "";

  if (!secretKey) {
    throw new SellerSpriteClientError({
      code: "configuration",
      message:
        "Missing SellerSprite secret key. Set SELLERSPRITE_SECRET_KEY or provide sellerSpriteConfig.secretKey.",
    });
  }

  const baseUrl = normalizeMcpBaseUrl(
    runtimeConfig?.baseUrl?.trim() ||
      process.env.SELLERSPRITE_BASE_URL?.trim() ||
      DEFAULT_MCP_BASE_URL
  );
  const timeout = normalizePositiveInteger(
    runtimeConfig?.requestTimeoutMs,
    requestTimeoutMs
  );

  return {
    baseUrl,
    secretKey,
    requestTimeoutMs: timeout,
    cacheKey: `${baseUrl}::${secretKey}`,
  };
}

async function acquireRequestSlot(): Promise<void> {
  if (activeRequestCount < maxConcurrentRequests) {
    activeRequestCount += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    queuedRequestResolvers.push(() => {
      activeRequestCount += 1;
      resolve();
    });
  });
}

function releaseRequestSlot(): void {
  activeRequestCount = Math.max(0, activeRequestCount - 1);
  const nextResolver = queuedRequestResolvers.shift();
  nextResolver?.();
}

async function withRequestSlot<T>(task: () => Promise<T>): Promise<T> {
  await acquireRequestSlot();
  try {
    return await task();
  } finally {
    releaseRequestSlot();
  }
}

async function getMCPClient(
  config: ResolvedSellerSpriteRuntimeConfig
): Promise<Client> {
  const cachedClientPromise = mcpClientPromiseCache.get(config.cacheKey);
  if (cachedClientPromise) {
    return cachedClientPromise;
  }

  const clientPromise = (async () => {
    const client = new Client(
      {
        name: "listing-module",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    const transport = new StreamableHTTPClientTransport(new URL(config.baseUrl), {
      requestInit: {
        headers: {
          "secret-key": config.secretKey,
        },
      },
    });

    try {
      await client.connect(transport);
      return client;
    } catch (error) {
      mcpClientPromiseCache.delete(config.cacheKey);
      throw toSellerSpriteError(error, {
        code: "upstream",
        message: "Failed to connect to SellerSprite MCP service.",
        requestTimeoutMs: config.requestTimeoutMs,
      });
    }
  })();

  mcpClientPromiseCache.set(config.cacheKey, clientPromise);
  return clientPromise;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "Unknown error";
}

function toSellerSpriteError(
  error: unknown,
  params: {
    code: SellerSpriteErrorCode;
    message: string;
    toolName?: string;
    asin?: string;
    requestTimeoutMs?: number;
  }
): SellerSpriteClientError {
  if (error instanceof SellerSpriteClientError) {
    return error;
  }

  if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) {
    return new SellerSpriteClientError({
      code: "timeout",
      message: `SellerSprite request timed out after ${
        params.requestTimeoutMs ?? requestTimeoutMs
      }ms${
        params.toolName ? ` while calling "${params.toolName}"` : ""
      }${params.asin ? ` for ASIN ${params.asin}` : ""}.`,
      toolName: params.toolName,
      asin: params.asin,
      cause: error,
    });
  }

  const details = extractErrorMessage(error);
  return new SellerSpriteClientError({
    code: params.code,
    message:
      details === params.message ? params.message : `${params.message} ${details}`,
    toolName: params.toolName,
    asin: params.asin,
    cause: error,
  });
}

function parseJsonEnvelope(
  rawText: string,
  toolName: string,
  asin?: string
): SellerSpriteApiEnvelope {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new SellerSpriteClientError({
      code: "bad-response",
      toolName,
      asin,
      cause: error,
      message: `SellerSprite returned invalid JSON for "${toolName}"${
        asin ? ` (ASIN ${asin})` : ""
      }.`,
    });
  }

  if (!isRecord(parsed) || typeof parsed.code !== "string") {
    throw new SellerSpriteClientError({
      code: "bad-response",
      toolName,
      asin,
      message: `SellerSprite returned an unexpected payload for "${toolName}"${
        asin ? ` (ASIN ${asin})` : ""
      }.`,
    });
  }

  const message =
    typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message.trim()
      : undefined;

  return {
    code: parsed.code,
    message,
    data: parsed.data,
  };
}

function getFirstTextContent(
  content: ContentBlock[],
  toolName: string,
  asin?: string
): string {
  const textBlock = content.find(isTextContent);
  if (!textBlock) {
    throw new SellerSpriteClientError({
      code: "bad-response",
      toolName,
      asin,
      message: `SellerSprite did not return text content for "${toolName}"${
        asin ? ` (ASIN ${asin})` : ""
      }.`,
    });
  }

  return textBlock.text;
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
    .filter((item) => item.length > 0);
}

function getNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const normalized = value.replace(/[,%$#\s]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getInteger(value: unknown): number {
  return Math.trunc(getNumber(value));
}

function getIsoDateString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? "" : new Date(timestamp).toISOString();
}

function getIsoDateStringFromTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return "";
}

function expectRecord(
  value: unknown,
  toolName: string,
  asin?: string
): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  throw new SellerSpriteClientError({
    code: "bad-response",
    toolName,
    asin,
    message: `SellerSprite returned malformed data for "${toolName}"${
      asin ? ` (ASIN ${asin})` : ""
    }.`,
  });
}

function getRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function getContentBlocks(
  value: unknown,
  toolName: string,
  asin?: string
): ContentBlock[] {
  if (!Array.isArray(value)) {
    throw new SellerSpriteClientError({
      code: "bad-response",
      toolName,
      asin,
      message: `SellerSprite returned malformed content for "${toolName}"${
        asin ? ` (ASIN ${asin})` : ""
      }.`,
    });
  }

  const blocks = value.filter(isContentBlock);
  if (blocks.length === 0) {
    throw new SellerSpriteClientError({
      code: "bad-response",
      toolName,
      asin,
      message: `SellerSprite returned empty content for "${toolName}"${
        asin ? ` (ASIN ${asin})` : ""
      }.`,
    });
  }

  return blocks;
}

async function callMCPTool(
  toolName: string,
  args: Record<string, unknown>,
  options: SellerSpriteToolOptions = {}
): Promise<unknown> {
  const resolvedConfig = resolveSellerSpriteRuntimeConfig(options.runtimeConfig);
  const asin = options.asin;

  try {
    return await withRequestSlot(async () => {
      const client = await getMCPClient(resolvedConfig);
      const result = await client.callTool(
        {
          name: toolName,
          arguments: args,
        },
        undefined,
        {
          timeout: resolvedConfig.requestTimeoutMs,
        }
      );

      if (result.isError) {
        const errorText = getContentBlocks(result.content, toolName, asin)
          .filter(isTextContent)
          .map((block) => block.text.trim())
          .filter(Boolean)
          .join(" ");

        throw new SellerSpriteClientError({
          code: "upstream",
          toolName,
          asin,
          message: errorText
            ? `SellerSprite tool "${toolName}" failed${
                asin ? ` for ASIN ${asin}` : ""
              }: ${errorText}`
            : `SellerSprite tool "${toolName}" failed${
                asin ? ` for ASIN ${asin}` : ""
              }.`,
        });
      }

      const rawText = getFirstTextContent(
        getContentBlocks(result.content, toolName, asin),
        toolName,
        asin
      );
      const envelope = parseJsonEnvelope(rawText, toolName, asin);

      if (envelope.code !== "OK") {
        throw new SellerSpriteClientError({
          code: "upstream",
          toolName,
          asin,
          message: envelope.message
            ? `SellerSprite tool "${toolName}" returned "${envelope.code}"${
                asin ? ` for ASIN ${asin}` : ""
              }: ${envelope.message}`
            : `SellerSprite tool "${toolName}" returned "${envelope.code}"${
                asin ? ` for ASIN ${asin}` : ""
              }.`,
        });
      }

      return envelope.data;
    });
  } catch (error) {
    throw toSellerSpriteError(error, {
      code: "upstream",
      message: `SellerSprite request failed for "${toolName}"${
        asin ? ` (ASIN ${asin})` : ""
      }.`,
      toolName,
      asin,
      requestTimeoutMs: resolvedConfig.requestTimeoutMs,
    });
  }
}

function readFirstNumber(
  data: Record<string, unknown>,
  keys: string[]
): number {
  for (const key of keys) {
    if (!(key in data)) {
      continue;
    }

    const value = getInteger(data[key]);
    if (value > 0) {
      return value;
    }
  }

  return 0;
}

function normalizeAsin(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(normalized) ? normalized : "";
}

function uniqueAsins(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => normalizeAsin(value)).filter(Boolean))
  );
}

function extractAsins(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueAsins(value.flatMap((entry) => extractAsins(entry)));
  }

  if (isRecord(value)) {
    return uniqueAsins([
      normalizeAsin(value.asin),
      normalizeAsin(value.childAsin),
      normalizeAsin(value.variationAsin),
      normalizeAsin(value.parentAsin),
    ]);
  }

  if (typeof value !== "string") {
    return [];
  }

  const matches = value.toUpperCase().match(/[A-Z0-9]{10}/g);
  return uniqueAsins(matches ?? []);
}

async function fetchAsinDetailRecord(
  asin: string,
  marketplace: string,
  runtimeConfig?: SellerSpriteRuntimeConfig
): Promise<Record<string, unknown>> {
  return expectRecord(
    await callMCPTool(
      "asin_detail",
      {
        marketplace,
        asin,
      },
      {
        asin,
        runtimeConfig,
      }
    ),
    "asin_detail",
    asin
  );
}

function buildListingFromDetail(
  asin: string,
  data: Record<string, unknown>
): CompetitorListing {
  const badgeRecord =
    isRecord(data.badge) ? (data.badge as Record<string, unknown>) : {};
  const overviewRecord = parseOverviewRecord(data.overviews);
  const primarySubcategory = Array.isArray(data.subcategories)
    ? data.subcategories.find(isRecord)
    : null;

  return {
    asin,
    title: getString(data.title),
    bulletPoints: getStringArray(data.features),
    attributes: {
      brand: getString(data.brand),
      bsrLabel: getString(data.bsrLabel),
      subcategoryLabel: primarySubcategory ? getString(primarySubcategory.label) : "",
      subcategoryRank: primarySubcategory
        ? String(getInteger(primarySubcategory.rank))
        : "",
      nodeLabelPath: getString(data.nodeLabelPath),
      nodeIdPath: getString(data.nodeIdPath),
      parentAsin: getString(data.parent),
      variationCount: String(getInteger(data.variations)),
      availableDate: getIsoDateStringFromTimestamp(data.availableDate),
      fulfillment: getString(data.fulfillment),
      coupon: getString(data.coupon),
      lqs: String(getInteger(data.lqs)),
      dimensions: getString(data.dimensions),
      weight: getString(data.weight),
      fabricType: getString(overviewRecord["Fabric type"]),
      careInstructions: getString(overviewRecord["Care instructions"]),
      origin: getString(overviewRecord.Origin),
      closureType: getString(overviewRecord["Closure type"]),
      hasAPlus: getString(badgeRecord.ebc),
      hasVideo: getString(badgeRecord.video),
      amazonChoice: getString(badgeRecord.amazonChoice),
      bestSeller: getString(badgeRecord.bestSeller),
      newRelease: getString(badgeRecord.newRelease),
    },
    price: getNumber(data.price),
    rating: getNumber(data.rating),
    reviews: getInteger(data.ratings),
    monthlySales: readFirstNumber(data, [
      "monthlySales",
      "monthlySalesEstimate",
      "estimatedMonthlySales",
      "salesEstimate",
      "monthly_units_sold",
      "sales",
    ]),
    bsr: getInteger(data.bsrRank),
    mainImage: getString(data.imageUrl),
  };
}

function parseOverviewRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isListingEmpty(listing: CompetitorListing): boolean {
  return (
    !listing.title.trim() &&
    listing.bulletPoints.length === 0 &&
    listing.price === 0 &&
    listing.rating === 0 &&
    listing.reviews === 0 &&
    listing.monthlySales === 0 &&
    listing.bsr === 0 &&
    !listing.mainImage.trim()
  );
}

function parseAsinFamilyFromDetail(data: Record<string, unknown>): {
  parentAsin: string | null;
  variantAsins: string[];
} {
  const parentAsin = normalizeAsin(data.parentAsin) || null;
  const variantAsins = uniqueAsins([
    ...extractAsins(data.variationAsins),
    ...extractAsins(data.variations),
    ...extractAsins(data.childAsins),
    ...extractAsins(data.children),
    ...extractAsins(data.variationChildAsins),
  ]).filter((candidate) => candidate !== parentAsin);

  if (variantAsins.length > 0) {
    return {
      parentAsin,
      variantAsins,
    };
  }

  return {
    parentAsin,
    variantAsins: [],
  };
}

async function resolveAsinFamily(
  asin: string,
  marketplace: string,
  primaryDetail?: Record<string, unknown>,
  runtimeConfig?: SellerSpriteRuntimeConfig
): Promise<AsinFamilyResolution> {
  const detail =
    primaryDetail ?? (await fetchAsinDetailRecord(asin, marketplace, runtimeConfig));
  const primaryFamily = parseAsinFamilyFromDetail(detail);

  if (primaryFamily.variantAsins.length > 0) {
    return {
      parentAsin: primaryFamily.parentAsin,
      variantAsins: primaryFamily.variantAsins,
      source: "asin-detail-variants",
    };
  }

  if (primaryFamily.parentAsin && primaryFamily.parentAsin !== asin) {
    try {
      const parentDetail = await fetchAsinDetailRecord(
        primaryFamily.parentAsin,
        marketplace,
        runtimeConfig
      );
      const parentFamily = parseAsinFamilyFromDetail(parentDetail);

      if (parentFamily.variantAsins.length > 0) {
        return {
          parentAsin: primaryFamily.parentAsin,
          variantAsins: parentFamily.variantAsins,
          source: "parent-detail-variants",
        };
      }
    } catch (error) {
      console.warn(
        `[SellerSprite] Failed to resolve parent family for ASIN ${asin} via parent ASIN ${primaryFamily.parentAsin}. ${extractErrorMessage(
          error
        )}`
      );
    }

    return {
      parentAsin: primaryFamily.parentAsin,
      variantAsins: uniqueAsins([asin, primaryFamily.parentAsin]),
      source: "parent-asin-fallback",
    };
  }

  return {
    parentAsin: primaryFamily.parentAsin,
    variantAsins: [asin],
    source: "single-asin",
  };
}

function logAsinFallback(
  asin: string,
  dataset: "listing" | "reviews" | "keywords",
  error: unknown
): void {
  const suffix = error instanceof Error ? ` ${error.message}` : "";
  console.warn(
    `[SellerSprite] Falling back to empty ${dataset} data for ASIN ${asin}.${suffix}`
  );
}

function parseReviewItem(item: Record<string, unknown>): ReviewApiItem {
  return {
    star: getNumber(item.star),
    title: getString(item.title),
    content: getString(item.content),
    date: getIsoDateString(item.date),
  };
}

async function fetchReviewPages(
  asin: string,
  limit: number,
  marketplace: string,
  runtimeConfig?: SellerSpriteRuntimeConfig
): Promise<ReviewData[]> {
  const collectedReviews: ReviewData[] = [];
  const totalPages = Math.min(
    Math.ceil(limit / REVIEW_PAGE_SIZE),
    MAX_REVIEW_PAGES
  );

  for (let page = 1; page <= totalPages; page += 1) {
    try {
      const data = expectRecord(
        await callMCPTool(
          "review",
          {
            marketplace,
            asin,
            page,
            size: REVIEW_PAGE_SIZE,
          },
          {
            asin,
            runtimeConfig,
          }
        ),
        "review",
        asin
      );

      const items = getRecordArray(data.items);
      const pageReviews = items.map((item, index) => {
        const parsedReview = parseReviewItem(item);
        return {
          id: `${asin}-${page}-${index}`,
          asin,
          rating: parsedReview.star,
          title: parsedReview.title,
          content: parsedReview.content,
          date: parsedReview.date,
          verifiedPurchase: true,
          helpfulVotes: 0,
        };
      });

      collectedReviews.push(...pageReviews);

      if (items.length < REVIEW_PAGE_SIZE) {
        break;
      }
    } catch (error) {
      if (page === 1) {
        throw error;
      }

      console.warn(
        `[SellerSprite] Stopped review pagination for ASIN ${asin} on page ${page}. ${extractErrorMessage(
          error
        )}`
      );
      break;
    }
  }

  return collectedReviews.slice(0, limit);
}

function buildReviewFingerprint(review: ReviewData): string {
  return [
    review.rating,
    review.date.slice(0, REVIEW_DEDUP_DATE_PRECISION),
    review.title.trim().toLowerCase(),
    review.content.trim().toLowerCase(),
  ].join("|");
}

function dedupeAndSortReviews(reviews: ReviewData[], limit: number): ReviewData[] {
  const uniqueReviews = new Map<string, ReviewData>();

  for (const review of reviews) {
    const fingerprint = buildReviewFingerprint(review);
    if (!uniqueReviews.has(fingerprint)) {
      uniqueReviews.set(fingerprint, review);
    }
  }

  return Array.from(uniqueReviews.values())
    .sort((left, right) => {
      const leftTimestamp = Date.parse(left.date || "");
      const rightTimestamp = Date.parse(right.date || "");

      if (Number.isFinite(leftTimestamp) || Number.isFinite(rightTimestamp)) {
        const timestampDifference =
          (Number.isFinite(rightTimestamp) ? rightTimestamp : 0) -
          (Number.isFinite(leftTimestamp) ? leftTimestamp : 0);
        if (timestampDifference !== 0) {
          return timestampDifference;
        }
      }

      if (left.rating !== right.rating) {
        return left.rating - right.rating;
      }

      return `${left.title} ${left.content}`.localeCompare(
        `${right.title} ${right.content}`,
        "en",
        { sensitivity: "base" }
      );
    })
    .slice(0, limit);
}

async function fetchFamilyReviews(
  asins: string[],
  limit: number,
  marketplace: string,
  runtimeConfig?: SellerSpriteRuntimeConfig
): Promise<ReviewData[]> {
  const uniqueVariantAsins = uniqueAsins(asins);
  const perAsinLimit = Math.max(
    REVIEW_PAGE_SIZE,
    Math.ceil(limit / Math.max(uniqueVariantAsins.length, 1))
  );

  const allReviews = await Promise.all(
    uniqueVariantAsins.map((asin) =>
      fetchReviewPages(asin, perAsinLimit, marketplace, runtimeConfig).catch((error) => {
        console.warn(
          `[SellerSprite] Failed to fetch reviews for family ASIN ${asin}. ${extractErrorMessage(
            error
          )}`
        );
        return [];
      })
    )
  );

  return dedupeAndSortReviews(allReviews.flat(), limit);
}

function filterReviewsByType(
  reviews: ReviewData[],
  type: "negative" | "positive"
): ReviewData[] {
  return type === "negative"
    ? reviews.filter((review) => review.rating <= 3)
    : reviews.filter((review) => review.rating >= 4);
}

export async function getCompetitorListing(
  asin: string,
  marketplace: string = DEFAULT_MARKETPLACE,
  runtimeConfig?: SellerSpriteRuntimeConfig
): Promise<CompetitorListing> {
  const data = await fetchAsinDetailRecord(asin, marketplace, runtimeConfig);
  return buildListingFromDetail(asin, data);
}

export async function getCompetitorReviews(
  asin: string,
  type: "negative" | "positive",
  limit: number = REVIEW_FETCH_LIMIT,
  marketplace: string = DEFAULT_MARKETPLACE,
  runtimeConfig?: SellerSpriteRuntimeConfig
): Promise<ReviewData[]> {
  const primaryDetail = await fetchAsinDetailRecord(
    asin,
    marketplace,
    runtimeConfig
  ).catch(() => null);
  const family = primaryDetail
    ? await resolveAsinFamily(
        asin,
        marketplace,
        primaryDetail,
        runtimeConfig
      ).catch(() => ({
        parentAsin: null,
        variantAsins: [asin],
        source: "single-asin" as const,
      }))
    : {
        parentAsin: null,
        variantAsins: [asin],
        source: "single-asin" as const,
      };
  const reviews = await fetchFamilyReviews(
    family.variantAsins,
    limit,
    marketplace,
    runtimeConfig
  );
  return filterReviewsByType(reviews, type);
}

function parseTrafficKeywordItem(
  item: Record<string, unknown>
): TrafficKeywordApiItem {
  const rankPosition = isRecord(item.rankPosition)
    ? {
        position: getInteger(item.rankPosition.position),
      }
    : null;

  const adPosition = isRecord(item.adPosition)
    ? {
        position: getInteger(item.adPosition.position),
      }
    : null;

  return {
    keyword: getString(item.keyword),
    searches: getInteger(item.searches),
    rankPosition,
    adPosition,
    trafficPercentage: getNumber(item.trafficPercentage),
  };
}

async function fetchTrafficKeywordCandidates(
  asin: string,
  marketplace: string,
  runtimeConfig?: SellerSpriteRuntimeConfig
): Promise<TrafficKeyword[]> {
  const data = expectRecord(
    await callMCPTool(
      "traffic_keyword",
      {
        request: {
          marketplace,
          asin,
          size: 50,
        },
      },
      {
        asin,
        runtimeConfig,
      }
    ),
    "traffic_keyword",
    asin
  );

  return getRecordArray(data.items).map((item) => {
    const keyword = parseTrafficKeywordItem(item);

    return {
      keyword: keyword.keyword,
      searchVolume: keyword.searches,
      organicRank: keyword.rankPosition?.position ?? 0,
      sponsoredRank: keyword.adPosition?.position ?? null,
      conversionShare: keyword.trafficPercentage,
    };
  });
}

export async function getTrafficKeywords(
  asin: string,
  marketplace: string = DEFAULT_MARKETPLACE,
  runtimeConfig?: SellerSpriteRuntimeConfig
): Promise<TrafficKeyword[]> {
  return selectTrafficKeywords(
    await fetchTrafficKeywordCandidates(asin, marketplace, runtimeConfig),
    DEFAULT_MAX_SELECTED_KEYWORDS
  );
}

async function fetchFamilyTrafficKeywords(
  asins: string[],
  marketplace: string,
  runtimeConfig?: SellerSpriteRuntimeConfig
): Promise<TrafficKeyword[]> {
  const keywordGroups = await Promise.all(
    uniqueAsins(asins).map((asin) =>
      fetchTrafficKeywordCandidates(asin, marketplace, runtimeConfig).catch((error) => {
        console.warn(
          `[SellerSprite] Failed to fetch traffic keywords for family ASIN ${asin}. ${extractErrorMessage(
            error
          )}`
        );
        return [];
      })
    )
  );

  return selectTrafficKeywords(
    keywordGroups.flat(),
    DEFAULT_MAX_SELECTED_KEYWORDS
  );
}

async function fetchSingleCompetitorData(
  asin: string,
  marketplace: string,
  runtimeConfig?: SellerSpriteRuntimeConfig
): Promise<{
  listing: CompetitorListing;
  negativeReviews: ReviewData[];
  positiveReviews: ReviewData[];
  keywords: TrafficKeyword[];
}> {
  const detailResult = await Promise.allSettled([
    fetchAsinDetailRecord(asin, marketplace, runtimeConfig),
  ]);

  const primaryDetail =
    detailResult[0]?.status === "fulfilled" ? detailResult[0].value : null;
  const family =
    primaryDetail === null
      ? {
          parentAsin: null,
          variantAsins: [asin],
          source: "single-asin" as const,
        }
      : await resolveAsinFamily(
          asin,
          marketplace,
          primaryDetail,
          runtimeConfig
        ).catch((error) => {
          console.warn(
            `[SellerSprite] Failed to resolve family for ASIN ${asin}. ${extractErrorMessage(
              error
            )}`
          );
          return {
            parentAsin: null,
            variantAsins: [asin],
            source: "single-asin" as const,
          };
        });

  if (family.source !== "single-asin") {
    console.info("[SellerSprite] Aggregating family data", {
      asin,
      parentAsin: family.parentAsin,
      variantAsins: family.variantAsins,
      source: family.source,
    });
  }

  const [listingResult, reviewsResult, keywordsResult] = await Promise.allSettled([
    primaryDetail
      ? Promise.resolve(buildListingFromDetail(asin, primaryDetail))
      : getCompetitorListing(asin, marketplace, runtimeConfig),
    fetchFamilyReviews(
      family.variantAsins,
      REVIEW_FETCH_LIMIT,
      marketplace,
      runtimeConfig
    ),
    fetchFamilyTrafficKeywords(family.variantAsins, marketplace, runtimeConfig),
  ]);

  let listing: CompetitorListing;
  if (listingResult.status === "fulfilled") {
    listing = listingResult.value;
    if (isListingEmpty(listing)) {
      throw new SellerSpriteClientError({
        code: "bad-response",
        asin,
        toolName: "asin_detail",
        message: `SellerSprite returned an empty listing payload for ASIN ${asin}.`,
      });
    }
  } else {
    throw toSellerSpriteError(listingResult.reason, {
      code: "upstream",
      message: `SellerSprite listing lookup failed for ASIN ${asin}.`,
      toolName: "asin_detail",
      asin,
    });
  }

  let allReviews: ReviewData[];
  if (reviewsResult.status === "fulfilled") {
    allReviews = reviewsResult.value;
  } else {
    logAsinFallback(asin, "reviews", reviewsResult.reason);
    allReviews = [];
  }

  let keywords: TrafficKeyword[];
  if (keywordsResult.status === "fulfilled") {
    keywords = keywordsResult.value;
  } else {
    logAsinFallback(asin, "keywords", keywordsResult.reason);
    keywords = [];
  }

  return {
    listing,
    negativeReviews: filterReviewsByType(allReviews, "negative"),
    positiveReviews: filterReviewsByType(allReviews, "positive"),
    keywords,
  };
}

export async function fetchCompetitorData(
  asins: string[],
  marketplace: string = DEFAULT_MARKETPLACE,
  runtimeConfig?: SellerSpriteRuntimeConfig
): Promise<{
  listings: CompetitorListing[];
  reviews: Record<string, ReviewData[]>;
  positiveReviews: Record<string, ReviewData[]>;
  keywords: Record<string, TrafficKeyword[]>;
}> {
  const validAsins = asins
    .filter((asin): asin is string => typeof asin === "string")
    .map((asin) => asin.trim())
    .filter((asin) => asin.length > 0);

  const results = await Promise.all(
    validAsins.map((asin) =>
      fetchSingleCompetitorData(asin, marketplace, runtimeConfig)
    )
  );

  const listings: CompetitorListing[] = [];
  const reviews: Record<string, ReviewData[]> = {};
  const positiveReviews: Record<string, ReviewData[]> = {};
  const keywords: Record<string, TrafficKeyword[]> = {};

  results.forEach((result, index) => {
    const asin = validAsins[index];
    if (!asin) {
      return;
    }

    listings.push(result.listing);
    reviews[asin] = result.negativeReviews;
    positiveReviews[asin] = result.positiveReviews;
    keywords[asin] = result.keywords;
  });

  return { listings, reviews, positiveReviews, keywords };
}
