import Link from "next/link";

import {
  CompetitorMonitorMetricCard,
  CompetitorMonitorSectionCard,
  CompetitorMonitorStatusBadge,
} from "@/components/competitor-monitor/primitives";
import {
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

interface MarketsPageProps {
  searchParams: Promise<{
    query?: string;
    health?: string;
  }>;
}

export default async function CompetitorMonitorMarketsPage({
  searchParams,
}: MarketsPageProps) {
  const filters = await searchParams;
  const { data } = await competitorMonitorClient.listMarkets(filters);

  return (
    <>
      <section className="grid gap-4 xl:grid-cols-4">
        {data.metrics.map(({ key, ...metric }) => (
          <CompetitorMonitorMetricCard key={key} {...metric} />
        ))}
      </section>

      <CompetitorMonitorSectionCard
        eyebrow="Market list"
        title="Filter the configured watchlists"
        description="The list keeps the UI workflow from the frontend thread, but the rows now come from the real market repository and derived coverage metrics."
      >
        <form
          action={competitorMonitorRoutes.markets}
          className="grid gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_180px_auto]"
        >
          <input
            type="search"
            name="query"
            defaultValue={data.filters.query}
            placeholder="Search market, region, ASIN, description..."
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-slate-950"
          />
          <select
            name="health"
            defaultValue={data.filters.health}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-slate-950"
          >
            <option value="all">All health states</option>
            <option value="healthy">Healthy</option>
            <option value="watch">Watch</option>
            <option value="risk">Risk</option>
          </select>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Apply filters
          </button>
        </form>

        <div className="mt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Market</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Tracked ASINs</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>Open alerts</TableHead>
                <TableHead>Avg price</TableHead>
                <TableHead>Last sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length > 0 ? (
                data.items.map((market) => (
                  <TableRow key={market.marketId}>
                    <TableCell>
                      <Link
                        href={competitorMonitorRoutes.marketDetail(market.marketId)}
                        className="font-semibold text-slate-950 hover:text-slate-700"
                      >
                        {market.marketName}
                      </Link>
                      <p className="mt-1 text-xs whitespace-normal text-slate-500">
                        {market.countryCode} / {market.region}
                        {market.heroAsin ? ` / ${market.heroAsin}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <CompetitorMonitorStatusBadge kind="health" value={market.health} />
                    </TableCell>
                    <TableCell>{market.asinCount}</TableCell>
                    <TableCell>{market.coverageRate.toFixed(0)}%</TableCell>
                    <TableCell>
                      {market.activeAlertCount}
                      {market.criticalAlertCount > 0 ? (
                        <span className="ml-2 text-xs font-semibold text-rose-700">
                          {market.criticalAlertCount} critical
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {market.averagePrice !== null
                        ? formatCompetitorMonitorCurrency(
                            market.averagePrice,
                            market.currency
                          )
                        : "Pending"}
                    </TableCell>
                    <TableCell>
                      {market.lastSyncedAt
                        ? formatCompetitorMonitorDateTime(market.lastSyncedAt)
                        : "Not synced"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                    No markets matched the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CompetitorMonitorSectionCard>
    </>
  );
}
