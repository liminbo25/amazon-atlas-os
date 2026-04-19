import { getListingDiagnosticsCapabilities } from "@/lib/listing-diagnostics/sp-api";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getListingDiagnosticsCapabilities());
}
