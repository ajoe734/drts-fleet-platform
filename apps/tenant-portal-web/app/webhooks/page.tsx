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
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import type { Locale } from "@/lib/translations";

export const dynamic = "force-dynamic";

const WEBHOOK_DELIVERY_DISCLAIMER = {
  titleKey: "webhooks.disclaimer.title",
  summaryKey: "webhooks.disclaimer.summary",
  detailKey: "webhooks.disclaimer.detail",
} as const;

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

function formatDateTime(value: string | null | undefined, locale: Locale) {
  if (!value) {
    return t("webhooks.value.notAvailable", locale);
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getWebhookStatusPresentation(
  webhook: TenantWebhookEndpoint,
  locale: Locale,
) {
  if (webhook.status === "disabled") {
    return {
      label: t("webhooks.status.disabled", locale),
      background: "rgba(244, 63, 94, 0.12)",
      color: "#9f1239",
    };
  }

  if (webhook.status === "test_pending") {
    return {
      label: t("webhooks.status.testPending", locale),
      background: "rgba(245, 158, 11, 0.14)",
      color: "#b45309",
    };
  }

  return {
    label: t("webhooks.status.active", locale),
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
  locale: Locale,
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
        `${label}: ${result.reason instanceof Error ? result.reason.message : t("webhooks.error.unknown", locale)}`,
      );
    }
  };

  collectError(t("webhooks.errorLabel.webhooks", locale), webhooksResult);
  collectError(
    t("webhooks.errorLabel.notifications", locale),
    notificationsResult,
  );
  collectError(
    t("webhooks.errorLabel.integrationGovernance", locale),
    governanceResult,
  );
  collectError(t("webhooks.errorLabel.deliveries", locale), deliveriesResult);

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
  const locale = await getServerLocale();
  const resolvedSearchParams = (await searchParams) ?? {};
  const roleSnapshot = await getTenantRoleSnapshot();
  const deliveryWebhookId = resolvedSearchParams.deliveries;
  const { webhooks, notifications, governance, deliveries, errors } =
    await loadPageData(deliveryWebhookId, locale);

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
        title={t("webhooks.page.title", locale)}
        description={
          roleSnapshot.capabilities.canWriteWebhooks
            ? t("webhooks.page.description.write", locale)
            : t("webhooks.page.description.read", locale)
        }
      >
        {errors.map((error) => (
          <div key={error} className="error-banner">
            <strong>{t("webhooks.banner.error", locale)}</strong> {error}
          </div>
        ))}

        {resolvedSearchParams.success ? (
          <div className="success-banner">
            <strong>{t("webhooks.banner.success", locale)}</strong>{" "}
            {resolvedSearchParams.success}
          </div>
        ) : null}

        {resolvedSearchParams.error ? (
          <div className="error-banner">
            <strong>{t("webhooks.banner.error", locale)}</strong>{" "}
            {resolvedSearchParams.error}
          </div>
        ) : null}

        <WebhookDeliveryDisclaimer locale={locale} />

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.9rem",
            marginBottom: "1rem",
          }}
        >
          <div style={infoPanelStyle}>
            <span className="metric-label">
              {t("webhooks.metric.activeEndpoints", locale)}
            </span>
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
              {t("webhooks.metric.activeEndpoints.hint", locale)}
            </p>
          </div>
          <div style={infoPanelStyle}>
            <span className="metric-label">
              {t("webhooks.metric.pendingValidation", locale)}
            </span>
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
              {t("webhooks.metric.pendingValidation.hint", locale)}
            </p>
          </div>
          <div style={infoPanelStyle}>
            <span className="metric-label">
              {t("webhooks.metric.disabled", locale)}
            </span>
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
              {t("webhooks.metric.disabled.hint", locale)}
            </p>
          </div>
          {deliveryWebhookId ? (
            <div style={infoPanelStyle}>
              <span className="metric-label">
                {t("webhooks.metric.selectedLog", locale)}
              </span>
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
                {t("webhooks.metric.selectedLog.hint", locale, {
                  delivered: deliverySummary.delivered,
                  failed: deliverySummary.failed,
                  queued: deliverySummary.queued,
                })}
              </p>
            </div>
          ) : null}
        </section>

        {webhookPolicy ? (
          <section style={{ ...infoPanelStyle, marginBottom: "1rem" }}>
            <strong>{t("webhooks.policy.title", locale)}</strong>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.9rem",
                marginTop: "0.85rem",
              }}
            >
              <div>
                <div className="metric-label">
                  {t("webhooks.policy.baselineEvents", locale)}
                </div>
                <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
                  {baselineEvents.length > 0
                    ? baselineEvents.join(", ")
                    : t("webhooks.policy.baselineEvents.empty", locale)}
                </p>
              </div>
              <div>
                <div className="metric-label">
                  {t("webhooks.policy.retryContract", locale)}
                </div>
                <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
                  {t("webhooks.policy.retryContract.value", locale, {
                    maxAttempts: webhookPolicy.retryPolicy.maxAttempts,
                    initialBackoff:
                      webhookPolicy.retryPolicy.initialBackoffSeconds,
                    maxBackoff: webhookPolicy.retryPolicy.maxBackoffSeconds,
                  })}
                </p>
              </div>
              <div>
                <div className="metric-label">
                  {t("webhooks.policy.validationRules", locale)}
                </div>
                <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
                  {t("webhooks.policy.validationRules.before", locale)}{" "}
                  <code>test_pending</code>.{" "}
                  {t("webhooks.policy.validationRules.after", locale)}
                </p>
              </div>
              <div>
                <div className="metric-label">
                  {t("webhooks.policy.failureNotices", locale)}
                </div>
                <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
                  {t("webhooks.policy.failureNotices.before", locale)}{" "}
                  <code>
                    {webhookPolicy.deliveryFailureNotificationChannel}
                  </code>{" "}
                  {t("webhooks.policy.failureNotices.after", locale)}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {createMode ? (
          roleSnapshot.capabilities.canWriteWebhooks ? (
            <CreateWebhookForm baselineEvents={baselineEvents} locale={locale} />
          ) : (
            <div className="error-banner">
              <strong>{t("webhooks.accessDenied.label", locale)}</strong>{" "}
              {t("webhooks.accessDenied.add", locale)}
            </div>
          )
        ) : editWebhookId ? (
          editingWebhook ? (
            roleSnapshot.capabilities.canWriteWebhooks ? (
              <EditWebhookForm
                baselineEvents={baselineEvents}
                webhook={editingWebhook}
                locale={locale}
              />
            ) : (
              <div className="error-banner">
                <strong>{t("webhooks.accessDenied.label", locale)}</strong>{" "}
                {t("webhooks.accessDenied.edit", locale)}
              </div>
            )
          ) : (
            <div className="error-banner">
              <strong>{t("webhooks.banner.error", locale)}</strong>{" "}
              {t("webhooks.notFound", locale)}
            </div>
          )
        ) : deliveryWebhookId ? (
          <DeliveryLogView
            webhookId={deliveryWebhookId}
            deliveries={deliveries}
            webhooks={webhooks}
            locale={locale}
          />
        ) : (
          <>
            {roleSnapshot.capabilities.canWriteWebhooks ? (
              <div className="form-actions" style={{ marginBottom: "1rem" }}>
                <Link href="/webhooks?create=true" className="btn-primary">
                  {t("webhooks.action.addEndpoint", locale)}
                </Link>
              </div>
            ) : null}
            <WebhookList
              webhooks={webhooks}
              canManage={roleSnapshot.capabilities.canWriteWebhooks}
              locale={locale}
            />
            <NotificationsList
              notifications={relevantNotifications}
              locale={locale}
            />
          </>
        )}

        <Link className="route-link" href="/">
          <strong>{t("webhooks.backHome.title", locale)}</strong>
          {t("webhooks.backHome.subtitle", locale)}
        </Link>
      </AppShellCard>
    </main>
  );
}

