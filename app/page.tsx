import Link from "next/link";
import {
  BadgeDollarSign,
  ArrowRight,
  ClipboardList,
  ImagePlus,
  ListChecks,
  Radar,
  Search,
  Sparkles,
  Video,
} from "lucide-react";
import { StudioHeader } from "@/components/portal/studio-header";

const modules = [
  {
    href: "/image-studio",
    title: "Image Studio",
    subtitle: "Try-on generation and upscale workflows",
    description:
      "Upload garments and model references, run the try-on batch, then keep the best outputs for quality enhancement and export.",
    status: "Live",
    icon: ImagePlus,
    accent: "from-[rgba(246,182,63,0.6)] via-[rgba(196,138,86,0.32)] to-transparent",
  },
  {
    href: "/listing-studio",
    title: "Listing Studio",
    subtitle: "Competitive research to listing delivery",
    description:
      "Keep the existing analysis, keyword, copy, and export workflow inside the unified portal without splitting it into a separate site.",
    status: "Live",
    icon: ListChecks,
    accent: "from-[rgba(96,165,250,0.52)] via-[rgba(56,189,248,0.28)] to-transparent",
  },
  {
    href: "/listing-diagnostics",
    title: "Listing Diagnostics",
    subtitle: "Root cause drilldown and operator-grade action plans",
    description:
      "Diagnose BUYABLE and DISCOVERABLE blockers with deterministic findings, verified vs inferred evidence, and ranked next actions for operators.",
    status: "Live",
    icon: Search,
    accent: "from-[rgba(251,146,60,0.46)] via-[rgba(244,114,182,0.24)] to-transparent",
  },
  {
    href: "/legacy-copy-diagnosis",
    title: "Legacy Copy Diagnosis",
    subtitle: "Existing ASIN copy audit and rewrite priorities",
    description:
      "Turn a mature listing into a scored diagnosis across keyword coverage, category relevance, conversion evidence, asset coordination, and execution priority.",
    status: "New",
    icon: ClipboardList,
    accent: "from-[rgba(167,139,250,0.48)] via-[rgba(217,70,239,0.22)] to-transparent",
  },
  {
    href: "/ad-optimizer",
    title: "Ad Optimizer",
    subtitle: "Search-term diagnostics to bulk-ready actions",
    description:
      "Upload current and previous search-term reports plus a bulk identity sheet, then generate harvest, negate, and bid-adjustment actions with review-safe exports.",
    status: "New",
    icon: BadgeDollarSign,
    accent: "from-[rgba(132,204,22,0.42)] via-[rgba(16,185,129,0.24)] to-transparent",
  },
  {
    href: "/competitor-monitor",
    title: "Competitor Monitor",
    subtitle: "Repository-backed watchlists, ASIN detail, and alert triage",
    description:
      "Monitor live market watchlists, stored snapshots, sync coverage, and alert workflows through the real competitor-monitor API and repository layer.",
    status: "Live",
    icon: Radar,
    accent: "from-[rgba(251,146,60,0.46)] via-[rgba(244,114,182,0.24)] to-transparent",
  },
  {
    href: "/video-studio",
    title: "Video Studio",
    subtitle: "Video analysis, copy adaptation, and task orchestration",
    description:
      "Use the integrated video workspace for upload, breakdown, script rewriting, and generation task management through the current Next.js APIs.",
    status: "Integrated",
    icon: Video,
    accent: "from-[rgba(16,185,129,0.46)] via-[rgba(45,212,191,0.22)] to-transparent",
  },
];

const nextModules = [
  "Listing QA and issue detection",
  "Keyword radar and ranking snapshots",
  "Creative asset library and workflow memory",
  "Deeper placement automation and budget pacing",
];

