"use client";

import { useListingStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Check,
  Database,
  Download,
  FileText,
  MessageSquareText,
  Search,
} from "lucide-react";

const steps = [
  { num: 1, name: "产品输入", icon: Search },
  { num: 2, name: "数据分析", icon: Database },
  { num: 3, name: "VOC 诊断", icon: MessageSquareText },
  { num: 4, name: "文案生成", icon: FileText },
  { num: 5, name: "导出", icon: Download },
];

export function StepNav() {
  const { currentStep, setCurrentStep, aiRuntimeSettings } = useListingStore();
  const currentMeta = steps.find((step) => step.num === currentStep) ?? steps[0];
  const runtimeCount = Object.keys(aiRuntimeSettings).length;
  const customizedRuntimeCount = Object.values(aiRuntimeSettings).filter(
    (config) => config.baseUrl.trim().length > 0 || config.model.trim().length > 0
  ).length;

  return (
    <nav className="obsidian-filter-bar">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 py-3">
          <p className="text-sm font-medium text-[#f7f0e6]">流程导航</p>
          <div className="text-right">
            <p className="text-xs text-[#b7aa9a]">
              当前步骤 {Math.min(currentStep, steps.length)}/{steps.length}
              <span className="hidden sm:inline"> · {currentMeta.name}</span>
            </p>
            <p className="text-xs text-[#998e82]">
              AI Runtime{" "}
              {customizedRuntimeCount > 0
                ? `已自定义 ${customizedRuntimeCount}/${runtimeCount}`
                : "跟随服务端默认"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.num;
            const isCompleted = currentStep > step.num;
            const canNavigate = step.num <= currentStep;

            return (
              <div key={step.num} className="flex items-center">
                {index > 0 ? (
                  <div
                    className={cn(
                      "mx-1 h-px w-8",
                      isCompleted ? "bg-[rgba(246,182,63,0.7)]" : "bg-white/12"
                    )}
                  />
                ) : null}

                <button
                  type="button"
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`前往第 ${step.num} 步：${step.name}`}
                  title={step.name}
                  onClick={() => {
                    if (canNavigate) {
                      setCurrentStep(step.num);
                    }
                  }}
                  disabled={!canNavigate}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-all",
                    isActive &&
                      "border-[rgba(246,182,63,0.32)] bg-[rgba(246,182,63,0.18)] text-[#f7f0e6] shadow-[0_12px_30px_rgba(0,0,0,0.22)]",
                    isCompleted &&
                      !isActive &&
                      "border-[rgba(246,182,63,0.2)] bg-[rgba(246,182,63,0.1)] text-[#f1d7b1]",
                    !isActive &&
                      !isCompleted &&
                      canNavigate &&
                      "border-white/10 bg-[rgba(255,255,255,0.04)] text-[#c8bbad] hover:bg-[rgba(255,255,255,0.08)]",
                    !canNavigate &&
                      "cursor-not-allowed border-white/8 bg-[rgba(255,255,255,0.02)] text-[#7f756b]"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      isActive && "bg-white/10 text-[#f7f0e6]",
                      isCompleted &&
                        !isActive &&
                        "bg-[rgba(246,182,63,0.2)] text-[#f7f0e6]",
                      !isActive && !isCompleted && "bg-white/5 text-[#c8bbad]"
                    )}
                  >
                    {isCompleted && !isActive ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <span className="hidden sm:inline">{step.name}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
