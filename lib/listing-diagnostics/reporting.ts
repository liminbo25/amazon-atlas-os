import type {
  ListingDiagnosticsActionPlanItem,
  ListingDiagnosticsActionPriority,
  ListingDiagnosticsFinding,
  ListingDiagnosticsResult,
  ListingDiagnosticsSourceCoverageItem,
} from "@/lib/listing-diagnostics/types";
import { getVerificationRank } from "@/lib/listing-diagnostics/rules/shared";

export interface ListingDiagnosticsActionPlanSection {
  id: ListingDiagnosticsActionPriority;
  label: string;
  description: string;
  items: ListingDiagnosticsActionPlanItem[];
}

export interface ListingDiagnosticsEvidenceRow {
  id: string;
  signal: string;
  source: string;
  confidence: number;
  verification: "verified" | "direct" | "inferred";
  evidence: string;
  category: "finding" | "coverage";
}

const ACTION_PRIORITY_ORDER: ListingDiagnosticsActionPriority[] = [
  "P0",
  "P1",
  "P2",
];

const ACTION_PRIORITY_META: Record<
  ListingDiagnosticsActionPriority,
  Omit<ListingDiagnosticsActionPlanSection, "items">
> = {
  P0: {
    id: "P0",
    label: "P0",
    description:
      "Fix now. These items are blocking buyability, compliance, or other critical outcomes.",
  },
  P1: {
    id: "P1",
    label: "P1",
    description:
      "Queue next. These items should move as soon as the P0 blockers are under control.",
  },
  P2: {
    id: "P2",
    label: "P2",
    description:
      "Monitor or batch later. These items matter, but they should not displace higher-impact fixes.",
  },
};

const FINDING_DIMENSION_SOURCE_IDS: Record<string, string[]> = {
  "content-coverage": ["target-listing"],
  "listing-health": ["target-listing", "target-keywords", "competitor-listings"],
  "keyword-opportunity": ["target-keywords"],
  "review-signal": ["target-negative-reviews", "target-positive-reviews"],
  "market-position": ["derived-benchmark", "competitor-listings"],
};

export function sortActionPlanByPriority(
  items: ListingDiagnosticsActionPlanItem[]
): ListingDiagnosticsActionPlanItem[] {
  const priorityRank = Object.fromEntries(
    ACTION_PRIORITY_ORDER.map((priority, index) => [priority, index])
  ) as Record<ListingDiagnosticsActionPriority, number>;

  return [...items].sort((left, right) => {
    if (priorityRank[left.priority] !== priorityRank[right.priority]) {
      return priorityRank[left.priority] - priorityRank[right.priority];
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

export function groupActionPlanByPriority(
  items: ListingDiagnosticsActionPlanItem[]
): ListingDiagnosticsActionPlanSection[] {
  const sortedItems = sortActionPlanByPriority(items);

  return ACTION_PRIORITY_ORDER.map((priority) => ({
    ...ACTION_PRIORITY_META[priority],
    items: sortedItems.filter((item) => item.priority === priority),
  })).filter((section) => section.items.length > 0);
}

export function buildListingDiagnosticsEvidenceRows(
  result: ListingDiagnosticsResult
): ListingDiagnosticsEvidenceRow[] {
  const coverageById = new Map(
    result.sourceCoverage.map((item) => [item.id, item] as const)
  );
  const verifiedFindingIds = new Set(
    result.spApiVerification?.verifiedFindingIds ?? []
  );

  const findingRows = result.findings.flatMap((finding) => {
    const relatedCoverageItems = resolveCoverageItemsForFinding(
      finding,
      coverageById,
      verifiedFindingIds
    );
    const evidenceItems =
      finding.evidence.length > 0 ? finding.evidence : [finding.description];

    return evidenceItems.map((evidence, index) => ({
      id: `finding-${finding.id}-${index}`,
      signal: finding.title,
      source: resolveEvidenceSourceLabel(relatedCoverageItems, finding, verifiedFindingIds),
      confidence: finding.confidence,
      verification: finding.verification,
      evidence,
      category: "finding" as const,
    }));
  });

  const coverageRows = result.sourceCoverage.map((item) => {
    const verification: ListingDiagnosticsEvidenceRow["verification"] =
      item.source === "Amazon SP-API"
        ? "verified"
        : item.inferred
          ? "inferred"
          : "direct";

    return {
      id: `coverage-${item.id}`,
      signal: item.label,
      source: item.source,
      confidence: item.confidence,
      verification,
      evidence: item.detail,
      category: "coverage" as const,
    };
  });

  return [...findingRows, ...coverageRows].sort((left, right) => {
    const categoryRank = left.category === right.category
      ? 0
      : left.category === "finding"
        ? -1
        : 1;

    if (categoryRank !== 0) {
      return categoryRank;
    }

    const verificationRank = getVerificationRank(left.verification) - getVerificationRank(right.verification);
    if (verificationRank !== 0) {
      return verificationRank;
    }

    return right.confidence - left.confidence;
  });
}

export function formatEvidenceVerificationLabel(
  verification: ListingDiagnosticsEvidenceRow["verification"]
): string {
  switch (verification) {
    case "verified":
      return "Verified";
    case "inferred":
      return "Inferred";
    case "direct":
      return "Direct";
  }
}

function resolveCoverageItemsForFinding(
  finding: ListingDiagnosticsFinding,
  coverageById: Map<string, ListingDiagnosticsSourceCoverageItem>,
  verifiedFindingIds: Set<string>
): ListingDiagnosticsSourceCoverageItem[] {
  const coverageIds = resolveCoverageIdsForFinding(finding, verifiedFindingIds);

  return coverageIds
    .map((id) => coverageById.get(id))
    .filter(
      (item): item is ListingDiagnosticsSourceCoverageItem => item !== undefined
    )
    .sort((left, right) => right.confidence - left.confidence);
}

function resolveCoverageIdsForFinding(
  finding: ListingDiagnosticsFinding,
  verifiedFindingIds: Set<string>
): string[] {
  if (verifiedFindingIds.has(finding.id)) {
    if (finding.id.startsWith("catalog-")) {
      return ["sp-api-catalog"];
    }

    if (
      finding.rootCauseCategory === "restrictions" ||
      finding.id === "account-restrictions"
    ) {
      return ["sp-api-account-restrictions"];
    }

    return ["sp-api-account-listing"];
  }

  if (finding.id === "market-missing-benchmark") {
    return ["competitor-listings"];
  }

  if (finding.id === "review-missing-signal") {
    return ["target-negative-reviews", "target-positive-reviews"];
  }

  if (finding.inferred) {
    switch (finding.dimensionId) {
      case "listing-health":
        return ["target-listing", "target-keywords", "competitor-listings"];
      case "keyword-opportunity":
        return ["competitor-keywords"];
      case "review-signal":
        return ["competitor-reviews"];
      case "market-position":
        return ["derived-benchmark", "competitor-listings"];
      default:
        break;
    }
  }

  return FINDING_DIMENSION_SOURCE_IDS[finding.dimensionId] ?? [];
}

function resolveEvidenceSourceLabel(
  relatedCoverageItems: ListingDiagnosticsSourceCoverageItem[],
  finding: ListingDiagnosticsFinding,
  verifiedFindingIds: Set<string>
): string {
  const primarySource = relatedCoverageItems[0]?.source;

  if (primarySource) {
    return primarySource;
  }

  if (verifiedFindingIds.has(finding.id)) {
    return "Amazon SP-API";
  }

  return finding.inferred ? "Derived benchmark" : "SellerSprite MCP";
}
