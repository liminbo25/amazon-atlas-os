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
        eyebrow="Listing 工作台"
        title="把产品输入、多源数据分析、VOC 诊断、文案生成和导出放进一条连续的亚马逊 Listing 工作流。"
        description="现有流程先承接产品信息，再串联卖家精灵真实数据、ABA、Rufus 与现有 VOC 分析，让最终文案生成真正做到三源结合。"
      />

      <section className="page-shell mt-8">
        <div className="obsidian-workbench overflow-hidden p-1">
          <div className="rounded-[1.7rem] border border-white/10 bg-[linear-gradient(135deg,rgba(10,14,22,0.96),rgba(20,32,47,0.94)_58%,rgba(53,34,24,0.9))] text-[#f7f0e6]">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-xs font-semibold tracking-[0.28em] text-[#b7aa9a]">
                当前流程
              </p>
              <h2 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em]">
                Listing 全流程工作台
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[#c8bbad]">
                继续使用现有的运行时配置与状态逻辑，但把输入、数据分析和文案生成链路统一到同一套 obsidian 工作台语言里。
              </p>
            </div>

            <div className="border-b border-white/10 px-4 py-4 sm:px-6">
              <StepNav />
            </div>

            <main className="bg-[rgba(5,8,14,0.28)] px-4 py-6 sm:px-6">
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
        </div>
      </section>
    </div>
  );
}
