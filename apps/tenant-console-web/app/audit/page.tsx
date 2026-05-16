import type { AuditLogRecord } from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const client = getTenantClient();
  const logs = (await client.listTenantAuditLogs()) as AuditLogRecord[];

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Audit"
        title="Tenant audit now reads as a real append-only governance surface."
        description="This lane exposes tenant-scoped evidence rows directly from `/api/tenant/audit`, keeping accountability separate from command surfaces and dispatch-only tools."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Rows</span>
          <strong>{logs.length}</strong>
          <p>Recent tenant audit rows currently visible in the tenant scope.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Modules</span>
          <strong>{new Set(logs.map((log) => log.moduleName)).size}</strong>
          <p>
            Distinct module names currently represented in the tenant audit
            trail.
          </p>
        </article>
      </section>

      <SurfaceCard
        kicker="Evidence"
        title="Recent audit rows"
        description="Audit remains read-only here. Tenant operators can inspect what happened, but cannot mutate audit history or platform evidence policy."
      >
        <div className="table-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Module</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Request</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 20).map((log) => (
                <tr key={log.auditId}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>
                    <div className="table-primary">
                      {log.actorType}
                      <span className="table-secondary">
                        {log.actorId ?? "Unknown actor"}
                      </span>
                    </div>
                  </td>
                  <td>{log.moduleName}</td>
                  <td>{log.actionName}</td>
                  <td>
                    <div className="table-primary">
                      {log.resourceType}
                      <span className="table-secondary">
                        {log.resourceId ?? "No resource ID"}
                      </span>
                    </div>
                  </td>
                  <td>{log.requestId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <CalloutPanel
        title="Scope guardrail"
        description="Tenant audit is intentionally narrower than platform evidence governance. Legal holds, deletion exceptions, and storage policy remain outside the tenant-admin lane."
      />
    </div>
  );
}
