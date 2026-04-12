import Link from "next/link";
import {
  ArrowRight,
  ImagePlus,
  ListChecks,
  Search,
  Sparkles,
  Video,
} from "lucide-react";
import { StudioHeader } from "@/components/portal/studio-header";

const modules = [
  {
    href: "/image-studio",
    title: "Image Studio",
    subtitle: "Model swaps and upscale workflows",
    description:
      "Upload product imagery, generate polished try-on or replacement outputs, then export the strongest visual candidates.",
    status: "Live",
    icon: ImagePlus,
    accent: "from-amber-200 via-orange-100 to-white",
  },
  {
    href: "/listing-studio",
    title: "Listing Studio",
    subtitle: "From competitor analysis to exportable copy",
    description:
      "Run the current end-to-end listing workflow across competitor analysis, keywords, copy generation, compliance, and export.",
    status: "Live",
    icon: ListChecks,
    accent: "from-sky-200 via-cyan-100 to-white",
  },
  {
    href: "/listing-diagnostics",
    title: "Listing Diagnosis",
    subtitle: "Deterministic scoring and action planning",
    description:
      "Benchmark a target ASIN against competitors, review source coverage, inspect findings, and walk away with a confidence-scored action plan.",
    status: "Phase 1 MVP",
    icon: Search,
    accent: "from-rose-200 via-orange-100 to-white",
  },
  {
    href: "/video-studio",
    title: "Video Studio",
    subtitle: "Video analysis, script rewrites, and generation tasks",
    description:
      "Connect the existing FastAPI video backend so teams can analyze footage, rewrite scripts, and orchestrate generation jobs from one front end.",
    status: "Integrated",
    icon: Video,
    accent: "from-emerald-200 via-teal-100 to-white",
  },
];

const nextModules = [
  "Ads diagnostics and spend control",
  "Keyword intelligence and competitor radar",
  "Asset library and workflow automation",
  "Reporting and team operations",
];

export default function Home() {
  return (
    <main className="pb-12">
      <StudioHeader
        eyebrow="Unified Operating Layer"
        title="Run image, listing, diagnostics, and video workflows from one Amazon operating surface."
        description="This repo is the front-end home for modular Amazon tools. Each studio keeps a clear boundary, but the shared shell, navigation, and deployment path make it easy to add the next operating module without rebuilding the product foundation."
      />

      <section className="page-shell mt-8">
        <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-4">
          {modules.map((module) => {
            const Icon = module.icon;

            return (
              <article key={module.href} className="glass-panel overflow-hidden">
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

                <div className="flex items-center justify-between gap-4 px-6 py-5">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Modular path, shared shell
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Each route can evolve independently without fragmenting the product.
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
          <p className="section-kicker">Operating model</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            One entry point, clear module boundaries, and room to keep adding tools.
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <p className="section-kicker">01</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">
                One repo
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                Ship the front end from one codebase instead of splitting each surface into a separate project.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <p className="section-kicker">02</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">
                Clear modules
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                Image, listing, diagnosis, and video routes stay independently maintainable even inside the shared shell.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <p className="section-kicker">03</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">
                Deployment friendly
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                One GitHub repo and one Vercel project keep release flow lightweight while heavier backends stay decoupled.
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
                Good candidates for the next modules
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
                    Add a new route, a focused component set, and a scoped service layer without disturbing the rest of the shell.
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
                Changes for every studio land in one repository, which keeps branching, reviews, and release notes simple.
              </p>
            </div>
            <div className="bg-white px-6 py-7">
              <p className="section-kicker">Vercel</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Front-end release path
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                Push once and publish the web shell continuously while backend-heavy systems stay independently deployable.
              </p>
            </div>
            <div className="bg-white px-6 py-7">
              <p className="section-kicker">Backends</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Specialized compute stays decoupled
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                Video analysis, future SP-API services, and heavier compute jobs can evolve on their own timelines without bloating the shell.
              </p>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
