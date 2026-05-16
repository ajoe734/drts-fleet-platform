import Link from "next/link";
import { getAuditLogs } from "./actions";
import { describeRoleSnapshot, getTenantRoleSnapshot } from "@/lib/rbac";
import { AppShellCard } from "@drts/ui-web";

export default async function AuditPage() {
  const { logs, error } = await getAuditLogs();
  const roleSnapshot = await getTenantRoleSnapshot();
  const combinedError = [error, roleSnapshot.identityError]
    .filter(Boolean)
    .join(" | ");

  return (
    <main className="app-grid">
      <AppShellCard
        title="Audit Trail"
        description={`Viewing as ${describeRoleSnapshot(roleSnapshot)}. Audit logs stay tenant-scoped, while user-management and integration actions remain attributable to the current authority context.`}
      >
        <div className="callout-panel">
          <strong>Formal governance framing</strong>
          <p>
            Tenant admin, operator, finance / analyst, integration manager, and
            viewer all need an auditable history. Current backend authority
            still emits the catalog-backed tenant role codes shown below.
          </p>
          <div className="chip-row">
            {roleSnapshot.roleCatalogBackedLabels.length > 0 ? (
              roleSnapshot.roleCatalogBackedLabels.map((roleLabel) => (
                <span className="status-chip" key={roleLabel}>
                  {roleLabel}
                </span>
              ))
            ) : (
              <span className="status-chip">authority unavailable</span>
            )}
          </div>
        </div>

        {combinedError && (
          <div className="error-banner">
            <strong>Error:</strong> {combinedError}
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
        <Link className="route-link" href="/settings">
          <strong>Settings lane</strong>
          Review the tenant settings summary for SLA, notifications, and
          capability guardrails.
        </Link>
      </AppShellCard>
    </main>
  );
}
