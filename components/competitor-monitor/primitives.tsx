import Link from "next/link";
import { cn } from "@/lib/utils";

type StatusKind = "health" | "severity" | "status";

const badgeConfig: Record<StatusKind, Record<string, { label: string; className: string }>> = {
  health: {
    healthy: {
      label: "Healthy",
      className: "bg-emerald-100 text-emerald-700",
    },
    watch: {
      label: "Watch",
      className: "bg-amber-100 text-amber-700",
    },
    risk: {
      label: "Risk",
      className: "bg-rose-100 text-rose-700",
    },
  },
  severity: {
    critical: {
      label: "Critical",
      className: "bg-rose-100 text-rose-700",
    },
    warning: {
      label: "Warning",
      className: "bg-amber-100 text-amber-700",
    },
    info: {
      label: "Info",
      className: "bg-sky-100 text-sky-700",
    },
    high: {
      label: "High",
      className: "bg-orange-100 text-orange-700",
    },
    medium: {
      label: "Medium",
      className: "bg-amber-100 text-amber-700",
    },
    low: {
      label: "Low",
      className: "bg-sky-100 text-sky-700",
    },
  },
  status: {
    open: {
      label: "Open",
      className: "bg-rose-100 text-rose-700",
    },
    acknowledged: {
      label: "Acknowledged",
      className: "bg-amber-100 text-amber-700",
    },
    muted: {
      label: "Muted",
      className: "bg-slate-100 text-slate-700",
    },
    resolved: {
      label: "Resolved",
      className: "bg-emerald-100 text-emerald-700",
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
    className: "bg-slate-100 text-slate-700",
  };

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
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
    <section className={cn("glass-panel p-6 sm:p-7", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          {eyebrow ? <p className="section-kicker">{eyebrow}</p> : null}
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
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
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-rose-700"
        : "text-slate-600";

  return (
    <article className="rounded-[1.6rem] border border-slate-200 bg-white/85 p-5 shadow-[0_16px_36px_rgba(16,32,51,0.05)]">
      <p className="section-kicker">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
        {value}
      </p>
      <p className={cn("mt-2 text-sm font-semibold", toneClass)}>{delta}</p>
      <p className="mt-3 text-sm leading-7 text-slate-500">{description}</p>
    </article>
  );
}

export function CompetitorMonitorBreadcrumbs({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
          {item.href ? (
            <Link href={item.href} className="hover:text-slate-950">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-slate-950">{item.label}</span>
          )}
          {index < items.length - 1 ? <span>/</span> : null}
        </span>
      ))}
    </nav>
  );
}
