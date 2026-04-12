import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export default async function FeatureFlagsPage() {
  const client = getTenantClient();

  let flags: unknown[] = [];
  let error: string | null = null;

  try {
    const summary = await client.getFeatureFlags();
    flags = summary.flags;
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Feature Flags"
        description={`Fetched from /api/admin/flags. ${flags.length} flag(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {flags.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag: any, i: number) => (
                  <tr key={i}>
                    <td>
                      <code>{flag.key}</code>
                    </td>
                    <td>{flag.enabled ? "✅ Enabled" : "❌ Disabled"}</td>
                    <td>{flag.description}</td>
                    <td>
                      {flag.updatedAt
                        ? new Date(flag.updatedAt).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No feature flags found.</p>
        )}

        <Link className="route-link" href="/">
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
