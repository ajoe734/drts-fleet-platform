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
    defaultAudience: "租戶管理員 / 整合管理員",
  },
  {
    eventType: "booking.confirmed",
    description: "司機接單或訂單轉成可執行狀態後發出。",
    defaultAudience: "派遣人員 / 申請人",
  },
  {
    eventType: "booking.cancelled",
    description: "訂單取消，包含租戶、營運與司機端來源。",
    defaultAudience: "申請人 / 審批人 / 管理員",
  },
  {
    eventType: "booking.approval_required",
    description: "命中審批規則，需要租戶主管簽核。",
    defaultAudience: "審批人 / 租戶管理員",
  },
  {
    eventType: "invoice.ready",
    description: "月結發票產生完成，可供下載與對帳。",
    defaultAudience: "帳務聯絡人 / 租戶管理員",
  },
  {
    eventType: "webhook.delivery_failed",
    description: "某個回呼端點連續失敗，需要追查投遞紀錄。",
    defaultAudience: "整合管理員 / 營運升級對象",
  },
  {
    eventType: "quota.threshold_warning",
    description: "月配額使用量接近上限，需提早調整策略。",
    defaultAudience: "配額擁有者 / 租戶管理員",
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
    body: "此租戶目前沒有任何自訂矩陣，將回退到治理基準設定。",
    tone: "neutral",
  },
  not_provisioned: {
    title: "通道尚未設定完成",
    body: "至少一個通知通道尚未完成建置，頁面會保留該欄位但禁止變更。",
    tone: "info",
    action: {
      action: "configure_webhook",
      enabled: true,
      riskLevel: "low",
      label: "前往回呼",
      href: "/webhooks",
    },
  },
  fetch_failed: {
    title: "通知偏好無法載入",
    body: "後端資料讀取失敗，請稍後重整或改由稽核 / 營運端追查。",
    tone: "danger",
  },
  permission_denied: {
    title: "目前角色僅可檢視",
    body: "你可以查看通知姿態，但沒有更新租戶通知矩陣的權限。",
    tone: "warn",
  },
  external_unavailable: {
    title: "外部通道暫時不可用",
    body: "外部投遞路徑降級中；租戶內通知仍可讀，跨系統路由請改走營運追查。",
    tone: "warn",
  },
  filtered_empty: {
    title: "篩選後沒有結果",
    body: "目前的通知通道或事件篩選沒有符合項目，請清除篩選條件。",
    tone: "neutral",
  },
};
