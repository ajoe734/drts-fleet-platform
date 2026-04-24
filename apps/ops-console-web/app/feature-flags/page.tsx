import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getServerOpsClient } from "@/lib/api-client.server";

export default async function FeatureFlagsPage() {
  const client = await getServerOpsClient();

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
        description={`Fetched from /api/admin/flags. ${flags.length} flag(s).`}
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
                </tr>
              </thead>
              <tbody>
                {flags.map((f: any, i: number) => (
                  <tr key={i}>
                    <td>
                      <code>{f.key}</code>
                    </td>
                    <td>{f.enabled ? "✅" : "❌"}</td>
                    <td>{f.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No flags found.</p>
        )}
        <Link className="route-link" href="/">
          <strong>Back to home</strong> Return to ops console overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