export default function Home() {
  return (
    <main className="pb-12">
      <StudioHeader
        eyebrow="Unified operations portal"
        title="A single Amazon operating surface that can keep growing without losing module boundaries."
        description="Image, listing, competitor monitoring, and video now live behind one shared frontend entry point. Each module still keeps a clean boundary so the main thread can attach backend integrations without rewriting the portal shell."
      />

      <section className="page-shell mt-8">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {modules.map((module) => {
            const Icon = module.icon;

            return (
              <article
                key={module.href}
                className="obsidian-workbench group overflow-hidden p-1"
              >
                <div className="relative flex h-full flex-col rounded-[1.7rem] bg-[rgba(7,11,18,0.88)] p-6">
                  <div
                    className={`pointer-events-none absolute inset-x-4 top-0 h-28 rounded-full bg-gradient-to-r ${module.accent} opacity-20 blur-3xl transition duration-500 group-hover:opacity-30`}
                  />
                  <div className="relative flex items-start justify-between gap-4">
                    <div className="obsidian-soft-card inline-flex h-14 w-14 items-center justify-center border-[rgba(246,182,63,0.2)] bg-[rgba(246,182,63,0.12)] text-[#f6c78f]">
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="obsidian-meta-pill border-[rgba(246,182,63,0.18)] bg-[rgba(246,182,63,0.1)] text-[#f3d6ae]">
                      {module.status}
                    </span>
                  </div>

                  <p className="section-kicker relative mt-8">{module.subtitle}</p>
                  <h2 className="relative mt-3 font-heading text-3xl font-semibold tracking-[-0.04em] text-[#f7f0e6]">
                    {module.title}
                  </h2>
                  <p className="relative mt-3 text-sm leading-7 text-[#b7aa9a]">
                    {module.description}
                  </p>

                  <div className="relative mt-8 flex flex-1 flex-col justify-end">
                    <div className="obsidian-soft-card p-4">
                      <p className="text-sm font-medium text-[#f7f0e6]">
                      Designed to merge back into the main portal cleanly
                      </p>
                      <p className="mt-1 text-sm text-[#b7aa9a]">
                      Shared shell on top, isolated module internals underneath.
                      </p>
                    </div>
                    <Link
                      href={module.href}
                      className="obsidian-action mt-4 inline-flex items-center gap-2 self-start"
                    >
                      Open
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="page-shell mt-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="obsidian-workbench p-6 sm:p-7">
          <p className="section-kicker">Structure</p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em] text-[#f7f0e6]">
            One portal, clear module seams, and room for the next workflows.
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="obsidian-soft-card p-5">
              <p className="section-kicker">01</p>
              <h3 className="mt-3 text-xl font-semibold text-[#f7f0e6]">
                Single repository
              </h3>
              <p className="mt-2 text-sm leading-7 text-[#b7aa9a]">
                One deploy target, one frontend shell, and one place to manage growth.
              </p>
            </div>
            <div className="obsidian-soft-card p-5">
              <p className="section-kicker">02</p>
              <h3 className="mt-3 text-xl font-semibold text-[#f7f0e6]">
                Isolated modules
              </h3>
              <p className="mt-2 text-sm leading-7 text-[#b7aa9a]">
                Each surface keeps its own route space, service layer, and UI concerns.
              </p>
            </div>
            <div className="obsidian-soft-card p-5">
              <p className="section-kicker">03</p>
              <h3 className="mt-3 text-xl font-semibold text-[#f7f0e6]">
                Backend ready
              </h3>
              <p className="mt-2 text-sm leading-7 text-[#b7aa9a]">
                Module UIs can evolve without breaking the backend contracts behind them.
              </p>
            </div>
          </div>
        </article>

        <article className="obsidian-workbench p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="obsidian-soft-card inline-flex h-12 w-12 items-center justify-center border-[rgba(246,182,63,0.2)] bg-[rgba(246,182,63,0.12)] text-[#f6c78f]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="section-kicker">Expansion path</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#f7f0e6]">
                Modules that fit next
              </h2>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {nextModules.map((item, index) => (
              <div key={item} className="obsidian-soft-card flex items-center justify-between px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-[#f7f0e6]">{item}</p>
                  <p className="mt-1 text-sm text-[#b7aa9a]">
                    Add one route space, one module shell, and one service boundary.
                  </p>
                </div>
                <span className="obsidian-meta-pill">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="page-shell mt-8">
        <article className="obsidian-workbench overflow-hidden p-1">
          <div className="grid gap-1 lg:grid-cols-3">
            <div className="obsidian-soft-card px-6 py-7">
              <p className="section-kicker">GitHub</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#f7f0e6]">
                Shared source of truth
              </h3>
              <p className="mt-3 text-sm leading-7 text-[#b7aa9a]">
                Keep each frontend surface in one codebase so branches can add modules in parallel.
              </p>
            </div>
            <div className="obsidian-soft-card px-6 py-7">
              <p className="section-kicker">Vercel</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#f7f0e6]">
                Single deployment path
              </h3>
              <p className="mt-3 text-sm leading-7 text-[#b7aa9a]">
                The shell remains deployable while backend services evolve behind it.
              </p>
            </div>
            <div className="obsidian-soft-card px-6 py-7">
              <p className="section-kicker">Module seams</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#f7f0e6]">
                Safe parallel delivery
              </h3>
              <p className="mt-3 text-sm leading-7 text-[#b7aa9a]">
                Frontend modules keep a shared shell while data services, sync jobs, and repositories stay isolated underneath.
              </p>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
