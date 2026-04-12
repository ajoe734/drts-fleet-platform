import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";

export default async function ComplaintsPage() {
  const client = getOpsClient();

  let complaints: unknown[] = [];
  let error: string | null = null;

  try {
    const result = await client.listComplaints();
    complaints = (result as any)?.items ?? result ?? [];
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Complaints"
        description={`Complaint case management for ops and ROC teams. ${complaints.length} case(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}
        {complaints.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Case No</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>SLA Breach</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((c: any, i: number) => (
                  <tr key={i}>
                    <td>{c.caseNo ?? c.id ?? "-"}</td>
                    <td>{c.category ?? "-"}</td>
                    <td>{c.severity ?? "-"}</td>
                    <td>{c.status ?? "-"}</td>
                    <td>{c.slaBreach ? "⚠️" : "✅"}</td>
                    <td>
                      {c.createdAt
                        ? new Date(c.createdAt).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No complaints. Cases are created via driver app, ops, or call center
            intake.
          </p>
        )}
        <Link className="route-link" href="/">
          <strong>Back to home</strong> Return to ops console overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
