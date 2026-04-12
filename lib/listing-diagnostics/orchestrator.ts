import { fetchCompetitorData } from "@/lib/seller-sprite-client";
import { listingDiagnosticsRules } from "@/lib/listing-diagnostics/rules";
import {
  average,
  extractReviewThemes,
  getCountConfidence,
  getCountCoverageStatus,
  getCoverageStatus,
  hasAnyEntitySignal,
  hasMeaningfulListingSnapshot,
  safeDivide,
  uniqueKeywords,
} from "@/lib/listing-diagnostics/rules/shared";
import type {
  ListingDiagnosticsApiResponse,
  ListingDiagnosticsBenchmark,
  ListingDiagnosticsEntitySnapshot,
  ListingDiagnosticsFinding,
  ListingDiagnosticsRequest,
  ListingDiagnosticsResult,
  ListingDiagnosticsRuleResult,
  ListingDiagnosticsSourceCoverageItem,
  ListingDiagnosticsStatus,
} from "@/lib/listing-diagnostics/types";
import type { CompetitorListing } from "@/lib/types";

const SELLERSPRITE_SOURCE = "SellerSprite MCP";
const DERIVED_SOURCE = "Derived benchmark";

export class ListingDiagnosticsOrchestratorError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code = "listing_diagnostics_failed", statusCode = 500) {
    super(message);
    this.name = "ListingDiagnosticsOrchestratorError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function runListingDiagnostics(
  request: ListingDiagnosticsRequest
): Promise<ListingDiagnosticsApiResponse> {
  const targetAsin = normalizeAsin(request.targetAsin);
  const normalizedRequest = {
    targetAsin,
    competitorAsins: uniqueAsins(request.competitorAsins).filter(
      (asin) => asin !== targetAsin
    ),
    marketplace: request.marketplace.trim().toUpperCase(),
  };

  const response = await fetchCompetitorData(
    [normalizedRequest.targetAsin, ...normalizedRequest.competitorAsins],
    normalizedRequest.marketplace
  );

  const listingsByAsin = new Map(
    response.listings.map((listing) => [normalizeAsin(listing.asin), listing])
  );

  const buildEntitySnapshot = (asin: string): ListingDiagnosticsEntitySnapshot => ({
    asin,
    listing: normalizeListing(listingsByAsin.get(asin)),
    negativeReviews: response.reviews[asin] ?? [],
    positiveReviews: response.positiveReviews[asin] ?? [],
    keywords: response.keywords[asin] ?? [],
  });

  const target = buildEntitySnapshot(normalizedRequest.targetAsin);
  const competitors = normalizedRequest.competitorAsins.map(buildEntitySnapshot);

  if (!hasAnyEntitySignal(target)) {
    throw new ListingDiagnosticsOrchestratorError(
      "SellerSprite did not return usable data for the target ASIN.",
      "target_data_missing",
      502
    );
  }

  const sourceCoverage = buildSourceCoverage(target, competitors);
  const coverageById = Object.fromEntries(
    sourceCoverage.map((item) => [item.id, item])
  );
  const benchmark = buildBenchmark(competitors);

  const ruleResults = listingDiagnosticsRules.map((rule) =>
    rule.run({
      request: normalizedRequest,
      target,
      competitors,
      benchmark,
      sourceCoverage,
      coverageById,
    })
  );

  const findings = sortFindings(dedupeById(ruleResults.flatMap((result) => result.findings)));
  const computedActions = sortActions(
    dedupeById(ruleResults.flatMap((result) => result.actions))
  ).slice(0, 6);
  const dimensions = ruleResults.map((result) => result.dimension);

  const overallScore = Math.round(
    dimensions.reduce((total, dimension) => total + dimension.score * dimension.weight, 0) /
      dimensions.reduce((total, dimension) => total + dimension.weight, 0)
  );
  const confidence = Math.round(
    buildConfidenceScore(sourceCoverage, ruleResults) * 100
  );

  const warnings = buildWarnings(sourceCoverage, findings);
  const status: ListingDiagnosticsStatus =
    sourceCoverage.some((item) => item.status !== "covered") ||
    dimensions.some((dimension) => dimension.inferred)
      ? "partial"
      : "success";

  const actionPlan =
    computedActions.length > 0
      ? computedActions
      : [
          {
            id: "monitor-win-state",
            title: "Keep monitoring the current listing baseline",
            description:
              "The deterministic checks did not surface a dominant Phase 1 issue. Re-run after meaningful copy, pricing, or review changes.",
            priority: "later" as const,
            confidence: confidence / 100,
            inferred: false,
            linkedFindingIds: [],
          },
        ];

  const result: ListingDiagnosticsResult = {
    generatedAt: new Date().toISOString(),
    request: normalizedRequest,
    status,
    overallScore,
    confidence,
    headline: buildHeadline(overallScore, confidence, findings),
    summary: buildSummary(dimensions, findings, status),
    dimensions,
    findings,
    actionPlan,
    sourceCoverage,
    warnings,
    target,
    competitors,
    benchmark,
    inferredCount:
      findings.filter((item) => item.inferred).length +
      actionPlan.filter((item) => item.inferred).length +
      sourceCoverage.filter((item) => item.inferred).length,
  };

  return {
    status,
    warnings,
    result,
  };
}

