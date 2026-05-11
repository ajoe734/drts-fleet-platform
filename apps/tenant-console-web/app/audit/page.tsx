import type { AuditLogRecord } from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

function groupCounts(values: string[]) {
  return Array.from(
    values.reduce((map, value) => {
      map.set(value, (map.get(value) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).sort((left, right) => right[1] - left[1]);
}

export default async function AuditPage() {
  const client = getTenantClient();
  const logs = (await client.listTenantAuditLogs()) as AuditLogRecord[];
  const recentLogs = logs.slice(0, 20);
  const moduleCounts = groupCounts(logs.map((log) => log.moduleName));
  const actorCounts = groupCounts(logs.map((log) => log.actorType));
  const requestCoverage = logs.filter((log) => log.requestId).length;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Audit"
        title="Tenant audit now reads as an append-only governance ledger, not an afterthought export."
        description="The built view stays on `/api/tenant/audit` and emphasizes request correlation, actor scope, and module-level evidence without inventing tenant-side mutation controls."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Rows</span>
          <strong>{logs.length}</strong>
          <p>Recent tenant-scoped audit rows currently visible in this lane.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Modules</span>
          <strong>{moduleCounts.length}</strong>
          <p>
            Distinct backend modules currently represented in the audit trail.
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Actors</span>
          <strong>{actorCounts.length}</strong>
          <p>
            Actor types currently visible across tenant-facing evidence rows.
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Requests</span>
          <strong>{requestCoverage}</strong>
          <p>Rows carrying request correlation IDs for downstream tracing.</p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Posture"
          title="What this route proves"
          description="The tenant console can inspect activity and export evidence posture, but it does not become the authority for retention, deletion, or platform legal hold workflows."
        >
          <dl className="definition-grid">
            <div>
              <dt>Scope</dt>
              <dd>Tenant-scoped audit visibility only</dd>
            </div>
            <div>
              <dt>Mutation</dt>
              <dd>Read-only on this route</dd>
            </div>
            <div>
              <dt>Correlation</dt>
              <dd>{requestCoverage} request-linked rows</dd>
            </div>
            <div>
              <dt>Latest event</dt>
              <dd>
                {recentLogs[0]
                  ? formatDateTime(recentLogs[0].createdAt)
                  : "No audit rows returned"}
              </dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="Coverage"
          title="Module and actor mix"
          description="The artboard emphasizes a flat, inspectable ledger. These summary chips make it easier to spot where evidence is coming from before drilling into raw rows."
        >
          <div className="chip-row">
            {moduleCounts.slice(0, 4).map(([moduleName, count]) => (
              <span className="status-chip" key={moduleName}>
                {moduleName}
                <span>{count}</span>
              </span>
            ))}
          </div>
          <ul className="panel-list">
            {actorCounts.map(([actorType, count]) => (
              <li key={actorType}>
                <strong>{actorType}</strong>
                <span className="list-note">{count} row(s)</span>
              </li>
            ))}
          </ul>
        </SurfaceCard>
      </section>

      <SurfaceCard
        kicker="Evidence"
        title="Recent audit rows"
        description="The table stays close to the design canvas: timestamp first, request correlation visible, and no UI-local rewrite of actor or resource vocabulary."
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
              {recentLogs.map((log) => (
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
        description="Tenant audit stays intentionally narrower than platform evidence governance. Legal holds, deletion exceptions, and storage policy remain outside the tenant-admin lane even when the request ID is visible here."
      />
    </div>
  );
}
