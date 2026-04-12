import Link from "next/link";
import type { TenantApiKeyRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export default async function ApiKeysPage() {
  const client = getTenantClient();

  let apiKeys: TenantApiKeyRecord[] = [];
  let error: string | null = null;

  try {
    apiKeys = await client.listApiKeys();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="API Keys"
        description={`Fetched from /api/tenant/api-keys. ${apiKeys.length} key(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {apiKeys.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Key ID</th>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Scopes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((apiKey) => (
                  <tr key={apiKey.apiKeyId}>
                    <td>{apiKey.apiKeyId}</td>
                    <td>{apiKey.keyName}</td>
                    <td>{apiKey.keyPrefix}</td>
                    <td>{apiKey.scopes.join(", ")}</td>
                    <td>{apiKey.revokedAt ? "❌ Revoked" : "✅ Active"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No API keys found. Issue via tenant partner API.
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