function normalizeAsin(value: string): string {
  return value.trim().toUpperCase();
}

function uniqueAsins(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => normalizeAsin(value))
        .filter(Boolean)
    )
  );
}

function normalizeListing(
  listing: CompetitorListing | undefined
): CompetitorListing | null {
  if (!listing) {
    return null;
  }

  return hasMeaningfulListingSnapshot(listing) ? listing : null;
}

function isComparableListing(
  listing: CompetitorListing | null
): listing is CompetitorListing {
  return hasMeaningfulListingSnapshot(listing);
}

function buildSourceCoverage(
  target: ListingDiagnosticsEntitySnapshot,
  competitors: ListingDiagnosticsEntitySnapshot[]
): ListingDiagnosticsSourceCoverageItem[] {
  const targetListingAvailable = hasMeaningfulListingSnapshot(target.listing) ? 1 : 0;
  const competitorListingCount = competitors.filter((competitor) =>
    hasMeaningfulListingSnapshot(competitor.listing)
  ).length;
  const competitorReviewCount = competitors.filter(
    (competitor) =>
      competitor.negativeReviews.length + competitor.positiveReviews.length > 0
  ).length;
  const competitorKeywordCount = competitors.filter(
    (competitor) => competitor.keywords.length > 0
  ).length;

  return [
    {
      id: "target-listing",
      label: "Target listing snapshot",
      source: SELLERSPRITE_SOURCE,
      entity: "target",
      status: targetListingAvailable > 0 ? "covered" : "missing",
      available: targetListingAvailable,
      expected: 1,
      detail:
        targetListingAvailable > 0
          ? "Direct title, bullet, price, and rating fields are available."
          : "SellerSprite did not return a usable listing snapshot for the target ASIN.",
      confidence: targetListingAvailable > 0 ? 0.98 : 0,
      inferred: false,
    },
    {
      id: "target-negative-reviews",
      label: "Target negative reviews",
      source: SELLERSPRITE_SOURCE,
      entity: "target",
      status: getCountCoverageStatus(target.negativeReviews.length, 8, 1),
      available: target.negativeReviews.length,
      expected: 8,
      detail: `${target.negativeReviews.length} negative reviews collected for the target ASIN.`,
      confidence: getCountConfidence(target.negativeReviews.length, 8, 1),
      inferred: false,
    },
    {
      id: "target-positive-reviews",
      label: "Target positive reviews",
      source: SELLERSPRITE_SOURCE,
      entity: "target",
      status: getCountCoverageStatus(target.positiveReviews.length, 8, 1),
      available: target.positiveReviews.length,
      expected: 8,
      detail: `${target.positiveReviews.length} positive reviews collected for the target ASIN.`,
      confidence: getCountConfidence(target.positiveReviews.length, 8, 1),
      inferred: false,
    },
    {
      id: "target-keywords",
      label: "Target traffic keywords",
      source: SELLERSPRITE_SOURCE,
      entity: "target",
      status: getCountCoverageStatus(target.keywords.length, 8, 1),
      available: target.keywords.length,
      expected: 8,
      detail: `${target.keywords.length} traffic keywords collected for the target ASIN.`,
      confidence: getCountConfidence(target.keywords.length, 8, 1),
      inferred: false,
    },
    {
      id: "competitor-listings",
      label: "Competitor listing snapshots",
      source: SELLERSPRITE_SOURCE,
      entity: "competitors",
      status: getCoverageStatus(
        competitorListingCount,
        competitors.length,
        competitors.length > 0 ? 1 : 2
      ),
      available: competitorListingCount,
      expected: competitors.length,
      detail:
        competitors.length > 0
          ? `${competitorListingCount} of ${competitors.length} competitor ASINs returned listing snapshots.`
          : "No competitor ASINs were provided for the benchmark set.",
      confidence:
        competitors.length > 0 ? safeDivide(competitorListingCount, competitors.length) : 0,
      inferred: false,
    },
    {
      id: "competitor-reviews",
      label: "Competitor review coverage",
      source: SELLERSPRITE_SOURCE,
      entity: "competitors",
      status: getCoverageStatus(
        competitorReviewCount,
        competitors.length,
        competitors.length > 0 ? 1 : 2
      ),
      available: competitorReviewCount,
      expected: competitors.length,
      detail:
        competitors.length > 0
          ? `${competitorReviewCount} of ${competitors.length} competitor ASINs returned reviews.`
          : "No competitor ASINs were provided for review benchmarking.",
      confidence:
        competitors.length > 0 ? safeDivide(competitorReviewCount, competitors.length) : 0,
      inferred: false,
    },
    {
      id: "competitor-keywords",
      label: "Competitor keyword coverage",
      source: SELLERSPRITE_SOURCE,
      entity: "competitors",
      status: getCoverageStatus(
        competitorKeywordCount,
        competitors.length,
        competitors.length > 0 ? 1 : 2
      ),
      available: competitorKeywordCount,
      expected: competitors.length,
      detail:
        competitors.length > 0
          ? `${competitorKeywordCount} of ${competitors.length} competitor ASINs returned traffic keywords.`
          : "No competitor ASINs were provided for keyword benchmarking.",
      confidence:
        competitors.length > 0 ? safeDivide(competitorKeywordCount, competitors.length) : 0,
      inferred: false,
    },
    {
      id: "derived-benchmark",
      label: "Derived benchmark model",
      source: DERIVED_SOURCE,
      entity: "benchmark",
      status: competitorListingCount > 0 ? "covered" : "missing",
      available: competitorListingCount > 0 ? 1 : 0,
      expected: 1,
      detail:
        competitorListingCount > 0
          ? "Benchmark averages and pack-level comparisons are derived from the available competitor snapshots."
          : "Benchmark averages cannot be derived until competitor listing snapshots are available.",
      confidence:
        competitors.length > 0 ? safeDivide(competitorListingCount, competitors.length) : 0,
      inferred: true,
    },
  ];
}

