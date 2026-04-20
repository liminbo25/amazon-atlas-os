import { CompetitorMonitorAlertList } from "@/components/competitor-monitor/alert-list";
import {
  CompetitorMonitorMetricCard,
  CompetitorMonitorSectionCard,
} from "@/components/competitor-monitor/primitives";
import { competitorMonitorClient } from "@/lib/competitor-monitor/client";
import { competitorMonitorRoutes } from "@/lib/competitor-monitor/routes";

interface AlertsPageProps {
  searchParams: Promise<{
    query?: string;
    marketId?: string;
    severity?: string;
    status?: string;
  }>;
}

export default async function CompetitorMonitorAlertsPage({
  searchParams,
}: AlertsPageProps) {
  const filters = await searchParams;
  const { data } = await competitorMonitorClient.listAlerts(filters);
  const marketOptions = await competitorMonitorClient.listMarkets();

  return (
    <>
      <section className="grid gap-4 xl:grid-cols-4">
        {data.metrics.map(({ key, ...metric }) => (
          <CompetitorMonitorMetricCard key={key} {...metric} />
        ))}
      </section>

      <CompetitorMonitorSectionCard
        eyebrow="Alert center"
        title="Filter and triage real monitoring signals"
        description="Filtering stays in the frontend so the backend alert contract can remain narrow and source-of-truth focused."
      >
        <form
          action={competitorMonitorRoutes.alerts}
          className="obsidian-filter-bar grid gap-3 p-4 xl:grid-cols-[1fr_180px_160px_180px_auto]"
        >
          <input
            type="search"
            name="query"
            defaultValue={data.filters.query}
            placeholder="Search alert, market, ASIN..."
            className="obsidian-native-field"
          />
          <select
            name="marketId"
            defaultValue={data.filters.marketId}
            className="obsidian-native-select"
          >
            <option value="all">All markets</option>
            {marketOptions.data.items.map((market) => (
              <option key={market.marketId} value={market.marketId}>
                {market.marketName}
              </option>
            ))}
          </select>
          <select
            name="severity"
            defaultValue={data.filters.severity}
            className="obsidian-native-select"
          >
            <option value="all">All severity</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select
            name="status"
            defaultValue={data.filters.status}
            className="obsidian-native-select"
          >
            <option value="open">Open only</option>
            <option value="all">All status</option>
            <option value="resolved">Resolved</option>
          </select>
          <button type="submit" className="obsidian-action h-11">
            Apply filters
          </button>
        </form>

        <div className="mt-6">
          <CompetitorMonitorAlertList
            alerts={data.items}
            emptyText="No real alerts matched the current filter combination."
          />
        </div>
      </CompetitorMonitorSectionCard>
    </>
  );
}
