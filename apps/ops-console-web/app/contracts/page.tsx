import Link from "next/link";
import type { VehicleContractRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";

export default async function ContractsPage() {
  const client = getOpsClient();

  let contracts: VehicleContractRecord[] = [];
  let error: string | null = null;

  try {
    contracts = await client.listContracts();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Contracts Registry"
        description={`Fetched from /api/regulatory-registry/contracts. ${contracts.length} contract(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}
        {contracts.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Contract ID</th>
                  <th>Vehicle</th>
                  <th>Partner</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.contractId}>
                    <td>{contract.contractId}</td>
                    <td>{contract.vehicleId}</td>
                    <td>{contract.partnerId}</td>
                    <td>{contract.contractType}</td>
                    <td>{contract.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No contracts registered. Add via regulatory registry.
          </p>
        )}
        <Link className="route-link" href="/">
          <strong>Back to home</strong> Return to ops console overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
