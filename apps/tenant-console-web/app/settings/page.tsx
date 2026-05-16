import type {
  FeatureFlagSummary,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantSlaProfile,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const client = getTenantClient();
  const [preferences, sla, governance, flags] = await Promise.all([
    client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
    client.getSlaProfile() as Promise<TenantSlaProfile>,
    client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
    client.getFeatureFlags({
      tenantId: DEMO_TENANT_ID,
    }) as Promise<FeatureFlagSummary>,
  ]);

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Settings"
        title="Tenant settings now summarize notification, SLA, and capability truth from real backend reads."
        description="This route groups tenant operational preferences under one stable lane while keeping the underlying scopes, subscriptions, and thresholds authority-driven."
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Notifications"
          title="Tenant notification subscriptions"
          description="Notification preferences stay tenant-scoped and remain distinct from platform-wide notices or ops-console escalations."
        >
          <ul className="panel-list">
            {preferences.subscriptions.map((subscription) => (
              <li key={`${subscription.eventType}-${subscription.channel}`}>
                <strong>{subscription.eventType}</strong>
                <span className="list-note">
                  {subscription.channel} ·{" "}
                  {subscription.enabled ? "enabled" : "disabled"}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted-copy">
            Updated {formatDateTime(preferences.updatedAt)}
          </p>
        </SurfaceCard>

        <SurfaceCard
          kicker="SLA"
          title="Tenant service thresholds"
          description="SLA settings remain tenant-facing expectation framing and do not leak dispatch-only internal controls."
        >
          <dl className="definition-grid">
            <div>
              <dt>Wait threshold</dt>
              <dd>{sla.waitThresholdMin} min</dd>
            </div>
            <div>
              <dt>Arrival threshold</dt>
              <dd>{sla.arrivalThresholdMin} min</dd>
            </div>
            <div>
              <dt>Completion threshold</dt>
              <dd>{sla.completionThresholdMin} min</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatDateTime(sla.updatedAt)}</dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="Capability"
          title="Feature and integration posture"
          description="Capability framing belongs in settings once tenant shell, booking, and integration surfaces are stable."
        >
          <div className="chip-row">
            {flags.flags
              .filter((flag) => flag.enabled)
              .slice(0, 8)
              .map((flag) => (
                <span className="status-chip" key={flag.key}>
                  {flag.key}
                </span>
              ))}
          </div>
          <ul className="panel-list">
            {governance.onboardingChecklist.slice(0, 4).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </SurfaceCard>
      </section>

      <CalloutPanel
        title="Scope guardrail"
        description="This route intentionally stops at tenant-scoped preferences. Feature flag mutation, webhook credential lifecycle, and platform legal governance stay on their own authority surfaces."
      />
    </div>
  );
}
