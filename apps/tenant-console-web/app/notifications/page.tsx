import type { CSSProperties } from "react";
import type {
  ResourceActionDescriptor,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantNotificationSubscription,
  TenantWebhookEndpoint,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasIcon,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  ServerCanvasTable,
  type ServerCanvasTableColumn,
} from "@/components/server-canvas-table";
import {
  CANVAS_EMPTY_REASONS,
  CANVAS_REFRESH_TIERS,
  CANVAS_RISK_LEVELS,
  CanvasToggle,
  type CanvasEmptyReason,
} from "@/lib/notification-canvas";
import {
  formatTenantErrorSummary,
  toTenantErrorMessage,
} from "@/lib/error-copy";
import { getTenantClient } from "@/lib/api-client";
import {
  formatTenantCodeLabel,
  hasTenantCodeLabel,
} from "@/lib/localized-labels";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-start",
};

const matrixCardStyle: CSSProperties = {
  flex: "1.6 1 680px",
  minWidth: 0,
};

const sideCardStyle: CSSProperties = {
  flex: "1 1 320px",
  minWidth: 0,
};

const emptyCatalogStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const emptyCardStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 8,
  padding: 12,
  background: th.bgRaised,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const emptyHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const emptyLabelStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontSize: 12,
};

const emptyHintStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const tableEmptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const crossAppListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const crossAppItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  background: th.bgRaised,
  color: th.text,
  fontSize: 12,
  textDecoration: "none",
};

const matrixEventCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const matrixEventCodeStyle: CSSProperties = {
  color: th.accent,
  fontFamily: th.monoFamily,
  fontWeight: 600,
  fontSize: 12,
};

const matrixEventDescStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.4,
};

const matrixCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const matrixNoteStyle: CSSProperties = {
  padding: "10px 14px 14px",
  color: th.textMuted,
  fontSize: 11.5,
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

const numberFormatter = new Intl.NumberFormat("en");

const T5_TIER = CANVAS_REFRESH_TIERS.slow;
const UPDATE_RISK = CANVAS_RISK_LEVELS.medium;

const NOTIFICATION_CHANNELS = ["email", "webhook", "ops_console"] as const;
type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  email: "電子郵件",
  webhook: "回呼",
  ops_console: "營運控制台",
};

const EVENT_DESCRIPTIONS: Record<string, string> = {
  "booking.created": "新訂單建立後立即發出",
  "booking.confirmed": "司機接單後，於抵達取車點前發出",
  "booking.cancelled": "租戶、營運或司機任一方取消訂單時發出",
  "booking.approval_required": "達到簽核規則條件，需主管簽核",
  "booking.approval_approved": "簽核通過後，訂單繼續派遣",
  "booking.approval_rejected": "簽核退回後，訂單需要重新調整",
  "invoice.ready": "月結發票已生成",
  "webhook.delivery_failed": "回呼端點連續失敗 3 次",
  "quota.threshold_warning": "配額使用率 ≥ 80%",
};

const EVENT_ORDER = [
  "booking.created",
  "booking.confirmed",
  "booking.cancelled",
  "booking.approval_required",
  "booking.approval_approved",
  "booking.approval_rejected",
  "invoice.ready",
  "webhook.delivery_failed",
  "quota.threshold_warning",
] as const;

type CrossAppLink = {
  label: string;
  hint: string;
  href: string;
  targetApp: "tenant-console" | "ops-console" | "platform-admin";
  openMode: "new_tab" | "same_tab";
};

const CROSS_APP_LINKS: CrossAppLink[] = [
  {
    label: "整合就緒度",
    hint: "查看整體整合就緒度與基線檢查項目",
    href: "/integration-governance",
    targetApp: "tenant-console",
    openMode: "same_tab",
  },
  {
    label: "回呼端點",
    hint: "建立或檢查回呼端點，讓回呼通道可以啟用",
    href: "/webhooks",
    targetApp: "tenant-console",
    openMode: "same_tab",
  },
  {
    label: "回呼投遞明細",
    hint: "到平台管理後台追查投遞失敗、重試與稽核紀錄",
    href: "/integrations/webhooks",
    targetApp: "platform-admin",
    openMode: "new_tab",
  },
];

const APP_LABELS: Record<CrossAppLink["targetApp"], string> = {
  "tenant-console": "租戶控制台",
  "ops-console": "營運控制台",
  "platform-admin": "平台管理後台",
};

type NotificationsPageData = {
  preferences: TenantNotificationPreferences | null;
  governance: TenantIntegrationGovernancePackage | null;
  webhookEndpoints: TenantWebhookEndpoint[];
  errors: string[];
};

