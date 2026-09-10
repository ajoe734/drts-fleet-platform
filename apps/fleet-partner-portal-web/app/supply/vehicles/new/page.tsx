import { getSupplyDraftScope } from "@/lib/fleet-portal-supply.server";
import { NewVehicleSubmissionForm } from "@/components/fleet-supply-workspace";

export const dynamic = "force-dynamic";

export default async function FleetSupplyVehicleNewPage() {
  return <NewVehicleSubmissionForm draftScope={await getSupplyDraftScope()} />;
}
