"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "总览" },
  { href: "/image-studio", label: "图片" },
  { href: "/listing-studio", label: "Listing" },
  { href: "/video-studio", label: "视频" },
];

type StudioHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
};

export function StudioHeader({ eyebrow, title }: StudioHeaderProps) {
  const pathname = usePathname();

  return (
    <section className="page-shell pt-5 sm:pt-7">
      <div className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <Link
            href="/"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-lg font-bold tracking-[0.16em] text-white"
            aria-label="返回总览"
          >
            AO
          </Link>

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
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-200/70 bg-[linear-gradient(140deg,rgba(255,255,255,0.9),rgba(248,242,233,0.88)_45%,rgba(227,239,244,0.82))] px-5 py-6 sm:px-6">
          <p className="section-kicker">{eyebrow}</p>
          <h1 className="mt-3 font-heading text-4xl leading-tight tracking-[-0.04em] text-slate-950 sm:text-5xl">
            {title}
          </h1>
        </div>
      </div>
    </section>
  );
}
