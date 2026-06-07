const CODE_LABELS: Record<string, string> = {
  active: "啟用中",
  accepted: "已受理",
  allow: "允許通過",
  approval: "需審批",
  all: "全部",
  all_of_parallel: "全部平行核准",
  any_of: "任一核准",
  approve: "核准",
  approved: "已核准",
  arrived_pickup: "已到上車點",
  assigned: "已指派",
  auto_reject: "自動拒絕",
  bank_card_inline: "銀行卡即時驗證",
  block: "阻擋",
  blocked: "已阻擋",
  booking: "叫車單",
  booking_amount_minor: "訂單金額",
  booking_approval_required: "訂單待審批",
  booking_approval_approved: "訂單審批已通過",
  booking_approval_rejected: "訂單審批已退回",
  booking_cancelled: "訂單已取消",
  booking_confirmed: "訂單已確認",
  booking_created: "訂單已建立",
  booking_business_dispatch_subtype: "派遣子類型",
  booking_direction: "行程方向",
  booking_flight_no_present: "是否有航班號",
  booking_passenger_id: "乘客 ID",
  booking_passenger_role: "乘客角色",
  booking_reservation_window_start: "預約起始時間",
  booking_vehicle_preference: "車型偏好",
  booking_count: "趟次",
  booking_terminal: "訂單已結束，無法再修改",
  boolean: "布林",
  business_dispatch: "商務派遣",
  cancelled_by_re_evaluation: "重新評估後取消",
  cancel: "取消",
  cancel_booking: "取消叫車",
  cancel_window_passed: "已超過可取消時限",
  cancelled: "已取消",
  completed: "已完成",
  cost_center_code: "成本中心代碼",
  cost_center: "成本中心",
  cost_center_monthly_quota_remaining_amount_minor: "成本中心剩餘金額配額",
  cost_center_monthly_quota_remaining_percent: "成本中心剩餘配額百分比",
  cost_center_owner: "成本中心負責人",
  credit_card_airport_transfer: "信用卡機場接送",
  created: "已建立",
  create_booking: "建立叫車",
  create_report_job: "建立報表工作",
  create_rule: "新增規則",
  create_webhook_endpoint: "新增端點",
  create_webhook_endpoint_not_published: "後端尚未發布建立端點操作",
  delete_webhook_endpoint: "刪除端點",
  delivery: "投遞",
  delivery_failed: "投遞失敗",
  degraded: "降級",
  download_artifact: "下載成品",
  draft: "草稿",
  disable_rule: "停用規則",
  disable_webhook_endpoint: "停用端點",
  disable_webhook_endpoint_not_published: "後端尚未發布停用端點操作",
  disabled: "已停用",
  disabled_by_backend: "由後端停用",
  dispatch: "派遣",
  dry_run: "試跑",
  dry_run_evaluate: "試跑評估",
  email: "電子郵件",
  editable_window_passed: "已超過可編輯時限",
  endpoint: "端點",
  enroute: "前往中",
  enroute_pickup: "前往上車點",
  enterprise_dispatch: "企業派遣",
  eq: "等於",
  equals: "等於",
  escalate_to_tenant_admin: "升級給租戶管理員",
  eta: "預估到達時間",
  expired: "已過期",
  fare: "車資",
  fallback: "後備",
  fast: "快速",
  failed: "失敗",
  exists: "存在",
  employee: "員工",
  enabled: "已啟用",
  eligible: "符合資格",
  external_unavailable: "外部依賴不可用",
  false: "否",
  fetch_failed: "載入失敗",
  filtered_empty: "篩選後無結果",
  flag_manual_review: "標記人工審查",
  fresh: "即時",
  global_default: "平台預設",
  greater_than: "大於",
  greater_than_or_equal: "大於等於",
  gt: "大於",
  gte: "大於等於",
  hard_block: "硬性阻擋",
  in: "包含於",
  integration_governance: "整合治理",
  less_than: "小於",
  less_than_or_equal: "小於等於",
  list: "清單",
  lt: "小於",
  lte: "小於等於",
  live: "即時",
  configured: "已設定",
  manual: "手動",
  manual_ops_review: "轉營運人工審查",
  manual_review: "人工審查",
  maintenance_overview: "維運總覽",
  medium: "中速",
  medium_slow: "中慢速",
  monthly_trip_report: "月度用量",
  neq: "不等於",
  no_data: "無資料",
  not_provisioned: "尚未開通",
  not_equals: "不等於",
  not_in: "不包含於",
  not_required: "不需要",
  number: "數字",
  open_billing: "前往帳務概覽",
  open_billing_setup: "前往帳務設定",
  open_detail: "開啟明細",
  open_integration_governance: "前往整合治理",
  open_ops_approval: "前往營運審批",
  open_ops_dispatch: "前往營運派遣",
  open_ops_reporting: "前往營運報表",
  open_platform_audit: "前往平台稽核",
  ordered_chain: "依序核准",
  on_trip: "行程中",
  on_trip_locked: "行程進行中，租戶不可修改",
  ops: "營運",
  ops_console: "營運控制台",
  platform_admin: "平台管理後台",
  tenant_console: "租戶控制台",
  partial: "部分就緒",
  paused: "已暫停",
  paid: "已付款",
  payload_schema: "載荷格式",
  pending: "待處理",
  pending_invite: "待邀請",
  partner_api_key: "合作夥伴 API 金鑰",
  permission_denied: "權限不足",
  preassigned: "預先指派",
  queued: "待派遣",
  ready: "就緒",
  ready_for_dispatch: "待派車",
  reference_required: "參考代碼驗證",
  refresh_report_jobs: "重新整理報表工作",
  refresh_snapshot: "重新整理快照",
  rejected: "已駁回",
  reorder_precedence: "調整優先順序",
  resubmit_approval: "重新送審",
  require_approval: "需審批",
  review_access: "檢查存取權限",
  revenue_summary: "成本中心拆分",
  reset_filters: "清除篩選",
  retry_failed_delivery: "重試失敗投遞",
  rolling_out: "逐步發布中",
  role: "角色",
  rotate_webhook_secret: "輪替密鑰",
  running: "執行中",
  sandbox: "沙箱",
  scheduled: "預約",
  slow: "慢速",
  standard_taxi: "標準計程車",
  stale: "已過新鮮期",
  static: "靜態",
  system: "系統",
  tenant_admin: "租戶管理員",
  tenant: "租戶",
  tenant_finance_admin: "租戶財務管理員",
  tenant_monthly_quota_remaining_amount_minor: "租戶剩餘金額配額",
  tenant_monthly_quota_remaining_percent: "租戶剩餘配額百分比",
  tenant_override: "租戶覆寫",
  tenant_portal_bearer: "租戶入口權杖",
  tenant_role: "租戶角色",
  tenant_user: "租戶使用者",
  text: "文字",
  timeout_escalated: "逾時升級",
  transport_error: "傳輸錯誤",
  trip_summary: "行程摘要",
  true: "是",
  unknown: "未知",
  urgent: "緊急",
  update_booking: "編輯叫車",
  update_rule: "更新規則",
  update_webhook_endpoint: "更新端點",
  user: "使用者",
  view_detail: "檢視詳情",
  view_delivery_log: "投遞紀錄",
  warn: "警示",
  warn_only: "僅警示",
  webhook: "回呼",
  webhook_delivery_failed: "回呼投遞失敗",
  workflow_locked: "流程已鎖定，無法再由租戶修改",
  platform: "平台",
  overdue: "已逾期",
  quota: "配額",
  quota_threshold_warning: "配額門檻警示",
  visitor: "訪客",
  cache: "快取",
  history: "已有歷史紀錄",
  idle: "尚未執行",
  invoice_ready: "發票已就緒",
  ineligible: "不符合資格",
};

