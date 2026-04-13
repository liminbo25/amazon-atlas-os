import { AdOptimizerWorkbench } from "@/components/ad-optimizer/ad-optimizer-workbench";
import { StudioHeader } from "@/components/portal/studio-header";

export default function AdOptimizerPage() {
  return (
    <div className="min-h-screen pb-10">
      <StudioHeader
        eyebrow="广告优化"
        title="把搜索词报表、bulk 身份表和优化动作收进一个真正可执行的广告工作台。"
        description="先在本地跑通 Amazon Ads 搜索词分析、捞词、否词、调价和 bulk 导出，再逐步补 placement 和更细的自动化规则。当前版本重点解决：能不能稳定读表、能不能补齐身份字段、能不能直接产出可执行文件。"
        badge="Local-first bulk workflow"
      />
      <AdOptimizerWorkbench />
    </div>
  );
}
