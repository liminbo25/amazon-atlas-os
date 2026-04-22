import { DiagnosticsWorkbench } from "@/components/listing-diagnostics/diagnostics-workbench";
import { StudioHeader } from "@/components/portal/studio-header";

export default function ListingDiagnosticsPage() {
  return (
    <main className="pb-12">
      <StudioHeader
        eyebrow="Listing 诊断"
        title="把 Listing 诊断改造成一份能直接执行的中文运营报告"
        description="SellerSprite 负责基础数据采集，Amazon SP-API 负责把可售性与目录阻塞项升级成已验证问题。页面结果会直接输出基础对比、关键词竞争、Listing 优缺点、优化方案、覆盖矩阵和行动清单，而不是只给一串英文 findings。"
        badge="SellerSprite + SP-API"
      />

      <DiagnosticsWorkbench />
    </main>
  );
}
