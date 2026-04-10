"use client";

import { RuntimeConfigPanel } from "@/components/RuntimeConfigPanel";
import { StepNav } from "@/components/StepNav";
import { StudioHeader } from "@/components/portal/studio-header";
import { Step1Analysis } from "@/components/steps/Step1Analysis";
import { Step2Keywords } from "@/components/steps/Step2Keywords";
import { Step3Copy } from "@/components/steps/Step3Copy";
import { Step4Generate } from "@/components/steps/Step4Generate";
import { Step5Export } from "@/components/steps/Step5Export";
import { useListingStore } from "@/lib/store";

export default function ListingStudioPage() {
  const { currentStep } = useListingStore();

  return (
    <div className="min-h-screen pb-10">
      <StudioHeader
        eyebrow="Listing 工坊"
        title="把竞品分析、VOC 洞察、文案生成和导出，放进一条连续的亚马逊 Listing 工作流。"
        description="这个模块保留你现有的五步式流程，同时被纳入统一门户。你后续可以继续迭代关键词、合规、导出模板，而不用拆分成新的独立站点。"
      />

      <section className="page-shell mt-8">
        <div className="glass-panel overflow-hidden">
          <div className="border-b border-slate-200/80 bg-[linear-gradient(90deg,#102033,#1f415b)] px-6 py-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/50">
              Current flow
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
              Listing 全流程工作台
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-white/70">
              继续使用你现有的运行时配置与状态逻辑，但整体视觉和导航已经并入统一总控台。
            </p>
          </div>

          <div className="border-b border-slate-200/80 px-4 py-4 sm:px-6">
            <StepNav />
          </div>

          <main className="px-4 py-6 sm:px-6">
            <div className="mb-6">
              <RuntimeConfigPanel />
            </div>

            {currentStep === 1 ? <Step1Analysis /> : null}
            {currentStep === 2 ? <Step2Keywords /> : null}
            {currentStep === 3 ? <Step3Copy /> : null}
            {currentStep === 4 ? <Step4Generate /> : null}
            {currentStep === 5 ? <Step5Export /> : null}
          </main>
        </div>
      </section>
    </div>
  );
}
