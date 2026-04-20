"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/image-studio", label: "Image Studio" },
  { href: "/listing-studio", label: "Listing Studio" },
  { href: "/legacy-copy-diagnosis", label: "Legacy Copy" },
  { href: "/listing-diagnostics", label: "Listing Diagnostics" },
  { href: "/ad-optimizer", label: "Ad Optimizer" },
  { href: "/competitor-monitor", label: "Competitor Monitor" },
  { href: "/video-studio", label: "Video Studio" },
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
  badge = "GitHub + Vercel Ready",
}: StudioHeaderProps) {
  const pathname = usePathname();

  return (
    <section className="page-shell pt-5 sm:pt-7">
      <div className="obsidian-workbench overflow-hidden p-1">
        <div className="rounded-[1.7rem] border border-white/10 bg-[rgba(7,11,18,0.9)]">
          <div className="border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="obsidian-soft-card flex h-11 w-11 items-center justify-center border-[rgba(246,182,63,0.22)] bg-[rgba(246,182,63,0.14)] text-lg font-bold tracking-[0.16em] text-[#f6c78f]"
              >
                AO
              </Link>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#b7aa9a]">
                  Amazon Atlas OS
                </p>
                <p className="mt-1 text-sm text-[#c8bbad]">
                  One entry point for image, listing, diagnostics, ad optimization,
                  repository-backed competitor monitoring, and video workflows.
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
                      "inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition",
                      isActive
                        ? "border-[rgba(246,182,63,0.28)] bg-[rgba(246,182,63,0.16)] text-[#f7f0e6]"
                        : "border-white/10 bg-[rgba(255,255,255,0.04)] text-[#c8bbad] hover:bg-[rgba(255,255,255,0.08)]"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

          <div className="grid gap-8 bg-[linear-gradient(135deg,rgba(9,13,20,0.94),rgba(17,25,37,0.94)_44%,rgba(48,31,22,0.9))] px-5 py-8 sm:px-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
            <div className="space-y-4">
            <p className="section-kicker">{eyebrow}</p>
            <h1 className="max-w-4xl font-heading text-4xl leading-tight tracking-[-0.04em] text-[#f7f0e6] sm:text-5xl xl:text-6xl">
              {title}
            </h1>
            <p className="max-w-3xl text-base leading-8 text-[#c8bbad] sm:text-lg">
              {description}
            </p>
          </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="obsidian-soft-card p-5">
              <p className="section-kicker">Release path</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#f7f0e6]">
                {badge}
              </p>
              <p className="mt-2 text-sm leading-7 text-[#b7aa9a]">
                Keep the portal deployable from a single repository while each module
                stays isolated enough for later backend swaps.
              </p>
            </div>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}
