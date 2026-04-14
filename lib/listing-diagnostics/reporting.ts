import type {
  ListingDiagnosticsActionPlanItem,
  ListingDiagnosticsActionPriority,
  ListingDiagnosticsFinding,
  ListingDiagnosticsResult,
  ListingDiagnosticsSourceCoverageItem,
} from "@/lib/listing-diagnostics/types";

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
  "now",
  "next",
  "later",
];

const ACTION_PRIORITY_META: Record<
  ListingDiagnosticsActionPriority,
  Omit<ListingDiagnosticsActionPlanSection, "items">
> = {
  now: {
    id: "now",
    label: "Do now",
    description:
      "Highest-priority fixes and verified blockers that should be handled before deeper iteration.",
  },
  next: {
    id: "next",
    label: "Queue next",
    description:
      "High-leverage follow-up work once the immediate blockers are under control.",
  },
  later: {
    id: "later",
    label: "Monitor later",
    description:
      "Lower-pressure optimizations or watch items that can wait until the baseline stabilizes.",
  },
};

const FINDING_DIMENSION_SOURCE_IDS: Record<string, string[]> = {
  "content-coverage": ["target-listing"],
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
      verification: resolveEvidenceVerification(
        relatedCoverageItems,
        finding.inferred,
        verifiedFindingIds.has(finding.id)
      ),
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

    if (finding.id === "account-restrictions") {
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

function resolveEvidenceVerification(
  relatedCoverageItems: ListingDiagnosticsSourceCoverageItem[],
  inferred: boolean,
  isVerified: boolean
): ListingDiagnosticsEvidenceRow["verification"] {
  if (isVerified || relatedCoverageItems.some((item) => item.source === "Amazon SP-API")) {
    return "verified";
  }

  if (inferred || relatedCoverageItems.some((item) => item.inferred)) {
    return "inferred";
  }

  return "direct";
}

function getVerificationRank(
  verification: ListingDiagnosticsEvidenceRow["verification"]
): number {
  switch (verification) {
    case "verified":
      return 0;
    case "direct":
      return 1;
    case "inferred":
      return 2;
  }
}
