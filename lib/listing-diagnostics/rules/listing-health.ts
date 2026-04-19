import type {
  ListingDiagnosticsRule,
  ListingDiagnosticsRuleContext,
} from "@/lib/listing-diagnostics/types";
import {
  average,
  clamp,
  createAction,
  createFinding,
  hasMeaningfulListingSnapshot,
  safeDivide,
} from "@/lib/listing-diagnostics/rules/shared";

const ATTRIBUTE_KEYS = [
  "brand",
  "dimensions",
  "fabricType",
  "origin",
  "closureType",
  "fulfillment",
  "hasAPlus",
  "hasVideo",
];

export const listingHealthRule: ListingDiagnosticsRule = {
  id: "listing-health",
  label: "Buyability & discoverability",
  weight: 0.24,
  run(context: ListingDiagnosticsRuleContext) {
    const targetListingSnapshot = context.target.listing;
    const listingCoverage = context.coverageById["target-listing"];
    const targetKeywordCoverage = context.coverageById["target-keywords"];
    const competitorKeywordCoverage = context.coverageById["competitor-keywords"];
    const competitorListingCoverage = context.coverageById["competitor-listings"];

    if (
      !targetListingSnapshot ||
      !hasMeaningfulListingSnapshot(targetListingSnapshot)
    ) {
      return {
        dimension: {
          id: this.id,
          label: this.label,
          score: 52,
          weight: this.weight,
          summary:
            "The target listing snapshot is too thin to infer operational listing health confidently.",
          confidence: listingCoverage?.confidence ?? 0,
          coverage: listingCoverage?.status ?? "missing",
          inferred: false,
        },
        findings: [],
        actions: [],
      };
    }

    const targetListing = targetListingSnapshot;

    const findings = [];
    const actions = [];
    const bulletCount = targetListing.bulletPoints.filter((point) => point.trim()).length;
    const titleLength = targetListing.title.trim().length;
    const attributeCoverageCount = ATTRIBUTE_KEYS.filter((key) =>
      targetListing.attributes[key]?.trim()
    ).length;
    const mainImagePresent = Boolean(targetListing.mainImage.trim());
    const variationCount = Number.parseInt(
      targetListing.attributes.variationCount ?? "0",
      10
    );
    const averagePrice = context.benchmark.averagePrice;
    const averageRating = context.benchmark.averageRating;
    const competitorAverageMonthlySales = average(
      context.competitors
        .map((competitor) => competitor.listing?.monthlySales ?? 0)
        .filter((value) => value > 0)
    );
    const priceDelta =
      averagePrice && targetListing.price > 0
        ? safeDivide(targetListing.price - averagePrice, averagePrice)
        : null;
    const ratingDelta =
      averageRating !== null && targetListing.rating > 0
        ? targetListing.rating - averageRating
        : null;
    const monthlySalesDelta =
      competitorAverageMonthlySales && targetListing.monthlySales > 0
        ? safeDivide(
            targetListing.monthlySales - competitorAverageMonthlySales,
            competitorAverageMonthlySales
          )
        : null;

    let score = 74;

    const missingContentSignals = [
      bulletCount < 5,
      titleLength < 120,
      attributeCoverageCount < 4,
      !mainImagePresent,
    ].filter(Boolean).length;

    if (missingContentSignals >= 2) {
      score -= 16;
      findings.push(
        createFinding({
          id: "health-missing-attributes",
          title: "Discoverability is exposed by thin catalog coverage",
          description:
            "The listing snapshot is missing enough title, bullet, attribute, or image coverage that Amazon may not have a complete surface to index and merchandise.",
          severity: missingContentSignals >= 3 ? "high" : "medium",
          dimensionId: this.id,
          impactType: "visibility",
          priority: "P1",
          confidence: listingCoverage?.confidence ?? 0,
          symptom:
            "Title, bullet, attribute, and gallery coverage are too thin for a stable discoverability baseline.",
          rootCause:
            "The ASIN appears under-specified in customer-facing copy or critical attributes, which often weakens indexing breadth and retail-surface quality.",
          rootCauseCategory: "missing-attributes",
          whatToChange:
            "Fill missing title context, complete all five bullets, and publish the core brand/material/fit attributes plus a complete image set.",
          whereToChange:
            "Seller Central > Edit listing > Vital Info / More Details / title / bullets / images",
          expectedImpact:
            "Should improve indexable relevance coverage and make click-through performance easier to recover.",
          evidence: [
            `Title length: ${titleLength} characters.`,
            `Bullets populated: ${bulletCount} / 5.`,
            `Structured attributes filled: ${attributeCoverageCount} / ${ATTRIBUTE_KEYS.length}.`,
            mainImagePresent
              ? "Main image present."
              : "SellerSprite did not return a main image signal.",
          ],
        })
      );
      actions.push(
        createAction({
          id: "health-complete-attributes",
          title: "Complete the indexed listing surfaces before judging traffic quality",
          description:
            "Fix the missing title, bullet, attribute, and image coverage so Amazon can index and merchandise the ASIN from a complete record.",
          priority: "P1",
          confidence: listingCoverage?.confidence ?? 0,
          symptom:
            "The listing is too thin to tell whether demand is the problem or the catalog record itself is limiting discovery.",
          rootCause:
            "Missing catalog fields and shallow content often suppress discoverability long before pricing or conversion tests matter.",
          action:
            "Publish the missing attributes and expand the customer-facing copy surfaces.",
          whereToChange:
            "Seller Central > Edit listing > title / bullets / attributes / images",
          expectedImpact:
            "Should lift discoverability and reduce false negatives in downstream keyword diagnosis.",
          linkedFindingIds: ["health-missing-attributes"],
        })
      );
    }

    if (context.target.keywords.length === 0 && context.benchmark.topKeywords.length > 0) {
      score -= 12;
      findings.push(
        createFinding({
          id: "health-discoverability-blindspot",
          title: "Target ASIN has no direct keyword footprint while competitors do",
          description:
            "The target ASIN did not return direct traffic keywords even though competitor demand signals are present, which often points to suppressed visibility or under-indexed content.",
          severity: "high",
          dimensionId: this.id,
          impactType: "visibility",
          priority: "P1",
          confidence:
            Math.max(
              targetKeywordCoverage?.confidence ?? 0,
              competitorKeywordCoverage?.confidence ?? 0
            ) * 0.82,
          inferred: true,
          symptom:
            "Competitors show active search demand, but the target ASIN has no direct keyword footprint in the diagnostic feed.",
          rootCause:
            "The listing may be search-suppressed, under-indexed, or still missing the attribute coverage required to surface on relevant queries.",
          rootCauseCategory: "listing-status",
          whatToChange:
            "Check Search Suppressed and Listing Quality dashboards, then confirm indexed copy/attributes for the top benchmark queries.",
          whereToChange:
            "Seller Central > Listing Quality Dashboard / Search Suppressed / title / bullets / backend keywords",
          expectedImpact:
            "Should restore discoverability if the hidden issue is listing health rather than demand.",
          evidence: [
            targetKeywordCoverage?.detail ??
              "Target keyword coverage is missing for the current ASIN.",
            competitorKeywordCoverage?.detail ??
              "Competitor keyword coverage is available for this benchmark set.",
          ],
        })
      );
      actions.push(
        createAction({
          id: "health-check-listing-status",
          title: "Verify the ASIN is indexable before expanding keyword work",
          description:
            "Use Seller Central listing health surfaces to confirm the ASIN is discoverable, then align indexed copy to the benchmark demand terms.",
          priority: "P1",
          confidence:
            Math.max(
              targetKeywordCoverage?.confidence ?? 0,
              competitorKeywordCoverage?.confidence ?? 0
            ) * 0.82,
          inferred: true,
          symptom:
            "Keyword gap work will be noisy until you know whether the ASIN is actually visible.",
          rootCause:
            "Missing traffic footprint often means the listing status itself is the primary blocker, not just copy choice.",
          action:
            "Audit discoverability status and indexed content before rewriting for additional terms.",
          whereToChange:
            "Seller Central > Listing Quality Dashboard / Search Suppressed / Manage All Inventory",
          expectedImpact:
            "Should prevent wasted keyword work when the listing is being held back by status issues.",
          linkedFindingIds: ["health-discoverability-blindspot"],
        })
      );
    }

    if (
      priceDelta !== null &&
      priceDelta > 0.1 &&
      (ratingDelta === null || ratingDelta <= 0.05)
    ) {
      score -= 10;
      findings.push(
        createFinding({
          id: "health-pricing-pressure",
          title: "Offer is priced above the pack without stronger proof",
          description:
            "The target ASIN is carrying a price premium, but the trust signals in rating and benchmark strength are not clearly offsetting it.",
          severity: priceDelta > 0.18 ? "high" : "medium",
          dimensionId: this.id,
          impactType: "conversion",
          priority: priceDelta > 0.18 ? "P0" : "P1",
          confidence: competitorListingCoverage?.confidence ?? 0,
          symptom:
            "The listing is asking shoppers to pay more without a clear proof advantage.",
          rootCause:
            "Pricing has likely drifted above the category value envelope, so click and conversion pressure show up before deeper merchandising changes can work.",
          rootCauseCategory: "pricing",
          whatToChange:
            "Tighten the offer price, add coupon/value framing, or strengthen proof around why the premium is justified.",
          whereToChange:
            "Seller Central > Pricing / promotions plus PDP title, bullets, and image value proof",
          expectedImpact:
            "Should improve conversion efficiency and reduce price-driven friction against the benchmark set.",
          evidence: [
            `Price delta vs benchmark: ${(priceDelta * 100).toFixed(0)}%.`,
            `Rating delta vs benchmark: ${
              ratingDelta !== null ? ratingDelta.toFixed(2) : "n/a"
            } stars.`,
          ],
        })
      );
      actions.push(
        createAction({
          id: "health-reset-offer-value",
          title: "Reprice or strengthen the value story before deeper testing",
          description:
            "Close the value gap by adjusting price/coupon strategy or making the premium proof unavoidable in the first scroll.",
          priority: priceDelta > 0.18 ? "P0" : "P1",
          confidence: competitorListingCoverage?.confidence ?? 0,
          symptom:
            "A premium offer without stronger proof is likely dragging conversion and possibly retail competitiveness.",
          rootCause:
            "Price is currently doing more harm than the merchandising is offsetting.",
          action:
            "Review price, coupon, and above-the-fold proof together as one offer decision.",
          whereToChange:
            "Seller Central > Pricing / coupons and PDP hero content",
          expectedImpact:
            "Should recover conversion rate and reduce benchmark disadvantage on value perception.",
          linkedFindingIds: ["health-pricing-pressure"],
        })
      );
    }

    if (
      priceDelta !== null &&
      priceDelta > 0.12 &&
      (monthlySalesDelta === null || monthlySalesDelta < -0.3)
    ) {
      score -= 8;
      findings.push(
        createFinding({
          id: "health-buy-box-risk",
          title: "Offer competitiveness suggests possible Buy Box pressure",
          description:
            "SellerSprite cannot verify Buy Box ownership, but the premium price and softer sales velocity suggest the offer may not be winning the purchase path consistently.",
          severity: "medium",
          dimensionId: this.id,
          impactType: "buyability",
          priority: "P1",
          confidence: (competitorListingCoverage?.confidence ?? 0) * 0.72,
          inferred: true,
          symptom:
            "Sales velocity trails the pack while the offer is still priced above the benchmark.",
          rootCause:
            "Offer competitiveness may be too weak to retain Buy Box share, but SP-API or Seller Central offer diagnostics are needed to verify it.",
          rootCauseCategory: "buy-box",
          whatToChange:
            "Review landed price, shipping promise, fulfillment setup, and Buy Box eligibility before making more copy changes.",
          whereToChange:
            "Seller Central > Pricing / shipping template / fulfillment settings / Buy Box eligibility surfaces",
          expectedImpact:
            "Could restore buyability and unlock conversion if hidden offer pressure is limiting the retail path.",
          evidence: [
            `Price delta vs benchmark: ${(priceDelta * 100).toFixed(0)}%.`,
            `Monthly sales delta vs benchmark: ${
              monthlySalesDelta !== null
                ? `${(monthlySalesDelta * 100).toFixed(0)}%`
                : "n/a"
            }.`,
          ],
        })
      );
      actions.push(
        createAction({
          id: "health-verify-buy-box",
          title: "Verify Buy Box and offer competitiveness in Seller Central",
          description:
            "Use offer diagnostics to confirm whether price, fulfillment, or shipping settings are suppressing buyability.",
          priority: "P1",
          confidence: (competitorListingCoverage?.confidence ?? 0) * 0.72,
          inferred: true,
          symptom:
            "Buyability may be constrained by offer competitiveness rather than just content quality.",
          rootCause:
            "Price and sales velocity patterns are directionally consistent with Buy Box pressure, but the current path cannot verify it without Amazon data.",
          action:
            "Audit Buy Box eligibility and offer setup before running additional creative or keyword tests.",
          whereToChange:
            "Seller Central > Manage All Inventory / Pricing / fulfillment settings",
          expectedImpact:
            "Should confirm whether the real blocker is offer competitiveness and prevent mis-prioritized content work.",
          linkedFindingIds: ["health-buy-box-risk"],
        })
      );
    }

    if (variationCount > 1 && !hasVariationCue(targetListing.title)) {
      score -= 6;
      findings.push(
        createFinding({
          id: "health-variation-clarity",
          title: "Variation setup may not be obvious from the target listing signal",
          description:
            "The ASIN belongs to a variation family, but the visible title does not clearly communicate the child-specific variant context.",
          severity: "low",
          dimensionId: this.id,
          impactType: "click",
          priority: "P2",
          confidence: listingCoverage?.confidence ?? 0,
          inferred: true,
          symptom:
            "Variant shoppers may not immediately understand which child offer they are opening.",
          rootCause:
            "Variation labeling appears weak in the customer-facing copy, which can create click confusion across siblings.",
          rootCauseCategory: "variation-issues",
          whatToChange:
            "Clarify size/color/style cues in the child title and verify the variation theme and child attributes are populated correctly.",
          whereToChange:
            "Seller Central > Edit listing > Variations plus child title/attributes",
          expectedImpact:
            "Should reduce variant confusion and improve click quality for the intended child offer.",
          evidence: [
            `Variation count reported by SellerSprite: ${variationCount}.`,
            `Current title: ${targetListing.title || "n/a"}`,
          ],
        })
      );
    }

    return {
      dimension: {
        id: this.id,
        label: this.label,
        score: clamp(Math.round(score), 40, 95),
        weight: this.weight,
        summary: `Operational listing health was checked across content completeness, keyword footprint, pricing pressure, and offer competitiveness.`,
        confidence: Math.max(
          listingCoverage?.confidence ?? 0,
          targetKeywordCoverage?.confidence ?? 0,
          competitorListingCoverage?.confidence ?? 0
        ),
        coverage:
          listingCoverage?.status === "covered" ||
          targetKeywordCoverage?.status === "covered"
            ? "covered"
            : listingCoverage?.status ?? "partial",
        inferred: findings.some((finding) => finding.inferred),
      },
      findings,
      actions,
    };
  },
};

function hasVariationCue(title: string): boolean {
  return /\b(size|color|pack|count|style|set|inch|oz|ml)\b/i.test(title);
}