function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function getEmptyReasonTone(reason: CanvasEmptyReason): CanvasTone {
  switch (reason) {
    case "no_data":
      return "neutral";
    case "not_provisioned":
      return "warn";
    case "fetch_failed":
      return "danger";
    case "permission_denied":
      return "danger";
    case "external_unavailable":
      return "warn";
    case "filtered_empty":
      return "info";
    case "driver_not_eligible":
      return "neutral";
  }
}

async function loadNotificationsData(): Promise<NotificationsPageData> {
  const client = getTenantClient();
  const [preferencesResult, governanceResult, webhooksResult] =
    await Promise.allSettled([
      client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
      client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
      client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
    ]);

  const errors: string[] = [];

  if (preferencesResult.status === "rejected") {
    errors.push(
      formatTenantErrorSummary(
        "通知偏好",
        toTenantErrorMessage(preferencesResult.reason, "通知偏好讀取失敗"),
      ),
    );
  }
  if (governanceResult.status === "rejected") {
    errors.push(
      formatTenantErrorSummary(
        "治理基線",
        toTenantErrorMessage(governanceResult.reason, "治理基線讀取失敗"),
      ),
    );
  }
  if (webhooksResult.status === "rejected") {
    errors.push(
      formatTenantErrorSummary(
        "回呼端點",
        toTenantErrorMessage(webhooksResult.reason, "回呼端點讀取失敗"),
      ),
    );
  }

  return {
    preferences:
      preferencesResult.status === "fulfilled" ? preferencesResult.value : null,
    governance:
      governanceResult.status === "fulfilled" ? governanceResult.value : null,
    webhookEndpoints:
      webhooksResult.status === "fulfilled" ? webhooksResult.value : [],
    errors,
  };
}

function buildSubscriptionIndex(
  subscriptions: TenantNotificationSubscription[],
) {
  const index = new Map<string, Map<NotificationChannel, boolean>>();
  for (const subscription of subscriptions) {
    if (
      !(NOTIFICATION_CHANNELS as readonly string[]).includes(
        subscription.channel,
      )
    ) {
      continue;
    }
    if (!index.has(subscription.eventType)) {
      index.set(subscription.eventType, new Map());
    }
    index
      .get(subscription.eventType)
      ?.set(subscription.channel as NotificationChannel, subscription.enabled);
  }
  return index;
}

type MatrixRow = Record<string, unknown> & {
  eventType: string;
  description: string;
  cells: Record<
    NotificationChannel,
    "enabled" | "disabled" | "not_provisioned"
  >;
};

function buildMatrixRows(
  primary: Map<string, Map<NotificationChannel, boolean>>,
  fallback: Map<string, Map<NotificationChannel, boolean>>,
  unavailableChannels: Set<NotificationChannel>,
): MatrixRow[] {
  const eventTypes = new Set<string>(EVENT_ORDER);
  for (const eventType of primary.keys()) eventTypes.add(eventType);
  for (const eventType of fallback.keys()) eventTypes.add(eventType);

  const order = (eventType: string) => {
    const idx = (EVENT_ORDER as readonly string[]).indexOf(eventType);
    return idx === -1 ? EVENT_ORDER.length : idx;
  };

  return Array.from(eventTypes)
    .sort((left, right) => {
      const cmp = order(left) - order(right);
      if (cmp !== 0) return cmp;
      return left.localeCompare(right, "en");
    })
    .map((eventType) => {
      const cells = {} as MatrixRow["cells"];
      for (const channel of NOTIFICATION_CHANNELS) {
        if (unavailableChannels.has(channel)) {
          cells[channel] = "not_provisioned";
          continue;
        }
        const value =
          primary.get(eventType)?.get(channel) ??
          fallback.get(eventType)?.get(channel) ??
          false;
        cells[channel] = value ? "enabled" : "disabled";
      }
      return {
        eventType,
        description: EVENT_DESCRIPTIONS[eventType] ?? "—",
        cells,
      };
    });
}

function formatNotificationEventLabel(eventType: string) {
  if (!hasTenantCodeLabel(eventType)) {
    return "未分類事件";
  }

  return formatTenantCodeLabel(eventType, "未分類事件");
}

const UPDATE_SUBSCRIPTION_ACTION = "update_subscription";

/**
 * Resolve the save CTA descriptor strictly from the backend-provided
 * `availableActions` (Q-X13 / packet §5.8). The UI must never synthesize an
 * enabled write affordance from role or data presence — when the backend does
 * not grant `update_subscription`, the CTA stays disabled with a reason code so
 * the screen cannot expose an unauthorized write path.
 */
