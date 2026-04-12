export function formatCompetitorMonitorCurrency(
  value: number,
  currency: string
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function formatCompetitorMonitorPercent(
  value: number,
  digits = 1
) {
  return `${value.toFixed(digits)}%`;
}

export function formatCompetitorMonitorCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatCompetitorMonitorDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function formatCompetitorMonitorDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatCompetitorMonitorDelta(
  value: number,
  suffix = "%"
) {
  const sign = value > 0 ? "+" : "";

  return `${sign}${value.toFixed(1)}${suffix}`;
}

