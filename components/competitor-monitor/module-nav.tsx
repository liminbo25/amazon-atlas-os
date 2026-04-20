"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { competitorMonitorRoutes } from "@/lib/competitor-monitor/routes";
import { cn } from "@/lib/utils";

const items = [
  {
    href: competitorMonitorRoutes.dashboard,
    label: "Dashboard",
    isActive: (pathname: string) => pathname === competitorMonitorRoutes.dashboard,
  },
  {
    href: competitorMonitorRoutes.markets,
    label: "Markets",
    isActive: (pathname: string) =>
      pathname.startsWith(competitorMonitorRoutes.markets) ||
      pathname.startsWith("/competitor-monitor/asins/"),
  },
  {
    href: competitorMonitorRoutes.alerts,
    label: "Alert Center",
    isActive: (pathname: string) => pathname.startsWith(competitorMonitorRoutes.alerts),
  },
];

export function CompetitorMonitorModuleNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = item.isActive(pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition",
              active
                ? "border-[rgba(246,182,63,0.28)] bg-[rgba(246,182,63,0.16)] text-[#f7f0e6]"
                : "border-white/10 bg-[rgba(255,255,255,0.04)] text-[#c8bbad] hover:bg-[rgba(255,255,255,0.08)]"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

