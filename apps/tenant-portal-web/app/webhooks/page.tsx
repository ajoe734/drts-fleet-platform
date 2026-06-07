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
import {
  formatPortalSectionError,
  formatPortalUiError,
  toPortalErrorMessage,
} from "@/lib/error-copy";
import { formatPortalCodeLabel } from "@/lib/localized-labels";

export const dynamic = "force-dynamic";

const WEBHOOK_DELIVERY_DISCLAIMER = {
  title: "第一階段可視性邊界",
  summary:
    "投遞紀錄是租戶回呼端點的正式可視資料，但在後端未發佈前，重試與重播控制仍會維持隱藏。",
  detail:
    "此頁僅用來檢查端點健康、投遞結果與相關通知。不要因為看得到投遞列，就假設系統已提供重播、重送或人工重試。",
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
    return "未提供";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getWebhookStatusPresentation(webhook: TenantWebhookEndpoint) {
  if (webhook.status === "disabled") {
    return {
      label: "已停用",
      background: "rgba(244, 63, 94, 0.12)",
      color: "#9f1239",
    };
  }

  if (webhook.status === "test_pending") {
    return {
      label: "待驗證",
      background: "rgba(245, 158, 11, 0.14)",
      color: "#b45309",
    };
  }

  return {
    label: "啟用中",
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
      errors.push(formatPortalSectionError(label, result.reason));
    }
  };

  collectError("回呼端點", webhooksResult);
  collectError("通知", notificationsResult);
  collectError("整合治理", governanceResult);
  collectError("投遞紀錄", deliveriesResult);

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
  const actionError = resolvedSearchParams.error
    ? formatPortalUiError(resolvedSearchParams.error, "回呼作業失敗")
    : null;

  return (
    <main className="app-grid">
      <AppShellCard
        title="回呼與投遞可視性"
        description={
          roleSnapshot.capabilities.canWriteWebhooks
            ? "管理租戶端點訂閱、驗證狀態與可觀測的投遞健康度，同時避免假裝後端尚未提供的重試控制已經存在。"
            : "目前身分仍可查看回呼投遞可視性，但在沒有回呼寫入權限時，新增、編輯與刪除端點仍會維持隱藏。"
        }
      >
        {errors.map((error) => (
          <div key={error} className="error-banner">
            <strong>錯誤：</strong> {error}
          </div>
        ))}

        {resolvedSearchParams.success ? (
          <div className="success-banner">
            <strong>成功：</strong> {resolvedSearchParams.success}
          </div>
        ) : null}

        {actionError ? (
          <div className="error-banner">
            <strong>錯誤：</strong> {actionError}
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
            <span className="metric-label">啟用端點</span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                marginTop: "0.5rem",
              }}
            >
              {activeCount}
            </div>
            <p className="muted-copy">已完成驗證並接收正式流量的端點。</p>
          </div>
          <div style={infoPanelStyle}>
            <span className="metric-label">待驗證</span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                marginTop: "0.5rem",
              }}
            >
              {pendingCount}
            </div>
            <p className="muted-copy">新增或變更後，仍在等待測試證據的端點。</p>
          </div>
          <div style={infoPanelStyle}>
            <span className="metric-label">已停用</span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                marginTop: "0.5rem",
              }}
            >
              {disabledCount}
            </div>
            <p className="muted-copy">重新啟用前仍需再次驗證的暫停端點。</p>
          </div>
          {deliveryWebhookId ? (
            <div style={infoPanelStyle}>
              <span className="metric-label">目前檢視紀錄</span>
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
                已送達 {deliverySummary.delivered} 筆，失敗{" "}
                {deliverySummary.failed} 筆，佇列中 {deliverySummary.queued}{" "}
                筆。
              </p>
            </div>
          ) : null}
        </section>

        {webhookPolicy ? (
          <section style={{ ...infoPanelStyle, marginBottom: "1rem" }}>
            <strong>權限政策快照</strong>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.9rem",
                marginTop: "0.85rem",
              }}
            >
              <div>
                <div className="metric-label">基準事件</div>
                <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
                  {baselineEvents.length > 0
                    ? baselineEvents
                        .map((eventType) =>
                          formatPortalCodeLabel(eventType, eventType),
                        )
                        .join("、")
                    : "治理套件目前沒有提供基準事件。"}
                </p>
              </div>
              <div>
                <div className="metric-label">重試規則</div>
                <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
                  最多重試 {webhookPolicy.retryPolicy.maxAttempts} 次，起始退避{" "}
                  {webhookPolicy.retryPolicy.initialBackoffSeconds} 秒，上限{" "}
                  {webhookPolicy.retryPolicy.maxBackoffSeconds} 秒。
                </p>
              </div>
              <div>
                <div className="metric-label">驗證規則</div>
                <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
                  新增或變更後的端點會重新進入待驗證狀態，輪替密鑰後也必須再次驗證。
                </p>
              </div>
              <div>
                <div className="metric-label">失敗通知</div>
                <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
                  最終投遞失敗時，系統會自動停用端點，並發送{" "}
                  <span>
                    {formatPortalCodeLabel(
                      webhookPolicy.deliveryFailureNotificationChannel,
                    )}
                  </span>{" "}
                  通知。
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
              <strong>拒絕存取：</strong> 新增端點需要租戶回呼寫入權限。
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
                <strong>拒絕存取：</strong> 編輯端點需要租戶回呼寫入權限。
              </div>
            )
          ) : (
            <div className="error-banner">
              <strong>錯誤：</strong> 找不到指定的回呼端點。
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
                  新增回呼端點
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
          <strong>返回首頁</strong>
          回到租戶入口總覽。
        </Link>
      </AppShellCard>
    </main>
  );
}

