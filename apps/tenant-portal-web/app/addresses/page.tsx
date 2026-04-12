import Link from "next/link";
import type { TenantAddressRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export default async function AddressesPage() {
  const client = getTenantClient();

  let addresses: TenantAddressRecord[] = [];
  let error: string | null = null;

  try {
    addresses = await client.listAddresses();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Addresses"
        description={`Fetched from /api/tenant/addresses. ${addresses.length} address(es) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {addresses.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Address ID</th>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Tags</th>
                  <th>Geocoded</th>
                </tr>
              </thead>
              <tbody>
                {addresses.map((address) => (
                  <tr key={address.addressId}>
                    <td>{address.addressId}</td>
                    <td>{address.addressName}</td>
                    <td>{address.addressText}</td>
                    <td>
                      {address.tags.length > 0 ? address.tags.join(", ") : "-"}
                    </td>
                    <td>
                      {address.lat != null && address.lng != null ? "✅" : "❌"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No addresses found. Add via tenant partner API.
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
