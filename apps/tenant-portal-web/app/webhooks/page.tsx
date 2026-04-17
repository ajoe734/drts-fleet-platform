import Link from "next/link";
import { revalidatePath } from "next/cache";
import type {
  CreateTenantWebhookEndpointCommand,
  NotificationRecord,
  TenantWebhookEndpoint,
  UpdateTenantWebhookEndpointCommand,
  WebhookDeliveryRecord,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

const WEBHOOK_DELIVERY_DISCLAIMER = {
  title: "Phase 1 limitation",
  summary:
    "Webhook delivery logs shown here are not backed by the production delivery engine yet.",
  detail:
    "Treat these entries as placeholder visibility only. Real outbound delivery, retry handling, and delivery status integrity will land in Phase 2.",
};

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams?: {
    create?: string;
    edit?: string;
    deliveries?: string;
    error?: string;
    success?: string;
  };
}) {
  const client = getTenantClient();

  let webhooks: TenantWebhookEndpoint[] = [];
  let notifications: NotificationRecord[] = [];
  let deliveries: WebhookDeliveryRecord[] = [];
  let error: string | null = null;

  const createMode = searchParams?.create === "true";
  const editWebhookId = searchParams?.edit;
  const deliveryWebhookId = searchParams?.deliveries;
  const showGlobalWebhookDeliveryDisclaimer = !deliveryWebhookId;
  const successMsg = searchParams?.success ?? null;
  const formError = searchParams?.error ?? null;

  try {
    const [webhookData, notifData] = await Promise.all([
      client.listWebhooks(),
      client.listTenantNotificationFeed(),
    ]);
    webhooks = webhookData;
    notifications = notifData;

    if (deliveryWebhookId) {
      deliveries = await client.listWebhookDeliveries(deliveryWebhookId);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const editingWebhook = editWebhookId
    ? (webhooks.find((webhook) => webhook.webhookId === editWebhookId) ?? null)
    : null;

  return (
    <main className="app-grid">
      <AppShellCard
        title="Webhooks & Notifications"
        description={`Manage webhook endpoint subscriptions and delivery logs. ${webhooks.length} webhook(s), ${notifications.length} notification(s).`}
      >
        {showGlobalWebhookDeliveryDisclaimer ? (
          <WebhookDeliveryDisclaimer />
        ) : null}

        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {successMsg && (
          <div className="success-banner">
            <strong>Success:</strong> {successMsg}
          </div>
        )}

        {createMode ? (
          <CreateWebhookForm formError={formError} />
        ) : editWebhookId ? (
          editingWebhook ? (
            <EditWebhookForm formError={formError} webhook={editingWebhook} />
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
            <div className="form-actions" style={{ marginBottom: "1rem" }}>
              <Link href="/webhooks?create=true" className="btn-primary">
                Add Webhook Endpoint
              </Link>
            </div>
            <WebhookList webhooks={webhooks} />
            <NotificationsList notifications={notifications} />
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

function CreateWebhookForm({ formError }: { formError: string | null }) {
  return (
    <div className="form-section">
      <h3>Create Webhook Endpoint</h3>
      {formError && (
        <div className="error-banner">
          <strong>Error:</strong> {formError}
        </div>
      )}
      <form action={createWebhook} className="form-grid">
        <div className="form-row">
          <label htmlFor="url">Webhook URL *</label>
          <input
            type="url"
            id="url"
            name="url"
            placeholder="https://your-server.com/webhook"
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
        <div className="form-row">
          <label htmlFor="events">Events (comma-separated) *</label>
          <input
            type="text"
            id="events"
            name="events"
            placeholder="booking.created,booking.updated,booking.cancelled"
            required
          />
        </div>
        <div className="form-actions">
          <button type="submit">Create Endpoint</button>
          <Link href="/webhooks">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

function EditWebhookForm({
  formError,
  webhook,
}: {
  formError: string | null;
  webhook: TenantWebhookEndpoint;
}) {
  return (
    <div className="form-section">
      <h3>Edit Webhook Endpoint</h3>
      {formError && (
        <div className="error-banner">
          <strong>Error:</strong> {formError}
        </div>
      )}
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
        <div className="form-row">
          <label htmlFor="edit-events">Events (comma-separated) *</label>
          <input
            type="text"
            id="edit-events"
            name="events"
            defaultValue={webhook.events.join(",")}
            required
          />
        </div>
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

function WebhookList({ webhooks }: { webhooks: TenantWebhookEndpoint[] }) {
  return (
    <div className="webhooks-section">
      <h3>Webhook Endpoints</h3>
      {webhooks.length === 0 ? (
        <p className="empty-state">
          No webhook endpoints configured. Add one to receive event
          notifications.
        </p>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Webhook ID</th>
                <th>URL</th>
                <th>Events</th>
                <th>Status</th>
                <th>Secret Version</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((webhook) => (
                <tr key={webhook.webhookId}>
                  <td>
                    <code>{webhook.webhookId}</code>
                  </td>
                  <td>
                    <code>{webhook.url}</code>
                  </td>
                  <td>{webhook.events.join(", ")}</td>
                  <td>
                    {webhook.status === "active" ? "✅ Active" : "⏳ Pending"}
                  </td>
                  <td>v{webhook.secretVersion}</td>
                  <td>{new Date(webhook.createdAt).toLocaleString()}</td>
                  <td>{new Date(webhook.updatedAt).toLocaleString()}</td>
                  <td>
                    <Link href={`/webhooks?deliveries=${webhook.webhookId}`}>
                      Deliveries
                    </Link>
                    {" | "}
                    <Link href={`/webhooks?edit=${webhook.webhookId}`}>
                      Edit
                    </Link>
                    {" | "}
                    <form action={deleteWebhook} style={{ display: "inline" }}>
                      <input
                        type="hidden"
                        name="webhookId"
                        value={webhook.webhookId}
                      />
                      <button
                        type="submit"
                        onClick={(e) => {
                          if (
                            !confirm(
                              `Delete webhook endpoint "${webhook.url}"? This action cannot be undone.`,
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
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
  const webhook = webhooks.find((w) => w.webhookId === webhookId);

  return (
    <div className="delivery-log-section">
      <h3>Delivery Log: {webhook?.url ?? webhookId}</h3>
      <WebhookDeliveryDisclaimer />
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/webhooks">← Back to webhooks</Link>
      </p>
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
                      ? "✅ Delivered"
                      : delivery.status === "queued"
                        ? "⏳ Queued"
                        : "❌ Failed"}
                  </td>
                  <td>{delivery.httpStatus ?? "-"}</td>
                  <td>
                    <code>{delivery.signature.slice(0, 20)}...</code>
                  </td>
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
      <h3>Recent Notifications</h3>
      {notifications.length === 0 ? (
        <p className="empty-state">No notifications.</p>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Notification ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((notification) => (
                <tr key={notification.notificationId}>
                  <td>{notification.notificationId}</td>
                  <td>{notification.title}</td>
                  <td>{notification.status}</td>
                  <td>{new Date(notification.createdAt).toLocaleString()}</td>
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
  const client = getTenantClient();

  const eventsStr = formData.get("events") as string;
  const events = eventsStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const command: CreateTenantWebhookEndpointCommand = {
    url: formData.get("url") as string,
    secret: formData.get("secret") as string,
    events,
  };

  try {
    await client.createWebhookEndpoint(command);
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?success=${encodeURIComponent(
        `Webhook endpoint created successfully.`,
      )}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    redirect(`/webhooks?create=true&error=${encodeURIComponent(msg)}`);
  }
}

async function updateWebhook(formData: FormData) {
  "use server";
  const client = getTenantClient();

  const webhookId = formData.get("webhookId") as string;
  const events = String(formData.get("events") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const command: UpdateTenantWebhookEndpointCommand = {
    url: formData.get("url") as string,
    events,
    status: formData.get("status") as "active" | "test_pending",
  };

  try {
    await client.updateWebhookEndpoint(webhookId, command);
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?success=${encodeURIComponent(
        "Webhook endpoint updated successfully.",
      )}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    redirect(
      `/webhooks?edit=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(msg)}`,
    );
  }
}

async function deleteWebhook(formData: FormData) {
  "use server";
  const client = getTenantClient();

  const webhookId = formData.get("webhookId") as string;

  try {
    await client.deleteWebhookEndpoint(webhookId);
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?success=${encodeURIComponent(
        `Webhook endpoint deleted successfully.`,
      )}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    redirect(`/webhooks?error=${encodeURIComponent(msg)}`);
  }
}

function redirect(path: string) {
  import("next/navigation").then(({ redirect }) => redirect(path));
}
