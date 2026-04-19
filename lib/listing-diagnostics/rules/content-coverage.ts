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
                  impactType: "visibility",
                  priority: "P1",
                  confidence: listingCoverage?.confidence ?? 0,
                  symptom:
                    "The rule engine does not have enough direct listing copy to score the ASIN confidently.",
                  rootCause:
                    "SellerSprite did not return a usable content snapshot, so discoverability and click diagnostics are incomplete.",
                  rootCauseCategory: "listing-status",
                  whatToChange:
                    "Confirm the ASIN resolves cleanly and that the listing has a visible title, bullets, and gallery record.",
                  whereToChange:
                    "SellerSprite input plus Seller Central listing detail surfaces",
                  expectedImpact:
                    "Should restore the baseline content signal needed for deterministic diagnosis.",
                  evidence: [listingCoverage?.detail ?? "No direct listing snapshot available."],
                }),
              ],
              actions: [
                createAction({
            id: "content-refresh-snapshot",
            title: "Re-run with a valid target ASIN snapshot",
                  description:
                    "Confirm the target ASIN resolves cleanly in SellerSprite so the rule engine can inspect title length, bullet depth, and image coverage directly.",
                  priority: "P1",
                  confidence: listingCoverage?.confidence ?? 0,
                  symptom:
                    "Core listing content is missing from the current snapshot.",
                  rootCause:
                    "Without a usable ASIN snapshot, structural problems cannot be separated from data-collection gaps.",
                  action:
                    "Re-run the analysis after confirming the target ASIN resolves and exposes a full listing record.",
                  whereToChange:
                    "SellerSprite source availability and Seller Central listing detail pages",
                  expectedImpact:
                    "Should unlock direct content scoring and remove avoidable inferred gaps.",
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
          impactType: "visibility",
          priority: "P1",
          confidence: listingCoverage.confidence,
          symptom:
            "The title is not carrying enough indexed context for a competitive search result.",
          rootCause:
            "Key modifiers, audience qualifiers, or product differentiators are missing from the title surface.",
          rootCauseCategory: "missing-attributes",
          whatToChange:
            "Expand the title with the primary demand term plus the strongest use-case and product qualifiers.",
          whereToChange:
            "Seller Central > Edit listing > Product name/title",
          expectedImpact:
            "Should improve discoverability and clarify relevance on search result pages.",
          evidence: [`Title length: ${titleLength} characters.`],
        })
      );
      actions.push(
        createAction({
          id: "content-expand-title",
          title: "Rebuild the title around the primary demand term",
          description:
            "Stretch the title into the 120-180 character range and add the top use case, material, or audience qualifiers that competitors lean on.",
          priority: "P1",
          confidence: listingCoverage.confidence,
          symptom: "The current title is too thin to compete on search intent coverage.",
          rootCause:
            "The listing is under-using the most visible indexed field for demand capture.",
          action:
            "Rewrite the title around the primary keyword, audience, and product differentiators.",
          whereToChange: "Seller Central > Product name/title",
          expectedImpact:
            "Should improve indexing breadth and raise SERP click quality.",
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
          impactType: "click",
          priority: "P2",
          confidence: listingCoverage.confidence,
          symptom:
            "The title may be trying to carry too many ideas at once for quick retail scanning.",
          rootCause:
            "The title is likely over-packed with modifiers, which can reduce scan speed on search and mobile.",
          whatToChange:
            "Trim low-value filler terms and keep the title focused on the highest-converting qualifiers.",
          whereToChange: "Seller Central > Product name/title",
          expectedImpact:
            "Should improve readability and help the strongest value props stand out faster.",
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
          impactType: "click",
          priority: bulletCount <= 3 ? "P1" : "P2",
          confidence: listingCoverage.confidence,
          symptom:
            "The bullet stack is leaving too much feature and objection-handling space unused.",
          rootCause:
            "The listing is under-using one of the highest-leverage content surfaces for detail and reassurance.",
          rootCauseCategory: "missing-attributes",
          whatToChange:
            "Populate all five bullets with distinct use-case, material, fit, proof, and trust messages.",
          whereToChange: "Seller Central > Key Product Features / bullet points",
          expectedImpact:
            "Should improve click-to-conversion continuity by answering more shopper questions on first view.",
          evidence: [`Visible bullets: ${bulletCount} / 5.`],
        })
      );
      actions.push(
        createAction({
          id: "content-complete-bullets",
          title: "Fill all five bullets with distinct value claims",
          description:
            "Use one bullet each for the core use case, differentiator, material or build detail, fit or sizing note, and trust signal.",
          priority: "P1",
          confidence: listingCoverage.confidence,
          symptom: "Shoppers are not seeing enough structured detail in the bullet stack.",
          rootCause:
            "Thin bullets limit both indexed context and conversion reassurance on the PDP.",
          action:
            "Fill the remaining bullet slots with distinct value claims and objection handling.",
          whereToChange: "Seller Central > bullet points",
          expectedImpact:
            "Should improve shopper comprehension and lift mid-page conversion quality.",
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
          impactType: "conversion",
          priority: "P1",
          confidence: listingCoverage.confidence,
          symptom:
            "The bullets are too short to explain why the product matters or who it is for.",
          rootCause:
            "The PDP is not translating features into shopper-facing proof and usage clarity.",
          whatToChange:
            "Rewrite short bullets into fuller claims with use case, proof, and objection handling.",
          whereToChange: "Seller Central > bullet points",
          expectedImpact:
            "Should improve PDP conversion by reducing unanswered questions before purchase.",
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
          priority: "P1",
          confidence: listingCoverage.confidence,
          symptom:
            "The current bullets are not turning features into persuasive customer proof.",
          rootCause:
            "Feature statements are too thin to carry conversion work on their own.",
          action:
            "Deepen each bullet with outcome, audience fit, and objection-handling language.",
          whereToChange: "Seller Central > bullet points",
          expectedImpact:
            "Should improve conversion quality by making the PDP easier to trust and understand.",
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
          impactType: "click",
          priority: "P2",
          confidence: listingCoverage.confidence,
          symptom: "The listing snapshot is missing a primary gallery image signal.",
          rootCause:
            "Without a hero image, search click and PDP merchandising quality are harder to assess and may be degraded in-market.",
          rootCauseCategory: "missing-attributes",
          whatToChange:
            "Confirm the hero image is published and compliant in the target marketplace.",
          whereToChange: "Seller Central > Images",
          expectedImpact:
            "Should stabilize click-through and make visual QA reliable again.",
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
