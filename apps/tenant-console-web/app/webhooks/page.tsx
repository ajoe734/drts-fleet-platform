import type {
  TenantIntegrationGovernancePackage,
  TenantWebhookEndpoint,
  TenantWebhookEndpointStatus,
  WebhookDeliveryRecord,
  WebhookRetryPolicyRecord,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

type DeliveryGroup = {
  webhook: TenantWebhookEndpoint;
  deliveries: WebhookDeliveryRecord[];
};

type WebhooksPageData = {
  webhooks: TenantWebhookEndpoint[];
  governance: TenantIntegrationGovernancePackage | null;
  deliveries: DeliveryGroup[];
  errors: string[];
};

async function loadWebhooksPageData(): Promise<WebhooksPageData> {
  const client = getTenantClient();
  const errors: string[] = [];

  const [webhooksResult, governanceResult] = await Promise.allSettled([
    client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
    client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
  ]);

  const webhooks =
    webhooksResult.status === "fulfilled" ? webhooksResult.value : [];
  const governance =
    governanceResult.status === "fulfilled" ? governanceResult.value : null;

  if (webhooksResult.status === "rejected") {
    errors.push(
      webhooksResult.reason instanceof Error
        ? webhooksResult.reason.message
        : "Unable to load tenant webhook endpoints.",
    );
  }

  if (governanceResult.status === "rejected") {
    errors.push(
      governanceResult.reason instanceof Error
        ? governanceResult.reason.message
        : "Unable to load webhook governance policy.",
    );
  }

  const deliveryResults = await Promise.allSettled(
    webhooks.map(async (webhook) => ({
      webhook,
      deliveries: (await client.listWebhookDeliveries(
        webhook.webhookId,
      )) as WebhookDeliveryRecord[],
    })),
  );

  const deliveries = deliveryResults.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return [result.value];
    }

    const webhook = webhooks[index];
    errors.push(
      result.reason instanceof Error
        ? `Unable to load deliveries for ${webhook?.url ?? "webhook"}: ${result.reason.message}`
        : `Unable to load deliveries for ${webhook?.url ?? "webhook"}.`,
    );
    return [];
  });

  return { webhooks, governance, deliveries, errors };
}

function getStatusClassName(status: TenantWebhookEndpointStatus) {
  switch (status) {
    case "active":
      return "status-chip is-active";
    case "test_pending":
      return "status-chip is-warning";
    case "disabled":
    default:
      return "status-chip";
  }
}

function getDeliveryStatusClassName(status: WebhookDeliveryRecord["status"]) {
  switch (status) {
    case "delivered":
      return "status-chip is-active";
    case "delivery_failed":
      return "status-chip is-warning";
    case "queued":
    default:
      return "status-chip";
  }
}

function formatRetryPolicy(
  policy: WebhookRetryPolicyRecord | null | undefined,
) {
  if (!policy) {
    return "Policy unavailable";
  }

  return `${policy.maxAttempts} attempts · ${policy.initialBackoffSeconds}s backoff · x${policy.backoffMultiplier}`;
}

function normalizeEventCount(webhooks: TenantWebhookEndpoint[]) {
  return new Set(webhooks.flatMap((webhook) => webhook.events)).size;
}

function collectRecentDeliveries(deliveries: DeliveryGroup[]) {
  return deliveries
    .flatMap((group) =>
      group.deliveries.map((delivery) => ({
        delivery,
        webhook: group.webhook,
      })),
    )
    .sort((left, right) =>
      right.delivery.createdAt.localeCompare(left.delivery.createdAt),
    );
}

