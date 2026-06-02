import type {
  EmptyReason,
  ResourceActionDescriptor,
  TenantNotificationSubscription,
} from "@drts/contracts";

export const NOTIFICATION_CHANNELS = [
  "email",
  "webhook",
  "ops_console",
] as const satisfies TenantNotificationSubscription["channel"][];

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_EVENT_CATALOG = [
  {
    eventType: "booking.created",
    description: "新訂單建立後立即發出。",
    defaultAudience: "tenant admin / integration manager",
  },
  {
    eventType: "booking.confirmed",
    description: "司機接單或 booking 轉成可執行狀態後發出。",
    defaultAudience: "dispatcher / requester",
  },
  {
    eventType: "booking.cancelled",
    description: "訂單取消，包含 tenant / ops / driver 來源。",
    defaultAudience: "requester / approver / admin",
  },
  {
    eventType: "booking.approval_required",
    description: "命中 approval rule，需要 tenant 主管簽核。",
    defaultAudience: "approver / tenant admin",
  },
  {
    eventType: "invoice.ready",
    description: "月結 invoice 產生完成，可供下載與對帳。",
    defaultAudience: "billing contact / tenant admin",
  },
  {
    eventType: "webhook.delivery_failed",
    description: "某個 webhook endpoint 連續失敗，需要追查 delivery。",
    defaultAudience: "integration manager / ops escalation",
  },
  {
    eventType: "quota.threshold_warning",
    description: "月配額使用量接近上限，需提早調整策略。",
    defaultAudience: "quota owner / tenant admin",
  },
] as const;

export const EMPTY_REASON_COPY: Record<
  Exclude<EmptyReason, "driver_not_eligible">,
  {
    title: string;
    body: string;
    tone: "neutral" | "info" | "warn" | "danger";
    action?: ResourceActionDescriptor & { label: string; href?: string };
  }
> = {
  no_data: {
    title: "尚無通知偏好資料",
    body: "此租戶目前沒有任何自訂矩陣，將回退到 governance baseline。",
    tone: "neutral",
  },
  not_provisioned: {
    title: "通道尚未設定完成",
    body: "至少一個通知通道未 provision，頁面會保留該欄位但禁止變更。",
    tone: "info",
    action: {
      action: "configure_webhook",
      enabled: true,
      riskLevel: "low",
      label: "前往 Webhook",
      href: "/webhooks",
    },
  },
  fetch_failed: {
    title: "通知偏好無法載入",
    body: "API 讀取失敗，請稍後重整或改由稽核 / 營運端追查。",
    tone: "danger",
  },
  permission_denied: {
    title: "目前角色僅可檢視",
    body: "你可以查看通知姿態，但沒有更新租戶通知矩陣的權限。",
    tone: "warn",
  },
  external_unavailable: {
    title: "外部通道暫時不可用",
    body: "外部 delivery 路徑降級中；租戶內通知仍可讀，跨系統路由請改走營運追查。",
    tone: "warn",
  },
  filtered_empty: {
    title: "篩選後沒有結果",
    body: "目前的 channel / event 篩選沒有符合項目，請清除篩選條件。",
    tone: "neutral",
  },
};
