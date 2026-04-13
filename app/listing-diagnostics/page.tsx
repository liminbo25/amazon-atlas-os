import { DiagnosticsWorkbench } from "@/components/listing-diagnostics/diagnostics-workbench";
import { StudioHeader } from "@/components/portal/studio-header";

export default function ListingDiagnosticsPage() {
  return (
    <main className="pb-12">
      <StudioHeader
        eyebrow="Listing Diagnostics"
        title="Diagnose a listing with deterministic scoring before you commit to deeper remediation."
        description="Phase 1 keeps the SellerSprite MVP scoring path, and can optionally add Amazon SP-API verification for target catalog and seller-account blockers. It benchmarks the target ASIN against competitor listings, scores content coverage and keyword opportunity, clusters review themes, and returns an action plan with confidence plus verified versus inferred signals."
        badge="SellerSprite MVP + SP-API Optional"
      />

      <DiagnosticsWorkbench />
    </main>
  );
}
