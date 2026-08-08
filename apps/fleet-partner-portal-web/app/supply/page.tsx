import { SupplyDashboard } from "@/components/fleet-supply-workspace";
import { loadSupplyDashboard } from "@/lib/fleet-portal-supply.server";

export const dynamic = "force-dynamic";

export default async function FleetSupplyPage() {
  const data = await loadSupplyDashboard();
  return <SupplyDashboard data={data} />;
}
