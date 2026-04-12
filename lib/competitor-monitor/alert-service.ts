import type {
  CompetitorMonitorAlertCandidate,
  CompetitorMonitorComparableSnapshot,
} from "./types";

const PRICE_CHANGE_THRESHOLD = 0.05;
const RATING_CHANGE_THRESHOLD = 0.2;
const REVIEW_CHANGE_THRESHOLD = 10;
const REVIEW_CHANGE_RATIO_THRESHOLD = 0.15;
const BSR_CHANGE_THRESHOLD = 100;
const BSR_CHANGE_RATIO_THRESHOLD = 0.15;

export function buildCompetitorMonitorAlerts(options: {
  previousSnapshot: CompetitorMonitorComparableSnapshot | null;
  currentSnapshot: CompetitorMonitorComparableSnapshot;
}): CompetitorMonitorAlertCandidate[] {
  const previous = options.previousSnapshot;
  const current = options.currentSnapshot;

  if (!previous) {
    return [];
  }

  const alerts: CompetitorMonitorAlertCandidate[] = [];

  alerts.push(...buildPriceAlerts(previous, current));
  alerts.push(...buildRatingAlerts(previous, current));
  alerts.push(...buildReviewAlerts(previous, current));
  alerts.push(...buildBsrAlerts(previous, current));

  return alerts;
}

function buildPriceAlerts(
  previous: CompetitorMonitorComparableSnapshot,
  current: CompetitorMonitorComparableSnapshot
): CompetitorMonitorAlertCandidate[] {
  if (previous.price <= 0 || current.price <= 0) {
    return [];
  }

  const delta = roundNumber(current.price - previous.price, 2);
  const ratio = Math.abs(delta) / Math.max(previous.price, 1);
  if (ratio < PRICE_CHANGE_THRESHOLD) {
    return [];
  }

  const isDrop = delta < 0;
  const percentage = roundNumber(ratio * 100, 1);

  return [
    {
      type: isDrop ? "price_drop" : "price_increase",
      severity:
        percentage >= 20 ? "critical" : percentage >= 10 ? "warning" : "info",
      title: isDrop ? "竞品价格下调" : "竞品价格上调",
      message: `${current.asin} 价格从 ${formatCurrency(previous.price)} ${
        isDrop ? "下调" : "上调"
      }到 ${formatCurrency(current.price)}（${percentage}%）。`,
      diff: {
        previousPrice: previous.price,
        currentPrice: current.price,
        delta,
        changePercent: percentage,
      },
    },
  ];
}

function buildRatingAlerts(
  previous: CompetitorMonitorComparableSnapshot,
  current: CompetitorMonitorComparableSnapshot
): CompetitorMonitorAlertCandidate[] {
  const delta = roundNumber(current.rating - previous.rating, 2);
  if (Math.abs(delta) < RATING_CHANGE_THRESHOLD) {
    return [];
  }

  const isDrop = delta < 0;
  return [
    {
      type: isDrop ? "rating_drop" : "rating_increase",
      severity:
        Math.abs(delta) >= 0.5 ? "critical" : Math.abs(delta) >= 0.3 ? "warning" : "info",
      title: isDrop ? "竞品评分下滑" : "竞品评分上升",
      message: `${current.asin} 评分从 ${previous.rating.toFixed(1)} ${
        isDrop ? "降到" : "升到"
      } ${current.rating.toFixed(1)}。`,
      diff: {
        previousRating: previous.rating,
        currentRating: current.rating,
        delta,
      },
    },
  ];
}

function buildReviewAlerts(
  previous: CompetitorMonitorComparableSnapshot,
  current: CompetitorMonitorComparableSnapshot
): CompetitorMonitorAlertCandidate[] {
  if (previous.reviews < 0 || current.reviews < 0) {
    return [];
  }

  const delta = current.reviews - previous.reviews;
  const ratio = Math.abs(delta) / Math.max(previous.reviews, 1);
  if (
    Math.abs(delta) < REVIEW_CHANGE_THRESHOLD ||
    ratio < REVIEW_CHANGE_RATIO_THRESHOLD
  ) {
    return [];
  }

  const isGrowth = delta > 0;
  return [
    {
      type: isGrowth ? "review_growth" : "review_drop",
      severity:
        Math.abs(delta) >= 50 ? "critical" : Math.abs(delta) >= 20 ? "warning" : "info",
      title: isGrowth ? "竞品评论量明显增长" : "竞品评论量下降",
      message: `${current.asin} 评论数从 ${previous.reviews} ${
        isGrowth ? "增加到" : "减少到"
      } ${current.reviews}。`,
      diff: {
        previousReviews: previous.reviews,
        currentReviews: current.reviews,
        delta,
        changePercent: roundNumber(ratio * 100, 1),
      },
    },
  ];
}

function buildBsrAlerts(
  previous: CompetitorMonitorComparableSnapshot,
  current: CompetitorMonitorComparableSnapshot
): CompetitorMonitorAlertCandidate[] {
  if (previous.bsr <= 0 || current.bsr <= 0) {
    return [];
  }

  const delta = current.bsr - previous.bsr;
  const ratio = Math.abs(delta) / Math.max(previous.bsr, 1);
  if (Math.abs(delta) < BSR_CHANGE_THRESHOLD || ratio < BSR_CHANGE_RATIO_THRESHOLD) {
    return [];
  }

  const improved = delta < 0;
  return [
    {
      type: improved ? "bsr_improved" : "bsr_declined",
      severity:
        Math.abs(delta) >= 1000 ? "critical" : Math.abs(delta) >= 300 ? "warning" : "info",
      title: improved ? "竞品 BSR 明显改善" : "竞品 BSR 下滑",
      message: `${current.asin} BSR 从 ${previous.bsr} ${
        improved ? "改善到" : "变化到"
      } ${current.bsr}。`,
      diff: {
        previousBsr: previous.bsr,
        currentBsr: current.bsr,
        delta,
        changePercent: roundNumber(ratio * 100, 1),
      },
    },
  ];
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function roundNumber(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
