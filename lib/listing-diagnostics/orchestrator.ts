import { fetchCompetitorData } from "@/lib/seller-sprite-client";
import { listingDiagnosticsRules } from "@/lib/listing-diagnostics/rules";
import { buildListingDiagnosticsSpApiEnhancement } from "@/lib/listing-diagnostics/sp-api";
import {
  average,
  extractReviewThemes,
  getCountConfidence,
  getCountCoverageStatus,
  getCoverageStatus,
  getImpactRank,
  getPriorityRank,
  getVerificationRank,
  hasAnyEntitySignal,
  hasMeaningfulListingSnapshot,
  formatImpactType,
  formatRootCauseCategory,
  safeDivide,
  uniqueKeywords,
} from "@/lib/listing-diagnostics/rules/shared";
import type {
  ListingDiagnosticsApiResponse,
  ListingDiagnosticsBenchmark,
  ListingDiagnosticsEntitySnapshot,
  ListingDiagnosticsFinding,
  ListingDiagnosticsImpactSummaryItem,
  ListingDiagnosticsRequest,
  ListingDiagnosticsResult,
  ListingDiagnosticsRuleResult,
  ListingDiagnosticsRootCauseSummaryItem,
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

  const spApiEnhancement = await buildListingDiagnosticsSpApiEnhancement({
    targetAsin: normalizedRequest.targetAsin,
    marketplace: normalizedRequest.marketplace,
    config: request.spApi,
  });

  const findings = sortFindings(
    dedupeById([
      ...ruleResults.flatMap((result) => result.findings),
      ...(spApiEnhancement?.findings ?? []),
    ])
  );
  const computedActions = sortActions(
    dedupeById([
      ...ruleResults.flatMap((result) => result.actions),
      ...(spApiEnhancement?.actions ?? []),
    ])
  ).slice(0, 6);
  const dimensions = ruleResults.map((result) => result.dimension);
  const rootCauseSummary = buildRootCauseSummary(findings);
  const impactSummary = buildImpactSummary(findings);

  const computedOverallScore = Math.round(
    dimensions.reduce((total, dimension) => total + dimension.score * dimension.weight, 0) /
      dimensions.reduce((total, dimension) => total + dimension.weight, 0)
  );
  const overallScore =
    spApiEnhancement?.scoreCeiling !== null && spApiEnhancement?.scoreCeiling !== undefined
      ? Math.min(computedOverallScore, spApiEnhancement.scoreCeiling)
      : computedOverallScore;
  const scoreCapApplied =
    spApiEnhancement?.scoreCeiling !== null &&
    spApiEnhancement?.scoreCeiling !== undefined &&
    computedOverallScore > spApiEnhancement.scoreCeiling;
  const confidence = Math.round(
    buildConfidenceScore(
      [...sourceCoverage, ...(spApiEnhancement?.coverageItems ?? [])],
      ruleResults
    ) * 100
  );

  const combinedSourceCoverage = [
    ...sourceCoverage,
    ...(spApiEnhancement?.coverageItems ?? []),
  ];
  const warnings = buildWarnings(combinedSourceCoverage, findings).concat(
    spApiEnhancement?.warnings ?? []
  );
  const status: ListingDiagnosticsResult["status"] =
    combinedSourceCoverage.some((item) => item.status !== "covered") ||
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
            priority: "P2" as const,
            verification: "direct" as const,
            symptom:
              "No single blocker outranked the rest in this deterministic pass.",
            rootCause:
              "Current signals do not show one obvious operational constraint, so the listing should be monitored after meaningful changes.",
            action:
              "Monitor the baseline and rerun after price, content, or offer changes.",
            whereToChange:
              "No immediate change surface; rerun after the next meaningful listing update",
            expectedImpact:
              "Keeps the operator focused on the next meaningful change instead of inventing a blocker.",
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
    headline:
      spApiEnhancement?.headline ?? buildHeadline(overallScore, confidence, findings),
    summary: buildSummary(
      dimensions,
      findings,
      status,
      spApiEnhancement?.summary.verifiedFindingIds.length ?? 0,
      rootCauseSummary[0]?.label ?? null
    ),
    dimensions,
    findings,
    actionPlan,
    rootCauseSummary,
    impactSummary,
    sourceCoverage: combinedSourceCoverage,
    warnings: Array.from(new Set(warnings)),
    target,
    competitors,
    benchmark,
    spApiVerification: spApiEnhancement
      ? {
          ...spApiEnhancement.summary,
          scoreCapApplied,
        }
      : null,
    inferredCount:
      findings.filter((item) => item.inferred).length +
      actionPlan.filter((item) => item.inferred).length +
      combinedSourceCoverage.filter((item) => item.inferred).length,
  };

  return {
    status,
    warnings: Array.from(new Set(warnings)),
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
    "sp-api-catalog": 0.05,
    "sp-api-account-listing": 0.04,
    "sp-api-account-restrictions": 0.03,
  };

  const sourceScore = sourceCoverage.reduce((total, item) => {
    return total + item.confidence * (sourceWeights[item.id] ?? 0);
  }, 0);
  const ruleScore = ruleResults.reduce(
    (total, result) => total + result.dimension.confidence * result.dimension.weight,
    0
  );
  const weightTotal =
    sourceCoverage.reduce((total, item) => total + (sourceWeights[item.id] ?? 0), 0) +
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
  status: ListingDiagnosticsStatus,
  verifiedFindingCount = 0,
  leadingRootCauseLabel: string | null = null
): string {
  const strongest = [...dimensions].sort((left, right) => right.score - left.score)[0];
  const weakest = [...dimensions].sort((left, right) => left.score - right.score)[0];

  if (!strongest || !weakest) {
    return "No dimensions were scored.";
  }

  const verificationSentence =
    verifiedFindingCount > 0
      ? ` ${verifiedFindingCount} catalog/account finding(s) were verified by Amazon SP-API.`
      : "";
  const p0Count = findings.filter((finding) => finding.priority === "P0").length;
  const p1Count = findings.filter((finding) => finding.priority === "P1").length;
  const rootCauseSentence = leadingRootCauseLabel
    ? ` The current root-cause queue is led by ${leadingRootCauseLabel}.`
    : "";

  return `${strongest.label} is currently the strongest dimension, while ${weakest.label} needs the most attention. ${findings.length} findings were generated in this ${status} run, including ${p0Count} P0 and ${p1Count} P1 priorities.${rootCauseSentence}${verificationSentence}`;
}

