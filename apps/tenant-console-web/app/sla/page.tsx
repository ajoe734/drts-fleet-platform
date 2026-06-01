import type { TenantSlaProfile } from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

function getSlaState(value: number) {
  if (value <= 15) return "tight";
  if (value <= 30) return "standard";
  return "extended";
}

export default async function SlaPage() {
  const client = getTenantClient();
  const profile = (await client.getSlaProfile()) as TenantSlaProfile;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="SLA"
        title="SLA thresholds now have a first-class route in the tenant rebuild."
        description="Dispatch, arrival, and completion thresholds remain backend-owned settings, but the rebuild exposes them directly at `/sla` so admins can audit service posture without digging through a generic settings page."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Wait</span>
          <strong>{profile.waitThresholdMin}m</strong>
          <p>{getSlaState(profile.waitThresholdMin)} response threshold.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Arrival</span>
          <strong>{profile.arrivalThresholdMin}m</strong>
          <p>{getSlaState(profile.arrivalThresholdMin)} arrival threshold.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Completion</span>
          <strong>{profile.completionThresholdMin}m</strong>
          <p>
            {getSlaState(profile.completionThresholdMin)} completion threshold.
          </p>
        </article>
      </section>

      <SurfaceCard
        kicker="Profile"
        title="Tenant SLA profile"
        description="The canonical SLA contract stays minimal: three tenant-owned thresholds plus the last update timestamp."
      >
        <dl className="definition-grid">
          <div>
            <dt>Tenant</dt>
            <dd>{profile.tenantId}</dd>
          </div>
          <div>
            <dt>Wait threshold</dt>
            <dd>{profile.waitThresholdMin} minutes</dd>
          </div>
          <div>
            <dt>Arrival threshold</dt>
            <dd>{profile.arrivalThresholdMin} minutes</dd>
          </div>
          <div>
            <dt>Completion threshold</dt>
            <dd>{profile.completionThresholdMin} minutes</dd>
          </div>
          <div>
            <dt>Updated at</dt>
            <dd>{formatDateTime(profile.updatedAt)}</dd>
          </div>
        </dl>
      </SurfaceCard>

      <CalloutPanel
        title="Thresholds stay policy-facing"
        description="This route currently reads the tenant SLA profile directly. Mutation flows remain backend-supported via `POST /api/tenant/sla` and can be layered in later without changing the route contract."
      />
    </div>
  );
}
