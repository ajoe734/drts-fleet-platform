import type {
  FeatureFlagSummary,
  IdentityContext,
  TenantBillingProfile,
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
  const [identity, billingProfile, preferences, sla, governance, flags] =
    await Promise.all([
      client.getIdentityContext() as Promise<IdentityContext>,
      client.getBillingProfile() as Promise<TenantBillingProfile>,
      client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
      client.getSlaProfile() as Promise<TenantSlaProfile>,
      client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
      client.getFeatureFlags({
        tenantId: DEMO_TENANT_ID,
      }) as Promise<FeatureFlagSummary>,
    ]);
  const enabledFlags = flags.flags.filter((flag) => flag.enabled);
  const notificationChannels = new Set(
    preferences.subscriptions.map((subscription) => subscription.channel),
  );

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Settings"
        title="Tenant settings now read like a composed operating profile instead of scattered backend fragments."
        description="The built route groups tenant profile, billing contact, notification subscriptions, SLA thresholds, and capability posture under one settings lane while keeping each underlying source authority-driven."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Flags</span>
          <strong>{enabledFlags.length}</strong>
          <p>Enabled feature flags visible to the current tenant context.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Channels</span>
          <strong>{notificationChannels.size}</strong>
          <p>Notification delivery channels currently configured in scope.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Checklist</span>
          <strong>{governance.onboardingChecklist.length}</strong>
          <p>Integration handoff items still published for this tenant.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Updated</span>
          <strong>{formatDateTime(billingProfile.updatedAt)}</strong>
          <p>
            Latest billing-profile update visible to the tenant settings lane.
          </p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="General"
          title="Tenant profile and billing contact"
          description="The artboard's general settings card is grounded here in the identity context plus the published tenant billing profile."
        >
          <dl className="definition-grid">
            <div>
              <dt>Tenant code</dt>
              <dd>{identity.tenantId ?? DEMO_TENANT_ID}</dd>
            </div>
            <div>
              <dt>Realm</dt>
              <dd>{identity.realm}</dd>
            </div>
            <div>
              <dt>Invoice title</dt>
              <dd>{billingProfile.invoiceTitle}</dd>
            </div>
            <div>
              <dt>Tax ID</dt>
              <dd>{billingProfile.taxId ?? "Not configured"}</dd>
            </div>
            <div>
              <dt>Billing contact</dt>
              <dd>{billingProfile.contactName ?? "Not configured"}</dd>
            </div>
            <div>
              <dt>Billing email</dt>
              <dd>{billingProfile.email}</dd>
            </div>
            <div>
              <dt>Billing address</dt>
              <dd>{billingProfile.address ?? "Not configured"}</dd>
            </div>
            <div>
              <dt>Auth mode</dt>
              <dd>{identity.authMode}</dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="Current posture"
          title="Capability and control summary"
          description="The second settings column keeps the artboard's status framing, but only with signals that are already published in tenant-facing contracts."
        >
          <dl className="definition-grid">
            <div>
              <dt>Enabled modules</dt>
              <dd>{enabledFlags.length} flags in current summary</dd>
            </div>
            <div>
              <dt>Webhook baseline</dt>
              <dd>{governance.baselineWebhookEvents.length} events</dd>
            </div>
            <div>
              <dt>Notification baseline</dt>
              <dd>
                {governance.baselineNotificationSubscriptions.length} routes
              </dd>
            </div>
            <div>
              <dt>SLA profile</dt>
              <dd>
                {sla.waitThresholdMin}/{sla.arrivalThresholdMin}/
                {sla.completionThresholdMin} min
              </dd>
            </div>
            <div>
              <dt>API key lifetime</dt>
              <dd>{governance.apiKeyPolicy.defaultLifetimeDays} days</dd>
            </div>
            <div>
              <dt>Webhook retry</dt>
              <dd>
                {governance.webhookPolicy.retryPolicy.maxAttempts} attempts
              </dd>
            </div>
          </dl>
        </SurfaceCard>
      </section>

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
            {enabledFlags.slice(0, 8).map((flag) => (
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
