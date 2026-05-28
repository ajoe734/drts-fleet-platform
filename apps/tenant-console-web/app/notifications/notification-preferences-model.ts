import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantNotificationSubscription,
  UiRefreshMetadata,
} from "@drts/contracts";

export const NOTIFICATION_CHANNELS = [
  "email",
  "webhook",
  "ops_console",
] as const satisfies readonly TenantNotificationSubscription["channel"][];

export const NOTIFICATION_EMPTY_REASONS = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const satisfies readonly EmptyReason[];

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_EVENTS = [
  {
    eventType: "booking.created",
    description: "新訂單建立後立即發出",
    defaultAudience: "booking owner, requester",
  },
  {
    eventType: "booking.confirmed",
    description: "司機接單並抵達取車點之前",
    defaultAudience: "dispatcher shadow, requester",
  },
  {
    eventType: "booking.cancelled",
    description: "訂單取消，含 tenant / ops / driver 取消",
    defaultAudience: "requester, finance contact",
  },
  {
    eventType: "booking.approval_required",
    description: "達到 approval rule 條件，需 tenant 主管簽核",
    defaultAudience: "approver, booking requester",
  },
  {
    eventType: "invoice.ready",
    description: "月結 invoice 完成，可進入帳務核對",
    defaultAudience: "billing contact",
  },
  {
    eventType: "webhook.delivery_failed",
    description: "某個 webhook endpoint 連續失敗 3 次",
    defaultAudience: "integration owner, ops monitor",
  },
  {
    eventType: "quota.threshold_warning",
    description: "配額用量 > 80%",
    defaultAudience: "tenant admin, finance owner",
  },
];

export const EMPTY_REASON_META: Record<
  EmptyReason,
  {
    title: string;
    body: string;
    tone: "neutral" | "info" | "warn" | "danger";
  }
> = {
  no_data: {
    title: "尚無資料",
    body: "Tenant 尚未自訂任何通知偏好，頁面會先顯示 baseline defaults。",
    tone: "neutral",
  },
  not_provisioned: {
    title: "尚未佈建",
    body: "至少一個 channel 尚未完成佈建，例如 webhook endpoint 尚未建立。",
    tone: "warn",
  },
  fetch_failed: {
    title: "讀取失敗",
    body: "偏好設定快照無法讀取，請稍後重試並檢查 API health。",
    tone: "danger",
  },
  permission_denied: {
    title: "權限不足",
    body: "目前角色可檢視矩陣，但不可更新通知訂閱設定。",
    tone: "danger",
  },
  external_unavailable: {
    title: "外部依賴不可用",
    body: "外部 channel 或跨系統依賴不可用時，僅顯示降級說明與深連結。",
    tone: "warn",
  },
  filtered_empty: {
    title: "篩選後無結果",
    body: "目前篩選條件未命中任何事件或 channel，請重設篩選。",
    tone: "info",
  },
  driver_not_eligible: {
    title: "不適用於本頁",
    body: "此 empty reason 為 driver-only；tenant page 不會實際採用。",
    tone: "neutral",
  },
};

export type NotificationMatrixRow = {
  eventType: string;
  description: string;
  defaultAudience: string;
  channels: Record<NotificationChannel, boolean>;
};

export type ChannelAvailability = Record<
  NotificationChannel,
  {
    ready: boolean;
    label: string;
    detail: string;
  }
>;

export type NotificationPageActionSource = {
  availableActions?: ResourceActionDescriptor[];
};

export function getNotificationAction(
  canUpdate: boolean,
): ResourceActionDescriptor {
  return {
    action: "update_subscription",
    enabled: canUpdate,
    disabledReasonCode: canUpdate ? undefined : "permission_denied",
    riskLevel: "medium",
  };
}

export function resolveNotificationAction(
  source: NotificationPageActionSource | null | undefined,
  canUpdateFallback: boolean,
) {
  const embedded = source?.availableActions?.find(
    (action) => action.action === "update_subscription",
  );

  return embedded ?? getNotificationAction(canUpdateFallback);
}

