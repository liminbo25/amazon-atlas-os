import Link from "next/link";
import {
  BadgeDollarSign,
  ArrowRight,
  ClipboardList,
  ImagePlus,
  ListChecks,
  Radar,
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
    accent: "from-amber-200 via-orange-100 to-white",
  },
  {
    href: "/listing-studio",
    title: "Listing Studio",
    subtitle: "Competitive research to listing delivery",
    description:
      "Keep the existing analysis, keyword, copy, and export workflow inside the unified portal without splitting it into a separate site.",
    status: "Live",
    icon: ListChecks,
    accent: "from-sky-200 via-cyan-100 to-white",
  },
  {
    href: "/legacy-copy-diagnosis",
    title: "Legacy Copy Diagnosis",
    subtitle: "Existing ASIN copy audit and rewrite priorities",
    description:
      "Turn a mature listing into a scored diagnosis across keyword coverage, category relevance, conversion evidence, asset coordination, and execution priority.",
    status: "New",
    icon: ClipboardList,
    accent: "from-violet-200 via-fuchsia-100 to-white",
  },
  {
    href: "/ad-optimizer",
    title: "Ad Optimizer",
    subtitle: "Search-term diagnostics to bulk-ready actions",
    description:
      "Upload current and previous search-term reports plus a bulk identity sheet, then generate harvest, negate, and bid-adjustment actions with review-safe exports.",
    status: "New",
    icon: BadgeDollarSign,
    accent: "from-lime-200 via-emerald-100 to-white",
  },
  {
    href: "/competitor-monitor",
    title: "Competitor Monitor",
    subtitle: "Repository-backed watchlists, ASIN detail, and alert triage",
    description:
      "Monitor live market watchlists, stored snapshots, sync coverage, and alert workflows through the real competitor-monitor API and repository layer.",
    status: "Live",
    icon: Radar,
    accent: "from-rose-200 via-orange-100 to-white",
  },
  {
    href: "/video-studio",
    title: "Video Studio",
    subtitle: "Video analysis, copy adaptation, and task orchestration",
    description:
      "Use the integrated video workspace for upload, breakdown, script rewriting, and generation task management through the current Next.js APIs.",
    status: "Integrated",
    icon: Video,
    accent: "from-emerald-200 via-teal-100 to-white",
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
                className="glass-panel overflow-hidden"
              >
                <div className={`bg-gradient-to-br ${module.accent} p-6`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-slate-950 text-white">
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {module.status}
                    </span>
                  </div>

                  <p className="mt-8 section-kicker">{module.subtitle}</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                    {module.title}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {module.description}
                  </p>
                </div>

                <div className="flex items-center justify-between px-6 py-5">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Designed to merge back into the main portal cleanly
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Shared shell on top, isolated module internals underneath.
                    </p>
                  </div>
                  <Link
                    href={module.href}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Open
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="page-shell mt-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="glass-panel p-6 sm:p-7">
          <p className="section-kicker">Structure</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            One portal, clear module seams, and room for the next workflows.
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <p className="section-kicker">01</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">
                Single repository
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                One deploy target, one frontend shell, and one place to manage growth.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <p className="section-kicker">02</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">
                Isolated modules
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                Each surface keeps its own route space, service layer, and UI concerns.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <p className="section-kicker">03</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">
                Backend ready
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                Module UIs can evolve without breaking the backend contracts behind them.
              </p>
            </div>
          </div>
        </article>

        <article className="glass-panel p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-300 text-slate-950">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="section-kicker">Expansion path</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Modules that fit next
              </h2>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {nextModules.map((item, index) => (
              <div
                key={item}
                className="flex items-center justify-between rounded-[1.4rem] border border-slate-200 bg-white/85 px-4 py-4"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-950">{item}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Add one route space, one module shell, and one service boundary.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="page-shell mt-8">
        <article className="glass-panel overflow-hidden">
          <div className="grid gap-px bg-slate-200 lg:grid-cols-3">
            <div className="bg-white px-6 py-7">
              <p className="section-kicker">GitHub</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Shared source of truth
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                Keep each frontend surface in one codebase so branches can add modules in parallel.
              </p>
            </div>
            <div className="bg-white px-6 py-7">
              <p className="section-kicker">Vercel</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Single deployment path
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                The shell remains deployable while backend services evolve behind it.
              </p>
            </div>
            <div className="bg-white px-6 py-7">
              <p className="section-kicker">Module seams</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Safe parallel delivery
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                Frontend modules keep a shared shell while data services, sync jobs, and repositories stay isolated underneath.
              </p>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
