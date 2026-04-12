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
            <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm leading-7 text-slate-500">
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
                  className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-600"
                >
                  {item}
                </div>
              ))
            ) : (
              <div className="rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-500">
                No bullet highlights were captured in the latest snapshot.
              </div>
            )}
          </div>

          {detail.attributeItems.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {detail.attributeItems.map((item) => (
                <div
                  key={`${item.label}-${item.value}`}
                  className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4"
                >
                  <p className="section-kicker">{item.label}</p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{item.value}</p>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>Organic</TableHead>
                <TableHead>Sponsored</TableHead>
                <TableHead>Search volume</TableHead>
                <TableHead>Conversion share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.keywordSnapshots.length > 0 ? (
                detail.keywordSnapshots.map((keyword) => (
                  <TableRow key={keyword.keyword}>
                    <TableCell className="font-medium text-slate-950">
                      {keyword.keyword}
                    </TableCell>
                    <TableCell>{keyword.organicRank}</TableCell>
                    <TableCell>{keyword.sponsoredRank ?? "-"}</TableCell>
                    <TableCell>
                      {formatCompetitorMonitorCompactNumber(keyword.searchVolume)}
                    </TableCell>
                    <TableCell>
                      {formatCompetitorMonitorPercent(keyword.conversionShare * 100)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                    No keywords were captured for the latest snapshot.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CompetitorMonitorSectionCard>

        <CompetitorMonitorSectionCard
          eyebrow="Recent changes"
          title="What moved most recently"
          description="These notes are derived from the latest alerts and snapshot-to-snapshot differences."
        >
          <div className="grid gap-3">
            {detail.recentChanges.length > 0 ? (
              detail.recentChanges.map((change) => (
                <div
                  key={change.id}
                  className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">
                      {change.type}
                    </p>
                    <span className="text-sm text-slate-500">
                      {formatCompetitorMonitorDateTime(change.happenedAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {change.summary}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-500">
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ASIN</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Monthly sales</TableHead>
              <TableHead>Alerts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.comparableAsins.length > 0 ? (
              detail.comparableAsins.map((comparable) => (
                <TableRow key={`${comparable.marketId}-${comparable.asin}`}>
                  <TableCell className="font-medium text-slate-950">
                    <Link
                      href={competitorMonitorRoutes.asinDetail(comparable.asin)}
                      className="hover:text-slate-700"
                    >
                      {comparable.asin}
                    </Link>
                  </TableCell>
                  <TableCell>{comparable.marketName}</TableCell>
                  <TableCell className="max-w-[24rem] whitespace-normal text-slate-600">
                    {comparable.title}
                  </TableCell>
                  <TableCell>
                    {comparable.price !== null
                      ? formatCompetitorMonitorCurrency(
                          comparable.price,
                          detail.currency
                        )
                      : "Pending"}
                  </TableCell>
                  <TableCell>
                    {comparable.rating !== null ? comparable.rating.toFixed(1) : "Pending"}
                  </TableCell>
                  <TableCell>
                    {comparable.monthlySales !== null
                      ? formatCompetitorMonitorCompactNumber(comparable.monthlySales)
                      : "Pending"}
                  </TableCell>
                  <TableCell>{comparable.alertCount}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                  No comparable ASINs are linked to this row yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
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
