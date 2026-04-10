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
  { num: 1, name: "需求确认", icon: Search },
  { num: 2, name: "竞品数据采集", icon: Database },
  { num: 3, name: "VOC 深度分析", icon: MessageSquareText },
  { num: 4, name: "Listing 生成", icon: FileText },
  { num: 5, name: "导出", icon: Download },
];

export function StepNav() {
  const { currentStep, setCurrentStep, aiRuntimeSettings } = useListingStore();
  const currentMeta = steps.find((step) => step.num === currentStep) ?? steps[0];
  const customizedRuntimeCount = Object.values(aiRuntimeSettings).filter(
    (config) => config.baseUrl.trim().length > 0 || config.model.trim().length > 0
  ).length;

  return (
    <nav className="border-b bg-card">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between gap-3 border-b py-3">
          <p className="text-sm font-medium">流程导航</p>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              当前步骤 {Math.min(currentStep, steps.length)}/{steps.length}
              <span className="hidden sm:inline"> · {currentMeta.name}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              AI Runtime{" "}
              {customizedRuntimeCount > 0
                ? `已自定义 ${customizedRuntimeCount}/${Object.keys(aiRuntimeSettings).length}`
                : "跟随服务端默认"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto py-3">
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
                      "mx-1 h-[2px] w-8",
                      isCompleted ? "bg-orange-500" : "bg-muted"
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
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-all",
                    isActive && "bg-orange-500 text-white shadow-md",
                    isCompleted && !isActive && "bg-orange-100 text-orange-700",
                    !isActive &&
                      !isCompleted &&
                      canNavigate &&
                      "text-muted-foreground hover:bg-muted",
                    !canNavigate && "cursor-not-allowed text-muted-foreground/50"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      isActive && "bg-white/20",
                      isCompleted && !isActive && "bg-orange-500 text-white"
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
