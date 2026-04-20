import {
  formatCompetitorMonitorCurrency,
  formatCompetitorMonitorDate,
  formatCompetitorMonitorPercent,
} from "@/lib/competitor-monitor/formatters";

type FormatMode = "number" | "percent" | "currency";

type TrendSeries = {
  key: string;
  label: string;
  colorClass: string;
  format?: FormatMode;
  currency?: string;
  max?: number;
};

export function CompetitorMonitorTrendStrip<T extends { date: string }>({
  data,
  series,
}: {
  data: T[];
  series: TrendSeries[];
}) {
  return (
    <div className="grid gap-3">
      {data.map((point) => (
        <div key={String(point.date)} className="obsidian-soft-card px-4 py-4">
          <p className="text-sm font-semibold text-[#f7f0e6]">
            {formatCompetitorMonitorDate(String(point.date))}
          </p>
          <div className="mt-4 grid gap-3">
            {series.map((item) => {
              const rawValue = Number(
                point[item.key as keyof T] as number | string | undefined
              );
              const ceiling =
                item.max ??
                Math.max(
                  ...data.map((row) =>
                    Number(row[item.key as keyof T] as number | string | undefined)
                  ),
                  rawValue,
                  1
                );
              const width = Math.max((rawValue / ceiling) * 100, 6);
              const value =
                item.format === "currency"
                  ? formatCompetitorMonitorCurrency(rawValue, item.currency ?? "USD")
                  : item.format === "percent"
                    ? formatCompetitorMonitorPercent(rawValue)
                    : rawValue.toFixed(0);

              return (
                <div key={item.key}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[#a99a89]">{item.label}</span>
                    <span className="font-semibold text-[#f7f0e6]">{value}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className={`h-full rounded-full ${item.colorClass}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
