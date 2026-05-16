import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  CreateTenantWebhookEndpointCommand,
  NotificationRecord,
  TenantIntegrationGovernancePackage,
  TenantWebhookEndpoint,
  UpdateTenantWebhookEndpointCommand,
  WebhookDeliveryRecord,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot, requireCapability } from "@/lib/rbac";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export const dynamic = "force-dynamic";

const WEBHOOK_DELIVERY_DISCLAIMER = {
  title: "Phase 1 visibility boundary",
  summary:
    "Delivery records are authoritative visibility from the tenant webhook endpoints, but retry and replay controls stay hidden until the backend exposes them.",
  detail:
    "Use this page to inspect endpoint health, delivery outcomes, and related notices. Do not assume replay, resend, or manual retry exists just because a delivery row is visible.",
};

const infoPanelStyle = {
  borderRadius: "18px",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  background: "rgba(255, 255, 255, 0.78)",
  padding: "1rem 1.1rem",
} as const;

const badgeBaseStyle = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "0.3rem 0.65rem",
  fontSize: "0.82rem",
  fontWeight: 700,
} as const;

type PageData = {
  webhooks: TenantWebhookEndpoint[];
  notifications: NotificationRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  deliveries: WebhookDeliveryRecord[];
  errors: string[];
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getWebhookStatusPresentation(webhook: TenantWebhookEndpoint) {
  if (webhook.status === "disabled") {
    return {
      label: "Disabled",
      background: "rgba(244, 63, 94, 0.12)",
      color: "#9f1239",
    };
  }

  if (webhook.status === "test_pending") {
    return {
      label: "Test pending",
      background: "rgba(245, 158, 11, 0.14)",
      color: "#b45309",
    };
  }

  return {
    label: "Active",
    background: "rgba(15, 118, 110, 0.12)",
    color: "#0f766e",
  };
}

function summarizeDeliveries(deliveries: WebhookDeliveryRecord[]) {
  return deliveries.reduce(
    (summary, delivery) => {
      summary.total += 1;
      if (delivery.status === "delivered") {
        summary.delivered += 1;
      } else if (delivery.status === "queued") {
        summary.queued += 1;
      } else {
        summary.failed += 1;
      }
      return summary;
    },
    { total: 0, delivered: 0, queued: 0, failed: 0 },
  );
}

function deriveRelevantNotifications(notifications: NotificationRecord[]) {
  return notifications.filter((notification) => {
    const haystack =
      `${notification.title} ${notification.message}`.toLowerCase();
    return haystack.includes("webhook") || haystack.includes("delivery");
  });
}

async function loadPageData(
  deliveryWebhookId: string | undefined,
): Promise<PageData> {
  const client = await getTenantClient();
  const [
    webhooksResult,
    notificationsResult,
    governanceResult,
    deliveriesResult,
  ] = await Promise.allSettled([
    client.listWebhooks(),
    client.listTenantNotificationFeed(),
    client.getTenantIntegrationGovernancePackage(),
    deliveryWebhookId
      ? client.listWebhookDeliveries(deliveryWebhookId)
      : Promise.resolve([]),
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

  collectError("Webhooks", webhooksResult);
  collectError("Notifications", notificationsResult);
  collectError("Integration governance", governanceResult);
  collectError("Deliveries", deliveriesResult);

  return {
    webhooks: webhooksResult.status === "fulfilled" ? webhooksResult.value : [],
    notifications:
      notificationsResult.status === "fulfilled"
        ? notificationsResult.value
        : [],
    governance:
      governanceResult.status === "fulfilled" ? governanceResult.value : null,
    deliveries:
      deliveriesResult.status === "fulfilled" ? deliveriesResult.value : [],
    errors,
  };
}

function parseEvents(formData: FormData) {
  const baselineEvents = formData
    .getAll("events")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const extraEvents = String(formData.get("extraEvents") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...baselineEvents, ...extraEvents])];
}

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams?: Promise<{
    create?: string;
    edit?: string;
    deliveries?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const roleSnapshot = await getTenantRoleSnapshot();
  const deliveryWebhookId = resolvedSearchParams.deliveries;
  const { webhooks, notifications, governance, deliveries, errors } =
    await loadPageData(deliveryWebhookId);

  const createMode = resolvedSearchParams.create === "true";
  const editWebhookId = resolvedSearchParams.edit;
  const editingWebhook = editWebhookId
    ? (webhooks.find((webhook) => webhook.webhookId === editWebhookId) ?? null)
    : null;
  const deliverySummary = summarizeDeliveries(deliveries);
  const activeCount = webhooks.filter(
    (webhook) => webhook.status === "active",
  ).length;
  const pendingCount = webhooks.filter(
    (webhook) => webhook.status === "test_pending",
  ).length;
  const disabledCount = webhooks.filter(
    (webhook) => webhook.status === "disabled",
  ).length;
  const relevantNotifications = deriveRelevantNotifications(notifications);
  const baselineEvents = governance?.baselineWebhookEvents ?? [];
  const webhookPolicy = governance?.webhookPolicy ?? null;

  return (
    <main className="app-grid">
      <AppShellCard
        title="Webhooks & Delivery Visibility"
        description={
          roleSnapshot.capabilities.canWriteWebhooks
            ? "Manage tenant endpoint subscriptions, validation posture, and observable delivery health without inventing retry controls that the backend does not actually expose."
            : "Webhook delivery visibility remains readable in this backend-issued identity, but endpoint create/edit/delete stays hidden without webhook write scope."
        }
      >
        {errors.map((error) => (
          <div key={error} className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        ))}

        {resolvedSearchParams.success ? (
          <div className="success-banner">
            <strong>Success:</strong> {resolvedSearchParams.success}
          </div>
        ) : null}

        {resolvedSearchParams.error ? (
          <div className="error-banner">
            <strong>Error:</strong> {resolvedSearchParams.error}
          </div>
        ) : null}

        <WebhookDeliveryDisclaimer />

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.9rem",
            marginBottom: "1rem",
          }}
        >
          <div style={infoPanelStyle}>
            <span className="metric-label">Active endpoints</span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                marginTop: "0.5rem",
              }}
            >
              {activeCount}
            </div>
            <p className="muted-copy">
              Validated endpoints receiving live traffic.
            </p>
          </div>
          <div style={infoPanelStyle}>
            <span className="metric-label">Pending validation</span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                marginTop: "0.5rem",
              }}
            >
              {pendingCount}
            </div>
            <p className="muted-copy">
              New or changed endpoints waiting for test evidence.
            </p>
          </div>
          <div style={infoPanelStyle}>
            <span className="metric-label">Disabled</span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                marginTop: "0.5rem",
              }}
            >
              {disabledCount}
            </div>
            <p className="muted-copy">
              Paused endpoints that need validation before reuse.
            </p>
          </div>
          {deliveryWebhookId ? (
            <div style={infoPanelStyle}>
              <span className="metric-label">Selected log</span>
              <div
                style={{
                  fontSize: "1.8rem",
                  fontWeight: 700,
                  marginTop: "0.5rem",
                }}
              >
                {deliverySummary.total}
              </div>
              <p className="muted-copy">
                {deliverySummary.delivered} delivered, {deliverySummary.failed}{" "}
                failed, {deliverySummary.queued} queued.
              </p>
            </div>
          ) : null}
        </section>

        {webhookPolicy ? (
          <section style={{ ...infoPanelStyle, marginBottom: "1rem" }}>
            <strong>Authority policy snapshot</strong>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.9rem",
                marginTop: "0.85rem",
              }}
            >
              <div>
                <div className="metric-label">Baseline events</div>
                <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
                  {baselineEvents.length > 0
                    ? baselineEvents.join(", ")
                    : "No baseline events available from governance."}
                </p>
              </div>
              <div>
                <div className="metric-label">Retry contract</div>
                <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
                  {webhookPolicy.retryPolicy.maxAttempts} attempts, starting at{" "}
                  {webhookPolicy.retryPolicy.initialBackoffSeconds}s, capped at{" "}
                  {webhookPolicy.retryPolicy.maxBackoffSeconds}s.
                </p>
              </div>
              <div>
                <div className="metric-label">Validation rules</div>
                <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
                  New or changed endpoints re-enter <code>test_pending</code>.
                  Secret rotation also requires revalidation.
                </p>
              </div>
              <div>
                <div className="metric-label">Failure notices</div>
                <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
                  Final delivery failure auto-disables the endpoint and surfaces
                  a{" "}
                  <code>
                    {webhookPolicy.deliveryFailureNotificationChannel}
                  </code>{" "}
                  notification.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {createMode ? (
          roleSnapshot.capabilities.canWriteWebhooks ? (
            <CreateWebhookForm baselineEvents={baselineEvents} />
          ) : (
            <div className="error-banner">
              <strong>Access denied:</strong> Tenant webhook write authority is
              required to add endpoints.
            </div>
          )
        ) : editWebhookId ? (
          editingWebhook ? (
            roleSnapshot.capabilities.canWriteWebhooks ? (
              <EditWebhookForm
                baselineEvents={baselineEvents}
                webhook={editingWebhook}
              />
            ) : (
              <div className="error-banner">
                <strong>Access denied:</strong> Tenant webhook write authority
                is required to edit endpoints.
              </div>
            )
          ) : (
            <div className="error-banner">
              <strong>Error:</strong> The selected webhook endpoint was not
              found.
            </div>
          )
        ) : deliveryWebhookId ? (
          <DeliveryLogView
            webhookId={deliveryWebhookId}
            deliveries={deliveries}
            webhooks={webhooks}
          />
        ) : (
          <>
            {roleSnapshot.capabilities.canWriteWebhooks ? (
              <div className="form-actions" style={{ marginBottom: "1rem" }}>
                <Link href="/webhooks?create=true" className="btn-primary">
                  Add Webhook Endpoint
                </Link>
              </div>
            ) : null}
            <WebhookList
              webhooks={webhooks}
              canManage={roleSnapshot.capabilities.canWriteWebhooks}
            />
            <NotificationsList notifications={relevantNotifications} />
          </>
        )}

        <Link className="route-link" href="/">
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}

