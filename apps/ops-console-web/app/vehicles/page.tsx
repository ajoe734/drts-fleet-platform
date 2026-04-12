import Link from "next/link";
import type { VehicleRegistryRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";

export default async function VehiclesPage() {
  const client = getOpsClient();

  let vehicles: VehicleRegistryRecord[] = [];
  let error: string | null = null;

  try {
    vehicles = await client.listVehicles();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Vehicles Registry"
        description={`Fetched from /api/regulatory-registry/vehicles. ${vehicles.length} vehicle(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}
        {vehicles.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Vehicle ID</th>
                  <th>Plate</th>
                  <th>Area</th>
                  <th>Insurance</th>
                  <th>Dispatchable</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => (
                  <tr key={vehicle.vehicleId}>
                    <td>{vehicle.vehicleId}</td>
                    <td>{vehicle.plateNo}</td>
                    <td>{vehicle.operatingArea}</td>
                    <td>{vehicle.insuranceStatus}</td>
                    <td>{vehicle.dispatchableFlag ? "✅" : "❌"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No vehicles registered. Add via regulatory registry.
          </p>
        )}
        <Link className="route-link" href="/">
          <strong>Back to home</strong> Return to ops console overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
