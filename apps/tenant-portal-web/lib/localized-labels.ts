const CODE_LABELS: Record<string, string> = {
  active: "啟用中",
  accepted: "已受理",
  billing: "帳務",
  booking_created: "訂單已建立",
  inactive: "停用中",
  invited: "已邀請",
  suspended: "已停權",
  tenant_admin: "租戶管理員",
  tenant_ops_admin: "租戶營運管理員",
  tenant_finance_admin: "租戶財務管理員",
  tenant_viewer: "租戶檢視者",
  tenant_user: "租戶使用者",
  operator: "營運人員",
  viewer: "檢視者",
  session: "工作階段",
  bootstrap_session: "啟動工作階段",
  api_key: "整合金鑰",
  partner_api_key: "合作夥伴整合金鑰",
  email: "電子郵件",
  webhook: "回呼",
  ops_console: "營運控制台",
  platform_admin: "平台管理後台",
  tenant_console: "租戶控制台",
  tenant: "租戶",
  partner: "合作夥伴",
  platform_pricing_rule: "平台定價規則",
  audit_read: "稽核讀取",
  reports_read: "報表讀取",
  reports_write: "報表寫入",
  tenant_read: "租戶資料讀取",
  tenant_write: "租戶資料寫入",
  tenant_billing_read: "帳務讀取",
  tenant_billing_write: "帳務寫入",
  tenant_sla_read: "服務時限讀取",
  tenant_sla_write: "服務時限寫入",
  tenant_webhooks_read: "回呼讀取",
  tenant_webhooks_write: "回呼寫入",
  tenant_portal_admin: "租戶入口管理",
  tenant_portal_billing: "租戶入口帳務",
  tenant_portal_booking: "租戶入口訂單",
  tenant_portal_reports: "租戶入口報表",
  tenant_portal_webhooks: "租戶入口回呼",
  immediate: "立即生效",
  booking_confirmed: "訂單已確認",
  booking_cancelled: "訂單已取消",
  booking_updated: "訂單已更新",
  sla_breach: "服務時限逾期",
  sla_warning: "服務時限警示",
  driver_assigned: "已指派司機",
  dispatch_assigned: "已指派派車",
  trip_completed: "行程已完成",
  invoice_generated: "發票已產生",
  invoice_issued: "發票已開立",
  payment_received: "已收到付款",
  created: "已建立",
  delivered: "已送達",
  disabled: "已停用",
  dispatch_recording_index: "派遣錄音索引",
  driver_app_earnings: "司機應用程式收入",
  driver_app_incidents: "司機應用程式事件",
  driver_app_shift: "司機應用程式出勤",
  driver_app_tasks: "司機應用程式任務",
  expired: "已過期",
  failed: "失敗",
  in_app: "站內通知",
  ops_console_callcenter: "營運控制台客服",
  ops_console_complaint: "營運控制台客訴",
  ops_console_dispatch: "營運控制台派遣",
  ops_console_reports: "營運控制台報表",
  pending: "待處理",
  phase1_read_models: "第一階段讀模型",
  phase1_smoke_paths: "第一階段冒煙路徑",
  processing: "處理中",
  push: "推播",
  queued: "佇列中",
  read: "已讀",
  recording_pending: "錄音待補",
  ready_for_dispatch: "待派車",
  preassigned: "預先指派",
  assigned: "已指派",
  driver_accepted: "司機已接受",
  enroute_pickup: "前往上車點",
  arrived_pickup: "已到上車點",
  on_trip: "行程中",
  proof_pending: "憑證待補",
  completed: "已完成",
  cancelled: "已取消",
  redispatch_required: "需要重新派遣",
  dispatch_failed: "派遣失敗",
  dispatch_timeout: "派遣逾時",
  no_supply: "無可派車源",
  delayed_queue: "延後排隊",
  exception_hold: "例外保留",
  reports: "報表",
  revenue_summary: "營收摘要",
  sent: "已送出",
  sms: "簡訊",
  success: "成功",
  test_pending: "待驗證",
  unread: "未讀",
  webhooks: "回呼",
};

const FLAG_DESCRIPTION_LABELS: Record<string, string> = {
  tenant_portal_booking: "啟用租戶入口的訂單管理功能。",
  tenant_portal_billing: "啟用租戶入口的帳務與發票檢視。",
  tenant_portal_reports: "啟用租戶入口的報表工作建立與查閱。",
  tenant_portal_webhooks: "啟用租戶入口的回呼端點管理。",
  ops_console_dispatch: "啟用營運控制台的派遣看板。",
  ops_console_complaint: "啟用營運控制台的客訴案件管理。",
  ops_console_callcenter: "啟用營運控制台的客服工作階段檢視。",
  ops_console_reports: "啟用營運控制台的報表工作管理。",
  driver_app_tasks: "啟用司機應用程式的任務流程。",
  driver_app_earnings: "啟用司機應用程式的收入讀模型。",
  driver_app_incidents: "啟用司機應用程式的事件回報。",
  driver_app_shift: "啟用司機應用程式的出勤追蹤。",
  phase1_read_models: "啟用第一階段讀模型介面。",
  phase1_smoke_paths: "啟用第一階段冒煙測試端點。",
};

