import type {
  FeatureFlagSummary,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantSlaProfile,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import {
  FORMAL_TENANT_ROLE_FRAMING,
  describeRoleSnapshot,
  getTenantRoleSnapshot,
} from "@/lib/rbac";

export const dynamic = "force-dynamic";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return DATE_TIME_FORMATTER.format(new Date(value));
}

export default async function SettingsPage() {
  const client = getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();
  const [preferencesResult, slaResult, governanceResult, flagsResult] =
    await Promise.allSettled([
      client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
      client.getSlaProfile() as Promise<TenantSlaProfile>,
      client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
      client.getFeatureFlags() as Promise<FeatureFlagSummary>,
    ]);

  const preferences =
    preferencesResult.status === "fulfilled" ? preferencesResult.value : null;
  const sla = slaResult.status === "fulfilled" ? slaResult.value : null;
  const governance =
    governanceResult.status === "fulfilled" ? governanceResult.value : null;
  const flags = flagsResult.status === "fulfilled" ? flagsResult.value : null;

  const errors = [
    roleSnapshot.identityError,
    preferencesResult.status === "rejected"
      ? `Notification preferences: ${preferencesResult.reason instanceof Error ? preferencesResult.reason.message : "Unknown error"}`
      : null,
    slaResult.status === "rejected"
      ? `SLA profile: ${slaResult.reason instanceof Error ? slaResult.reason.message : "Unknown error"}`
      : null,
    governanceResult.status === "rejected"
      ? `Integration governance: ${governanceResult.reason instanceof Error ? governanceResult.reason.message : "Unknown error"}`
      : null,
    flagsResult.status === "rejected"
      ? `Feature flags: ${flagsResult.reason instanceof Error ? flagsResult.reason.message : "Unknown error"}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <main className="page-shell">
      <section className="page-hero">
        <span className="eyebrow">Settings</span>
        <h1>
          Tenant settings summarize live authority, preference, and capability
          truth.
        </h1>
        <p>
          This surface groups notification posture, SLA framing, integration
          governance, and the formal tenant role model without fabricating
          backend-only actions.
        </p>
      </section>

      {errors.length > 0 ? (
        <section className="callout-panel is-warning">
          <strong>Some settings data is unavailable</strong>
          <ul className="panel-list">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="surface-grid surface-grid-wide">
        <article className="surface-card">
          <span className="surface-kicker">Role model</span>
          <h3>Formal tenant roles</h3>
          <p>
            Current identity resolves as {describeRoleSnapshot(roleSnapshot)}.
            The selected prototype expects these governance lanes.
          </p>
          <ul className="panel-list">
            {FORMAL_TENANT_ROLE_FRAMING.map((roleFrame) => (
              <li key={roleFrame.key}>
                <strong>{roleFrame.label}</strong>
                <span className="list-note">{roleFrame.summary}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="surface-card">
          <span className="surface-kicker">Authority</span>
          <h3>Current backend role catalog</h3>
          <p>
            UI gating follows server-issued roles from the identity context.
            Integration manager is still carried by tenant admin authority until
            the backend exposes a distinct role code.
          </p>
          <div className="chip-row">
            {roleSnapshot.roleCatalogBackedLabels.length > 0 ? (
              roleSnapshot.roleCatalogBackedLabels.map((roleLabel) => (
                <span className="status-chip" key={roleLabel}>
                  {roleLabel}
                </span>
              ))
            ) : (
              <span className="status-chip">
                No role catalog labels resolved
              </span>
            )}
          </div>
        </article>

        <article className="surface-card">
          <span className="surface-kicker">Notifications</span>
          <h3>Tenant notification subscriptions</h3>
          <p>
            Preferences stay tenant-scoped and separate from platform-wide
            notices or ops-console escalations.
          </p>
          {preferences ? (
            <>
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
            </>
          ) : (
            <p className="muted-copy">Notification preferences unavailable.</p>
          )}
        </article>

        <article className="surface-card">
          <span className="surface-kicker">SLA</span>
          <h3>Tenant service thresholds</h3>
          <p>
            SLA settings remain tenant-facing expectation framing and do not
            leak dispatch-only internal controls.
          </p>
          {sla ? (
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
          ) : (
            <p className="muted-copy">SLA profile unavailable.</p>
          )}
        </article>

        <article className="surface-card">
          <span className="surface-kicker">Integration</span>
          <h3>Capability and onboarding posture</h3>
          <p>
            Integration governance belongs on dedicated API key and webhook
            routes, but settings should still summarize the posture those routes
            depend on.
          </p>
          <div className="chip-row">
            {flags?.flags
              .filter((flag) => flag.enabled)
              .slice(0, 8)
              .map((flag) => (
                <span className="status-chip" key={flag.key}>
                  {flag.key}
                </span>
              ))}
          </div>
          {governance?.onboardingChecklist?.length ? (
            <ul className="panel-list">
              {governance.onboardingChecklist.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">
              No onboarding checklist items were returned.
            </p>
          )}
        </article>
      </section>

      <section className="callout-panel">
        <strong>Scope guardrail</strong>
        <p>
          This route intentionally stops at tenant-scoped preferences and
          governance summary. Invite mutations, webhook credential lifecycle,
          and API key actions stay on their dedicated authority surfaces.
        </p>
      </section>
    </main>
  );
}
