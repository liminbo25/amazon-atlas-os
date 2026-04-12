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
} from "@/lib/listing-diagnostics/rules/shared";

export const contentCoverageRule: ListingDiagnosticsRule = {
  id: "content-coverage",
  label: "Content coverage",
  weight: 0.3,
  run(context: ListingDiagnosticsRuleContext) {
    const listing = context.target.listing;
    const listingCoverage = context.coverageById["target-listing"];
    const findings = [];
    const actions = [];

    if (!hasMeaningfulListingSnapshot(listing)) {
      return {
        dimension: {
          id: this.id,
          label: this.label,
          score: 50,
          weight: this.weight,
          summary:
            "SellerSprite did not return enough direct listing copy data to score structure confidently.",
          confidence: listingCoverage?.confidence ?? 0,
          coverage: "missing",
          inferred: false,
        },
        findings: [
          createFinding({
            id: "content-missing-snapshot",
            title: "Target listing snapshot is missing",
            description:
              "The target ASIN returned little or no title and bullet copy, so structural checks are limited until SellerSprite coverage improves.",
            severity: "medium",
            tone: "info",
            dimensionId: this.id,
            confidence: listingCoverage?.confidence ?? 0,
            evidence: [listingCoverage?.detail ?? "No direct listing snapshot available."],
          }),
        ],
        actions: [
          createAction({
            id: "content-refresh-snapshot",
            title: "Re-run with a valid target ASIN snapshot",
            description:
              "Confirm the target ASIN resolves cleanly in SellerSprite so the rule engine can inspect title length, bullet depth, and image coverage directly.",
            priority: "now",
            confidence: listingCoverage?.confidence ?? 0,
            linkedFindingIds: ["content-missing-snapshot"],
          }),
        ],
      };
    }

    const bulletPoints = listing?.bulletPoints.filter((point) => point.trim()) ?? [];
    const titleLength = listing?.title.trim().length ?? 0;
    const bulletCount = bulletPoints.length;
    const averageBulletLength = average(
      bulletPoints.map((point) => point.trim().length)
    );

    let score = 82;

    if (titleLength < 120) {
      score -= 18;
      findings.push(
        createFinding({
          id: "content-short-title",
          title: "Title is short for a search-driven listing",
          description:
            "The current title leaves little room for high-intent modifiers and differentiation cues.",
          severity: "high",
          dimensionId: this.id,
          confidence: listingCoverage.confidence,
          evidence: [`Title length: ${titleLength} characters.`],
        })
      );
      actions.push(
        createAction({
          id: "content-expand-title",
          title: "Rebuild the title around the primary demand term",
          description:
            "Stretch the title into the 120-180 character range and add the top use case, material, or audience qualifiers that competitors lean on.",
          priority: "now",
          confidence: listingCoverage.confidence,
          linkedFindingIds: ["content-short-title"],
        })
      );
    } else if (titleLength > 200) {
      score -= 10;
      findings.push(
        createFinding({
          id: "content-long-title",
          title: "Title may be overloaded",
          description:
            "The title is long enough that readability and scan speed may suffer on search and mobile surfaces.",
          severity: "medium",
          dimensionId: this.id,
          confidence: listingCoverage.confidence,
          evidence: [`Title length: ${titleLength} characters.`],
        })
      );
    } else {
      score += 4;
    }

    if (bulletCount < 5) {
      score -= (5 - bulletCount) * 8;
      findings.push(
        createFinding({
          id: "content-bullet-count",
          title: "Bullet stack is thin",
          description:
            "The listing is not using the full five-bullet surface, which limits feature coverage and keyword depth.",
          severity: bulletCount <= 3 ? "high" : "medium",
          dimensionId: this.id,
          confidence: listingCoverage.confidence,
          evidence: [`Visible bullets: ${bulletCount} / 5.`],
        })
      );
      actions.push(
        createAction({
          id: "content-complete-bullets",
          title: "Fill all five bullets with distinct value claims",
          description:
            "Use one bullet each for the core use case, differentiator, material or build detail, fit or sizing note, and trust signal.",
          priority: "now",
          confidence: listingCoverage.confidence,
          linkedFindingIds: ["content-bullet-count"],
        })
      );
    }

    if ((averageBulletLength ?? 0) < 55) {
      score -= 10;
      findings.push(
        createFinding({
          id: "content-thin-bullets",
          title: "Bullets are not carrying enough detail",
          description:
            "Short bullets often miss use-case language, proof points, and objection handling that help conversion.",
          severity: "medium",
          dimensionId: this.id,
          confidence: listingCoverage.confidence,
          evidence: [
            `Average bullet length: ${Math.round(averageBulletLength ?? 0)} characters.`,
          ],
        })
      );
      actions.push(
        createAction({
          id: "content-deepen-bullets",
          title: "Add proof, audience fit, and objection handling inside bullets",
          description:
            "Rewrite short bullets into fuller statements that explain why the feature matters and which customer concern it resolves.",
          priority: "next",
          confidence: listingCoverage.confidence,
          linkedFindingIds: ["content-thin-bullets"],
        })
      );
    }

    if (!listing?.mainImage.trim()) {
      score -= 6;
      findings.push(
        createFinding({
          id: "content-missing-hero-image",
          title: "Main image signal is missing",
          description:
            "The snapshot did not return a primary image, which makes visual merchandising harder to evaluate in Phase 1.",
          severity: "low",
          tone: "info",
          dimensionId: this.id,
          confidence: listingCoverage.confidence,
          evidence: ["No main image URL in the SellerSprite snapshot."],
        })
      );
    }

    if ((listing?.reviews ?? 0) >= 250) {
      score += 4;
    }

    return {
      dimension: {
        id: this.id,
        label: this.label,
        score: clamp(Math.round(score), 35, 98),
        weight: this.weight,
        summary: `Title length is ${titleLength} characters with ${bulletCount} populated bullets.`,
        confidence: listingCoverage.confidence,
        coverage: listingCoverage.status,
        inferred: false,
      },
      findings,
      actions,
    };
  },
};