function WebhookDeliveryDisclaimer() {
  return (
    <section
      aria-label="回呼投遞說明"
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
        <label htmlFor="extraEvents">事件 *</label>
        <input
          type="text"
          id="extraEvents"
          name="extraEvents"
          placeholder="請輸入事件代碼，使用逗號分隔"
          required
        />
      </div>
    );
  }

  return (
    <>
      <div className="form-row">
        <label>基準事件 *</label>
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
                display: "grid",
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
              <span>{formatPortalCodeLabel(eventType, eventType)}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="form-row">
        <label htmlFor="extraEvents">額外事件</label>
        <input
          type="text"
          id="extraEvents"
          name="extraEvents"
          defaultValue={(selectedEvents ?? [])
            .filter((eventType) => !baselineEvents.includes(eventType))
            .join(", ")}
          placeholder="若權限方新增其他事件，請以逗號分隔輸入"
        />
      </div>
    </>
  );
}

function CreateWebhookForm({ baselineEvents }: { baselineEvents: string[] }) {
  return (
    <div className="form-section">
      <h3>新增回呼端點</h3>
      <p className="muted-copy">
        新端點會先以待驗證狀態建立，直到驗證完成為止。
      </p>
      <form action={createWebhook} className="form-grid">
        <div className="form-row">
          <label htmlFor="url">回呼網址 *</label>
          <input
            type="url"
            id="url"
            name="url"
            placeholder="請輸入回呼網址"
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="secret">密鑰 *</label>
          <input
            type="text"
            id="secret"
            name="secret"
            placeholder="請輸入回呼密鑰"
            required
          />
        </div>
        <EventChecklist baselineEvents={baselineEvents} />
        <div className="form-actions">
          <button type="submit">建立端點</button>
          <Link href="/webhooks">取消</Link>
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
      <h3>編輯回呼端點</h3>
      <p className="muted-copy">
        變更網址、事件或密鑰生命週期後，都需要再做一次驗證。
      </p>
      <form action={updateWebhook} className="form-grid">
        <input type="hidden" name="webhookId" value={webhook.webhookId} />
        <div className="form-row">
          <label htmlFor="edit-url">回呼網址 *</label>
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
          <label htmlFor="edit-status">狀態 *</label>
          <select
            id="edit-status"
            name="status"
            defaultValue={webhook.status}
            required
          >
            <option value="active">啟用中</option>
            <option value="test_pending">待驗證</option>
            <option value="disabled">已停用</option>
          </select>
        </div>
        <div className="form-actions">
          <button type="submit">更新端點</button>
          <Link href="/webhooks">取消</Link>
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
      <h3>回呼端點</h3>
      {webhooks.length === 0 ? (
        <p className="empty-state">
          目前尚未設定任何回呼端點。新增端點後，才能接收租戶事件通知。
        </p>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>端點</th>
                <th>事件</th>
                <th>狀態</th>
                <th>密鑰</th>
                <th>執行狀態</th>
                <th>操作</th>
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
                        建立於 {formatDateTime(webhook.createdAt)}，更新於{" "}
                        {formatDateTime(webhook.updatedAt)}。
                      </div>
                    </td>
                    <td>
                      {webhook.events
                        .map((eventType) =>
                          formatPortalCodeLabel(eventType, eventType),
                        )
                        .join("、")}
                    </td>
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
                          停用原因：{" "}
                          <code>
                            {formatPortalCodeLabel(runtime.disableReason)}
                          </code>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <strong>v{webhook.secretVersion}</strong>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        預覽 <code>{webhook.secretPreview}</code>
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        輪替次數{" "}
                        {runtime?.secretRotation.rotationCount ??
                          webhook.secretHistory?.length ??
                          0}
                      </div>
                    </td>
                    <td>
                      <div className="muted-copy">
                        投遞 {runtime?.deliveryCount ?? 0} 筆，失敗{" "}
                        {runtime?.failedDeliveryCount ?? 0} 筆
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        最後嘗試 {formatDateTime(runtime?.lastAttemptAt)}
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        最後送達 {formatDateTime(runtime?.lastDeliveredAt)}
                      </div>
                      <div
                        className="muted-copy"
                        style={{ marginTop: "0.35rem" }}
                      >
                        最後驗證 {formatDateTime(runtime?.lastValidatedAt)}
                      </div>
                    </td>
                    <td>
                      <Link href={`/webhooks?deliveries=${webhook.webhookId}`}>
                        投遞紀錄
                      </Link>
                      {canManage ? (
                        <>
                          {" | "}
                          <Link href={`/webhooks?edit=${webhook.webhookId}`}>
                            編輯
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
                              confirmMessage={`確定要刪除回呼端點「${webhook.url}」嗎？此動作無法復原。`}
                            >
                              刪除
                            </ConfirmSubmitButton>
                          </form>
                        </>
                      ) : (
                        <span className="muted-copy"> | 僅供稽核</span>
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
      <h3>投遞紀錄</h3>
      <p className="muted-copy">
        {webhook ? (
          <>
            端點 <code>{webhook.url}</code>
          </>
        ) : (
          <>
            端點 <code>{webhookId}</code>
          </>
        )}
      </p>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/webhooks">返回回呼列表</Link>
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
          <span className="metric-label">總數</span>
          <div
            style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}
          >
            {summary.total}
          </div>
        </div>
        <div style={infoPanelStyle}>
          <span className="metric-label">已送達</span>
          <div
            style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}
          >
            {summary.delivered}
          </div>
        </div>
        <div style={infoPanelStyle}>
          <span className="metric-label">佇列中</span>
          <div
            style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}
          >
            {summary.queued}
          </div>
        </div>
        <div style={infoPanelStyle}>
          <span className="metric-label">失敗</span>
          <div
            style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "0.5rem" }}
          >
            {summary.failed}
          </div>
        </div>
      </section>
      {deliveries.length === 0 ? (
        <p className="empty-state">這個回呼端點目前沒有任何投遞紀錄。</p>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>投遞編號</th>
                <th>事件類型</th>
                <th>嘗試次數</th>
                <th>狀態</th>
                <th>回應狀態碼</th>
                <th>簽章</th>
                <th>建立時間</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.deliveryId}>
                  <td>
                    <code>{delivery.deliveryId}</code>
                  </td>
                  <td>
                    {formatPortalCodeLabel(
                      delivery.eventType,
                      delivery.eventType,
                    )}
                  </td>
                  <td>{delivery.attempt}</td>
                  <td>
                    {delivery.status === "delivered"
                      ? "已送達"
                      : delivery.status === "queued"
                        ? "佇列中"
                        : "投遞失敗"}
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
      <h3>相關通知</h3>
      <p className="muted-copy" style={{ marginBottom: "0.85rem" }}>
        投遞失敗與端點治理相關通知，應持續出現在租戶通知摘要中。
      </p>
      {notifications.length === 0 ? (
        <p className="empty-state">目前通知摘要中沒有可見的回呼專屬通知。</p>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>通知編號</th>
                <th>標題</th>
                <th>狀態</th>
                <th>渠道</th>
                <th>建立時間</th>
              </tr>
            </thead>
            <tbody>
              {notifications.slice(0, 8).map((notification) => (
                <tr key={notification.notificationId}>
                  <td>
                    <code>{notification.notificationId}</code>
                  </td>
                  <td>{notification.title}</td>
                  <td>{formatPortalCodeLabel(notification.status)}</td>
                  <td>{formatPortalCodeLabel(notification.channel)}</td>
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
    "需要租戶回呼寫入權限。",
  );
  const client = await getTenantClient();
  const events = parseEvents(formData);
  let destination = "/webhooks";

  try {
    if (events.length === 0) {
      throw new Error("請至少選擇一個回呼事件。");
    }

    const command: CreateTenantWebhookEndpointCommand = {
      url: String(formData.get("url") ?? "").trim(),
      secret: String(formData.get("secret") ?? "").trim(),
      events,
    };

    if (!command.url || !command.secret) {
      throw new Error("回呼網址與密鑰皆為必填。");
    }

    await client.createWebhookEndpoint(command);
    revalidatePath("/webhooks");
    destination = `/webhooks?success=${encodeURIComponent(
      "回呼端點已建立，待完成驗證。",
    )}`;
  } catch (error) {
    const message = formatPortalUiError(
      toPortalErrorMessage(error),
      "無法建立回呼端點",
    );
    destination = `/webhooks?create=true&error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

async function updateWebhook(formData: FormData) {
  "use server";

  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteWebhooks,
    "需要租戶回呼寫入權限。",
  );
  const client = await getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "");
  const events = parseEvents(formData);
  let destination = "/webhooks";

  try {
    if (!webhookId) {
      throw new Error("端點編號為必填。");
    }
    if (events.length === 0) {
      throw new Error("請至少選擇一個回呼事件。");
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
      throw new Error("回呼網址與狀態皆為必填。");
    }

    await client.updateWebhookEndpoint(webhookId, command);
    revalidatePath("/webhooks");
    destination = `/webhooks?success=${encodeURIComponent("回呼端點已更新。")}`;
  } catch (error) {
    const message = formatPortalUiError(
      toPortalErrorMessage(error),
      "無法更新回呼端點",
    );
    destination = `/webhooks?edit=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

async function deleteWebhook(formData: FormData) {
  "use server";

  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteWebhooks,
    "需要租戶回呼寫入權限。",
  );
  const client = await getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "");
  let destination = "/webhooks";

  try {
    if (!webhookId) {
      throw new Error("端點編號為必填。");
    }

    await client.deleteWebhookEndpoint(webhookId, {
      reason: "tenant_portal_delete_webhook",
    });
    revalidatePath("/webhooks");
    destination = `/webhooks?success=${encodeURIComponent("回呼端點已刪除。")}`;
  } catch (error) {
    const message = formatPortalUiError(
      toPortalErrorMessage(error),
      "無法刪除回呼端點",
    );
    destination = `/webhooks?error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}
