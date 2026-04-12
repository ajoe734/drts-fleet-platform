import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";

export default async function MaintenancePage() {
  const client = getOpsClient();

  let records: unknown[] = [];
  let error: string | null = null;

  try {
    const result = await client.listMaintenance();
    records = (result as any)?.items ?? result ?? [];
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "#007AFF",
      in_progress: "#FF9500",
      completed: "#34C759",
      cancelled: "#8E8E93",
      overdue: "#FF3B30",
    };
    const color = colors[status] || "#8E8E93";
    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: "4px",
          backgroundColor: color,
          color: "#fff",
          fontSize: "12px",
          fontWeight: 600,
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <main className="app-grid">
      <AppShellCard
        title="Vehicle Maintenance"
        description="Track scheduled and completed maintenance for fleet vehicles."
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}
        {records.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Vehicle</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Recorded By</th>
                  <th>Cost</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r: any, i: number) => (
                  <tr key={i}>
                    <td>{r.logId ?? "-"}</td>
                    <td>{r.vehicleId ?? "-"}</td>
                    <td>{r.maintenanceType?.replace(/_/g, " ") ?? "-"}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td>{r.recordedBy ?? "-"}</td>
                    <td>{r.costAmount != null ? `$${r.costAmount}` : "-"}</td>
                    <td>
                      {r.updatedAt
                        ? new Date(r.updatedAt).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No maintenance records. Vehicles under maintenance cannot be
            dispatched.
          </p>
        )}
        <Link className="route-link" href="/">
          <strong>Back to home</strong> Return to ops console overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
