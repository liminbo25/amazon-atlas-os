import { DiagnosticsWorkbench } from "@/components/listing-diagnostics/diagnostics-workbench";
import { StudioHeader } from "@/components/portal/studio-header";

export default function ListingDiagnosticsPage() {
  return (
    <main className="pb-12">
      <StudioHeader
        eyebrow="Listing 诊断"
        title="把 Listing 诊断结果整理成可执行的运营决策台，而不是只有一堆原始字段。"
        description="SellerSprite 继续作为主分析路径，可选的 Amazon SP-API 校验会把部分方向性信号升级为已验证问题。结果会按业务影响排序，清楚区分症状、根因和动作优先级，并支持直接导出中文分析表。"
        badge="SellerSprite + SP-API 诊断"
      />

      <DiagnosticsWorkbench />
    </main>
  );
}
