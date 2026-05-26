import type { CSSProperties } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantNotificationSubscription,
  TenantWebhookEndpoint,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

type NotificationChannel = TenantNotificationSubscription["channel"];

const CHANNELS: readonly NotificationChannel[] = [
  "email",
  "webhook",
  "ops_console",
];

const CHANNEL_LABEL_ZH: Record<NotificationChannel, string> = {
  email: "Email",
  webhook: "Webhook",
  ops_console: "Console",
};

type MatrixEvent = {
  eventType: string;
  category: "booking" | "billing" | "integration" | "quota";
  description: string;
};

const MATRIX_EVENTS: readonly MatrixEvent[] = [
  {
    eventType: "booking.created",
    category: "booking",
    description: "新訂單建立後立即發出",
  },
  {
    eventType: "booking.confirmed",
    category: "booking",
    description: "司機接單並抵達取車點之前",
  },
  {
    eventType: "booking.cancelled",
    category: "booking",
    description: "訂單取消 (含 tenant / ops / driver 取消)",
  },
  {
    eventType: "booking.approval_required",
    category: "booking",
    description: "達到 approval rule 條件，需 tenant 主管簽核",
  },
  {
    eventType: "invoice.ready",
    category: "billing",
    description: "月結 invoice 完成",
  },
  {
    eventType: "webhook.delivery_failed",
    category: "integration",
    description: "某個 webhook endpoint 連續失敗 3 次",
  },
  {
    eventType: "quota.threshold_warning",
    category: "quota",
    description: "配額用量 > 80%",
  },
];

const REFRESH_TIER: RefreshTier = "slow";
const REFRESH_CADENCE_MS = 30_000;

const UPDATE_SUBSCRIPTION_ACTION: ResourceActionDescriptor = {
  action: "update_subscription",
  enabled: true,
  riskLevel: "medium",
};

const CROSS_APP_LINKS: readonly CrossAppResourceLink[] = [
  {
    targetApp: "tenant-console",
    route: "/integration-governance",
    resourceType: "tenant_integration_governance",
    resourceId: "tenant",
    openMode: "same_tab",
    label: "整合就緒度",
  },
  {
    targetApp: "tenant-console",
    route: "/webhooks",
    resourceType: "tenant_webhook_endpoint",
    resourceId: "tenant",
    openMode: "same_tab",
    label: "Webhook",
  },
  {
    targetApp: "tenant-console",
    route: "/api-keys",
    resourceType: "tenant_api_key",
    resourceId: "tenant",
    openMode: "same_tab",
    label: "API 金鑰",
  },
];

type EmptyVariant = {
  reason: EmptyReason;
  title: string;
  body: string;
  tone: CanvasTone;
  icon: "warn" | "ok" | "ext" | "filter" | "x" | "search";
  callout: string;
  active: boolean;
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const matrixGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
};

const matrixCardStyle: CSSProperties = {
  flex: "2 1 720px",
  minWidth: 0,
};

const linksCardStyle: CSSProperties = {
  flex: "1 1 280px",
  minWidth: 0,
};

const refreshGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
};

const refreshCardStyle: CSSProperties = {
  flex: "1 1 360px",
  minWidth: 0,
};

const emptyGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const emptyTileBaseStyle: CSSProperties = {
  background: th.surfaceLo,
  border: `1px solid ${th.border}`,
  borderRadius: 8,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 130,
};

const emptyTileTitleStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: th.text,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const emptyTileBodyStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
  lineHeight: 1.45,
};

const emptyTileFootStyle: CSSProperties = {
  marginTop: "auto",
  fontSize: 10.5,
  color: th.textDim,
  fontFamily: th.monoFamily,
};

const linksStackStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const eventCellTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const eventCellCodeStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
  fontSize: 12,
};

const eventCellDescStyle: CSSProperties = {
  fontSize: 11,
  color: th.textMuted,
  whiteSpace: "normal",
  lineHeight: 1.4,
};

