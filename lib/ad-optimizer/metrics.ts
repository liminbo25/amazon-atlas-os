import type { AnalysisControls, MetricBundle, ProfitView } from "@/lib/ad-optimizer/types";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return currencyFormatter.format(value);
}

export function formatRate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return percentFormatter.format(value);
}

export function sanitizeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function sumNumbers(values: number[]) {
  return values.reduce((total, value) => total + sanitizeNumber(value), 0);
}

export function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

export function roundCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampInt(value: number, min: number, max: number) {
  return Math.round(clampNumber(value, min, max));
}

export function calculateDeltaPct(current: number, previous: number | null) {
  if (previous === null || previous === 0) {
    return null;
  }
  return (current - previous) / previous;
}

export function buildMetricBundle(input: {
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
  units: number;
  ctr: number;
  cpc: number;
  cvr: number;
  acos: number | null;
  roas: number;
}): MetricBundle {
  const impressions = sanitizeNumber(input.impressions);
  const clicks = sanitizeNumber(input.clicks);
  const cost = sanitizeNumber(input.cost);
  const sales = sanitizeNumber(input.sales);
  const orders = sanitizeNumber(input.orders);
  const units = sanitizeNumber(input.units || orders);
  const ctr = impressions > 0 ? clicks / impressions : sanitizeNumber(input.ctr);
  const cpc = clicks > 0 ? cost / clicks : sanitizeNumber(input.cpc);
  const cvr = clicks > 0 ? orders / clicks : sanitizeNumber(input.cvr);
  const acos = sales > 0 ? cost / sales : input.acos;
  const roas = cost > 0 ? sales / cost : sanitizeNumber(input.roas);

  return {
    impressions,
    clicks,
    cost,
    sales,
    orders,
    units,
    ctr,
    cpc,
    cvr,
    acos: typeof acos === "number" && Number.isFinite(acos) ? acos : null,
    roas,
  };
}

export function sumMetricBundles(metrics: MetricBundle[]) {
  return buildMetricBundle({
    impressions: sumNumbers(metrics.map((item) => item.impressions)),
    clicks: sumNumbers(metrics.map((item) => item.clicks)),
    cost: sumNumbers(metrics.map((item) => item.cost)),
    sales: sumNumbers(metrics.map((item) => item.sales)),
    orders: sumNumbers(metrics.map((item) => item.orders)),
    units: sumNumbers(metrics.map((item) => item.units)),
    ctr: 0,
    cpc: 0,
    cvr: 0,
    acos: null,
    roas: 0,
  });
}

export function buildProfitView(
  metrics: MetricBundle,
  controls: Pick<
    AnalysisControls,
    "grossMarginPct" | "profitSafetyMarginPct" | "tacosTarget"
  >
): ProfitView {
  const grossMarginPct = controls.grossMarginPct;
  const breakEvenAcos =
    grossMarginPct !== null ? clampNumber(grossMarginPct, 0, 0.95) : null;
  const profitSafeAcos =
    breakEvenAcos !== null
      ? clampNumber(
          Math.max(0, breakEvenAcos - controls.profitSafetyMarginPct),
          0,
          breakEvenAcos
        )
      : null;
  const estimatedProfit =
    grossMarginPct !== null
      ? roundCurrency(metrics.sales * grossMarginPct - metrics.cost)
      : null;
  const estimatedProfitMargin =
    estimatedProfit !== null && metrics.sales > 0 ? estimatedProfit / metrics.sales : null;
  const tacos = metrics.sales > 0 ? metrics.cost / metrics.sales : null;

  return {
    grossMarginPct,
    profitSafetyMarginPct: controls.profitSafetyMarginPct,
    breakEvenAcos,
    profitSafeAcos,
    estimatedProfit,
    estimatedProfitMargin,
    tacos: controls.tacosTarget ?? tacos,
    tacosIsEstimated: controls.tacosTarget === null,
  };
}

export function compareMetricHeavyItems<
  T extends
    | { current: MetricBundle }
    | { metrics: MetricBundle }
    | { rows: Array<{ metrics: MetricBundle }> }
>(left: T, right: T) {
  const leftMetrics =
    "current" in left
      ? left.current
      : "metrics" in left
        ? left.metrics
        : sumMetricBundles(left.rows.map((row) => row.metrics));
  const rightMetrics =
    "current" in right
      ? right.current
      : "metrics" in right
        ? right.metrics
        : sumMetricBundles(right.rows.map((row) => row.metrics));

  return (
    rightMetrics.cost - leftMetrics.cost ||
    rightMetrics.orders - leftMetrics.orders ||
    rightMetrics.sales - leftMetrics.sales ||
    rightMetrics.clicks - leftMetrics.clicks
  );
}
