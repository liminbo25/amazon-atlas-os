import { DiagnosticsWorkbench } from "@/components/listing-diagnostics/diagnostics-workbench";
import { StudioHeader } from "@/components/portal/studio-header";

export default function ListingDiagnosticsPage() {
  return (
    <main className="pb-12">
      <StudioHeader
        eyebrow="Listing Diagnostics"
        title="Turn listing diagnostics into an operator decision console with verified versus inferred root causes."
        description="SellerSprite remains the deterministic primary path, while optional Amazon SP-API verification upgrades BUYABLE and DISCOVERABLE blockers from directional signals into verified root-cause drilldowns. The result is ranked by business impact, shows symptom and root cause clearly, and outputs an operator-ready action plan instead of generic advice."
        badge="SellerSprite + SP-API drilldown"
      />

      <DiagnosticsWorkbench />
    </main>
  );
}
