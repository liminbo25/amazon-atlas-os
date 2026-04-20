import Link from "next/link";
import { formatCompetitorMonitorDateTime } from "@/lib/competitor-monitor/formatters";
import { competitorMonitorRoutes } from "@/lib/competitor-monitor/routes";
import type { CompetitorMonitorUiAlert } from "@/lib/competitor-monitor/view-model";
import { CompetitorMonitorStatusBadge } from "./primitives";

export function CompetitorMonitorAlertList({
  alerts,
  emptyText = "No alerts matched the current view.",
}: {
  alerts: CompetitorMonitorUiAlert[];
  emptyText?: string;
}) {
  if (alerts.length === 0) {
    return <div className="obsidian-empty-state px-5 py-8 text-sm leading-7">{emptyText}</div>;
  }

  return (
    <div className="grid gap-4">
      {alerts.map((alert) => (
        <article key={alert.id} className="obsidian-card px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CompetitorMonitorStatusBadge kind="severity" value={alert.severity} />
                <CompetitorMonitorStatusBadge kind="status" value={alert.status} />
                <span className="obsidian-meta-pill">{alert.typeLabel}</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#f7f0e6]">{alert.title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#c5b9aa]">{alert.message}</p>
              </div>
            </div>

            <div className="grid gap-2 text-sm text-[#a99a89] lg:text-right">
              <span>{formatCompetitorMonitorDateTime(alert.createdAt)}</span>
              <span>{alert.markets.map((market) => market.name).join(" / ") || "Unscoped"}</span>
            </div>
          </div>

          {alert.detailItems.length > 0 ? (
            <div className="mt-5 grid gap-3 text-sm text-[#c5b9aa] lg:grid-cols-3">
              {alert.detailItems.map((item) => (
                <div key={`${alert.id}-${item.label}`} className="obsidian-soft-card px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#a99a89]">
                    {item.label}
                  </p>
                  <p className="mt-2 font-semibold text-[#f7f0e6]">{item.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
            {alert.markets.map((market) => (
              <Link
                key={`${alert.id}-${market.id}`}
                href={competitorMonitorRoutes.marketDetail(market.id)}
                className="obsidian-meta-pill transition hover:border-[rgba(246,182,63,0.3)] hover:text-[#f7f0e6]"
              >
                {market.name}
              </Link>
            ))}
            <Link
              href={competitorMonitorRoutes.asinDetail(alert.asin)}
              className="obsidian-meta-pill transition hover:border-[rgba(246,182,63,0.3)] hover:text-[#f7f0e6]"
            >
              {alert.asin}
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
