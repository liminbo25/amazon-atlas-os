"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "总览" },
  { href: "/image-studio", label: "图片工作台" },
  { href: "/listing-studio", label: "Listing 工作台" },
  { href: "/legacy-copy-diagnosis", label: "旧版文案" },
  { href: "/listing-diagnostics", label: "Listing 诊断" },
  { href: "/ad-optimizer", label: "广告优化" },
  { href: "/competitor-monitor", label: "竞品监控" },
  { href: "/video-studio", label: "视频工作台" },
];

type StudioHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  badge?: string;
};

export function StudioHeader({
  eyebrow,
  title,
  description,
  badge = "GitHub + Vercel 就绪",
}: StudioHeaderProps) {
  const pathname = usePathname();

  return (
    <section className="page-shell pt-5 sm:pt-7">
      <div className="glass-panel overflow-hidden">
        <div className="border-b border-slate-200/70 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-lg font-bold tracking-[0.16em] text-white"
              >
                AO
              </Link>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
                  Amazon Atlas OS
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  图片、Listing、诊断、广告优化、基于仓库的竞品监控与视频工作流统一从一个入口进入。
                </p>
              </div>
            </div>

            <nav className="flex flex-wrap gap-2">
              {navItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname?.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition",
                      isActive
                        ? "bg-slate-950 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="grid gap-8 bg-[linear-gradient(140deg,rgba(255,255,255,0.85),rgba(248,242,233,0.92)_45%,rgba(227,239,244,0.88))] px-5 py-8 sm:px-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div className="space-y-4">
            <p className="section-kicker">{eyebrow}</p>
            <h1 className="max-w-4xl font-heading text-4xl leading-tight tracking-[-0.04em] text-slate-950 sm:text-5xl xl:text-6xl">
              {title}
            </h1>
            <p className="max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
              {description}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[1.6rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_16px_40px_rgba(16,32,51,0.05)]">
              <p className="section-kicker">发布路径</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                {badge}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                保持整个门户可从单一仓库部署，同时让每个模块保持足够清晰的边界，便于后续替换后端。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
