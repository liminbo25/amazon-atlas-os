import type {
  ListingDiagnosticsRule,
  ListingDiagnosticsRuleContext,
} from "@/lib/listing-diagnostics/types";
import {
  buildListingText,
  clamp,
  createAction,
  createFinding,
  keywordIsPresent,
  uniqueKeywords,
} from "@/lib/listing-diagnostics/rules/shared";

export const keywordOpportunityRule: ListingDiagnosticsRule = {
  id: "keyword-opportunity",
  label: "Keyword opportunity",
  weight: 0.25,
  run(context: ListingDiagnosticsRuleContext) {
    const targetKeywordCoverage = context.coverageById["target-keywords"];
    const competitorKeywordCoverage = context.coverageById["competitor-keywords"];
    const listingText = buildListingText(context.target.listing);
    const findings = [];
    const actions = [];

    const targetKeywords = uniqueKeywords(context.target.keywords);
    const competitorKeywords = uniqueKeywords(
      context.competitors.flatMap((competitor) => competitor.keywords)
    );

    const usingCompetitorProxy =
      targetKeywords.length === 0 && competitorKeywords.length > 0;

    const keywordPool = (
      usingCompetitorProxy ? competitorKeywords : targetKeywords
    ).slice(0, 8);

    if (!listingText.trim() || keywordPool.length === 0) {
      const confidence = usingCompetitorProxy
        ? competitorKeywordCoverage?.confidence ?? 0
        : targetKeywordCoverage?.confidence ?? 0;

      return {
        dimension: {
          id: this.id,
          label: this.label,
          score: 52,
          weight: this.weight,
          summary:
            "Keyword coverage could not be scored directly because copy text or keyword data is missing.",
          confidence,
          coverage:
            keywordPool.length > 0
              ? competitorKeywordCoverage?.status ?? "missing"
              : targetKeywordCoverage?.status ?? "missing",
          inferred: usingCompetitorProxy,
        },
        findings:
          keywordPool.length > 0
            ? [
                createFinding({
                  id: "keyword-proxy-basis",
                  title: "Keyword model falls back to competitor demand signals",
                  description:
                    "Target traffic keywords are unavailable, so the diagnosis is using competitor traffic terms as a directional proxy.",
                  severity: "medium",
                  tone: "info",
                  dimensionId: this.id,
                  impactType: "visibility",
                  priority: "P2",
                  confidence,
                  inferred: true,
                  symptom:
                    "The target ASIN does not have direct traffic keyword coverage in the current run.",
                  rootCause:
                    "The diagnosis has to lean on competitor demand terms, so visibility recommendations are directional rather than target-verified.",
                  rootCauseCategory: "listing-status",
                  whatToChange:
                    "Verify direct target keyword coverage before making a large indexing or copy rewrite.",
                  whereToChange:
                    "SellerSprite target keyword coverage plus Seller Central keyword/indexing surfaces",
                  expectedImpact:
                    "Should improve confidence that visibility work is fixing the right root cause.",
                  evidence: [
                    competitorKeywordCoverage?.detail ??
                      "Competitor keyword coverage is the only available source.",
                  ],
                }),
              ]
            : [],
        actions:
          keywordPool.length > 0
            ? [
                createAction({
                  id: "keyword-proxy-validate",
                  title: "Validate target traffic keywords before making large copy changes",
                  description:
                    "Use the target ASIN keyword feed when it becomes available so title and bullet updates are anchored to direct demand instead of competitor proxy data.",
                  priority: "P2",
                  confidence,
                  inferred: true,
                  symptom:
                    "Current keyword guidance is running on proxy demand data.",
                  rootCause:
                    "Without target keyword coverage, it is easy to over-fit to competitor patterns that do not fully match the ASIN.",
                  action:
                    "Refresh the target keyword data before committing to a broad copy rewrite.",
                  whereToChange:
                    "SellerSprite target keyword source and indexed copy fields",
                  expectedImpact:
                    "Should reduce false-positive keyword work and tighten discoverability recommendations.",
                  linkedFindingIds: ["keyword-proxy-basis"],
                }),
              ]
            : [],
      };
}
    const matchedKeywords = keywordPool.filter((keyword) =>
      keywordIsPresent(listingText, keyword.keyword)
    );
    const missingKeywords = keywordPool.filter(
      (keyword) => !matchedKeywords.some((matched) => matched.keyword === keyword.keyword)
    );
    const averageOrganicRank = (() => {
      const ranks = targetKeywords
        .slice(0, 5)
        .map((keyword) => keyword.organicRank)
        .filter((rank) => rank > 0);

      if (ranks.length === 0) {
        return null;
      }

      const total = ranks.reduce((sum, rank) => sum + rank, 0);
      return total / ranks.length;
    })();

    let score = 58 + (matchedKeywords.length / keywordPool.length) * 28;

    if (averageOrganicRank !== null) {
      if (averageOrganicRank <= 15) {
        score += 14;
      } else if (averageOrganicRank <= 30) {
        score += 6;
      } else if (averageOrganicRank <= 50) {
        score -= 4;
      } else {
        score -= 12;
      }
    }

    if (usingCompetitorProxy) {
      score = Math.min(score, 74);
      findings.push(
        createFinding({
          id: "keyword-proxy-basis",
          title: "Keyword gap uses competitor proxy demand terms",
          description:
            "The target ASIN did not return direct traffic keywords, so high-volume competitor queries are being used as a fallback lens.",
          severity: "medium",
          tone: "info",
          dimensionId: this.id,
          impactType: "visibility",
          priority: "P2",
          confidence: competitorKeywordCoverage.confidence,
          inferred: true,
          symptom:
            "Keyword opportunity is directional because only competitor demand terms are available.",
          rootCause:
            "The target ASIN's direct traffic model is missing, so the diagnosis is inferring discoverability from the competitor pack.",
          rootCauseCategory: "listing-status",
          whatToChange:
            "Validate direct target keyword visibility and indexing before overhauling copy.",
          whereToChange:
            "SellerSprite keyword coverage and Seller Central indexed copy fields",
          expectedImpact:
            "Should sharpen discoverability decisions and avoid overreacting to proxy data.",
          evidence: [competitorKeywordCoverage.detail],
        })
      );
    }

    if (matchedKeywords.length <= Math.floor(keywordPool.length / 2)) {
      findings.push(
        createFinding({
          id: "keyword-missing-coverage",
          title: "Copy misses too many demand-driving terms",
          description:
            "A large share of the highest-volume tracked terms do not appear in the title or bullets.",
          severity: "high",
          dimensionId: this.id,
          impactType: "visibility",
          priority: "P1",
          confidence: usingCompetitorProxy
            ? competitorKeywordCoverage.confidence
            : targetKeywordCoverage.confidence,
          inferred: usingCompetitorProxy,
          symptom:
            "Top tracked demand terms are absent from the most visible indexed copy fields.",
          rootCause:
            "The current title and bullets are not aligned tightly enough with the query spaces driving category demand.",
          rootCauseCategory: "missing-attributes",
          whatToChange:
            "Thread the strongest missing demand terms into title and early bullets without breaking readability.",
          whereToChange:
            "Seller Central > title / bullets / backend keywords",
          expectedImpact:
            "Should improve discoverability on high-intent queries and make clicks more relevant.",
          evidence: missingKeywords
            .slice(0, 4)
            .map((keyword) => `${keyword.keyword} (${keyword.searchVolume.toLocaleString()})`),
        })
      );
      actions.push(
        createAction({
          id: "keyword-inject-demand-terms",
          title: "Inject the missing demand terms into title and bullets",
          description:
            "Rework the hero title and the first two bullets so the highest-volume missing phrases show up naturally in customer-facing copy.",
          priority: "P1",
          confidence: usingCompetitorProxy
            ? competitorKeywordCoverage.confidence
            : targetKeywordCoverage.confidence,
          inferred: usingCompetitorProxy,
          symptom:
            "The listing is leaving indexed demand on the table because critical phrases are absent from visible copy.",
          rootCause:
            "Current copy does not mirror the strongest tracked query patterns closely enough.",
          action:
            "Rewrite the title and opening bullets around the highest-volume missing terms.",
          whereToChange: "Seller Central > title / bullets",
          expectedImpact:
            "Should improve discoverability and relevance for the highest-value query set.",
          linkedFindingIds: ["keyword-missing-coverage"],
        })
      );
    }

    if (averageOrganicRank !== null && averageOrganicRank > 30) {
      findings.push(
        createFinding({
          id: "keyword-weak-rank",
          title: "Tracked organic positions trail the page-one pack",
          description:
            "The target ASIN is visible on fewer high-intent queries than the stronger competitors in this comparison set.",
          severity: "medium",
          dimensionId: this.id,
          impactType: "visibility",
          priority: "P1",
          confidence: targetKeywordCoverage.confidence,
          inferred: false,
          symptom:
            "Organic rank is lagging on the tracked query set even where the ASIN is indexed.",
          rootCause:
            "The listing is not yet competitive enough on critical demand terms to stay near the page-one pack.",
          rootCauseCategory: "listing-status",
          whatToChange:
            "Align indexed copy, conversion proof, and offer strength around the weak-rank query group.",
          whereToChange:
            "Title, bullets, backend keywords, and PDP proof hierarchy",
          expectedImpact:
            "Should improve discoverability depth across already-relevant queries.",
          evidence: [`Average tracked organic rank: ${averageOrganicRank.toFixed(1)}.`],
        })
      );
      actions.push(
        createAction({
          id: "keyword-align-query-coverage",
          title: "Align copy with the terms where rank is weak",
          description:
            "Prioritize the top ranked-demand queries that are already sending traffic to the category and thread them through title, bullets, and image overlays.",
          priority: "P1",
          confidence: targetKeywordCoverage.confidence,
          symptom:
            "The ASIN is visible, but not competitive enough, on important tracked queries.",
          rootCause:
            "Indexed copy and merchandising are not yet strong enough to support page-one organic positioning.",
          action:
            "Align the weak-rank query set with title, bullets, and gallery proof in the next revision.",
          whereToChange:
            "Title, bullets, image overlays, and supporting PDP proof",
          expectedImpact:
            "Should improve organic placement quality on already-relevant traffic.",
          linkedFindingIds: ["keyword-weak-rank"],
        })
      );
    }

    return {
      dimension: {
        id: this.id,
        label: this.label,
        score: clamp(Math.round(score), 40, 96),
        weight: this.weight,
        summary: `Copy currently covers ${matchedKeywords.length} of the top ${keywordPool.length} tracked demand terms.`,
        confidence: usingCompetitorProxy
          ? competitorKeywordCoverage.confidence * 0.78
          : targetKeywordCoverage.confidence,
        coverage: usingCompetitorProxy
          ? competitorKeywordCoverage.status
          : targetKeywordCoverage.status,
        inferred: usingCompetitorProxy,
      },
      findings,
      actions,
    };
  },
};
