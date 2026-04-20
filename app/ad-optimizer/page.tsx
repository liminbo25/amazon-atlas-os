import { AdOptimizerWorkbench } from "@/components/ad-optimizer/ad-optimizer-workbench";
import { StudioHeader } from "@/components/portal/studio-header";

export default function AdOptimizerPage() {
  return (
    <div className="min-h-screen pb-10">
      <StudioHeader
        eyebrow="广告优化"
        title="把搜索词、placement、预算和治理动作收敛成一个可执行的 Amazon Ads 操盘台"
        description="在现有 ad optimizer 基础上继续增强：同一工作流里完成搜索词收词、否词、竞价、placement 系数、预算放量/收缩、跨结构防内耗治理，以及 bulk-ready 导出。"
        badge="Local-first Ad Workbench"
      />
      <AdOptimizerWorkbench />
    </div>
  );
}