function WebhookDeliveryDisclaimer() {
  return (
    <section
      aria-label="Webhook delivery disclaimer"
      style={{
        marginBottom: "1rem",
        padding: "1rem 1.25rem",
        borderRadius: "16px",
        border: "1px solid rgba(180, 83, 9, 0.28)",
        background: "linear-gradient(180deg, #fff7ed 0%, #fffbeb 100%)",
        color: "#7c2d12",
      }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>
        {WEBHOOK_DELIVERY_DISCLAIMER.title}
      </p>
      <p style={{ margin: "0.5rem 0 0" }}>
        {WEBHOOK_DELIVERY_DISCLAIMER.summary}
      </p>
      <p style={{ margin: "0.5rem 0 0", color: "#9a3412" }}>
        {WEBHOOK_DELIVERY_DISCLAIMER.detail}
      </p>
    </section>
  );
}

function EventChecklist({
  baselineEvents,
  selectedEvents,
}: {
  baselineEvents: string[];
  selectedEvents?: string[];
}) {
  const selected = new Set(selectedEvents ?? []);

  if (baselineEvents.length === 0) {
    return (
      <div className="form-row">
        <label htmlFor="extraEvents">Events *</label>
        <input
          type="text"
          id="extraEvents"
          name="extraEvents"
          placeholder="tenant.webhook.test, booking.created"
          required
        />
      </div>
    );
  }

  return (
    <>
      <div className="form-row">
        <label>Baseline events *</label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0.55rem 0.9rem",
          }}
        >
          {baselineEvents.map((eventType) => (
            <label
              key={eventType}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.55rem",
                borderRadius: "12px",
                border: "1px solid rgba(15, 23, 42, 0.08)",
                padding: "0.7rem 0.8rem",
                background: "rgba(255, 255, 255, 0.72)",
              }}
            >
              <input
                type="checkbox"
                name="events"
                value={eventType}
                defaultChecked={selected.has(eventType)}
              />
              <code>{eventType}</code>
            </label>
          ))}
        </div>
      </div>
      <div className="form-row">
        <label htmlFor="extraEvents">Additional events</label>
        <input
          type="text"
          id="extraEvents"
          name="extraEvents"
          defaultValue={(selectedEvents ?? [])
            .filter((eventType) => !baselineEvents.includes(eventType))
            .join(", ")}
          placeholder="Comma-separated custom events if authority adds more"
        />
      </div>
    </>
  );
}

