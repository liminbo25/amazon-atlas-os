import { StudioHeader } from "@/components/portal/studio-header";
import {
  competitorMonitorApiRoutes,
  competitorMonitorRoutes,
} from "@/lib/competitor-monitor/routes";
import { CompetitorMonitorModuleNav } from "./module-nav";

export function CompetitorMonitorShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-10">
      <StudioHeader
        eyebrow="Competitor Monitor"
        title="Track watchlists, ASIN snapshots, sync coverage, and alerts in one repository-backed workspace."
        description="This module now runs on the real competitor-monitor data layer. Page routes stay under the same frontend shell, while the API, repository, sync, and alert services keep their own backend boundary."
        badge="Repository-backed"
      />

      <section className="page-shell mt-8">
        <div className="glass-panel p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div>
                <p className="section-kicker">Module contract</p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  Page routes live under <code>{competitorMonitorRoutes.dashboard}</code>
                </p>
              </div>
              <p className="max-w-3xl text-sm leading-7 text-slate-600">
                The frontend still consumes a single <code>competitor-monitor</code>{" "}
                namespace. Real API paths live under{" "}
                <code>{competitorMonitorApiRoutes.dashboard}</code>, and the UI now
                adapts to the backend contract through a dedicated view-model layer
                instead of shipping mock service types.
              </p>
            </div>
            <CompetitorMonitorModuleNav />
          </div>
        </div>
      </section>

      <main className="page-shell mt-8 flex flex-col gap-6">{children}</main>
    </div>
  );
}
