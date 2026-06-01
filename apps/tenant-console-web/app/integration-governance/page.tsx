import Link from "next/link";
import type {
  FeatureFlagSummary,
  ReportJobRecord,
  TenantApiKeyRecord,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantSlaProfile,
  TenantWebhookEndpoint,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

type IntegrationGovernanceData = {
  governance: TenantIntegrationGovernancePackage | null;
  apiKeys: TenantApiKeyRecord[];
  webhooks: TenantWebhookEndpoint[];
  notifications: TenantNotificationPreferences | null;
  sla: TenantSlaProfile | null;
  reports: ReportJobRecord[];
  featureFlags: FeatureFlagSummary | null;
  errors: string[];
};

async function loadIntegrationGovernanceData(): Promise<IntegrationGovernanceData> {
  const client = getTenantClient();
  const [
    governanceResult,
    apiKeysResult,
    webhooksResult,
    notificationsResult,
    slaResult,
    reportsResult,
    flagsResult,
  ] = await Promise.allSettled([
    client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
    client.listApiKeys() as Promise<TenantApiKeyRecord[]>,
    client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
    client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
    client.getSlaProfile() as Promise<TenantSlaProfile>,
    client.listTenantReportJobs() as Promise<ReportJobRecord[]>,
    client.getFeatureFlags({ tenantId: DEMO_TENANT_ID }),
  ]);

  const errors: string[] = [];
  const collectError = (
    label: string,
    result: PromiseSettledResult<unknown>,
  ) => {
    if (result.status === "rejected") {
      errors.push(
        `${label}: ${result.reason instanceof Error ? result.reason.message : "Unknown error"}`,
      );
    }
  };

  collectError("Governance package", governanceResult);
  collectError("API keys", apiKeysResult);
  collectError("Webhooks", webhooksResult);
  collectError("Notification preferences", notificationsResult);
  collectError("SLA profile", slaResult);
  collectError("Report jobs", reportsResult);
  collectError("Feature flags", flagsResult);

  return {
    governance:
      governanceResult.status === "fulfilled" ? governanceResult.value : null,
    apiKeys: apiKeysResult.status === "fulfilled" ? apiKeysResult.value : [],
    webhooks: webhooksResult.status === "fulfilled" ? webhooksResult.value : [],
    notifications:
      notificationsResult.status === "fulfilled"
        ? notificationsResult.value
        : null,
    sla: slaResult.status === "fulfilled" ? slaResult.value : null,
    reports: reportsResult.status === "fulfilled" ? reportsResult.value : [],
    featureFlags: flagsResult.status === "fulfilled" ? flagsResult.value : null,
    errors,
  };
}

function readinessLabel(ready: boolean, warning = false) {
  if (ready) return "Ready";
  return warning ? "Attention" : "Not ready";
}

export default async function IntegrationGovernancePage() {
  const data = await loadIntegrationGovernanceData();
  const activeKeys = data.apiKeys.filter(
    (apiKey) =>
      !apiKey.revokedAt &&
      (!apiKey.expiresAt || new Date(apiKey.expiresAt).getTime() > Date.now()),
  ).length;
  const activeWebhooks = data.webhooks.filter(
    (webhook) => webhook.status === "active",
  ).length;
  const enabledSubscriptions =
    data.notifications?.subscriptions.filter(
      (subscription) => subscription.enabled,
    ).length ?? 0;
  const completedReports = data.reports.filter(
    (job) => job.status === "completed",
  ).length;
  const enabledFlags =
    data.featureFlags?.flags.filter((flag) => flag.enabled).length ?? 0;
  const checklist = data.governance?.onboardingChecklist ?? [];

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Integration Governance"
        title="The rebuild now exposes a dedicated integration-readiness route."
        description="This page consolidates API key, webhook, notification, SLA, report, and feature-flag signals so tenant admins can understand what is provisioned before they drill into each module."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Checklist</span>
          <strong>
            {checklist.length > 0 ? formatCount(checklist.length) : "Ready"}
          </strong>
          <p>Open onboarding items returned by the governance package.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">API keys</span>
          <strong>{formatCount(activeKeys)}</strong>
          <p>Active or expiring-soon key(s) currently available.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Webhooks</span>
          <strong>{formatCount(activeWebhooks)}</strong>
          <p>Active webhook endpoint(s) visible in this tenant context.</p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Readiness"
          title="Cross-module readiness snapshot"
          description="This route ships before the dedicated Q-TEN10 aggregated readiness endpoint; until that backend lands, the page derives readiness from the currently available module contracts."
        >
          <dl className="definition-grid">
            <div>
              <dt>API key posture</dt>
              <dd>{readinessLabel(activeKeys > 0, data.apiKeys.length > 0)}</dd>
            </div>
            <div>
              <dt>Webhook posture</dt>
              <dd>
                {readinessLabel(activeWebhooks > 0, data.webhooks.length > 0)}
              </dd>
            </div>
            <div>
              <dt>Notifications</dt>
              <dd>{readinessLabel(enabledSubscriptions > 0)}</dd>
            </div>
            <div>
              <dt>SLA profile</dt>
              <dd>{readinessLabel(Boolean(data.sla))}</dd>
            </div>
            <div>
              <dt>Reports</dt>
              <dd>
                {readinessLabel(completedReports > 0, data.reports.length > 0)}
              </dd>
            </div>
            <div>
              <dt>Feature flags</dt>
              <dd>
                {enabledFlags > 0
                  ? `${enabledFlags} enabled`
                  : "No enabled flags"}
              </dd>
            </div>
            <div>
              <dt>Generated at</dt>
              <dd>{formatDateTime(data.governance?.generatedAt)}</dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="Checklist"
          title="Onboarding checklist"
          description="The governance package remains the canonical source for setup guidance, baseline events, and API key / webhook policies."
        >
          {checklist.length > 0 ? (
            <ul className="panel-list">
              {checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <div className="empty-panel">
              No onboarding checklist items were returned.
            </div>
          )}
          <div className="link-row">
            <Link className="text-link" href="/api-keys">
              Review API keys
            </Link>
            <Link className="text-link" href="/webhooks">
              Review webhooks
            </Link>
            <Link className="text-link" href="/notifications">
              Review notifications
            </Link>
            <Link className="text-link" href="/sla">
              Review SLA
            </Link>
            <Link className="text-link" href="/reports">
              Review reports
            </Link>
          </div>
        </SurfaceCard>
      </section>

      {data.governance ? (
        <SurfaceCard
          kicker="Policy"
          title="Governance package highlights"
          description="These baseline controls come straight from `TenantIntegrationGovernancePackage` and frame what each tenant integration should provision."
        >
          <dl className="definition-grid">
            <div>
              <dt>API scopes</dt>
              <dd>{data.governance.apiKeyPolicy.allowedScopes.join(", ")}</dd>
            </div>
            <div>
              <dt>Webhook baseline events</dt>
              <dd>{data.governance.baselineWebhookEvents.join(", ")}</dd>
            </div>
            <div>
              <dt>Notification baselines</dt>
              <dd>
                {data.governance.baselineNotificationSubscriptions
                  .map(
                    (subscription) =>
                      `${subscription.eventType}:${subscription.channel}`,
                  )
                  .join(", ")}
              </dd>
            </div>
          </dl>
        </SurfaceCard>
      ) : null}

      {data.errors.length > 0 ? (
        <CalloutPanel
          title="Partial data warning"
          description="One or more integration slices did not resolve. The page still shows the successful reads so admins can continue triage."
          tone="warning"
        >
          <ul className="panel-list">
            {data.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </CalloutPanel>
      ) : null}
    </div>
  );
}
