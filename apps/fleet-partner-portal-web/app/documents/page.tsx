import { SupplyDocumentsBoard } from "@/components/fleet-supply-workspace";
import { loadSupplyDocuments } from "@/lib/fleet-portal-supply.server";

export const dynamic = "force-dynamic";

export default async function FleetDocumentsPage() {
  const data = await loadSupplyDocuments();
  return <SupplyDocumentsBoard data={data} />;
}
