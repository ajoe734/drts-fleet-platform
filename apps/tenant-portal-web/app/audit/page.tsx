import Link from "next/link";
import { getAuditLogs } from "./actions";
import { getCurrentRole } from "@/lib/rbac";
import { AppShellCard } from "@drts/ui-web";

export default async function AuditPage() {
  const { logs, error } = await getAuditLogs();
  const role = await getCurrentRole();

  return (
    <main className="app-grid">
      <AppShellCard
        title="Audit Trail"
        description={`Viewing as ${role}. Audit logs for actions taken within this tenant.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {logs.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Module</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Request ID</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.auditId}>
                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                    <td>
                      {log.actorId ? (
                        <span title={log.actorId}>{log.actorType}</span>
                      ) : (
                        <span className="muted">{log.actorType}</span>
                      )}
                    </td>
                    <td>{log.moduleName}</td>
                    <td>
                      <code>{log.actionName}</code>
                    </td>
                    <td>
                      {log.resourceType}
                      {log.resourceId ? `: ${log.resourceId}` : ""}
                    </td>
                    <td>
                      <code className="muted">{log.requestId}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No audit logs found.</p>
        )}

        <Link className="route-link" href="/" style={{ marginTop: "1rem" }}>
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
