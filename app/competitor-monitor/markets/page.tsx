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
          className="obsidian-filter-bar grid gap-3 p-4 lg:grid-cols-[1fr_180px_auto]"
        >
          <input
            type="search"
            name="query"
            defaultValue={data.filters.query}
            placeholder="Search market, region, ASIN, description..."
            className="obsidian-native-field"
          />
          <select
            name="health"
            defaultValue={data.filters.health}
            className="obsidian-native-select"
          >
            <option value="all">All health states</option>
            <option value="healthy">Healthy</option>
            <option value="watch">Watch</option>
            <option value="risk">Risk</option>
          </select>
          <button type="submit" className="obsidian-action h-11">
            Apply filters
          </button>
        </form>

        <div className="obsidian-soft-card mt-6 overflow-hidden px-3 py-3">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="px-4 text-[#a99a89]">Market</TableHead>
                <TableHead className="px-4 text-[#a99a89]">Health</TableHead>
                <TableHead className="px-4 text-[#a99a89]">Tracked ASINs</TableHead>
                <TableHead className="px-4 text-[#a99a89]">Coverage</TableHead>
                <TableHead className="px-4 text-[#a99a89]">Open alerts</TableHead>
                <TableHead className="px-4 text-[#a99a89]">Avg price</TableHead>
                <TableHead className="px-4 text-[#a99a89]">Last sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length > 0 ? (
                data.items.map((market) => (
                  <TableRow
                    key={market.marketId}
                    className="border-white/8 hover:bg-white/[0.03]"
                  >
                    <TableCell className="px-4 py-4">
                      <Link
                        href={competitorMonitorRoutes.marketDetail(market.marketId)}
                        className="font-semibold text-[#f7f0e6] transition hover:text-[#f6b63f]"
                      >
                        {market.marketName}
                      </Link>
                      <p className="mt-1 text-xs whitespace-normal text-[#a99a89]">
                        {market.countryCode} / {market.region}
                        {market.heroAsin ? ` / ${market.heroAsin}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <CompetitorMonitorStatusBadge kind="health" value={market.health} />
                    </TableCell>
                    <TableCell className="px-4 py-4 text-[#f7f0e6]">
                      {market.asinCount}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-[#f7f0e6]">
                      {market.coverageRate.toFixed(0)}%
                    </TableCell>
                    <TableCell className="px-4 py-4 text-[#f7f0e6]">
                      {market.activeAlertCount}
                      {market.criticalAlertCount > 0 ? (
                        <span className="ml-2 text-xs font-semibold text-rose-200">
                          {market.criticalAlertCount} critical
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-[#f7f0e6]">
                      {market.averagePrice !== null
                        ? formatCompetitorMonitorCurrency(
                            market.averagePrice,
                            market.currency
                          )
                        : "Pending"}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-[#c5b9aa]">
                      {market.lastSyncedAt
                        ? formatCompetitorMonitorDateTime(market.lastSyncedAt)
                        : "Not synced"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableCell colSpan={7} className="px-4 py-8">
                    <div className="obsidian-empty-state px-5 py-6 text-center text-sm leading-7">
                      No markets matched the current filters.
                    </div>
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