function buildBenchmark(
  competitors: ListingDiagnosticsEntitySnapshot[]
): ListingDiagnosticsBenchmark {
  const comparableListings = competitors
    .map((competitor) => competitor.listing)
    .filter(isComparableListing);

  const averagePrice = average(
    comparableListings.map((listing) => listing.price).filter((value) => value > 0)
  );
  const averageRating = average(
    comparableListings.map((listing) => listing.rating).filter((value) => value > 0)
  );
  const averageReviews = average(
    comparableListings.map((listing) => listing.reviews).filter((value) => value > 0)
  );
  const averageKeywordCount = average(
    competitors.map((competitor) => competitor.keywords.length).filter((value) => value > 0)
  );
  const topKeywords = uniqueKeywords(
    competitors.flatMap((competitor) => competitor.keywords)
  )
    .slice(0, 6)
    .map((keyword) => keyword.keyword);
  const topThemes = extractReviewThemes(
    competitors.flatMap((competitor) => competitor.negativeReviews),
    true,
    3
  );

  return {
    competitorCount: comparableListings.length,
    averagePrice,
    averageRating,
    averageReviews,
    averageKeywordCount,
    topKeywords,
    topThemes,
  };
}

function buildConfidenceScore(
  sourceCoverage: ListingDiagnosticsSourceCoverageItem[],
  ruleResults: ListingDiagnosticsRuleResult[]
): number {
  const sourceWeights: Record<string, number> = {
    "target-listing": 0.24,
    "target-negative-reviews": 0.14,
    "target-positive-reviews": 0.1,
    "target-keywords": 0.18,
    "competitor-listings": 0.14,
    "competitor-reviews": 0.08,
    "competitor-keywords": 0.07,
    "derived-benchmark": 0.05,
  };

  const sourceScore = sourceCoverage.reduce((total, item) => {
    return total + item.confidence * (sourceWeights[item.id] ?? 0);
  }, 0);
  const ruleScore = ruleResults.reduce(
    (total, result) => total + result.dimension.confidence * result.dimension.weight,
    0
  );
  const weightTotal =
    Object.values(sourceWeights).reduce((total, value) => total + value, 0) +
    ruleResults.reduce((total, result) => total + result.dimension.weight, 0);

  return weightTotal > 0 ? (sourceScore + ruleScore) / weightTotal : 0;
}

