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
  formatCompetitorMonitorPercent,
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

interface AsinDetailPageProps {
  params: Promise<{
    asin: string;
  }>;
}

export default async function CompetitorMonitorAsinDetailPage({
  params,
}: AsinDetailPageProps) {
  const { asin } = await params;
  const response = await competitorMonitorClient.getAsin(asin);

  if (!response) {
    notFound();
  }

  const { asin: detail } = response.data;

  return (
    <>
      <CompetitorMonitorSectionCard
        eyebrow="ASIN detail"
        title={detail.asin}
        description={detail.title}
      >
        <CompetitorMonitorBreadcrumbs
          items={[
            { label: "Dashboard", href: competitorMonitorRoutes.dashboard },
            { label: "Markets", href: competitorMonitorRoutes.markets },
            detail.marketId
              ? {
                  label: detail.marketName,
                  href: competitorMonitorRoutes.marketDetail(detail.marketId),
                }
              : { label: detail.marketName },
            { label: detail.asin },
          ]}
        />

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          <CompetitorMonitorMetricCard
            label="Health"
            value={detail.health.toUpperCase()}
            delta={`${detail.alertCount} open alerts`}
            tone={
              detail.health === "healthy"
                ? "positive"
                : detail.health === "risk"
                  ? "negative"
                  : "neutral"
            }
            description={`${detail.marketName} / ${detail.brand}`}
          />
          <CompetitorMonitorMetricCard
            label="Price"
            value={
              detail.price !== null
                ? formatCompetitorMonitorCurrency(detail.price, detail.currency)
                : "Pending"
            }
            delta={
              detail.priceChange !== null
                ? `${detail.priceChange > 0 ? "+" : ""}${formatCompetitorMonitorCurrency(
                    detail.priceChange,
                    detail.currency
                  )} vs previous snapshot`
                : "No prior snapshot yet"
            }
            tone={
              detail.priceChange === null
                ? "neutral"
                : detail.priceChange < 0
                  ? "negative"
                  : "positive"
            }
            description="Current price from the latest stored competitor snapshot."
          />
          <CompetitorMonitorMetricCard
            label="Reviews"
            value={formatCompetitorMonitorCompactNumber(detail.reviewCount)}
            delta={
              detail.reviewChange !== null
                ? `${detail.reviewChange > 0 ? "+" : ""}${detail.reviewChange} vs previous snapshot`
                : "No prior snapshot yet"
            }
            tone={
              detail.reviewChange === null
                ? "neutral"
                : detail.reviewChange >= 0
                  ? "positive"
                  : "negative"
            }
            description={
              detail.lastCapturedAt
                ? `Latest capture ${formatCompetitorMonitorDateTime(detail.lastCapturedAt)}`
                : "Awaiting first stored snapshot"
            }
          />
          <CompetitorMonitorMetricCard
            label="Monthly sales"
            value={
              detail.monthlySales !== null
                ? formatCompetitorMonitorCompactNumber(detail.monthlySales)
                : "Pending"
            }
            delta={detail.bsr !== null ? `BSR ${detail.bsr}` : "BSR pending"}
            tone="neutral"
            description={`${detail.countryCode} / ${detail.region}`}
          />
        </div>
      </CompetitorMonitorSectionCard>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <CompetitorMonitorSectionCard
          eyebrow="Snapshot history"
          title="Recent observed changes"
          description="This timeline is built from the real snapshot history stored by competitor-monitor."
        >
          {detail.timeline.length > 0 ? (
            <CompetitorMonitorTrendStrip
              data={detail.timeline}
              series={[
                {
                  key: "price",
                  label: "Price",
                  colorClass: "bg-slate-950",
                  format: "currency",
                  currency: detail.currency,
                },
                {
                  key: "reviews",
                  label: "Reviews",
                  colorClass: "bg-sky-500",
                  format: "number",
                  max: Math.max(detail.reviewCount, 1),
                },
                {
                  key: "monthlySales",
                  label: "Monthly sales",
                  colorClass: "bg-emerald-500",
                  format: "number",
                  max: Math.max(detail.monthlySales ?? 1, 1),
                },
              ]}
            />
          ) : (
            <div className="obsidian-empty-state px-5 py-8 text-sm leading-7">
              Snapshot history is still empty for this ASIN.
            </div>
          )}
        </CompetitorMonitorSectionCard>

        <CompetitorMonitorSectionCard
          eyebrow="Highlights"
          title="Captured bullets and attributes"
          description="Frontend layout is preserved, but the content now comes from the stored snapshot fields."
        >
          <div className="grid gap-3">
            {detail.bulletHighlights.length > 0 ? (
              detail.bulletHighlights.map((item) => (
                <div
                  key={item}
                  className="obsidian-inline-note px-4 py-4 text-sm leading-7"
                >
                  {item}
                </div>
              ))
            ) : (
              <div className="obsidian-empty-state px-4 py-4 text-sm leading-7">
                No bullet highlights were captured in the latest snapshot.
              </div>
            )}
          </div>

          {detail.attributeItems.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {detail.attributeItems.map((item) => (
                <div
                  key={`${item.label}-${item.value}`}
                  className="obsidian-soft-card px-4 py-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#a99a89]">
                    {item.label}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[#dfd2c3]">{item.value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </CompetitorMonitorSectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <CompetitorMonitorSectionCard
          eyebrow="Keyword snapshot"
          title="Latest tracked keyword coverage"
          description="Keyword rows come directly from the latest stored snapshot instead of a mock ranking contract."
        >
          <div className="obsidian-soft-card overflow-hidden px-3 py-3">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="px-4 text-[#a99a89]">Keyword</TableHead>
                  <TableHead className="px-4 text-[#a99a89]">Organic</TableHead>
                  <TableHead className="px-4 text-[#a99a89]">Sponsored</TableHead>
                  <TableHead className="px-4 text-[#a99a89]">Search volume</TableHead>
                  <TableHead className="px-4 text-[#a99a89]">Conversion share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.keywordSnapshots.length > 0 ? (
                  detail.keywordSnapshots.map((keyword) => (
                    <TableRow key={keyword.keyword} className="border-white/8 hover:bg-white/[0.03]">
                      <TableCell className="px-4 py-4 font-medium text-[#f7f0e6]">
                        {keyword.keyword}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-[#f7f0e6]">
                        {keyword.organicRank}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-[#f7f0e6]">
                        {keyword.sponsoredRank ?? "-"}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-[#f7f0e6]">
                        {formatCompetitorMonitorCompactNumber(keyword.searchVolume)}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-[#f7f0e6]">
                        {formatCompetitorMonitorPercent(keyword.conversionShare * 100)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="border-white/8 hover:bg-transparent">
                    <TableCell colSpan={5} className="px-4 py-8">
                      <div className="obsidian-empty-state px-5 py-6 text-center text-sm leading-7">
                        No keywords were captured for the latest snapshot.
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CompetitorMonitorSectionCard>

        <CompetitorMonitorSectionCard
          eyebrow="Recent changes"
          title="What moved most recently"
          description="These notes are derived from the latest alerts and snapshot-to-snapshot differences."
        >
          <div className="grid gap-3">
            {detail.recentChanges.length > 0 ? (
              detail.recentChanges.map((change) => (
                <div key={change.id} className="obsidian-soft-card px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#f7f0e6]">
                      {change.type}
                    </p>
                    <span className="text-sm text-[#a99a89]">
                      {formatCompetitorMonitorDateTime(change.happenedAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-[#c5b9aa]">
                    {change.summary}
                  </p>
                </div>
              ))
            ) : (
              <div className="obsidian-empty-state px-4 py-4 text-sm leading-7">
                No change notes are available yet for this ASIN.
              </div>
            )}
          </div>
        </CompetitorMonitorSectionCard>
      </section>

      <CompetitorMonitorSectionCard
        eyebrow="Comparable rows"
        title="Other tracked ASINs in the same monitored markets"
        description="Comparable rows are derived from the real market memberships instead of a separate mock dataset."
      >
        <div className="obsidian-soft-card overflow-hidden px-3 py-3">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="px-4 text-[#a99a89]">ASIN</TableHead>
                <TableHead className="px-4 text-[#a99a89]">Market</TableHead>
                <TableHead className="px-4 text-[#a99a89]">Title</TableHead>
                <TableHead className="px-4 text-[#a99a89]">Price</TableHead>
                <TableHead className="px-4 text-[#a99a89]">Rating</TableHead>
                <TableHead className="px-4 text-[#a99a89]">Monthly sales</TableHead>
                <TableHead className="px-4 text-[#a99a89]">Alerts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.comparableAsins.length > 0 ? (
                detail.comparableAsins.map((comparable) => (
                  <TableRow
                    key={`${comparable.marketId}-${comparable.asin}`}
                    className="border-white/8 hover:bg-white/[0.03]"
                  >
                    <TableCell className="px-4 py-4 font-medium text-[#f7f0e6]">
                      <Link
                        href={competitorMonitorRoutes.asinDetail(comparable.asin)}
                        className="transition hover:text-[#f6b63f]"
                      >
                        {comparable.asin}
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-[#f7f0e6]">
                      {comparable.marketName}
                    </TableCell>
                    <TableCell className="max-w-[24rem] px-4 py-4 whitespace-normal text-[#c5b9aa]">
                      {comparable.title}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-[#f7f0e6]">
                      {comparable.price !== null
                        ? formatCompetitorMonitorCurrency(
                            comparable.price,
                            detail.currency
                          )
                        : "Pending"}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-[#f7f0e6]">
                      {comparable.rating !== null ? comparable.rating.toFixed(1) : "Pending"}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-[#f7f0e6]">
                      {comparable.monthlySales !== null
                        ? formatCompetitorMonitorCompactNumber(comparable.monthlySales)
                        : "Pending"}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-[#f7f0e6]">
                      {comparable.alertCount}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableCell colSpan={7} className="px-4 py-8">
                    <div className="obsidian-empty-state px-5 py-6 text-center text-sm leading-7">
                      No comparable ASINs are linked to this row yet.
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CompetitorMonitorSectionCard>

      <CompetitorMonitorSectionCard
        eyebrow="ASIN alerts"
        title="Signals attached to this tracked row"
        description="The alert cards are shared across the dashboard, market detail, and ASIN detail views."
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <CompetitorMonitorStatusBadge kind="health" value={detail.health} />
          {detail.markets.map((market) => (
            <Link
              key={`${detail.asin}-${market.id}`}
              href={competitorMonitorRoutes.marketDetail(market.id)}
              className="obsidian-meta-pill transition hover:border-[rgba(246,182,63,0.3)] hover:text-[#f7f0e6]"
            >
              {market.name}
            </Link>
          ))}
        </div>
        <CompetitorMonitorAlertList
          alerts={detail.alerts}
          emptyText="No open alerts are currently linked to this ASIN."
        />
      </CompetitorMonitorSectionCard>
    </>
  );
}
