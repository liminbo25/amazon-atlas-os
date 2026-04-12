import { CompetitorMonitorShell } from "@/components/competitor-monitor/module-shell";

export const dynamic = "force-dynamic";

export default function CompetitorMonitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CompetitorMonitorShell>{children}</CompetitorMonitorShell>;
}
