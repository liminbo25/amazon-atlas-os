import Link from "next/link";
import { notFound } from "next/navigation";

import { CompetitorMonitorAlertList } from "@/components/competitor-monitor/alert-list";
import {
  CompetitorMonitorBreadcrumbs,
  CompetitorMonitorMetricCard,
  CompetitorMonitorSectionCard,
  CompetitorMonitorStatusBadge,
} from "@/components/competitor-monitor/primitives";
import { CompetitorMonitorTrendStrip } from "@/components/competitor-monitor/trend-strip";
import {
  formatCompetitorMonitorCompactNumber,
  formatCompetitorMonitorCurrency,
  formatCompetitorMonitorDateTime,
} from "@/lib/competitor-monitor/formatters";
import { competitorMonitorClient } from "@/lib/competitor-monitor/client";
import { competitorMonitorRoutes } from "@/lib/competitor-monitor/routes";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MarketDetailPageProps {
  params: Promise<{
    marketId: string;
  }>;
}

export default async function CompetitorMonitorMarketDetailPage({
  params,
}: MarketDetailPageProps) {
  const { marketId } = await params;
  const response = await competitorMonitorClient.getMarket(marketId);

  if (!response) {
    notFound();
  }

  const { market } = response.data;

  return (
    <>
      <CompetitorMonitorSectionCard
        eyebrow="Market detail"
        title={market.marketName}
        description={market.description}
      >
        <CompetitorMonitorBreadcrumbs
          items={[
            { label: "Dashboard", href: competitorMonitorRoutes.dashboard },
            { label: "Markets", href: competitorMonitorRoutes.markets },
            { label: market.marketName },
          ]}
        />

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          <CompetitorMonitorMetricCard
            label="Health"
            value={market.health.toUpperCase()}
            delta={`${market.activeAlertCount} open alerts`}
            tone={
              market.health === "healthy"
                ? "positive"
                : market.health === "risk"
                  ? "negative"
                  : "neutral"
            }
            description={`${market.countryCode} / ${market.region}`}
          />
          <CompetitorMonitorMetricCard
            label="Sync coverage"
            value={`${market.coverageRate.toFixed(0)}%`}
            delta={`${market.syncedAsinCount} of ${market.asinCount} synced`}
            tone={
              market.coverageRate >= 80
                ? "positive"
                : market.coverageRate < 50
                  ? "negative"
                  : "neutral"
            }
            description="Configured ASINs that already have stored snapshot data."
          />
          <CompetitorMonitorMetricCard
            label="Average price"
            value={
              market.averagePrice !== null
                ? formatCompetitorMonitorCurrency(market.averagePrice, market.currency)
                : "Pending"
            }
            delta={
              market.averageRating !== null
                ? `${market.averageRating.toFixed(1)} avg rating`
                : "Awaiting sync"
            }
            tone="neutral"
            description="Average values are derived from the most recent snapshots in this market."
          />
          <CompetitorMonitorMetricCard
            label="Tracked ASINs"
            value={String(market.asinCount)}
            delta={`${market.criticalAlertCount} critical alerts`}
            tone={market.criticalAlertCount > 0 ? "negative" : "neutral"}
            description={market.heroAsin ? `Hero ASIN ${market.heroAsin}` : "No hero ASIN yet"}
          />
        </div>
      </CompetitorMonitorSectionCard>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <CompetitorMonitorSectionCard
          eyebrow="Latest capture activity"
          title="Recent synced checkpoints"
          description="Grouped from the latest stored snapshots inside this watchlist."
        >
          {market.activityTimeline.length > 0 ? (
            <CompetitorMonitorTrendStrip
              data={market.activityTimeline}
              series={[
                {
                  key: "averagePrice",
                  label: "Avg price",
                  colorClass: "bg-slate-950",
                  format: "currency",
                  currency: market.currency,
                },
                {
                  key: "syncedAsins",
                  label: "Synced ASINs",
                  colorClass: "bg-sky-500",
                  format: "number",
                  max: Math.max(market.asinCount, 1),
                },
                {
                  key: "openAlerts",
                  label: "Open alerts",
                  colorClass: "bg-amber-500",
                  format: "number",
                  max: Math.max(market.activeAlertCount, 1),
                },
              ]}
            />
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm leading-7 text-slate-500">
              No synced snapshots are available yet for this market.
            </div>
          )}
        </CompetitorMonitorSectionCard>

        <CompetitorMonitorSectionCard
          eyebrow="Setup context"
          title="What this watchlist is currently tracking"
          description="Context fields come straight from the real market record plus derived sync diagnostics."
        >
          <div className="grid gap-4">
            <div className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
              <p className="section-kicker">Marketplace</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                Amazon {market.marketplace}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                {market.countryCode} / {market.region}
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
              <p className="section-kicker">Last sync</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {market.lastSyncedAt
                  ? formatCompetitorMonitorDateTime(market.lastSyncedAt)
                  : "Not synced yet"}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Coverage is currently {market.coverageRate.toFixed(0)}% across the
                configured ASIN set.
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
              <p className="section-kicker">Description</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                {market.description}
              </p>
            </div>
          </div>
        </CompetitorMonitorSectionCard>
      </section>

      <CompetitorMonitorSectionCard
        eyebrow="Tracked ASINs"
        title="Monitored rows inside this market"
        description="The table keeps the original deep-link workflow while showing the fields that actually exist in the backend contract."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ASIN</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Reviews</TableHead>
              <TableHead>Monthly sales</TableHead>
              <TableHead>Alerts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {market.trackedAsins.length > 0 ? (
              market.trackedAsins.map((asin) => (
                <TableRow key={asin.asin}>
                  <TableCell>
                    <Link
                      href={competitorMonitorRoutes.asinDetail(asin.asin)}
                      className="font-semibold text-slate-950 hover:text-slate-700"
                    >
                      {asin.asin}
                    </Link>
                    <p className="mt-1 max-w-[22rem] text-xs whitespace-normal text-slate-500">
                      {asin.title}
                    </p>
                  </TableCell>
                  <TableCell>
                    <CompetitorMonitorStatusBadge kind="health" value={asin.health} />
                  </TableCell>
                  <TableCell>
                    {asin.price !== null
                      ? formatCompetitorMonitorCurrency(asin.price, market.currency)
                      : "Pending"}
                  </TableCell>
                  <TableCell>{asin.rating !== null ? asin.rating.toFixed(1) : "Pending"}</TableCell>
                  <TableCell>{formatCompetitorMonitorCompactNumber(asin.reviewCount)}</TableCell>
                  <TableCell>
                    {asin.monthlySales !== null
                      ? formatCompetitorMonitorCompactNumber(asin.monthlySales)
                      : "Pending"}
                  </TableCell>
                  <TableCell>{asin.alertCount}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                  No ASINs are attached to this market yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CompetitorMonitorSectionCard>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <CompetitorMonitorSectionCard
          eyebrow="Coverage notes"
          title="What the current data says"
          description="These notes are derived from the actual market detail payload and sync coverage calculations."
        >
          <div className="grid gap-3">
            {market.notes.map((note) => (
              <div
                key={note}
                className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-600"
              >
                {note}
              </div>
            ))}
          </div>
        </CompetitorMonitorSectionCard>

        <CompetitorMonitorSectionCard
          eyebrow="Market alerts"
          title="Signals linked to this watchlist"
          description="Alert cards are preserved from the frontend thread and now render the real alert payload."
        >
          <CompetitorMonitorAlertList
            alerts={market.recentAlerts}
            emptyText="No open alerts are currently linked to this market."
          />
        </CompetitorMonitorSectionCard>
      </section>
    </>
  );
}
