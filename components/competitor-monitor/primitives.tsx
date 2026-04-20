import Link from "next/link";
import { cn } from "@/lib/utils";

type StatusKind = "health" | "severity" | "status";

const badgeConfig: Record<StatusKind, Record<string, { label: string; className: string }>> = {
  health: {
    healthy: {
      label: "Healthy",
      className: "border-emerald-400/25 bg-emerald-500/14 text-emerald-200",
    },
    watch: {
      label: "Watch",
      className: "border-amber-400/25 bg-amber-500/14 text-amber-200",
    },
    risk: {
      label: "Risk",
      className: "border-rose-400/25 bg-rose-500/14 text-rose-200",
    },
  },
  severity: {
    critical: {
      label: "Critical",
      className: "border-rose-400/25 bg-rose-500/14 text-rose-200",
    },
    warning: {
      label: "Warning",
      className: "border-amber-400/25 bg-amber-500/14 text-amber-200",
    },
    info: {
      label: "Info",
      className: "border-sky-400/25 bg-sky-500/14 text-sky-200",
    },
    high: {
      label: "High",
      className: "border-orange-400/25 bg-orange-500/14 text-orange-200",
    },
    medium: {
      label: "Medium",
      className: "border-amber-400/25 bg-amber-500/14 text-amber-200",
    },
    low: {
      label: "Low",
      className: "border-sky-400/25 bg-sky-500/14 text-sky-200",
    },
  },
  status: {
    open: {
      label: "Open",
      className: "border-rose-400/25 bg-rose-500/14 text-rose-200",
    },
    acknowledged: {
      label: "Acknowledged",
      className: "border-amber-400/25 bg-amber-500/14 text-amber-200",
    },
    muted: {
      label: "Muted",
      className: "border-white/10 bg-white/6 text-[#d7cabd]",
    },
    resolved: {
      label: "Resolved",
      className: "border-emerald-400/25 bg-emerald-500/14 text-emerald-200",
    },
  },
};

export function CompetitorMonitorStatusBadge({
  kind,
  value,
}: {
  kind: StatusKind;
  value: string;
}) {
  const config = badgeConfig[kind][value] ?? {
    label: value,
    className: "border-white/10 bg-white/6 text-[#d7cabd]",
  };

  return (
    <span
      className={cn(
        "obsidian-meta-pill border px-3 py-1 text-[11px]",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}

export function CompetitorMonitorSectionCard({
  eyebrow,
  title,
  description,
  action,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("obsidian-workbench p-6 sm:p-7", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#a99a89]">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#f7f0e6]">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#c5b9aa]">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function CompetitorMonitorMetricCard({
  label,
  value,
  delta,
  tone,
  description,
}: {
  label: string;
  value: string;
  delta: string;
  tone: "positive" | "negative" | "neutral";
  description: string;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-200"
      : tone === "negative"
        ? "text-rose-200"
        : "text-[#c5b9aa]";

  return (
    <article className="obsidian-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#a99a89]">
        {label}
      </p>
      <p className="obsidian-stat-value mt-3 text-3xl">{value}</p>
      <p className={cn("mt-2 text-sm font-semibold", toneClass)}>{delta}</p>
      <p className="mt-3 text-sm leading-7 text-[#c5b9aa]">{description}</p>
    </article>
  );
}

export function CompetitorMonitorBreadcrumbs({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm text-[#a99a89]">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
          {item.href ? (
            <Link href={item.href} className="transition hover:text-[#f7f0e6]">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-[#f7f0e6]">{item.label}</span>
          )}
          {index < items.length - 1 ? <span className="text-[#6f6459]">/</span> : null}
        </span>
      ))}
    </nav>
  );
}
