import Link from "next/link";
import type { TenantPassengerRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export default async function PassengersPage() {
  const client = getTenantClient();

  let passengers: TenantPassengerRecord[] = [];
  let error: string | null = null;

  try {
    passengers = await client.listPassengers();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Passengers"
        description={`Fetched from /api/tenant/passengers. ${passengers.length} passenger(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {passengers.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Passenger ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Phone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {passengers.map((passenger) => (
                  <tr key={passenger.passengerId}>
                    <td>{passenger.passengerId}</td>
                    <td>{passenger.fullName}</td>
                    <td>{passenger.departmentName ?? "-"}</td>
                    <td>{passenger.mobile ?? "-"}</td>
                    <td>
                      {passenger.activeFlag ? "✅ Active" : "❌ Inactive"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No passengers found. Add via tenant partner API.
          </p>
        )}

        <Link className="route-link" href="/">
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