function deriveUpdateAction(
  preferences: TenantNotificationPreferences | null,
  hasError: boolean,
): ResourceActionDescriptor {
  if (hasError) {
    return {
      action: UPDATE_SUBSCRIPTION_ACTION,
      enabled: false,
      disabledReasonCode: "fetch_failed",
      riskLevel: "medium",
    };
  }
  if (preferences === null) {
    return {
      action: UPDATE_SUBSCRIPTION_ACTION,
      enabled: false,
      disabledReasonCode: "not_provisioned",
      riskLevel: "medium",
    };
  }
  const granted = preferences.availableActions?.find(
    (descriptor) => descriptor.action === UPDATE_SUBSCRIPTION_ACTION,
  );
  if (!granted) {
    // No descriptor → actor is not authorized to write. Show the affordance
    // disabled rather than hidden, per Q-X13 disabled-with-reason guidance.
    return {
      action: UPDATE_SUBSCRIPTION_ACTION,
      enabled: false,
      disabledReasonCode: "permission_denied",
      riskLevel: "medium",
    };
  }
  return {
    ...granted,
    riskLevel: granted.riskLevel ?? "medium",
  };
}

/**
 * The active empty-state is derived from the page's own load outcome, returning
 * only a fixed set of contract literals ("fetch_failed" | "not_provisioned" |
 * "no_data"). It never casts a raw backend `emptyState.reason` into the tenant
 * enum, so no out-of-set value (e.g. a driver-app `driver_not_eligible`) can
 * reach an unguarded lookup.
 */
function deriveActiveEmptyReason(data: NotificationsPageData): {
  reason: CanvasEmptyReason;
  detail: string;
} | null {
  if (data.errors.length > 0 && data.preferences === null) {
    return {
      reason: "fetch_failed",
      detail: "通知偏好讀取失敗,顯示既有治理基線供參考。",
    };
  }
  if (data.preferences === null && data.governance === null) {
    return {
      reason: "not_provisioned",
      detail: "通知路由尚未為此租戶設定,請先完成基線設定。",
    };
  }
  if (
    data.preferences === null &&
    (data.governance?.baselineNotificationSubscriptions?.length ?? 0) === 0
  ) {
    return {
      reason: "no_data",
      detail: "目前尚未訂閱任何事件，所有通道都維持預設關閉。",
    };
  }
  return null;
}