function CreateWebhookForm({ baselineEvents }: { baselineEvents: string[] }) {
  return (
    <div className="form-section">
      <h3>Create Webhook Endpoint</h3>
      <p className="muted-copy">
        New endpoints start in <code>test_pending</code> until validation
        succeeds.
      </p>
      <form action={createWebhook} className="form-grid">
        <div className="form-row">
          <label htmlFor="url">Webhook URL *</label>
          <input
            type="url"
            id="url"
            name="url"
            placeholder="https://partner.example.com/drts/webhooks"
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="secret">Secret *</label>
          <input
            type="text"
            id="secret"
            name="secret"
            placeholder="whsec_..."
            required
          />
        </div>
        <EventChecklist baselineEvents={baselineEvents} />
        <div className="form-actions">
          <button type="submit">Create Endpoint</button>
          <Link href="/webhooks">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

function EditWebhookForm({
  baselineEvents,
  webhook,
}: {
  baselineEvents: string[];
  webhook: TenantWebhookEndpoint;
}) {
  return (
    <div className="form-section">
      <h3>Edit Webhook Endpoint</h3>
      <p className="muted-copy">
        Changing the URL, events, or secret lifecycle requires another
        validation pass.
      </p>
      <form action={updateWebhook} className="form-grid">
        <input type="hidden" name="webhookId" value={webhook.webhookId} />
        <div className="form-row">
          <label htmlFor="edit-url">Webhook URL *</label>
          <input
            type="url"
            id="edit-url"
            name="url"
            defaultValue={webhook.url}
            required
          />
        </div>
        <EventChecklist
          baselineEvents={baselineEvents}
          selectedEvents={webhook.events}
        />
        <div className="form-row">
          <label htmlFor="edit-status">Status *</label>
          <select
            id="edit-status"
            name="status"
            defaultValue={webhook.status}
            required
          >
            <option value="active">Active</option>
            <option value="test_pending">Test Pending</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <div className="form-actions">
          <button type="submit">Update Endpoint</button>
          <Link href="/webhooks">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

function WebhookList({
  webhooks,
  canManage,
}: {
  webhooks: TenantWebhookEndpoint[];
  canManage: boolean;
}) {
  return (
    <div className="webhooks-section">
      <h3>Webhook Endpoints</h3>
      {webhooks.length === 0 ? (
        <p className="empty-state">
          No webhook endpoints configured. Add one to receive tenant event
          notifications.
        </p>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Events</th>
                <th>Status</th>
                <th>Secret</th>
                <th>Runtime</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((webhook) => {
                const presentation = getWebhookStatusPresentation(webhook);
                const runtime = webhook.runtimeMetadata;

                return (
                  <tr key={webhook.webhookId}>
                    <td>
                      <strong>{webhook.url}</strong>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        <code>{webhook.webhookId}</code>
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        Created {formatDateTime(webhook.createdAt)}. Updated{" "}
                        {formatDateTime(webhook.updatedAt)}.
                      </div>
                    </td>
                    <td>{webhook.events.join(", ")}</td>
                    <td>
                      <span
                        style={{
                          ...badgeBaseStyle,
                          background: presentation.background,
                          color: presentation.color,
                        }}
                      >
                        {presentation.label}
                      </span>
                      {runtime?.disableReason ? (
                        <div
                          className="muted-copy"
                          style={{ marginTop: "0.35rem" }}
                        >
                          Disable reason: <code>{runtime.disableReason}</code>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <strong>v{webhook.secretVersion}</strong>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        Preview <code>{webhook.secretPreview}</code>
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        Rotation history{" "}
                        {runtime?.secretRotation.rotationCount ??
                          webhook.secretHistory?.length ??
                          0}
                      </div>
                    </td>
                    <td>
                      <div className="muted-copy">
                        Deliveries {runtime?.deliveryCount ?? 0}, failed{" "}
                        {runtime?.failedDeliveryCount ?? 0}
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        Last attempt {formatDateTime(runtime?.lastAttemptAt)}
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        Last delivered{" "}
                        {formatDateTime(runtime?.lastDeliveredAt)}
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        Last validated{" "}
                        {formatDateTime(runtime?.lastValidatedAt)}
                      </div>
                    </td>
                    <td>
                      <Link href={`/webhooks?deliveries=${webhook.webhookId}`}>
                        Deliveries
                      </Link>
                      {canManage ? (
                        <>
                          {" | "}
                          <Link href={`/webhooks?edit=${webhook.webhookId}`}>
                            Edit
                          </Link>
                          {" | "}
                          <form
                            action={deleteWebhook}
                            style={{ display: "inline" }}
                          >
                            <input
                              type="hidden"
                              name="webhookId"
                              value={webhook.webhookId}
                            />
                            <ConfirmSubmitButton
                              type="submit"
                              confirmMessage={`Delete webhook endpoint "${webhook.url}"? This action cannot be undone.`}
                            >
                              Delete
                            </ConfirmSubmitButton>
                          </form>
                        </>
                      ) : (
                        <span className="muted-copy"> | Audit only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeliveryLogView({
  webhookId,
  deliveries,
  webhooks,
}: {
  webhookId: string;
  deliveries: WebhookDeliveryRecord[];
  webhooks: TenantWebhookEndpoint[];
}) {
  const webhook = webhooks.find((item) => item.webhookId === webhookId);
  const summary = summarizeDeliveries(deliveries);

  return (
    <div className="delivery-log-section">
      <h3>Delivery Log</h3>
      <p className="muted-copy">
        {webhook ? (
          <>
            Endpoint <code>{webhook.url}</code>
          </>
        ) : (
          <>
            Endpoint <code>{webhookId}</code>
          </>
        )}
      </p>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/webhooks">Back to webhooks</Link>
      </p>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.9rem",
          marginBottom: "1rem",
        }}
      >
        <div style={infoPanelStyle}>
          <span className="metric-label">Total</span>
          <div
            style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}
          >
            {summary.total}
          </div>
        </div>
        <div style={infoPanelStyle}>
          <span className="metric-label">Delivered</span>
          <div
            style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}
          >
            {summary.delivered}
          </div>
        </div>
        <div style={infoPanelStyle}>
          <span className="metric-label">Queued</span>
          <div
            style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}
          >
            {summary.queued}
          </div>
        </div>
        <div style={infoPanelStyle}>
          <span className="metric-label">Failed</span>
          <div
            style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}
          >
            {summary.failed}
          </div>
        </div>
      </section>
      {deliveries.length === 0 ? (
        <p className="empty-state">No delivery records for this webhook.</p>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Delivery ID</th>
                <th>Event Type</th>
                <th>Attempt</th>
                <th>Status</th>
                <th>HTTP Status</th>
                <th>Signature</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.deliveryId}>
                  <td>
                    <code>{delivery.deliveryId}</code>
                  </td>
                  <td>{delivery.eventType}</td>
                  <td>{delivery.attempt}</td>
                  <td>
                    {delivery.status === "delivered"
                      ? "Delivered"
                      : delivery.status === "queued"
                        ? "Queued"
                        : "Delivery failed"}
                  </td>
                  <td>{delivery.httpStatus ?? "-"}</td>
                  <td>
                    <code>{delivery.signature.slice(0, 20)}...</code>
                  </td>
                  <td>{formatDateTime(delivery.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NotificationsList({
  notifications,
}: {
  notifications: NotificationRecord[];
}) {
  return (
    <div className="notifications-section" style={{ marginTop: "2rem" }}>
      <h3>Related notifications</h3>
      <p className="muted-copy" style={{ marginBottom: "0.85rem" }}>
        Delivery failure and endpoint-governance notices should remain visible
        in the tenant notification feed.
      </p>
      {notifications.length === 0 ? (
        <p className="empty-state">
          No webhook-specific notifications are visible in the current feed.
        </p>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Notification ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Channel</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {notifications.slice(0, 8).map((notification) => (
                <tr key={notification.notificationId}>
                  <td>
                    <code>{notification.notificationId}</code>
                  </td>
                  <td>{notification.title}</td>
                  <td>{notification.status}</td>
                  <td>{notification.channel}</td>
                  <td>{formatDateTime(notification.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function createWebhook(formData: FormData) {
  "use server";

  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteWebhooks,
    "Tenant webhook write authority required.",
  );
  const client = await getTenantClient();
  const events = parseEvents(formData);
  let destination = "/webhooks";

  try {
    if (events.length === 0) {
      throw new Error("Select at least one webhook event.");
    }

    const command: CreateTenantWebhookEndpointCommand = {
      url: String(formData.get("url") ?? "").trim(),
      secret: String(formData.get("secret") ?? "").trim(),
      events,
    };

    if (!command.url || !command.secret) {
      throw new Error("Webhook URL and secret are required.");
    }

    await client.createWebhookEndpoint(command);
    revalidatePath("/webhooks");
    destination = `/webhooks?success=${encodeURIComponent(
      "Webhook endpoint created in test_pending status.",
    )}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    destination = `/webhooks?create=true&error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

async function updateWebhook(formData: FormData) {
  "use server";

  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteWebhooks,
    "Tenant webhook write authority required.",
  );
  const client = await getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "");
  const events = parseEvents(formData);
  let destination = "/webhooks";

  try {
    if (!webhookId) {
      throw new Error("Webhook ID is required.");
    }
    if (events.length === 0) {
      throw new Error("Select at least one webhook event.");
    }

    const command: UpdateTenantWebhookEndpointCommand = {
      url: String(formData.get("url") ?? "").trim(),
      events,
      status: String(formData.get("status") ?? "") as
        | "active"
        | "test_pending"
        | "disabled",
    };

    if (!command.url || !command.status) {
      throw new Error("Webhook URL and status are required.");
    }

    await client.updateWebhookEndpoint(webhookId, command);
    revalidatePath("/webhooks");
    destination = `/webhooks?success=${encodeURIComponent(
      "Webhook endpoint updated successfully.",
    )}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    destination = `/webhooks?edit=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

async function deleteWebhook(formData: FormData) {
  "use server";

  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteWebhooks,
    "Tenant webhook write authority required.",
  );
  const client = await getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "");
  let destination = "/webhooks";

  try {
    if (!webhookId) {
      throw new Error("Webhook ID is required.");
    }

    await client.deleteWebhookEndpoint(webhookId);
    revalidatePath("/webhooks");
    destination = `/webhooks?success=${encodeURIComponent("Webhook endpoint deleted successfully.")}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    destination = `/webhooks?error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}
