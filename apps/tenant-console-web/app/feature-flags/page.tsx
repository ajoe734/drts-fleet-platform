import type { FeatureFlag } from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default async function FeatureFlagsPage() {
  const client = getTenantClient();
  const summary = await client.getFeatureFlags({ tenantId: DEMO_TENANT_ID });
  const flags = [...summary.flags].sort((left, right) =>
    left.key.localeCompare(right.key, "en"),
  );
  const overrides = flags.filter((flag) => flag.tenantId).length;
  const enabledCount = flags.filter((flag) => flag.enabled).length;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Feature Flags"
        title="Feature visibility now has a tenant-console route instead of living behind parity gaps."
        description="The rebuild exposes the tenant-resolved feature flag view so admins can distinguish rollout gating from a broken screen."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Visible flags</span>
          <strong>{formatCount(flags.length)}</strong>
          <p>{formatCount(enabledCount)} currently resolve enabled.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Overrides</span>
          <strong>{formatCount(overrides)}</strong>
          <p>Flag row(s) are carrying a tenant-specific override.</p>
        </article>
      </section>

      <SurfaceCard
        kicker="Visibility"
        title="Tenant-resolved feature flag inventory"
        description="The current backend exposes this data through the admin flag controller with tenant scoping via header. The route uses that resolved view until the dedicated tenant-scoped endpoint lands."
      >
        {flags.length > 0 ? (
          <div className="table-wrap">
            <table className="data-grid">
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>State</th>
                  <th>Scope</th>
                  <th>Description</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => (
                  <tr key={`${flag.key}:${flag.tenantId ?? "global"}`}>
                    <td>
                      <div className="table-primary">
                        <span>{flag.key}</span>
                      </div>
                    </td>
                    <td>{renderFlagState(flag)}</td>
                    <td>
                      {flag.tenantId
                        ? `tenant:${flag.tenantId}`
                        : "global default"}
                    </td>
                    <td>{flag.description || "—"}</td>
                    <td>{formatDateTime(flag.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-panel">
            No feature flags were returned for this tenant context.
          </div>
        )}
      </SurfaceCard>

      {summary.notes.length > 0 ? (
        <CalloutPanel
          title="Backend notes"
          description="The flag service already returns operator-facing notes; the rebuild keeps them visible instead of hiding contract caveats."
        >
          <ul className="panel-list">
            {summary.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </CalloutPanel>
      ) : null}
    </div>
  );
}

function renderFlagState(flag: FeatureFlag) {
  if (flag.enabled) {
    return <span className="status-chip is-active">enabled</span>;
  }

  return <span className="status-badge">disabled</span>;
}
