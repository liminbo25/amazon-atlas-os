import { LegacyCopyDiagnosisWorkbench } from "@/components/legacy-copy-diagnosis/legacy-copy-diagnosis-workbench";
import { StudioHeader } from "@/components/portal/studio-header";

export default function LegacyCopyDiagnosisPage() {
  return (
    <div className="min-h-screen pb-10">
      <StudioHeader
        eyebrow="老品诊断"
        title="直接定位老品卡点，给出可执行改写和复盘动作。"
        description="输入目标 ASIN、竞品 ASIN 和可选当前文案后，只输出字段级问题、优先级动作、改写建议和 7/14/28 天验证指标。"
        badge="ASIN diagnosis workspace"
      />

      <LegacyCopyDiagnosisWorkbench />
    </div>
  );
}
