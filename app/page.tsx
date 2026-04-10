import Link from "next/link";
import { ArrowRight, ImagePlus, ListChecks, Sparkles, Video } from "lucide-react";
import { StudioHeader } from "@/components/portal/studio-header";

const modules = [
  {
    href: "/image-studio",
    title: "图片工坊",
    subtitle: "模特换装与高质量放大",
    description:
      "上传服装图与模特参考图，批量生成试穿效果，并对优选结果进行超分增强导出。",
    status: "已接入前后端",
    icon: ImagePlus,
    accent: "from-amber-200 via-orange-100 to-white",
  },
  {
    href: "/listing-studio",
    title: "Listing 工坊",
    subtitle: "竞品分析到文案导出的一体流程",
    description:
      "围绕竞品 ASIN、评论、流量词和图片卖点，完成分析、关键词策略、文案生成与导出。",
    status: "已接入前后端",
    icon: ListChecks,
    accent: "from-sky-200 via-cyan-100 to-white",
  },
  {
    href: "/video-studio",
    title: "视频工坊",
    subtitle: "视频拆解、脚本改写与生成任务",
    description:
      "统一接入现有 FastAPI 视频后端，支持本地视频拆解、AI 改写脚本和多模型视频生成任务编排。",
    status: "前端已整合，后端独立部署",
    icon: Video,
    accent: "from-emerald-200 via-teal-100 to-white",
  },
];

const nextModules = [
  "广告分析与投放建议",
  "Listing 诊断与问题定位",
  "关键词与竞品雷达",
  "素材资产库与项目归档",
];

export default function Home() {
  return (
    <main className="pb-12">
      <StudioHeader
        eyebrow="统一运营平台"
        title="把你已经做好的三个模块，收拢成一个可持续扩展的亚马逊运营总控台。"
        description="这个新仓库会成为你的统一前端入口、统一部署项目和统一后续扩展底座。图片、Listing、视频三个工坊已经被整理成独立路由，后续新增广告、诊断、报表模块时也能按同样结构继续长出来。"
      />

      <section className="page-shell mt-8">
        <div className="grid gap-5 xl:grid-cols-3">
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
                      适合后续继续独立维护
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      保留模块边界，避免越改越乱
                    </p>
                  </div>
                  <Link
                    href={module.href}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    打开
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
          <p className="section-kicker">设计思路</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            一个公开入口，三条清晰边界，后续还能继续加模块。
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <p className="section-kicker">01</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">
                单仓统一
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                以后只维护一个 GitHub 仓库，Vercel 只接一个项目。
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <p className="section-kicker">02</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">
                模块独立
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                图片、Listing、视频各自保留边界，未来广告模块也可平移接入。
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
              <p className="section-kicker">03</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">
                发布友好
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                Web 前端直接上 Vercel，重计算视频后端独立保留，更稳。
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
              <p className="section-kicker">扩展路线</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                后面适合接进来的模块
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
                    新增时只需要一条新路由和一组模块组件
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
                统一代码源
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                这个仓库会成为你后续所有版本的唯一来源，改代码后直接提交推送即可。
              </p>
            </div>
            <div className="bg-white px-6 py-7">
              <p className="section-kicker">Vercel</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                自动发版前端
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                每次 `git push` 后自动重新部署，让你分享出去的链接始终保持最新。
              </p>
            </div>
            <div className="bg-white px-6 py-7">
              <p className="section-kicker">Video Backend</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                独立承载重计算
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                当前视频分析依赖 Python、OpenCV 和 Whisper，保留独立后端更适合后续扩展。
              </p>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