function normalizeCode(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[.\s-]+/g, "_")
    .toLowerCase();
}

const ZH_CODE_TOKEN_LABELS: Record<string, string> = {
  action: "動作",
  active: "啟用中",
  admin: "管理員",
  api: "API",
  approval: "審批",
  approve: "核准",
  audit: "稽核",
  billing: "帳務",
  booking: "叫車",
  callback: "回呼",
  cancel: "取消",
  cancelled: "已取消",
  center: "中心",
  code: "代碼",
  completed: "已完成",
  console: "控制台",
  cost: "成本",
  create: "建立",
  delivery: "投遞",
  detail: "明細",
  disabled: "停用",
  dispatch: "派遣",
  driver: "司機",
  endpoint: "端點",
  error: "錯誤",
  failed: "失敗",
  fallback: "後備",
  finance: "財務",
  governance: "治理",
  id: "編號",
  invoice: "發票",
  key: "金鑰",
  list: "清單",
  log: "紀錄",
  manual: "手動",
  monthly: "每月",
  no: "無",
  notification: "通知",
  ops: "營運",
  order: "訂單",
  partner: "合作夥伴",
  payment: "付款",
  pending: "待處理",
  platform: "平台",
  quota: "配額",
  read: "讀取",
  refresh: "重新整理",
  report: "報表",
  request: "請求",
  required: "必填",
  reset: "重設",
  review: "審查",
  rule: "規則",
  slow: "慢速",
  source: "來源",
  status: "狀態",
  sync: "同步",
  system: "系統",
  tenant: "租戶",
  threshold: "門檻",
  unknown: "未知",
  update: "更新",
  user: "使用者",
  view: "檢視",
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

export function hasTenantCodeLabel(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return normalizeCode(value) in CODE_LABELS;
}

export function formatTenantCodeLabel(
  value: string | null | undefined,
  fallback = "—",
  options?: {
    humanizeUnknown?: boolean;
  },
) {
  if (!value) {
    return fallback;
  }

  const normalized = normalizeCode(value);
  if (CODE_LABELS[normalized]) {
    return CODE_LABELS[normalized];
  }

  if (options?.humanizeUnknown === false) {
    return formatUnknownZhCode(value);
  }

  return formatUnknownZhCode(value);
}

export function formatTenantCodeList(
  values: readonly string[] | null | undefined,
) {
  if (!values || values.length === 0) {
    return "—";
  }

  return values.map((value) => formatTenantCodeLabel(value)).join("、");
}
