import { contentCoverageRule } from "@/lib/listing-diagnostics/rules/content-coverage";
import { keywordOpportunityRule } from "@/lib/listing-diagnostics/rules/keyword-opportunity";
import { listingHealthRule } from "@/lib/listing-diagnostics/rules/listing-health";
import { marketPositionRule } from "@/lib/listing-diagnostics/rules/market-position";
import { reviewSignalRule } from "@/lib/listing-diagnostics/rules/review-signal";
import type { ListingDiagnosticsRule } from "@/lib/listing-diagnostics/types";

export const listingDiagnosticsRules: ListingDiagnosticsRule[] = [
  listingHealthRule,
  contentCoverageRule,
  keywordOpportunityRule,
  reviewSignalRule,
  marketPositionRule,
];
