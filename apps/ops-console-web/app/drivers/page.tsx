import Link from "next/link";
import type { DriverRegistryRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";

export default async function DriversPage() {
  const client = getOpsClient();

  let drivers: DriverRegistryRecord[] = [];
  let error: string | null = null;

  try {
    drivers = await client.listDrivers();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Drivers Registry"
        description={`Fetched from /api/regulatory-registry/drivers. ${drivers.length} driver(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}
        {drivers.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Driver ID</th>
                  <th>Name</th>
                  <th>Work State</th>
                  <th>Eligible</th>
                  <th>Earnings</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr key={driver.driverId}>
                    <td>{driver.driverId}</td>
                    <td>
                      <Link
                        href={`/drivers/${encodeURIComponent(driver.driverId)}`}
                      >
                        {driver.name}
                      </Link>
                    </td>
                    <td>{driver.workState}</td>
                    <td>{driver.licensesValid ? "✅" : "❌"}</td>
                    <td>
                      <Link
                        href={`/drivers/${encodeURIComponent(driver.driverId)}`}
                      >
                        View earnings
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No drivers registered. Add via regulatory registry.
          </p>
        )}
        <Link className="route-link" href="/">
          <strong>Back to home</strong> Return to ops console overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
