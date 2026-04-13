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
        title="把产品输入、多源数据分析、VOC 诊断、文案生成和导出，放进一条连续的亚马逊 Listing 工作流。"
        description="现在的流程会先接住产品信息，再串联卖家精灵真实数据、ABA、Rufus 与现有 VOC 分析，让最终文案生成真正做到三源结合。"
      />

      <section className="page-shell mt-8">
        <div className="glass-panel overflow-hidden">
          <div className="border-b border-slate-200/80 bg-[linear-gradient(90deg,#102033,#1f415b)] px-6 py-5 text-white">
            <p className="text-xs font-semibold tracking-[0.28em] text-white/50">
              当前流程
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
              Listing 全流程工作台
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-white/70">
              继续使用你现有的运行时配置与状态逻辑，但输入、数据分析和文案生成链路已经升级为更贴近实际运营的多源工作流。
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