export default async function NotificationsPage() {
  const data = await loadNotificationsData();
  const subscriptions = data.preferences?.subscriptions ?? [];
  const baselineSubscriptions =
    data.governance?.baselineNotificationSubscriptions ?? [];

  const primaryIndex = buildSubscriptionIndex(subscriptions);
  const baselineIndex = buildSubscriptionIndex(baselineSubscriptions);

  const webhookEndpoints = data.webhookEndpoints;
  const activeWebhookEndpoints = webhookEndpoints.filter(
    (endpoint) => endpoint.status === "active",
  ).length;
  const webhookChannelProvisioned = webhookEndpoints.length > 0;
  const unavailableChannels = new Set<NotificationChannel>();
  if (!webhookChannelProvisioned) {
    unavailableChannels.add("webhook");
  }

  const matrixRows = buildMatrixRows(
    primaryIndex,
    baselineIndex,
    unavailableChannels,
  );

  const enabledCount = matrixRows.reduce(
    (total, row) =>
      total +
      NOTIFICATION_CHANNELS.reduce(
        (cellTotal, channel) =>
          cellTotal + (row.cells[channel] === "enabled" ? 1 : 0),
        0,
      ),
    0,
  );
  const totalCells = matrixRows.length * NOTIFICATION_CHANNELS.length;
  const overridesCount = subscriptions.length;
  const hasCustomConfiguration = overridesCount > 0;

  const updateAction = deriveUpdateAction(
    data.preferences,
    data.errors.length > 0,
  );
  const activeEmptyReason = deriveActiveEmptyReason(data);

  const headerSubtitle = `${T5_TIER.note} · 事件與通道矩陣快照`;

  const channelEnabledByChannel: Record<NotificationChannel, number> = {
    email: 0,
    webhook: 0,
    ops_console: 0,
  };
  for (const row of matrixRows) {
    for (const channel of NOTIFICATION_CHANNELS) {
      if (row.cells[channel] === "enabled") {
        channelEnabledByChannel[channel] += 1;
      }
    }
  }

  const matrixColumns: ServerCanvasTableColumn<MatrixRow>[] = [
    {
      h: "事件類型",
      w: 240,
      r: (row) => (
        <div style={matrixEventCellStyle}>
          <span style={matrixEventCodeStyle}>
            {formatNotificationEventLabel(row.eventType)}
          </span>
          <span style={matrixEventDescStyle}>{row.description}</span>
        </div>
      ),
    },
    ...NOTIFICATION_CHANNELS.map<ServerCanvasTableColumn<MatrixRow>>(
      (channel) => ({
        h: CHANNEL_LABEL[channel],
        w: 160,
        r: (row) => {
          const cell = row.cells[channel];
          if (cell === "not_provisioned") {
            return (
              <CanvasPill theme={th} tone="neutral">
                <CanvasIcon name="x" size={10} />
                尚未開通
              </CanvasPill>
            );
          }
          return (
            <span style={matrixCellStyle}>
              <CanvasToggle
                theme={th}
                on={cell === "enabled"}
                label={cell === "enabled" ? "開" : "關"}
              />
            </span>
          );
        },
      }),
    ),
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="通知偏好"
        subtitle={headerSubtitle}
        actions={
          <>
            <CanvasBtn theme={th} icon="ext" size="sm">
              回呼載荷格式
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="check"
              size="sm"
              disabled={!updateAction.enabled}
            >
              儲存設定
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分通知資料無法載入"
            body={data.errors.join(" · ")}
          />
        ) : null}

        {!webhookChannelProvisioned ? (
          <CanvasBanner
            theme={th}
            tone="info"
            icon="info"
            title="回呼通道尚未設定"
            body="目前沒有任何回呼端點，因此此通道會顯示為尚未開通。前往回呼管理新增端點後即可啟用。"
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="事件"
            value={formatCount(matrixRows.length)}
            sub="事件類型"
          />
          <CanvasKPI
            theme={th}
            label="訂閱數"
            value={`${formatCount(enabledCount)} / ${formatCount(totalCells)}`}
            sub={
              hasCustomConfiguration
                ? `${formatCount(overridesCount)} 項覆寫`
                : "全為治理基線"
            }
          />
          <CanvasKPI
            theme={th}
            label="回呼"
            value={formatCount(activeWebhookEndpoints)}
            sub={
              webhookChannelProvisioned ? "啟用中的端點" : "尚未設定（未開通）"
            }
          />
          <CanvasKPI
            theme={th}
            label="最後更新"
            value={formatUpdated(data.preferences?.updatedAt)}
            sub={hasCustomConfiguration ? "自訂設定" : "全為預設基線"}
          />
        </div>

        <div style={contentGridStyle}>
          <CanvasCard
            theme={th}
            title="事件 × 通道"
            subtitle={`每個事件可獨立選擇是否透過 ${NOTIFICATION_CHANNELS.length} 個通道送出，${UPDATE_RISK.pattern}`}
            padding={0}
            style={matrixCardStyle}
          >
            {matrixRows.length > 0 ? (
              <>
                <ServerCanvasTable<MatrixRow>
                  theme={th}
                  columns={matrixColumns}
                  rows={matrixRows}
                />
                <div style={matrixNoteStyle}>
                  {hasCustomConfiguration
                    ? `已套用 ${formatCount(overridesCount)} 個租戶覆寫，最後更新於 ${formatUpdated(data.preferences?.updatedAt)}`
                    : `尚未覆寫，目前顯示治理基線快照，產生時間為 ${formatUpdated(data.governance?.generatedAt)}`}
                </div>
              </>
            ) : (
              <div style={tableEmptyStateStyle}>目前沒有可顯示的事件路由</div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="狀態概要"
            subtitle="系統會自動判定目前狀態變體"
            style={sideCardStyle}
          >
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                {
                  k: "變體",
                  v: hasCustomConfiguration ? "自訂設定" : "全為預設基線",
                  mono: true,
                },
                {
                  k: "刷新層級",
                  v: `${T5_TIER.label} · ${T5_TIER.note}`,
                  mono: true,
                },
                {
                  k: "矩陣範圍",
                  v: `${formatCount(matrixRows.length)} 種事件 × ${NOTIFICATION_CHANNELS.length} 個通道`,
                  mono: true,
                },
                {
                  k: "風險",
                  v: `${UPDATE_RISK.label}，${UPDATE_RISK.pattern}`,
                  mono: true,
                },
                {
                  k: "操作",
                  v: updateAction.enabled
                    ? "更新通知訂閱"
                    : `已停用（${formatTenantCodeLabel(updateAction.disabledReasonCode ?? "blocked", "已阻擋")}）`,
                  mono: true,
                },
                {
                  k: "電子郵件訂閱",
                  v: `${formatCount(channelEnabledByChannel.email)} / ${formatCount(matrixRows.length)}`,
                  mono: true,
                },
                {
                  k: "回呼訂閱",
                  v: webhookChannelProvisioned
                    ? `${formatCount(channelEnabledByChannel.webhook)} / ${formatCount(matrixRows.length)}`
                    : "尚未開通",
                  mono: true,
                },
                {
                  k: "營運控制台訂閱",
                  v: `${formatCount(channelEnabledByChannel.ops_console)} / ${formatCount(matrixRows.length)}`,
                  mono: true,
                },
              ]}
            />
            {activeEmptyReason ? (
              <div style={{ marginTop: 12 }}>
                <CanvasBanner
                  theme={th}
                  tone={
                    getEmptyReasonTone(activeEmptyReason.reason) === "neutral"
                      ? "info"
                      : (getEmptyReasonTone(
                          activeEmptyReason.reason,
                        ) as Exclude<CanvasTone, "neutral">)
                  }
                  icon={
                    activeEmptyReason.reason === "fetch_failed"
                      ? "warn"
                      : activeEmptyReason.reason === "permission_denied"
                        ? "lock"
                        : "info"
                  }
                  title={`目前狀態: ${CANVAS_EMPTY_REASONS[activeEmptyReason.reason].label}`}
                  body={activeEmptyReason.detail}
                />
              </div>
            ) : null}
          </CanvasCard>
        </div>

        <CanvasCard
          theme={th}
          title="空狀態原因對照"
          subtitle="六種空狀態都會用不同的視覺提示，方便快速辨識目前情境"
        >
          <div style={emptyCatalogStyle}>
            {/*
             * Tenant-console catalog renders 6 EmptyReason states per acceptance.
             * The 7th contract value, `driver_not_eligible`, is a driver-app-only
             * state and is intentionally omitted here. The display map
             * (`CANVAS_EMPTY_REASONS`) is still a complete `Record<EmptyReason,…>`
             * so any reason key resolves safely; nothing casts a runtime value
             * into this list, so there is no out-of-range / crash path.
             */}
            {(
              [
                "no_data",
                "not_provisioned",
                "fetch_failed",
                "permission_denied",
                "external_unavailable",
                "filtered_empty",
              ] as const
            ).map((reason, index) => {
              const meta = CANVAS_EMPTY_REASONS[reason];
              const tone = getEmptyReasonTone(reason);
              const isActive = activeEmptyReason?.reason === reason;
              return (
                <div
                  key={`${reason}-${index}`}
                  style={{
                    ...emptyCardStyle,
                    borderColor: isActive ? th.accent : th.border,
                    boxShadow: isActive ? `0 0 0 1px ${th.accent}` : undefined,
                  }}
                >
                  <div style={emptyHeaderStyle}>
                    <CanvasPill theme={th} tone={tone} dot>
                      {meta.label}
                    </CanvasPill>
                    {isActive ? (
                      <CanvasPill theme={th} tone="accent">
                        目前狀態
                      </CanvasPill>
                    ) : null}
                  </div>
                  <span style={emptyLabelStyle}>{meta.label}</span>
                  <span style={emptyHintStyle}>{meta.hint}</span>
                </div>
              );
            })}
          </div>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="跨應用導向"
          subtitle="通知偏好的相關頁面入口"
        >
          <div style={crossAppListStyle}>
            {CROSS_APP_LINKS.map((link) => (
              <a
                key={`${link.targetApp}:${link.href}`}
                href={link.href}
                style={crossAppItemStyle}
                {...(link.openMode === "new_tab"
                  ? { target: "_blank", rel: "noreferrer noopener" }
                  : {})}
              >
                <CanvasIcon
                  name={link.openMode === "new_tab" ? "ext" : "arrow"}
                  size={13}
                />
                <span style={{ fontWeight: 600 }}>{link.label}</span>
                <CanvasPill theme={th} tone="neutral">
                  {APP_LABELS[link.targetApp]}
                </CanvasPill>
                <span style={{ color: th.textMuted, fontSize: 11.5 }}>
                  {link.hint}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: th.monoFamily,
                    color: th.textMuted,
                    fontSize: 11,
                  }}
                >
                  {link.openMode === "new_tab" ? "新分頁" : "站內"}
                </span>
              </a>
            ))}
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