function WebhookDeliveryDisclaimer({ locale }: { locale: Locale }) {
  return (
    <section
      aria-label={t("webhooks.disclaimer.ariaLabel", locale)}
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
        {t(WEBHOOK_DELIVERY_DISCLAIMER.titleKey, locale)}
      </p>
      <p style={{ margin: "0.5rem 0 0" }}>
        {t(WEBHOOK_DELIVERY_DISCLAIMER.summaryKey, locale)}
      </p>
      <p style={{ margin: "0.5rem 0 0", color: "#9a3412" }}>
        {t(WEBHOOK_DELIVERY_DISCLAIMER.detailKey, locale)}
      </p>
    </section>
  );
}

function EventChecklist({
  baselineEvents,
  selectedEvents,
  locale,
}: {
  baselineEvents: string[];
  selectedEvents?: string[];
  locale: Locale;
}) {
  const selected = new Set(selectedEvents ?? []);

  if (baselineEvents.length === 0) {
    return (
      <div className="form-row">
        <label htmlFor="extraEvents">
          {t("webhooks.form.events.label", locale)}
        </label>
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
        <label>{t("webhooks.form.baselineEvents.label", locale)}</label>
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
        <label htmlFor="extraEvents">
          {t("webhooks.form.additionalEvents.label", locale)}
        </label>
        <input
          type="text"
          id="extraEvents"
          name="extraEvents"
          defaultValue={(selectedEvents ?? [])
            .filter((eventType) => !baselineEvents.includes(eventType))
            .join(", ")}
          placeholder={t("webhooks.form.additionalEvents.placeholder", locale)}
        />
      </div>
    </>
  );
}

function CreateWebhookForm({
  baselineEvents,
  locale,
}: {
  baselineEvents: string[];
  locale: Locale;
}) {
  return (
    <div className="form-section">
      <h3>{t("webhooks.create.heading", locale)}</h3>
      <p className="muted-copy">
        {t("webhooks.create.hint.before", locale)} <code>test_pending</code>{" "}
        {t("webhooks.create.hint.after", locale)}
      </p>
      <form action={createWebhook} className="form-grid">
        <div className="form-row">
          <label htmlFor="url">{t("webhooks.form.url.label", locale)}</label>
          <input
            type="url"
            id="url"
            name="url"
            placeholder="https://partner.example.com/drts/webhooks"
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="secret">
            {t("webhooks.form.secret.label", locale)}
          </label>
          <input
            type="text"
            id="secret"
            name="secret"
            placeholder="whsec_..."
            required
          />
        </div>
        <EventChecklist baselineEvents={baselineEvents} locale={locale} />
        <div className="form-actions">
          <button type="submit">
            {t("webhooks.action.createEndpoint", locale)}
          </button>
          <Link href="/webhooks">{t("webhooks.action.cancel", locale)}</Link>
        </div>
      </form>
    </div>
  );
}

function EditWebhookForm({
  baselineEvents,
  webhook,
  locale,
}: {
  baselineEvents: string[];
  webhook: TenantWebhookEndpoint;
  locale: Locale;
}) {
  return (
    <div className="form-section">
      <h3>{t("webhooks.edit.heading", locale)}</h3>
      <p className="muted-copy">{t("webhooks.edit.hint", locale)}</p>
      <form action={updateWebhook} className="form-grid">
        <input type="hidden" name="webhookId" value={webhook.webhookId} />
        <div className="form-row">
          <label htmlFor="edit-url">
            {t("webhooks.form.url.label", locale)}
          </label>
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
          locale={locale}
        />
        <div className="form-row">
          <label htmlFor="edit-status">
            {t("webhooks.form.status.label", locale)}
          </label>
          <select
            id="edit-status"
            name="status"
            defaultValue={webhook.status}
            required
          >
            <option value="active">
              {t("webhooks.status.active", locale)}
            </option>
            <option value="test_pending">
              {t("webhooks.status.testPending", locale)}
            </option>
            <option value="disabled">
              {t("webhooks.status.disabled", locale)}
            </option>
          </select>
        </div>
        <div className="form-actions">
          <button type="submit">
            {t("webhooks.action.updateEndpoint", locale)}
          </button>
          <Link href="/webhooks">{t("webhooks.action.cancel", locale)}</Link>
        </div>
      </form>
    </div>
  );
}

function WebhookList({
  webhooks,
  canManage,
  locale,
}: {
  webhooks: TenantWebhookEndpoint[];
  canManage: boolean;
  locale: Locale;
}) {
  return (
    <div className="webhooks-section">
      <h3>{t("webhooks.list.heading", locale)}</h3>
      {webhooks.length === 0 ? (
        <p className="empty-state">{t("webhooks.list.empty", locale)}</p>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>{t("webhooks.table.endpoint", locale)}</th>
                <th>{t("webhooks.table.events", locale)}</th>
                <th>{t("webhooks.table.status", locale)}</th>
                <th>{t("webhooks.table.secret", locale)}</th>
                <th>{t("webhooks.table.runtime", locale)}</th>
                <th>{t("webhooks.table.actions", locale)}</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((webhook) => {
                const presentation = getWebhookStatusPresentation(
                  webhook,
                  locale,
                );
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
                        {t("webhooks.list.timestamps", locale, {
                          created: formatDateTime(webhook.createdAt, locale),
                          updated: formatDateTime(webhook.updatedAt, locale),
                        })}
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
                          {t("webhooks.list.disableReason", locale)}{" "}
                          <code>{runtime.disableReason}</code>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <strong>v{webhook.secretVersion}</strong>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        {t("webhooks.list.secretPreview", locale)}{" "}
                        <code>{webhook.secretPreview}</code>
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        {t("webhooks.list.rotationHistory", locale, {
                          count:
                            runtime?.secretRotation.rotationCount ??
                            webhook.secretHistory?.length ??
                            0,
                        })}
                      </div>
                    </td>
                    <td>
                      <div className="muted-copy">
                        {t("webhooks.list.deliveryCounts", locale, {
                          deliveries: runtime?.deliveryCount ?? 0,
                          failed: runtime?.failedDeliveryCount ?? 0,
                        })}
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        {t("webhooks.list.lastAttempt", locale, {
                          value: formatDateTime(runtime?.lastAttemptAt, locale),
                        })}
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        {t("webhooks.list.lastDelivered", locale, {
                          value: formatDateTime(
                            runtime?.lastDeliveredAt,
                            locale,
                          ),
                        })}
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        {t("webhooks.list.lastValidated", locale, {
                          value: formatDateTime(
                            runtime?.lastValidatedAt,
                            locale,
                          ),
                        })}
                      </div>
                    </td>
                    <td>
                      <Link href={`/webhooks?deliveries=${webhook.webhookId}`}>
                        {t("webhooks.action.deliveries", locale)}
                      </Link>
                      {canManage ? (
                        <>
                          {" | "}
                          <Link href={`/webhooks?edit=${webhook.webhookId}`}>
                            {t("webhooks.action.edit", locale)}
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
                              confirmMessage={t(
                                "webhooks.action.delete.confirm",
                                locale,
                                { url: webhook.url },
                              )}
                            >
                              {t("webhooks.action.delete", locale)}
                            </ConfirmSubmitButton>
                          </form>
                        </>
                      ) : (
                        <span className="muted-copy">
                          {" "}
                          {t("webhooks.action.auditOnly", locale)}
                        </span>
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
  locale,
}: {
  webhookId: string;
  deliveries: WebhookDeliveryRecord[];
  webhooks: TenantWebhookEndpoint[];
  locale: Locale;
}) {
  const webhook = webhooks.find((item) => item.webhookId === webhookId);
  const summary = summarizeDeliveries(deliveries);

  return (
    <div className="delivery-log-section">
      <h3>{t("webhooks.deliveryLog.heading", locale)}</h3>
      <p className="muted-copy">
        {webhook ? (
          <>
            {t("webhooks.deliveryLog.endpoint", locale)}{" "}
            <code>{webhook.url}</code>
          </>
        ) : (
          <>
            {t("webhooks.deliveryLog.endpoint", locale)}{" "}
            <code>{webhookId}</code>
          </>
        )}
      </p>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/webhooks">
          {t("webhooks.deliveryLog.back", locale)}
        </Link>
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
          <span className="metric-label">
            {t("webhooks.summary.total", locale)}
          </span>
          <div
            style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}
          >
            {summary.total}
          </div>
        </div>
        <div style={infoPanelStyle}>
          <span className="metric-label">
            {t("webhooks.summary.delivered", locale)}
          </span>
          <div
            style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}
          >
            {summary.delivered}
          </div>
        </div>
        <div style={infoPanelStyle}>
          <span className="metric-label">
            {t("webhooks.summary.queued", locale)}
          </span>
          <div
            style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}
          >
            {summary.queued}
          </div>
        </div>
        <div style={infoPanelStyle}>
          <span className="metric-label">
            {t("webhooks.summary.failed", locale)}
          </span>
          <div
            style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}
          >
            {summary.failed}
          </div>
        </div>
      </section>
      {deliveries.length === 0 ? (
        <p className="empty-state">
          {t("webhooks.deliveryLog.empty", locale)}
        </p>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>{t("webhooks.deliveryTable.deliveryId", locale)}</th>
                <th>{t("webhooks.deliveryTable.eventType", locale)}</th>
                <th>{t("webhooks.deliveryTable.attempt", locale)}</th>
                <th>{t("webhooks.deliveryTable.status", locale)}</th>
                <th>{t("webhooks.deliveryTable.httpStatus", locale)}</th>
                <th>{t("webhooks.deliveryTable.signature", locale)}</th>
                <th>{t("webhooks.deliveryTable.created", locale)}</th>
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
                      ? t("webhooks.deliveryStatus.delivered", locale)
                      : delivery.status === "queued"
                        ? t("webhooks.deliveryStatus.queued", locale)
                        : t("webhooks.deliveryStatus.failed", locale)}
                  </td>
                  <td>{delivery.httpStatus ?? "-"}</td>
                  <td>
                    <code>{delivery.signature.slice(0, 20)}...</code>
                  </td>
                  <td>{formatDateTime(delivery.createdAt, locale)}</td>
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
  locale,
}: {
  notifications: NotificationRecord[];
  locale: Locale;
}) {
  return (
    <div className="notifications-section" style={{ marginTop: "2rem" }}>
      <h3>{t("webhooks.notifications.heading", locale)}</h3>
      <p className="muted-copy" style={{ marginBottom: "0.85rem" }}>
        {t("webhooks.notifications.hint", locale)}
      </p>
      {notifications.length === 0 ? (
        <p className="empty-state">
          {t("webhooks.notifications.empty", locale)}
        </p>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>{t("webhooks.notificationsTable.id", locale)}</th>
                <th>{t("webhooks.notificationsTable.title", locale)}</th>
                <th>{t("webhooks.notificationsTable.status", locale)}</th>
                <th>{t("webhooks.notificationsTable.channel", locale)}</th>
                <th>{t("webhooks.notificationsTable.created", locale)}</th>
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
                  <td>{formatDateTime(notification.createdAt, locale)}</td>
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

  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteWebhooks,
    t("webhooks.error.writeAuthorityRequired", locale),
  );
  const client = await getTenantClient();
  const events = parseEvents(formData);
  let destination = "/webhooks";

  try {
    if (events.length === 0) {
      throw new Error(t("webhooks.error.selectEvent", locale));
    }

    const command: CreateTenantWebhookEndpointCommand = {
      url: String(formData.get("url") ?? "").trim(),
      secret: String(formData.get("secret") ?? "").trim(),
      events,
    };

    if (!command.url || !command.secret) {
      throw new Error(t("webhooks.error.urlSecretRequired", locale));
    }

    await client.createWebhookEndpoint(command);
    revalidatePath("/webhooks");
    destination = `/webhooks?success=${encodeURIComponent(
      t("webhooks.success.created", locale),
    )}`;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : t("webhooks.error.unknown", locale);
    destination = `/webhooks?create=true&error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

async function updateWebhook(formData: FormData) {
  "use server";

  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteWebhooks,
    t("webhooks.error.writeAuthorityRequired", locale),
  );
  const client = await getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "");
  const events = parseEvents(formData);
  let destination = "/webhooks";

  try {
    if (!webhookId) {
      throw new Error(t("webhooks.error.idRequired", locale));
    }
    if (events.length === 0) {
      throw new Error(t("webhooks.error.selectEvent", locale));
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
      throw new Error(t("webhooks.error.urlStatusRequired", locale));
    }

    await client.updateWebhookEndpoint(webhookId, command);
    revalidatePath("/webhooks");
    destination = `/webhooks?success=${encodeURIComponent(
      t("webhooks.success.updated", locale),
    )}`;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : t("webhooks.error.unknown", locale);
    destination = `/webhooks?edit=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

async function deleteWebhook(formData: FormData) {
  "use server";

  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteWebhooks,
    t("webhooks.error.writeAuthorityRequired", locale),
  );
  const client = await getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "");
  let destination = "/webhooks";

  try {
    if (!webhookId) {
      throw new Error(t("webhooks.error.idRequired", locale));
    }

    await client.deleteWebhookEndpoint(webhookId, {
      reason: "tenant_portal_delete_webhook",
    });
    revalidatePath("/webhooks");
    destination = `/webhooks?success=${encodeURIComponent(t("webhooks.success.deleted", locale))}`;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : t("webhooks.error.unknown", locale);
    destination = `/webhooks?error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}
