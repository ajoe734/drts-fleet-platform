import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";

export default async function CallcenterPage() {
  const client = getOpsClient();

  let sessions: unknown[] = [];
  let error: string | null = null;

  try {
    const result = await client.listCallSessions();
    sessions = (result as any)?.items ?? result ?? [];
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Callcenter"
        description={`Call session monitoring for ROC and ops teams. ${sessions.length} session(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}
        {sessions.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Call ID</th>
                  <th>Type</th>
                  <th>Caller</th>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Flags</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s: any, i: number) => (
                  <tr key={i}>
                    <td>{s.callId ?? "-"}</td>
                    <td>{s.callType ?? "-"}</td>
                    <td>{s.callerPhone ?? "-"}</td>
                    <td>{s.agentId ?? "-"}</td>
                    <td>{s.status ?? "-"}</td>
                    <td>{(s.flags ?? []).join(", ") || "-"}</td>
                    <td>
                      {s.startedAt
                        ? new Date(s.startedAt).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No call sessions. Sessions are created when ops opens a call center
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