function buildRootCauseSummary(
  findings: ListingDiagnosticsFinding[]
): ListingDiagnosticsRootCauseSummaryItem[] {
  const grouped = new Map<string, ListingDiagnosticsFinding[]>();

  for (const finding of findings) {
    const key = finding.rootCauseCategory ?? "general";
    const next = grouped.get(key) ?? [];
    next.push(finding);
    grouped.set(key, next);
  }

  return Array.from(grouped.entries())
    .map(([key, group]) => {
      const sortedGroup = sortFindings(group);
      const leader = sortedGroup[0];

      return {
        category: key === "general" ? null : leader.rootCauseCategory,
        label: formatRootCauseCategory(
          key === "general" ? null : leader.rootCauseCategory
        ),
        findingCount: group.length,
        verifiedCount: group.filter((finding) => finding.verification === "verified")
          .length,
        inferredCount: group.filter((finding) => finding.verification === "inferred")
          .length,
        topPriority: leader.priority,
        primaryImpactType: leader.impactType,
        symptom: leader.symptom,
        recommendedSurface: leader.whereToChange,
        topFindingIds: sortedGroup.slice(0, 3).map((finding) => finding.id),
      };
    })
    .sort((left, right) => {
      if (getPriorityRank(left.topPriority) !== getPriorityRank(right.topPriority)) {
        return getPriorityRank(left.topPriority) - getPriorityRank(right.topPriority);
      }

      if (
        getImpactRank(left.primaryImpactType) !==
        getImpactRank(right.primaryImpactType)
      ) {
        return (
          getImpactRank(left.primaryImpactType) -
          getImpactRank(right.primaryImpactType)
        );
      }

      return right.findingCount - left.findingCount;
    });
}

function buildImpactSummary(
  findings: ListingDiagnosticsFinding[]
): ListingDiagnosticsImpactSummaryItem[] {
  const grouped = new Map<
    ListingDiagnosticsFinding["impactType"],
    ListingDiagnosticsFinding[]
  >();

  for (const finding of findings) {
    const next = grouped.get(finding.impactType) ?? [];
    next.push(finding);
    grouped.set(finding.impactType, next);
  }

  return Array.from(grouped.entries())
    .map(([impactType, group]) => {
      const sortedGroup = sortFindings(group);
      const leader = sortedGroup[0];
      const verifiedCount = group.filter(
        (finding) => finding.verification === "verified"
      ).length;
      const inferredCount = group.filter(
        (finding) => finding.verification === "inferred"
      ).length;
      const verificationHeadline =
        verifiedCount > 0
          ? `${verifiedCount} verified`
          : inferredCount > 0
            ? `${inferredCount} inferred`
            : "direct";

      return {
        impactType,
        label: formatImpactType(impactType),
        findingCount: group.length,
        verifiedCount,
        inferredCount,
        topPriority: leader.priority,
        headline: `${group.length} finding(s) are pressing on ${formatImpactType(impactType).toLowerCase()}, led by ${verificationHeadline} signal(s).`,
        topRootCauseCategory: leader.rootCauseCategory,
        nextMove: leader.whatToChange,
        topFindingIds: sortedGroup.slice(0, 3).map((finding) => finding.id),
      };
    })
    .sort((left, right) => {
      if (getPriorityRank(left.topPriority) !== getPriorityRank(right.topPriority)) {
        return getPriorityRank(left.topPriority) - getPriorityRank(right.topPriority);
      }

      if (getImpactRank(left.impactType) !== getImpactRank(right.impactType)) {
        return getImpactRank(left.impactType) - getImpactRank(right.impactType);
      }

      return right.findingCount - left.findingCount;
    });
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
  return [...findings].sort((left, right) => {
    if (getPriorityRank(left.priority) !== getPriorityRank(right.priority)) {
      return getPriorityRank(left.priority) - getPriorityRank(right.priority);
    }

    if (getImpactRank(left.impactType) !== getImpactRank(right.impactType)) {
      return getImpactRank(left.impactType) - getImpactRank(right.impactType);
    }

    if (
      getVerificationRank(left.verification) !==
      getVerificationRank(right.verification)
    ) {
      return (
        getVerificationRank(left.verification) -
        getVerificationRank(right.verification)
      );
    }

    return right.confidence - left.confidence;
  });
}

function sortActions(
  actions: ListingDiagnosticsResult["actionPlan"]
): ListingDiagnosticsResult["actionPlan"] {
  return [...actions].sort((left, right) => {
    if (getPriorityRank(left.priority) !== getPriorityRank(right.priority)) {
      return getPriorityRank(left.priority) - getPriorityRank(right.priority);
    }

    if (
      getVerificationRank(left.verification) !==
      getVerificationRank(right.verification)
    ) {
      return (
        getVerificationRank(left.verification) -
        getVerificationRank(right.verification)
      );
    }

    return right.confidence - left.confidence;
  });
}
