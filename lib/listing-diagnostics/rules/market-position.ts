import type {
  ListingDiagnosticsRule,
  ListingDiagnosticsRuleContext,
} from "@/lib/listing-diagnostics/types";
import {
  clamp,
  createAction,
  createFinding,
  hasMeaningfulListingSnapshot,
  safeDivide,
} from "@/lib/listing-diagnostics/rules/shared";

export const marketPositionRule: ListingDiagnosticsRule = {
  id: "market-position",
  label: "Market position",
  weight: 0.2,
  run(context: ListingDiagnosticsRuleContext) {
    const competitorListingCoverage = context.coverageById["competitor-listings"];
    const targetListingCoverage = context.coverageById["target-listing"];
    const targetListing = context.target.listing;
    const competitorCount = context.benchmark.competitorCount;
    const findings = [];
    const actions = [];

    if (!hasMeaningfulListingSnapshot(targetListing) || competitorCount === 0) {
      const inferred = competitorCount === 0;
      const confidence = inferred
        ? competitorListingCoverage?.confidence ?? 0
        : targetListingCoverage?.confidence ?? 0;

      return {
        dimension: {
          id: this.id,
          label: this.label,
          score: 56,
          weight: this.weight,
          summary:
            competitorCount === 0
              ? "No competitor ASINs were supplied with usable listing data, so benchmark signals are directional only."
              : "Target listing data is too thin to compare against the competitor pack reliably.",
          confidence,
          coverage:
            competitorCount === 0
              ? competitorListingCoverage?.status ?? "missing"
              : targetListingCoverage?.status ?? "missing",
          inferred,
        },
        findings:
          competitorCount === 0
            ? [
                createFinding({
                  id: "market-missing-benchmark",
                  title: "Competitor benchmark is missing",
                  description:
                    "Market position scoring needs at least one usable competitor snapshot to compare price, rating, and review depth.",
                  severity: "medium",
                  tone: "info",
                  dimensionId: this.id,
                  impactType: "conversion",
                  priority: "P2",
                  confidence,
                  inferred: true,
                  symptom:
                    "The ASIN is being evaluated without a real competitor pack for context.",
                  rootCause:
                    "Pricing and proof signals cannot be ranked confidently until at least one usable competitor baseline exists.",
                  rootCauseCategory: "listing-status",
                  whatToChange:
                    "Add 2-3 comparable competitor ASINs so pricing and trust gaps can be prioritized against the market.",
                  whereToChange:
                    "Diagnostics competitor input set",
                  expectedImpact:
                    "Should improve the quality of business-impact sorting for market-facing actions.",
                  evidence: [competitorListingCoverage?.detail ?? "No competitor listings available."],
                }),
              ]
            : [],
        actions:
          competitorCount === 0
            ? [
                createAction({
                  id: "market-add-benchmark",
                  title: "Add competitor ASINs to sharpen the benchmark",
                  description:
                    "Phase 1 does not need SP-API, but it still benefits from 2-3 competitor ASINs so pricing and proof gaps can be ranked instead of guessed.",
                  priority: "P2",
                  confidence,
                  inferred: true,
                  symptom:
                    "Pricing and proof decisions are being made without a reliable pack comparison.",
                  rootCause:
                    "The benchmark set is too thin to rank market-facing actions with confidence.",
                  action:
                    "Add 2-3 comparable competitor ASINs and rerun the analysis.",
                  whereToChange:
                    "Diagnostics competitor ASIN inputs",
                  expectedImpact:
                    "Should make price, proof, and positioning recommendations more decision-grade.",
                  linkedFindingIds: ["market-missing-benchmark"],
                }),
              ]
            : [],
      };
    }

    const averagePrice = context.benchmark.averagePrice;
    const averageRating = context.benchmark.averageRating;
    const averageReviews = context.benchmark.averageReviews;
    const targetPrice = targetListing?.price ?? 0;
    const targetRating = targetListing?.rating ?? 0;
    const targetReviews = targetListing?.reviews ?? 0;

    let score = 68;

    const priceDelta =
      averagePrice && targetPrice > 0
        ? safeDivide(targetPrice - averagePrice, averagePrice)
        : null;
    const ratingDelta =
      averageRating !== null && targetRating > 0 ? targetRating - averageRating : null;
    const reviewDelta =
      averageReviews && targetReviews > 0
        ? safeDivide(targetReviews - averageReviews, averageReviews)
        : null;

    if (priceDelta !== null) {
      if (priceDelta <= -0.08) {
        score += 8;
      } else if (priceDelta <= 0.08) {
        score += 4;
      } else {
        score -= 10;
      }
    }

    if (ratingDelta !== null) {
      if (ratingDelta >= 0.12) {
        score += 12;
      } else if (ratingDelta >= -0.1) {
        score += 4;
      } else {
        score -= 14;
      }
    }

    if (reviewDelta !== null) {
      if (reviewDelta >= 0) {
        score += 8;
      } else if (reviewDelta >= -0.4) {
        score += 2;
      } else {
        score -= 10;
      }
    }

    if (
      priceDelta !== null &&
      ratingDelta !== null &&
      priceDelta > 0.1 &&
      ratingDelta <= 0
    ) {
      findings.push(
        createFinding({
          id: "market-overpriced",
          title: "Price sits above the pack without stronger proof",
          description:
            "The listing is priced above the competitor average, but rating strength is not offsetting that premium yet.",
          severity: "high",
          dimensionId: this.id,
          impactType: "conversion",
          priority: "P0",
          confidence: competitorListingCoverage.confidence,
          symptom:
            "The ASIN is priced above the benchmark without enough trust or proof to justify the premium.",
          rootCause:
            "Pricing is ahead of the category value envelope, so shoppers have to overcome extra friction before converting.",
          rootCauseCategory: "pricing",
          whatToChange:
            "Either tighten price/coupon strategy or make the premium proof impossible to miss above the fold.",
          whereToChange:
            "Seller Central > Pricing plus PDP hero proof and bullets",
          expectedImpact:
            "Should reduce conversion friction and improve price competitiveness against the pack.",
          evidence: [
            `Price delta vs benchmark: ${(priceDelta * 100).toFixed(0)}%.`,
            `Rating delta vs benchmark: ${ratingDelta.toFixed(2)} stars.`,
          ],
        })
      );
      actions.push(
        createAction({
          id: "market-price-proof",
          title: "Either defend the premium or tighten the offer",
          description:
            "Add clearer proof around material, outcome, or bundle value, or consider a tighter entry offer if the listing cannot justify the premium visually.",
          priority: "P0",
          confidence: competitorListingCoverage.confidence,
          symptom:
            "The premium is being asked before the listing earns it.",
          rootCause:
            "Offer economics and visible proof are currently out of balance.",
          action:
            "Reprice, add coupon support, or rewrite the above-the-fold value proof to justify the premium.",
          whereToChange:
            "Seller Central > Pricing plus title, bullets, and hero gallery",
          expectedImpact:
            "Should improve conversion efficiency and reduce premium-driven drop-off.",
          linkedFindingIds: ["market-overpriced"],
        })
      );
    }

    if (ratingDelta !== null && ratingDelta < -0.15) {
      findings.push(
        createFinding({
          id: "market-rating-gap",
          title: "Rating trails the comparison set",
          description:
            "The current star rating is softer than the competitor pack, which raises conversion friction when shoppers compare listings side by side.",
          severity: "high",
          dimensionId: this.id,
          impactType: "conversion",
          priority: "P0",
          confidence: competitorListingCoverage.confidence,
          symptom:
            "The ASIN enters side-by-side comparisons with weaker social proof quality than the pack.",
          rootCause:
            "Shoppers are seeing softer trust signals before purchase, which makes each visit harder to convert.",
          rootCauseCategory: "offer",
          whatToChange:
            "Use stronger expectation-setting, FAQs, and proof to reduce the objections behind the weaker rating.",
          whereToChange:
            "Bullets, gallery proof, A+ content, offer messaging, and post-click reassurance",
          expectedImpact:
            "Should reduce conversion drag caused by trust and expectation gaps.",
          evidence: [`Rating delta vs benchmark: ${ratingDelta.toFixed(2)} stars.`],
        })
      );
    }

    if (reviewDelta !== null && reviewDelta < -0.5) {
      findings.push(
        createFinding({
          id: "market-proof-gap",
          title: "Social proof depth trails the pack",
          description:
            "The review base is materially smaller than the competitor average, so proof and trust need extra help from copy and gallery structure.",
          severity: "medium",
          dimensionId: this.id,
          impactType: "conversion",
          priority: "P1",
          confidence: competitorListingCoverage.confidence,
          symptom:
            "The ASIN has less review depth than the benchmark, so trust is easier to lose mid-funnel.",
          rootCause:
            "Shoppers are relying on a thinner proof base, which makes merchandising quality more important than usual.",
          rootCauseCategory: "offer",
          whatToChange:
            "Front-load guarantees, outcomes, FAQs, and proof cues that compensate for the lighter review base.",
          whereToChange:
            "Hero gallery, bullets, A+ modules, and trust-focused content blocks",
          expectedImpact:
            "Should offset weaker proof depth and improve conversion resilience.",
          evidence: [
            `Review count delta vs benchmark: ${(reviewDelta * 100).toFixed(0)}%.`,
          ],
        })
      );
      actions.push(
        createAction({
          id: "market-amplify-proof",
          title: "Use merchandising to compensate for lighter proof depth",
          description:
            "Front-load trust signals, guarantees, outcomes, and FAQs in the gallery and bullets so shoppers do not rely on review count alone.",
          priority: "P1",
          confidence: competitorListingCoverage.confidence,
          symptom:
            "Shoppers have fewer reviews to lean on than they do on competing listings.",
          rootCause:
            "The listing needs to manufacture more explicit trust because the proof base is lighter than the market average.",
          action:
            "Push guarantees, FAQs, outcomes, and trust cues earlier in the PDP experience.",
          whereToChange:
            "Hero gallery, bullets, A+ modules, and trust-focused merchandising",
          expectedImpact:
            "Should reduce trust loss when review depth lags behind the benchmark.",
          linkedFindingIds: ["market-proof-gap"],
        })
      );
    }

    return {
      dimension: {
        id: this.id,
        label: this.label,
        score: clamp(Math.round(score), 42, 96),
        weight: this.weight,
        summary: `Benchmark is based on ${competitorCount} competitor listings with average price ${
          averagePrice !== null ? `$${averagePrice.toFixed(2)}` : "n/a"
        }.`,
        confidence: competitorListingCoverage.confidence,
        coverage: competitorListingCoverage.status,
        inferred: competitorListingCoverage.status !== "covered",
      },
      findings,
      actions,
    };
  },
};
