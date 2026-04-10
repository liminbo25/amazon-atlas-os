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
        eyebrow="Listing"
        title="Listing 工具"
      />

      <section className="page-shell mt-8">
        <div className="glass-panel overflow-hidden">
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