const CHECKLIST_LABELS: Record<string, string> = {
  "Confirm the tenant integration owner and rollback owner before issuing production credentials.":
    "在簽發正式環境憑證前，先確認租戶整合負責人與回滾負責人。",
  "Issue a scoped sandbox API key with an explicit expiry within the rotation window.":
    "先簽發具有限定權限且明確設定到期時間的沙箱整合金鑰，並納入輪替時程。",
  "Configure the tenant webhook endpoint and verify the initial secret preview with the consumer owner.":
    "設定租戶回呼端點後，需與接收端負責人共同確認初始密鑰預覽值。",
  "Run a tenant.webhook.test delivery and wait for the endpoint to return to active status before cutover.":
    "切換正式流量前，先執行租戶回呼測試事件的投遞，並確認端點已回到啟用中。",
  "Review delivery logs and authority notification feed for repeated failures or auto-disable events.":
    "檢查投遞紀錄與權限通知摘要，確認沒有重複失敗或自動停用事件。",
  "Record the planned rotation date and the revocation procedure in the tenant cutover packet.":
    "將預計輪替日期與撤銷程序記錄在租戶切換交接文件中。",
};

function normalizeCode(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[:.\s-]+/g, "_")
    .toLowerCase();
}

const ZH_CODE_TOKEN_LABELS: Record<string, string> = {
  active: "啟用中",
  admin: "管理員",
  api: "API",
  app: "應用程式",
  audit: "稽核",
  billing: "帳務",
  booking: "訂單",
  callback: "回呼",
  cancelled: "已取消",
  channel: "通道",
  completed: "已完成",
  console: "控制台",
  created: "已建立",
  delivery: "投遞",
  disabled: "已停用",
  dispatch: "派遣",
  driver: "司機",
  endpoint: "端點",
  failed: "失敗",
  finance: "財務",
  generated: "已產生",
  id: "編號",
  integration: "整合",
  invoice: "發票",
  key: "金鑰",
  notification: "通知",
  ops: "營運",
  order: "訂單",
  partner: "合作夥伴",
  payment: "付款",
  pending: "待處理",
  platform: "平台",
  portal: "入口",
  read: "讀取",
  recording: "錄音",
  report: "報表",
  reports: "報表",
  status: "狀態",
  tenant: "租戶",
  trip: "行程",
  unknown: "未知",
  updated: "已更新",
  user: "使用者",
  viewer: "檢視者",
  webhook: "回呼",
  write: "寫入",
};

function formatUnknownZhCode(value: string) {
  const tokens = normalizeCode(value).split("_").filter(Boolean);
  if (tokens.length === 0) {
    return "未知";
  }

  return tokens
    .map((token) => {
      const translated = ZH_CODE_TOKEN_LABELS[token];
      if (translated) {
        return translated;
      }
      if (/^\d+$/.test(token)) {
        return token;
      }
      if (/^[a-z]{1,4}$/.test(token)) {
        return token.toUpperCase();
      }
      return "未定義";
    })
    .join("");
}

export function formatPortalCodeLabel(
  value: string | null | undefined,
  fallback = "—",
) {
  if (!value) {
    return fallback;
  }

  const normalized = normalizeCode(value);
  if (CODE_LABELS[normalized]) {
    return CODE_LABELS[normalized];
  }

  return formatUnknownZhCode(value);
}

export function formatPortalFlagDescription(
  key: string | null | undefined,
  fallback: string | null | undefined,
) {
  if (key) {
    const normalized = normalizeCode(key);
    if (FLAG_DESCRIPTION_LABELS[normalized]) {
      return FLAG_DESCRIPTION_LABELS[normalized];
    }
  }

  if (fallback && /[\u4e00-\u9fff]/u.test(fallback)) {
    return fallback;
  }

  return formatPortalCodeLabel(key, fallback ?? "—");
}

export function formatPortalChecklistItem(
  value: string | null | undefined,
  fallback = "—",
) {
  if (!value) {
    return fallback;
  }

  return CHECKLIST_LABELS[value] ?? formatPortalCodeLabel(value, value);
}
