import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";

export default async function DashboardPage() {
  const client = getOpsClient();

  let systemInfo: Record<string, unknown> | null = null;
  let error: string | null = null;

  try {
    const [foundation, identity] = await Promise.all([
      client.get("/api/system/foundation/manifest"),
      client.getIdentityContext(),
    ]);
    systemInfo = { foundation, identity };
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Dashboard"
        description="Operational overview and system health."
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}
        {systemInfo && (
          <div className="system-info">
            <pre>{JSON.stringify(systemInfo, null, 2)}</pre>
          </div>
        )}
      </AppShellCard>
    </main>
  );
}
