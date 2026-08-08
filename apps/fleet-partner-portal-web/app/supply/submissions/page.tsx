import { SupplySubmissionList } from "@/components/fleet-supply-workspace";
import { loadSupplySubmissions } from "@/lib/fleet-portal-supply.server";

export const dynamic = "force-dynamic";

export default async function FleetSupplySubmissionsPage() {
  const { rows, source } = await loadSupplySubmissions();
  return <SupplySubmissionList rows={rows} source={source} />;
}