export function createRefreshMetadata(
  generatedAt: string,
  freshness: UiRefreshMetadata["dataFreshness"],
): UiRefreshMetadata {
  return {
    generatedAt,
    staleAfterMs: 30_000,
    dataFreshness: freshness,
    source: freshness === "degraded" ? "cache" : "live",
  };
}

export function getNotificationFieldName(
  eventType: string,
  channel: NotificationChannel,
) {
  return `sub__${eventType}__${channel}`;
}

export function buildMatrixRows(
  subscriptions: TenantNotificationSubscription[],
): NotificationMatrixRow[] {
  const byKey = new Map(
    subscriptions.map((subscription) => [
      `${subscription.eventType}:${subscription.channel}`,
      subscription.enabled,
    ]),
  );

  return NOTIFICATION_EVENTS.map((event) => ({
    eventType: event.eventType,
    description: event.description,
    defaultAudience: event.defaultAudience,
    channels: {
      email: byKey.get(`${event.eventType}:email`) ?? false,
      webhook: byKey.get(`${event.eventType}:webhook`) ?? false,
      ops_console: byKey.get(`${event.eventType}:ops_console`) ?? false,
    },
  }));
}

export function flattenRows(
  rows: NotificationMatrixRow[],
): TenantNotificationSubscription[] {
  return rows.flatMap((row) =>
    NOTIFICATION_CHANNELS.map((channel) => ({
      eventType: row.eventType,
      channel,
      enabled: row.channels[channel],
    })),
  );
}

export function countCustomSubscriptions(
  current: TenantNotificationSubscription[],
  baseline: TenantNotificationSubscription[],
) {
  const baselineMap = new Map(
    baseline.map((subscription) => [
      `${subscription.eventType}:${subscription.channel}`,
      subscription.enabled,
    ]),
  );

  return current.filter(
    (subscription) =>
      baselineMap.get(`${subscription.eventType}:${subscription.channel}`) !==
      subscription.enabled,
  ).length;
}

export function deriveEmptyReason({
  requestedReason,
  hasFetchError,
  action,
  hasWebhookChannel,
  hasFilteredRows,
  usesBaselineDefaults,
}: {
  requestedReason?: EmptyReason | null;
  hasFetchError: boolean;
  action: ResourceActionDescriptor;
  hasWebhookChannel: boolean;
  hasFilteredRows: boolean;
  usesBaselineDefaults: boolean;
}): EmptyReason | null {
  if (requestedReason) return requestedReason;
  if (hasFetchError) return "fetch_failed";
  if (!action.enabled) return "permission_denied";
  if (!hasFilteredRows) return "filtered_empty";
  if (!hasWebhookChannel) return "not_provisioned";
  if (usesBaselineDefaults) return "no_data";
  return null;
}

export function buildNotificationLinks(tenantId: string): Array<
  CrossAppResourceLink & {
    href: string;
    description: string;
  }
> {
  const opsConsoleOrigin =
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
  const platformAdminOrigin =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";

  return [
    {
      targetApp: "tenant-console",
      route: "/webhooks",
      resourceType: "tenant_webhook",
      resourceId: tenantId,
      openMode: "same_tab",
      label: "Webhook channel setup",
      href: "/webhooks",
      description: "Webhook channel 未佈建時，先到本 app 建立 endpoint。",
    },
    {
      targetApp: "ops-console",
      route: `/audit?tenantId=${tenantId}&eventType=webhook.delivery_failed`,
      resourceType: "tenant_notification_event",
      resourceId: "webhook.delivery_failed",
      openMode: "new_tab",
      label: "Ops delivery investigation",
      href: `${opsConsoleOrigin}/audit?tenantId=${tenantId}&eventType=webhook.delivery_failed`,
      description: "跨 app 追 webhook 失敗與下游處理狀態。",
    },
    {
      targetApp: "platform-admin",
      route: `/audit?tenantId=${tenantId}&resourceType=tenant_notifications`,
      resourceType: "tenant_notifications",
      resourceId: tenantId,
      openMode: "new_tab",
      label: "Platform audit trace",
      href: `${platformAdminOrigin}/audit?tenantId=${tenantId}&resourceType=tenant_notifications`,
      description: "若通知策略受平台維運或公告影響，改走 platform audit 追溯。",
    },
  ];
}
