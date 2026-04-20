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
        <div className="obsidian-workbench p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="obsidian-soft-card p-4">
                <p className="section-kicker">Module contract</p>
                <p className="mt-2 text-base font-semibold text-[#f7f0e6]">
                  Page routes live under{" "}
                  <code className="rounded-full border border-white/10 bg-[rgba(255,255,255,0.05)] px-2.5 py-1 text-sm text-[#f3e5d2]">
                    {competitorMonitorRoutes.dashboard}
                  </code>
                </p>
              </div>
              <p className="obsidian-inline-note max-w-3xl px-4 py-3 text-sm leading-7 text-[#dfd2c3]">
                The frontend still consumes a single{" "}
                <code className="rounded-full border border-[rgba(246,182,63,0.18)] bg-[rgba(246,182,63,0.08)] px-2.5 py-1 text-xs text-[#f3e5d2]">
                  competitor-monitor
                </code>{" "}
                namespace. Real API paths live under{" "}
                <code className="rounded-full border border-white/10 bg-[rgba(255,255,255,0.05)] px-2.5 py-1 text-xs text-[#f3e5d2]">
                  {competitorMonitorApiRoutes.dashboard}
                </code>
                , and the UI now adapts to the backend contract through a dedicated
                view-model layer instead of shipping mock service types.
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
