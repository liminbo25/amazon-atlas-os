import Link from "next/link";
import { ArrowRight, ImagePlus, ListChecks, Video } from "lucide-react";
import { StudioHeader } from "@/components/portal/studio-header";

const modules = [
  {
    href: "/image-studio",
    title: "图片",
    description: "服装图上传、模特参考图、批量试穿、高清增强导出。",
    icon: ImagePlus,
    accent: "from-amber-200 via-orange-100 to-white",
  },
  {
    href: "/listing-studio",
    title: "Listing",
    description: "竞品 ASIN、评论、关键词、图片卖点、文案生成与导出。",
    icon: ListChecks,
    accent: "from-sky-200 via-cyan-100 to-white",
  },
  {
    href: "/video-studio",
    title: "视频",
    description: "本地视频拆解、脚本改写、视频生成任务配置。",
    icon: Video,
    accent: "from-emerald-200 via-teal-100 to-white",
  },
];

export default function Home() {
  return (
    <main className="pb-12">
      <StudioHeader eyebrow="工具入口" title="选择要使用的工具" />

      <section className="page-shell mt-8">
        <div className="grid gap-5 xl:grid-cols-3">
          {modules.map((module) => {
            const Icon = module.icon;

            return (
              <article key={module.href} className="glass-panel overflow-hidden">
                <div className={`bg-gradient-to-br ${module.accent} p-6`}>
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-slate-950 text-white">
                    <Icon className="h-6 w-6" />
                  </div>

                  <h2 className="mt-8 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                    {module.title}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {module.description}
                  </p>
                </div>

                <div className="flex items-center justify-end px-6 py-5">
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
    </main>
  );
}