const matrixFooterStyle: CSSProperties = {
  padding: "10px 14px 14px",
  fontSize: 11,
  color: th.textDim,
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function getCategoryTone(category: MatrixEvent["category"]): CanvasTone {
  if (category === "booking") return "info";
  if (category === "billing") return "accent";
  if (category === "integration") return "warn";
  return "success";
}

function getCategoryLabel(category: MatrixEvent["category"]) {
  if (category === "booking") return "booking";
  if (category === "billing") return "billing";
  if (category === "integration") return "integration";
  return "quota";
}

type SubscriptionKey = `${string}::${NotificationChannel}`;

function subscriptionKey(
  eventType: string,
  channel: NotificationChannel,
): SubscriptionKey {
  return `${eventType}::${channel}`;
}

function buildSubscriptionIndex(
  subscriptions: readonly TenantNotificationSubscription[],
) {
  const index = new Map<SubscriptionKey, TenantNotificationSubscription>();
  for (const subscription of subscriptions) {
    index.set(
      subscriptionKey(subscription.eventType, subscription.channel),
      subscription,
    );
  }
  return index;
}

function sameSubscriptionShape(
  left: readonly TenantNotificationSubscription[],
  right: readonly TenantNotificationSubscription[],
) {
  if (left.length !== right.length) return false;
  const leftIndex = buildSubscriptionIndex(left);
  for (const subscription of right) {
    const counterpart = leftIndex.get(
      subscriptionKey(subscription.eventType, subscription.channel),
    );
    if (!counterpart || counterpart.enabled !== subscription.enabled) {
      return false;
    }
  }
  return true;
}

function isChannelProvisioned(
  channel: NotificationChannel,
  webhooks: readonly TenantWebhookEndpoint[],
) {
  if (channel !== "webhook") return true;
  return webhooks.some((endpoint) => endpoint.status === "active");
}

type NotificationsPageData = {
  preferences: TenantNotificationPreferences | null;
  baseline: readonly TenantNotificationSubscription[];
  governanceUpdatedAt: string | null;
  webhooks: readonly TenantWebhookEndpoint[];
  errors: string[];
  rejected: {
    preferences: boolean;
    governance: boolean;
    webhooks: boolean;
  };
};

async function loadNotificationsPageData(): Promise<NotificationsPageData> {
  const client = getTenantClient();
  const [preferencesResult, governanceResult, webhooksResult] =
    await Promise.allSettled([
      client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
      client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
      client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
    ]);

  const errors: string[] = [];
  if (preferencesResult.status === "rejected") {
    errors.push(`通知訂閱: ${toErrorMessage(preferencesResult.reason)}`);
  }
  if (governanceResult.status === "rejected") {
    errors.push(`整合治理: ${toErrorMessage(governanceResult.reason)}`);
  }
  if (webhooksResult.status === "rejected") {
    errors.push(`Webhook 端點: ${toErrorMessage(webhooksResult.reason)}`);
  }

  return {
    preferences:
      preferencesResult.status === "fulfilled" ? preferencesResult.value : null,
    baseline:
      governanceResult.status === "fulfilled"
        ? governanceResult.value.baselineNotificationSubscriptions
        : [],
    governanceUpdatedAt:
      governanceResult.status === "fulfilled"
        ? governanceResult.value.generatedAt
        : null,
    webhooks: webhooksResult.status === "fulfilled" ? webhooksResult.value : [],
    errors,
    rejected: {
      preferences: preferencesResult.status === "rejected",
      governance: governanceResult.status === "rejected",
      webhooks: webhooksResult.status === "rejected",
    },
  };
}

type MatrixRow = Record<string, unknown> & {
  eventType: string;
  category: MatrixEvent["category"];
  description: string;
  cells: Record<NotificationChannel, MatrixCell>;
};

type MatrixCell =
  | { kind: "enabled" }
  | { kind: "disabled" }
  | { kind: "not_provisioned"; reason: string };

function buildMatrixRows(
  subscriptions: readonly TenantNotificationSubscription[],
  webhooks: readonly TenantWebhookEndpoint[],
): MatrixRow[] {
  const index = buildSubscriptionIndex(subscriptions);

  return MATRIX_EVENTS.map((event) => {
    const cells: Record<NotificationChannel, MatrixCell> = {
      email: { kind: "disabled" },
      webhook: { kind: "disabled" },
      ops_console: { kind: "disabled" },
    };

    for (const channel of CHANNELS) {
      if (!isChannelProvisioned(channel, webhooks)) {
        cells[channel] = {
          kind: "not_provisioned",
          reason:
            channel === "webhook"
              ? "未設定 active webhook endpoint"
              : "通道未啟用",
        };
        continue;
      }

      const subscription = index.get(subscriptionKey(event.eventType, channel));
      cells[channel] = subscription?.enabled
        ? { kind: "enabled" }
        : { kind: "disabled" };
    }

    return {
      eventType: event.eventType,
      category: event.category,
      description: event.description,
      cells,
    };
  });
}

function buildEmptyVariants(data: NotificationsPageData): EmptyVariant[] {
  const subscriptionsLoaded = !data.rejected.preferences;
  const webhookEngineLive =
    !data.rejected.webhooks &&
    data.webhooks.some((endpoint) => endpoint.status === "active");
  const subscriptionCount = data.preferences?.subscriptions.length ?? 0;
  const noBaseline = data.rejected.governance || data.baseline.length === 0;
  const filteredEmpty = MATRIX_EVENTS.length === 0;

  return [
    {
      reason: "no_data",
      title: "尚未訂閱任何事件",
      body: "後端回傳的 subscriptions[] 為空陣列；以治理基線渲染並提示新增訂閱。",
      tone: "info",
      icon: "warn",
      callout: 'reason="no_data"',
      active: subscriptionsLoaded && subscriptionCount === 0,
    },
    {
      reason: "not_provisioned",
      title: "通道尚未配置",
      body: "Webhook 通道尚未配置 active endpoint，矩陣以 lock pill 取代 toggle，禁止啟用。",
      tone: "warn",
      icon: "x",
      callout: 'reason="not_provisioned"',
      active: !webhookEngineLive,
    },
    {
      reason: "fetch_failed",
      title: "讀取失敗",
      body: "通知訂閱讀取請求被拒絕。錯誤訊息顯示於 banner，矩陣不嘗試自動覆寫。",
      tone: "danger",
      icon: "warn",
      callout: 'reason="fetch_failed"',
      active: data.rejected.preferences,
    },
    {
      reason: "permission_denied",
      title: "權限不足",
      body: "actor 不具 tc_admin / tc_integration_mgr 角色時隱藏儲存 CTA，並顯示原因卡片。",
      tone: "warn",
      icon: "x",
      callout: 'reason="permission_denied"',
      active: false,
    },
    {
      reason: "external_unavailable",
      title: "依賴外部資料失效",
      body: "整合治理基線無法載入，矩陣保留現有訂閱但停用 CTA。",
      tone: "warn",
      icon: "ext",
      callout: 'reason="external_unavailable"',
      active: noBaseline,
    },
    {
      reason: "filtered_empty",
      title: "篩選後為空",
      body: "事件分類過濾後沒有匹配項，提示清除篩選；非後端缺資料。",
      tone: "neutral",
      icon: "filter",
      callout: 'reason="filtered_empty"',
      active: filteredEmpty,
    },
  ];
}

function renderCell(cell: MatrixCell) {
  if (cell.kind === "not_provisioned") {
    return (
      <CanvasPill theme={th} tone="neutral" dot>
        not_provisioned
      </CanvasPill>
    );
  }

  if (cell.kind === "enabled") {
    return (
      <CanvasPill theme={th} tone="success" dot>
        啟用
      </CanvasPill>
    );
  }

  return (
    <CanvasPill theme={th} tone="neutral">
      停用
    </CanvasPill>
  );
}

function buildRefreshMeta(
  data: NotificationsPageData,
  generatedAt: string,
): UiRefreshMetadata {
  const dataFreshness: UiRefreshMetadata["dataFreshness"] = data.rejected
    .preferences
    ? "degraded"
    : "fresh";
  return {
    generatedAt,
    staleAfterMs: REFRESH_CADENCE_MS,
    dataFreshness,
    source: data.rejected.preferences ? "cache" : "live",
  };
}

export default async function NotificationsPage() {
  const data = await loadNotificationsPageData();

  const effectiveSubscriptions =
    data.preferences?.subscriptions ?? data.baseline;
  const rows = buildMatrixRows(effectiveSubscriptions, data.webhooks);
  const emptyVariants = buildEmptyVariants(data);
  const generatedAt =
    data.preferences?.updatedAt ??
    data.governanceUpdatedAt ??
    new Date().toISOString();
  const refreshMeta = buildRefreshMeta(data, generatedAt);

  const baselineMatch = sameSubscriptionShape(
    effectiveSubscriptions,
    data.baseline,
  );
  const variantBanner =
    data.preferences == null
      ? {
          tone: "warn" as const,
          title: "尚未取得租戶訂閱",
          body: "矩陣以整合治理基線為預覽，避免空白頁面。儲存設定後將改用租戶覆寫。",
        }
      : baselineMatch
        ? {
            tone: "info" as const,
            title: "目前使用預設訂閱",
            body: "尚未覆寫治理基線。任何儲存動作將建立租戶特有覆寫，並進入稽核紀錄。",
          }
        : {
            tone: "success" as const,
            title: "已啟用自訂訂閱",
            body: "本租戶的訂閱已覆寫治理基線。可隨時調整或還原為基線。",
          };

  const matrixColumns: CanvasTableColumn<MatrixRow>[] = [
    {
      h: "EVENT",
      w: 240,
      r: (row) => (
        <div>
          <div style={eventCellTopStyle}>
            <span style={eventCellCodeStyle}>{row.eventType}</span>
            <CanvasPill theme={th} tone={getCategoryTone(row.category)}>
              {getCategoryLabel(row.category)}
            </CanvasPill>
          </div>
        </div>
      ),
    },
    {
      h: "WHEN",
      w: 280,
      r: (row) => <span style={eventCellDescStyle}>{row.description}</span>,
    },
    ...CHANNELS.map<CanvasTableColumn<MatrixRow>>((channel) => ({
      h: CHANNEL_LABEL_ZH[channel].toUpperCase(),
      w: 140,
      align: "center" as const,
      r: (row: MatrixRow) => renderCell(row.cells[channel]),
    })),
  ];

  const saveActionEnabled =
    UPDATE_SUBSCRIPTION_ACTION.enabled &&
    !data.rejected.preferences &&
    !data.rejected.governance;

  const matrixFooter =
    data.preferences == null
      ? `治理基線 ${formatUpdated(data.governanceUpdatedAt)} · 尚未覆寫`
      : baselineMatch
        ? `預設訂閱基線 · 治理時間 ${formatUpdated(data.governanceUpdatedAt)}`
        : `租戶覆寫 · 最後儲存 ${formatUpdated(data.preferences.updatedAt)}`;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="通知偏好"
        subtitle="事件 × 通道訂閱矩陣 · spec §9.6.6 · NEW per Q-TEN02 · refresh tier T5 slow"
        tabs={["矩陣", "通道狀態", "稽核"]}
        activeTab="矩陣"
        actions={
          <CanvasBtn
            theme={th}
            variant="primary"
            icon="check"
            size="sm"
            disabled={!saveActionEnabled}
          >
            儲存設定
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分通知設定資料無法載入"
            body={data.errors.join(" · ")}
          />
        ) : null}

        <CanvasBanner
          theme={th}
          tone={variantBanner.tone}
          icon="warn"
          title={variantBanner.title}
          body={variantBanner.body}
        />

        <div style={matrixGridStyle}>
          <CanvasCard
            theme={th}
            title="事件 × 通道矩陣"
            subtitle="決定哪些 event 經由哪些 channel 送出"
            padding={0}
            style={matrixCardStyle}
            actions={
              <CanvasPill
                theme={th}
                tone={
                  UPDATE_SUBSCRIPTION_ACTION.riskLevel === "medium"
                    ? "warn"
                    : UPDATE_SUBSCRIPTION_ACTION.riskLevel === "high"
                      ? "danger"
                      : "info"
                }
              >
                {`action=${UPDATE_SUBSCRIPTION_ACTION.action} · ${UPDATE_SUBSCRIPTION_ACTION.riskLevel}`}
              </CanvasPill>
            }
          >
            <CanvasTable<MatrixRow>
              theme={th}
              columns={matrixColumns}
              rows={rows}
              dense={false}
            />
            <div style={matrixFooterStyle}>{matrixFooter}</div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="跨應用導覽"
            subtitle="Q-X03 deep links"
            style={linksCardStyle}
          >
            <div style={linksStackStyle}>
              {CROSS_APP_LINKS.map((link) => (
                <CanvasBtn
                  key={link.route}
                  theme={th}
                  icon="ext"
                  size="sm"
                  variant="secondary"
                  style={{ flex: "1 1 auto" }}
                >
                  {link.label}
                </CanvasBtn>
              ))}
            </div>
            <div style={{ height: 12 }} />
            <CanvasDL
              theme={th}
              cols={1}
              items={CROSS_APP_LINKS.map((link) => ({
                k: link.label,
                v: `${link.targetApp} · ${link.route}`,
                mono: true,
              }))}
            />
          </CanvasCard>
        </div>

        <div style={refreshGridStyle}>
          <CanvasCard
            theme={th}
            title="重新整理節奏"
            subtitle="UiRefreshMetadata · Q-X01 / Q-X02"
            style={refreshCardStyle}
          >
            <CanvasDL
              theme={th}
              cols={2}
              items={[
                {
                  k: "refreshTier",
                  v: REFRESH_TIER,
                  mono: true,
                },
                {
                  k: "staleAfter",
                  v: `${Math.round(refreshMeta.staleAfterMs / 1000)}s`,
                  mono: true,
                },
                {
                  k: "source",
                  v: refreshMeta.source,
                  mono: true,
                },
                {
                  k: "dataFreshness",
                  v: refreshMeta.dataFreshness,
                  mono: true,
                },
                {
                  k: "generatedAt",
                  v: formatUpdated(refreshMeta.generatedAt),
                  mono: true,
                },
                {
                  k: "actor roles",
                  v: "tc_admin · tc_integration_mgr",
                  mono: true,
                },
              ]}
            />
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="可用動作 · availableActions"
            subtitle="Q-X13 ResourceActionDescriptor"
            style={refreshCardStyle}
          >
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                {
                  k: "action",
                  v: UPDATE_SUBSCRIPTION_ACTION.action,
                  mono: true,
                },
                {
                  k: "riskLevel",
                  v: UPDATE_SUBSCRIPTION_ACTION.riskLevel,
                  mono: true,
                },
                {
                  k: "enabled",
                  v: saveActionEnabled ? "true" : "false",
                  mono: true,
                },
                {
                  k: "requiresReason",
                  v: UPDATE_SUBSCRIPTION_ACTION.requiresReason
                    ? "true"
                    : "false",
                  mono: true,
                },
                {
                  k: "endpoint",
                  v: "POST /api/tenant/notifications",
                  mono: true,
                },
              ]}
            />
          </CanvasCard>
        </div>

        <CanvasCard
          theme={th}
          title="狀態變體 · EmptyReason"
          subtitle="Q-X15 · 6 tenant-console reasons 對應的視覺處理"
        >
          <div style={emptyGridStyle}>
            {emptyVariants.map((variant) => (
              <div
                key={variant.reason}
                style={{
                  ...emptyTileBaseStyle,
                  borderColor: variant.active ? th.accent : th.border,
                  boxShadow: variant.active
                    ? `inset 0 0 0 1px ${th.accent}`
                    : "none",
                }}
              >
                <div style={emptyTileTitleStyle}>
                  <CanvasPill theme={th} tone={variant.tone} dot>
                    {variant.reason}
                  </CanvasPill>
                  <span>{variant.title}</span>
                </div>
                <div style={emptyTileBodyStyle}>{variant.body}</div>
                <div style={emptyTileFootStyle}>
                  {variant.callout}
                  {variant.active ? " · ACTIVE" : ""}
                </div>
              </div>
            ))}
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