export default async function WebhooksPage() {
  const data = await loadWebhooksPageData();
  const recentDeliveries = collectRecentDeliveries(data.deliveries).slice(
    0,
    20,
  );
  const totalDeliveries = recentDeliveries.length;
  const failedDeliveries = recentDeliveries.filter(
    ({ delivery }) => delivery.status === "delivery_failed",
  ).length;
  const activeEndpoints = data.webhooks.filter(
    (webhook) => webhook.status === "active",
  ).length;
  const baselineEvents = data.governance?.baselineWebhookEvents ?? [];
  const subscribedEvents = new Set(
    data.webhooks.flatMap((webhook) => webhook.events),
  );
  const uncoveredEvents = baselineEvents.filter(
    (eventType) => !subscribedEvents.has(eventType),
  );
  const rotationCount = data.webhooks.reduce(
    (sum, webhook) =>
      sum + (webhook.runtimeMetadata?.secretRotation.rotationCount ?? 0),
    0,
  );

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Webhooks"
        title="Tenant webhook operations now show endpoint posture, delivery evidence, and backend-owned retry policy in one route."
        description="This surface stays inside the published tenant webhook contracts: endpoint inventory comes from `/api/tenant/webhooks`, delivery evidence remains inline, and governance posture is read from the existing integration package instead of inventing tenant-local semantics."
      />

      {data.errors.length > 0 ? (
        <CalloutPanel
          title="Webhook data loaded partially"
          description="The route keeps contract-backed posture visible, but one or more webhook reads failed. Missing rows below reflect transport gaps rather than hidden UI state."
          tone="warning"
        >
          <ul className="panel-list">
            {data.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </CalloutPanel>
      ) : null}

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Endpoints</span>
          <strong>{formatCount(data.webhooks.length)}</strong>
          <p>Published tenant webhook endpoints currently visible.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Active</span>
          <strong>{formatCount(activeEndpoints)}</strong>
          <p>
            Endpoints in `active` state rather than `test_pending` or
            `disabled`.
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Recent deliveries</span>
          <strong>{formatCount(totalDeliveries)}</strong>
          <p>Most recent visible delivery rows aggregated across endpoints.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Failures</span>
          <strong>{formatCount(failedDeliveries)}</strong>
          <p>Recent rows currently marked `delivery_failed`.</p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Coverage"
          title="Event coverage and onboarding posture"
          description="The route shows what the governance package expects versus what the current endpoint set actually subscribes to."
        >
          <dl className="definition-grid">
            <div>
              <dt>Baseline events</dt>
              <dd>{formatCount(baselineEvents.length)}</dd>
            </div>
            <div>
              <dt>Subscribed events</dt>
              <dd>{formatCount(normalizeEventCount(data.webhooks))}</dd>
            </div>
            <div>
              <dt>Uncovered baseline events</dt>
              <dd>{formatCount(uncoveredEvents.length)}</dd>
            </div>
            <div>
              <dt>Checklist items</dt>
              <dd>
                {formatCount(data.governance?.onboardingChecklist.length ?? 0)}
              </dd>
            </div>
          </dl>
          {baselineEvents.length > 0 ? (
            <div className="chip-row">
              {baselineEvents.map((eventType) => (
                <span
                  className={
                    subscribedEvents.has(eventType)
                      ? "status-chip is-active"
                      : "status-chip is-warning"
                  }
                  key={eventType}
                >
                  {eventType}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted-copy">
              Governance baseline events were not returned for this tenant.
            </p>
          )}
        </SurfaceCard>

        <SurfaceCard
          kicker="Policy"
          title="Backend-owned retry and disablement rules"
          description="The tenant console can inspect webhook resilience posture, but retry cadence, test-event naming, and auto-disable thresholds remain backend authority."
        >
          <dl className="definition-grid">
            <div>
              <dt>Test event</dt>
              <dd>
                {data.governance?.webhookPolicy.testEventType ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt>Auto-disable threshold</dt>
              <dd>
                {data.governance?.webhookPolicy
                  .autoDisableAfterConsecutiveFailures ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt>Retry policy</dt>
              <dd>
                {formatRetryPolicy(data.governance?.webhookPolicy.retryPolicy)}
              </dd>
            </div>
            <div>
              <dt>Secret rotations</dt>
              <dd>{formatCount(rotationCount)}</dd>
            </div>
          </dl>
          <ul className="panel-list">
            <li>
              Create validation required:{" "}
              {data.governance?.webhookPolicy.revalidationRequiredOnCreate
                ? "yes"
                : "no"}
            </li>
            <li>
              Endpoint mutation revalidation:{" "}
              {data.governance?.webhookPolicy
                .revalidationRequiredOnEndpointMutation
                ? "yes"
                : "no"}
            </li>
            <li>
              Secret rotation revalidation:{" "}
              {data.governance?.webhookPolicy
                .revalidationRequiredOnSecretRotation
                ? "yes"
                : "no"}
            </li>
            <li>
              Failure notifications:{" "}
              {data.governance?.webhookPolicy
                .deliveryFailureNotificationChannel ?? "Unknown"}
            </li>
          </ul>
        </SurfaceCard>
      </section>

      <SurfaceCard
        kicker="Endpoints"
        title="Endpoint inventory"
        description="The top table keeps URL, subscription set, secret posture, and runtime health together so operators do not have to bounce between configuration and delivery evidence."
      >
        <div className="table-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Events</th>
                <th>Status</th>
                <th>Secret</th>
                <th>Runtime</th>
                <th>Retry</th>
              </tr>
            </thead>
            <tbody>
              {data.webhooks.length > 0 ? (
                data.webhooks.map((webhook) => {
                  const runtime = webhook.runtimeMetadata;
                  return (
                    <tr key={webhook.webhookId}>
                      <td>
                        <div className="table-primary">
                          {webhook.url}
                          <span className="table-secondary">
                            {webhook.webhookId} · updated{" "}
                            {formatDateTime(webhook.updatedAt)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="chip-row">
                          {webhook.events.map((eventType) => (
                            <span className="status-chip" key={eventType}>
                              {eventType}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={getStatusClassName(webhook.status)}>
                          {webhook.status}
                        </span>
                      </td>
                      <td>
                        <div className="table-primary">
                          v{webhook.secretVersion} · {webhook.secretPreview}
                          <span className="table-secondary">
                            {runtime?.secretRotation.rotatedAt
                              ? `Rotated ${formatDateTime(runtime.secretRotation.rotatedAt)}`
                              : `Created ${formatDateTime(webhook.createdAt)}`}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          {formatCount(runtime?.deliveryCount ?? 0)} deliveries
                          <span className="table-secondary">
                            Last success{" "}
                            {runtime?.lastDeliveredAt
                              ? formatDateTime(runtime.lastDeliveredAt)
                              : "not available"}
                          </span>
                          <span className="table-secondary">
                            Failed{" "}
                            {formatCount(runtime?.failedDeliveryCount ?? 0)} ·
                            next attempt{" "}
                            {runtime?.nextAttemptAt
                              ? formatDateTime(runtime.nextAttemptAt)
                              : "none queued"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          {formatRetryPolicy(
                            runtime?.retryPolicy ?? webhook.retryPolicy,
                          )}
                          <span className="table-secondary">
                            Retryable:{" "}
                            {(
                              runtime?.retryPolicy.retryableStatusCodes ??
                              webhook.retryPolicy?.retryableStatusCodes ??
                              []
                            ).join(", ") || "none"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="table-primary">
                      No webhook endpoints returned.
                      <span className="table-secondary">
                        This may mean the tenant has not registered endpoints
                        yet, or the webhook list transport is unavailable.
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <SurfaceCard
        kicker="Deliveries"
        title="Recent delivery log"
        description="Delivery evidence stays on the same route as configuration so endpoint owners can inspect failures, replay pressure, and signature posture without a separate diagnostics jump."
      >
        <div className="table-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th>Delivery</th>
                <th>Endpoint</th>
                <th>Event</th>
                <th>Status</th>
                <th>HTTP</th>
                <th>Attempt</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentDeliveries.length > 0 ? (
                recentDeliveries.map(({ delivery, webhook }) => (
                  <tr key={delivery.deliveryId}>
                    <td>
                      <div className="table-primary">
                        {delivery.deliveryId}
                        <span className="table-secondary">
                          {delivery.signature}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        {webhook.url}
                        <span className="table-secondary">
                          {webhook.webhookId}
                        </span>
                      </div>
                    </td>
                    <td>{delivery.eventType}</td>
                    <td>
                      <span
                        className={getDeliveryStatusClassName(delivery.status)}
                      >
                        {delivery.status}
                      </span>
                    </td>
                    <td>{delivery.httpStatus ?? "pending"}</td>
                    <td>{delivery.attempt}</td>
                    <td>{formatDateTime(delivery.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className="table-primary">
                      No delivery rows returned.
                      <span className="table-secondary">
                        Endpoint inventory can still be reviewed while delivery
                        history is empty or unavailable.
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <CalloutPanel
        title="Guardrail"
        description="This route intentionally stops at the published webhook read models plus governance posture. It does not invent replay buttons, secret mutation flows, or disable/enable semantics beyond what the backend already contracts."
      />
    </div>
  );
}
