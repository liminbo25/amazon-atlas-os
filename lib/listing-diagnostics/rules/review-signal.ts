import type {
  ListingDiagnosticsRule,
  ListingDiagnosticsRuleContext,
} from "@/lib/listing-diagnostics/types";
import {
  clamp,
  createAction,
  createFinding,
  extractReviewThemes,
  safeDivide,
} from "@/lib/listing-diagnostics/rules/shared";

export const reviewSignalRule: ListingDiagnosticsRule = {
  id: "review-signal",
  label: "Review signal",
  weight: 0.25,
  run(context: ListingDiagnosticsRuleContext) {
    const negativeCoverage = context.coverageById["target-negative-reviews"];
    const positiveCoverage = context.coverageById["target-positive-reviews"];
    const competitorReviewCoverage = context.coverageById["competitor-reviews"];

    let negativeReviews = context.target.negativeReviews;
    let positiveReviews = context.target.positiveReviews;
    let inferred = false;

    if (negativeReviews.length + positiveReviews.length === 0) {
      negativeReviews = context.competitors.flatMap(
        (competitor) => competitor.negativeReviews
      );
      positiveReviews = context.competitors.flatMap(
        (competitor) => competitor.positiveReviews
      );
      inferred = negativeReviews.length + positiveReviews.length > 0;
    }

    const findings = [];
    const actions = [];
    const reviewThemes = extractReviewThemes(negativeReviews, inferred, 3);
    const totalReviews = negativeReviews.length + positiveReviews.length;

    if (totalReviews === 0) {
      return {
        dimension: {
          id: this.id,
          label: this.label,
          score: 52,
          weight: this.weight,
          summary:
            "Neither the target ASIN nor the competitor set returned usable review coverage for Phase 1 diagnostics.",
          confidence: 0,
          coverage: "missing",
          inferred: false,
        },
        findings: [
          createFinding({
            id: "review-missing-signal",
            title: "VOC signal is missing",
            description:
              "Without review data, the rule engine cannot verify recurring complaints, positive proof points, or rating pressure.",
            severity: "medium",
            tone: "info",
            dimensionId: this.id,
            impactType: "conversion",
            priority: "P2",
            confidence: 0,
            symptom:
              "The run does not have enough review coverage to verify shopper friction or proof themes.",
            rootCause:
              "SellerSprite did not return usable target or competitor review data, so conversion recommendations are directional only.",
            rootCauseCategory: "listing-status",
            whatToChange:
              "Refresh review coverage before relying on VOC-driven conversion decisions.",
            whereToChange:
              "SellerSprite review coverage and follow-on PDP messaging work",
            expectedImpact:
              "Should improve confidence that conversion recommendations address real shopper objections.",
            evidence: [
              negativeCoverage?.detail ?? "No negative review coverage.",
              positiveCoverage?.detail ?? "No positive review coverage.",
            ],
          }),
        ],
        actions: [
          createAction({
            id: "review-refresh-signal",
            title: "Re-run once review coverage is available",
            description:
              "Phase 1 can score without SP-API, but SellerSprite still needs to return at least a baseline set of reviews for VOC findings to be actionable.",
            priority: "P2",
            confidence: 0,
            symptom:
              "VOC-driven remediation is weak until direct review evidence is available.",
            rootCause:
              "The current run is missing the customer language needed to prioritize objections with confidence.",
            action:
              "Refresh the review source before making major copy or image changes based on VOC.",
            whereToChange:
              "SellerSprite review coverage before PDP copy iteration",
            expectedImpact:
              "Should make conversion recommendations materially more reliable.",
            linkedFindingIds: ["review-missing-signal"],
          }),
        ],
      };
    }

    const targetRating = context.target.listing?.rating ?? 0;
    const positiveShare = safeDivide(positiveReviews.length, totalReviews);
    let score = 62;

    if (targetRating >= 4.4) {
      score += 14;
    } else if (targetRating >= 4.2) {
      score += 8;
    } else if (targetRating >= 4.0) {
      score += 2;
    } else if (targetRating > 0) {
      score -= 16;
    }

    if (positiveShare >= 0.78) {
      score += 12;
    } else if (positiveShare >= 0.68) {
      score += 6;
    } else if (positiveShare < 0.55) {
      score -= 16;
    }

    if (reviewThemes[0] && reviewThemes[0].share >= 0.3) {
      score -= 10;
    }

    if (inferred) {
      score = Math.min(score, 74);
      findings.push(
        createFinding({
          id: "review-proxy-basis",
          title: "Review diagnosis uses competitor proxy themes",
          description:
            "The target ASIN returned no direct reviews, so recurring complaint themes come from competitor review clusters instead.",
          severity: "medium",
          tone: "info",
          dimensionId: this.id,
          impactType: "conversion",
          priority: "P2",
          confidence: competitorReviewCoverage.confidence,
          inferred: true,
          symptom:
            "The current VOC themes are coming from competitor reviews instead of the target ASIN.",
          rootCause:
            "Target review coverage is missing, so conversion guidance has to lean on adjacent-category complaints.",
          rootCauseCategory: "listing-status",
          whatToChange:
            "Validate the target review base before rewriting the PDP around competitor complaint themes.",
          whereToChange:
            "SellerSprite target review source and PDP messaging surfaces",
          expectedImpact:
            "Should reduce the risk of solving the wrong objection set.",
          evidence: [competitorReviewCoverage.detail],
        })
      );
    }

    if (positiveShare < 0.65) {
      findings.push(
        createFinding({
          id: "review-mixed-sentiment",
          title: "Sentiment mix is weaker than healthy category leaders",
          description:
            "The current positive-to-negative split suggests more friction than a strong listing should carry into a conversion click.",
          severity: positiveShare < 0.55 ? "high" : "medium",
          dimensionId: this.id,
          impactType: "conversion",
          priority: positiveShare < 0.55 ? "P0" : "P1",
          confidence: inferred
            ? competitorReviewCoverage.confidence * 0.78
            : Math.max(negativeCoverage.confidence, positiveCoverage.confidence),
          inferred,
          symptom:
            "The positive-to-negative review mix is softer than a healthy conversion baseline.",
          rootCause:
            "Shoppers are experiencing enough friction post-click that sentiment quality is becoming a measurable conversion drag.",
          rootCauseCategory: "offer",
          whatToChange:
            "Use copy, gallery proof, FAQs, and offer framing to pre-handle the most repeated objections.",
          whereToChange:
            "PDP bullets, images, A+ content, and post-click expectation-setting surfaces",
          expectedImpact:
            "Should reduce objection-driven conversion drop-off on the PDP.",
          evidence: [
            `Positive review share: ${(positiveShare * 100).toFixed(0)}%.`,
            `Negative reviews inspected: ${negativeReviews.length}.`,
          ],
        })
      );
    }

    if (reviewThemes[0]) {
      findings.push(
        createFinding({
          id: `review-theme-${reviewThemes[0].id}`,
          title: `Complaint theme: ${reviewThemes[0].label}`,
          description:
            "This theme appears often enough in the review set to justify explicit mitigation in copy, imagery, or offer framing.",
          severity: reviewThemes[0].share >= 0.3 ? "high" : "medium",
          dimensionId: this.id,
          impactType: "conversion",
          priority: reviewThemes[0].share >= 0.3 ? "P0" : "P1",
          confidence: inferred
            ? competitorReviewCoverage.confidence * 0.78
            : negativeCoverage.confidence,
          inferred,
          symptom:
            "A repeated complaint theme is strong enough to affect conversion quality.",
          rootCause:
            "The PDP or offer is not setting expectations clearly enough around this shopper concern.",
          rootCauseCategory: "offer",
          whatToChange:
            "Answer this complaint theme directly in copy, imagery, and expectation-setting messaging.",
          whereToChange:
            "Bullets, gallery callouts, A+ modules, FAQs, and offer messaging",
          expectedImpact:
            "Should reduce objection-driven hesitation for one of the biggest repeat complaints.",
          evidence: [
            `${reviewThemes[0].mentions} mentions in the inspected negative reviews.`,
            ...reviewThemes[0].keywords.map((keyword) => `Signal keyword: ${keyword}`),
          ],
        })
      );
      actions.push(
        createAction({
          id: `review-action-${reviewThemes[0].id}`,
          title: `Address ${reviewThemes[0].label.toLowerCase()} in copy and imagery`,
          description:
            "Add a proof point, usage note, or image callout that directly answers the most repeated review complaint before the customer needs to infer it.",
          priority: "P0",
          confidence: inferred
            ? competitorReviewCoverage.confidence * 0.78
            : negativeCoverage.confidence,
          inferred,
          symptom:
            "A concentrated review complaint is likely depressing conversion and trust.",
          rootCause:
            "The PDP is not proactively answering the theme shoppers are repeatedly complaining about.",
          action:
            "Add a direct counter-proof, usage note, or gallery callout for the dominant complaint theme.",
          whereToChange:
            "Bullets, hero gallery, A+ content, and FAQs",
          expectedImpact:
            "Should improve conversion by resolving a repeated shopper objection earlier in the journey.",
          linkedFindingIds: [`review-theme-${reviewThemes[0].id}`],
        })
      );
    }

    if (targetRating > 0 && targetRating < 4.1) {
      actions.push(
        createAction({
          id: "review-rating-recovery",
          title: "Use copy to pre-handle the objections behind the lower star rating",
          description:
            "The rating is soft enough that the title, bullets, and gallery should reduce expectation gaps and clarify how the product should be used.",
          priority: "P1",
          confidence: inferred
            ? competitorReviewCoverage.confidence * 0.78
            : Math.max(negativeCoverage.confidence, positiveCoverage.confidence),
          inferred,
          symptom:
            "The star rating is low enough that expectation gaps are likely hurting conversion.",
          rootCause:
            "Current merchandising is not preventing the main post-purchase objections from forming.",
          action:
            "Rewrite the PDP to pre-handle the objections behind the softer star rating.",
          whereToChange:
            "Title, bullets, gallery captions, FAQs, and A+ proof",
          expectedImpact:
            "Should improve conversion quality and reduce repeat objection-driven dissatisfaction.",
          linkedFindingIds: ["review-mixed-sentiment"],
        })
      );
    }

    return {
      dimension: {
        id: this.id,
        label: this.label,
        score: clamp(Math.round(score), 38, 96),
        weight: this.weight,
        summary: `Review signal is based on ${totalReviews} inspected reviews with ${(positiveShare * 100).toFixed(0)}% positive share.`,
        confidence: inferred
          ? competitorReviewCoverage.confidence * 0.78
          : Math.max(negativeCoverage.confidence, positiveCoverage.confidence),
        coverage: inferred
          ? competitorReviewCoverage.status
          : negativeCoverage.status === "covered" || positiveCoverage.status === "covered"
            ? "covered"
            : "partial",
        inferred,
      },
      findings,
      actions,
    };
  },
};