function buildWarnings(
  sourceCoverage: ListingDiagnosticsSourceCoverageItem[],
  findings: ListingDiagnosticsFinding[]
): string[] {
  const warnings = sourceCoverage
    .filter((item) => item.status !== "covered")
    .map((item) => item.detail);

  if (findings.some((finding) => finding.inferred)) {
    warnings.push(
      "Some findings are marked as inferred because they rely on competitor proxy data or a derived benchmark."
    );
  }

  return Array.from(new Set(warnings));
}

function buildHeadline(
  overallScore: number,
  confidence: number,
  findings: ListingDiagnosticsFinding[]
): string {
  const highSeverityCount = findings.filter(
    (finding) => finding.severity === "high"
  ).length;

  if (overallScore >= 80 && highSeverityCount === 0) {
    return "Listing fundamentals are healthy, with the remaining work focused on upside capture.";
  }

  if (overallScore >= 65) {
    return "The listing is viable, but the rule engine sees clear Phase 1 gaps worth tightening.";
  }

  if (confidence < 60) {
    return "The current score is directional only because source coverage is thin in key areas.";
  }

  return "The listing needs concentrated copy and proof work before it can compete comfortably.";
}

function buildSummary(
  dimensions: ListingDiagnosticsResult["dimensions"],
  findings: ListingDiagnosticsFinding[],
  status: ListingDiagnosticsStatus
): string {
  const strongest = [...dimensions].sort((left, right) => right.score - left.score)[0];
  const weakest = [...dimensions].sort((left, right) => left.score - right.score)[0];

  if (!strongest || !weakest) {
    return "No dimensions were scored.";
  }

  return `${strongest.label} is currently the strongest dimension, while ${weakest.label} needs the most attention. ${findings.length} findings were generated in this ${status} run.`;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.set(item.id, item);
    }
  }

  return Array.from(seen.values());
}

function sortFindings(findings: ListingDiagnosticsFinding[]): ListingDiagnosticsFinding[] {
  const severityRank: Record<ListingDiagnosticsFinding["severity"], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return [...findings].sort((left, right) => {
    if (severityRank[left.severity] !== severityRank[right.severity]) {
      return severityRank[left.severity] - severityRank[right.severity];
    }

    return right.confidence - left.confidence;
  });
}

function sortActions(
  actions: ListingDiagnosticsResult["actionPlan"]
): ListingDiagnosticsResult["actionPlan"] {
  const priorityRank: Record<ListingDiagnosticsResult["actionPlan"][number]["priority"], number> =
    {
      now: 0,
      next: 1,
      later: 2,
    };

  return [...actions].sort((left, right) => {
    if (priorityRank[left.priority] !== priorityRank[right.priority]) {
      return priorityRank[left.priority] - priorityRank[right.priority];
    }

    return right.confidence - left.confidence;
  });
}
