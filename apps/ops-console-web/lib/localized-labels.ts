import type { Locale } from "./translations";

type LocalizedText = {
  en: string;
  zh: string;
};

const UI_LABELS: Record<string, LocalizedText> = {
  error: { en: "Error", zh: "錯誤" },
  switchLanguage: { en: "Switch language", zh: "切換語言" },
  unknown: { en: "Unknown", zh: "未知" },
  dispatchEtaUnavailable: {
    en: "ETA not available",
    zh: "暫無預估到達時間",
  },
  dispatchLastUpdated: {
    en: "Last updated: {value}",
    zh: "最後更新：{value}",
  },
  order: { en: "Order", zh: "訂單" },
  vehicle: { en: "Vehicle", zh: "車輛" },
  complaint: { en: "Complaint", zh: "客訴" },
  dispatchSource: { en: "Source: {value}", zh: "來源：{value}" },
  dispatchId: { en: "ID: {value}", zh: "編號：{value}" },
  dispatchStatus: { en: "Status: {value}", zh: "狀態：{value}" },
  incidentsPriorityQueue: { en: "Priority queue", zh: "優先處理佇列" },
  incidentsCriticalQueue: {
    en: "Critical / SOS queue",
    zh: "重大 / 緊急求助佇列",
  },
  incidentsActiveCritical: {
    en: "{count} active critical incident(s)",
    zh: "{count} 筆重大事故處理中",
  },
  incidentsReviewTimeline: { en: "Review timeline", zh: "檢視時間軸" },
  incidentsAllClear: {
    en: "No critical incidents. All clear for now.",
    zh: "目前沒有重大事故，現況正常。",
  },
  incidentsLoading: { en: "Loading incidents...", zh: "載入事故中..." },
  incidentsNoLinkedEntities: { en: "No linked entities", zh: "沒有關聯項目" },
  incidentsSelectHint: {
    en: "Choose an incident row to inspect timeline and audit flow.",
    zh: "請選擇一筆事故，檢視其時間軸與稽核流程。",
  },
  reportsPeriodExample: { en: "2026-04 or 2026-H1", zh: "2026-04 或 2026-H1" },
  reportsClosedMonthExample: { en: "2026-03", zh: "2026-03" },
  reportsRequestedByExample: { en: "ops-console", zh: "營運後台" },
  driverRegistryUnavailableSubtitle: {
    en: "Unable to load driver registry data for {driverId}.",
    zh: "無法載入司機名冊資料：{driverId}。",
  },
  openDriverDetail: {
    en: "Open detail for driver {driverId}",
    zh: "開啟司機 {driverId} 的明細",
  },
};

const CODE_LABELS: Record<string, LocalizedText> = {
  available: { en: "Available", zh: "可派遣" },
  eligible: { en: "Eligible", zh: "符合資格" },
  ineligible: { en: "Ineligible", zh: "不符合資格" },
  online: { en: "Online", zh: "上線" },
  lifecycle_draft: { en: "Lifecycle: Draft", zh: "生命週期：草稿" },
  lifecycle_suspended: { en: "Lifecycle: Suspended", zh: "生命週期：停用" },
  lifecycle_retired: { en: "Lifecycle: Retired", zh: "生命週期：退場" },
  licenses_invalid: { en: "Licenses Invalid", zh: "駕照失效" },
  work_state_reserved: { en: "Work State: Reserved", zh: "工作狀態：已預約" },
  work_state_enroute: { en: "Work State: En Route", zh: "工作狀態：前往中" },
  work_state_arrived: { en: "Work State: Arrived", zh: "工作狀態：已到達" },
  work_state_on_trip: { en: "Work State: On Trip", zh: "工作狀態：行程中" },
  work_state_paused: { en: "Work State: Paused", zh: "工作狀態：暫停" },
  work_state_suspended: { en: "Work State: Suspended", zh: "工作狀態：停用" },
  work_state_incident_hold: {
    en: "Work State: Incident Hold",
    zh: "工作狀態：事故暫停",
  },
  work_state_offline: { en: "Work State: Offline", zh: "工作狀態：離線" },
  active: { en: "Active", zh: "啟用中" },
  accept_pending: { en: "Awaiting Platform Accept", zh: "等待平台接受" },
  accessible_taxi: { en: "Accessible Taxi", zh: "無障礙計程車" },
  api: { en: "API", zh: "API" },
  absent: { en: "Absent", zh: "缺勤" },
  approved: { en: "Approved", zh: "已核准" },
  app: { en: "App", zh: "應用程式" },
  airport_transfer: { en: "Airport Transfer", zh: "機場接送" },
  any_of: { en: "Any Of", zh: "任一核准" },
  arrived: { en: "Arrived", zh: "已到達" },
  assigned: { en: "Assigned", zh: "已指派" },
  arrived_pickup: { en: "Arrived at Pickup", zh: "已到接送點" },
  auth: { en: "Auth", zh: "驗證" },
  authenticated: { en: "Authenticated", zh: "已驗證" },
  booking: { en: "Booking", zh: "訂車" },
  brake_service: { en: "Brake Service", zh: "煞車保養" },
  broadcasted: { en: "Broadcasted", zh: "已廣播" },
  broadcasting: { en: "Broadcasting", zh: "廣播中" },
  callback: { en: "Callback", zh: "回撥" },
  cache: { en: "Cache", zh: "快取" },
  cancelled: { en: "Cancelled", zh: "已取消" },
  cancelled_by_platform: {
    en: "Cancelled by Platform",
    zh: "平台已取消",
  },
  closed: { en: "Closed", zh: "已關閉" },
  clear: { en: "Clear", zh: "正常" },
  complaint: { en: "Complaint", zh: "客訴" },
  complaint_case_detail: { en: "Complaint Case Detail", zh: "客訴案件明細" },
  completed: { en: "Completed", zh: "已完成" },
  completed_synced: { en: "Completion Synced", zh: "完成已同步" },
  concierge: { en: "Concierge", zh: "禮賓" },
  confirmed_by_platform: {
    en: "Confirmed by Platform",
    zh: "平台已確認",
  },
  contract_roster: { en: "Contract Roster", zh: "合約名冊" },
  cooldown: { en: "Cooldown", zh: "冷卻中" },
  credential: { en: "Credential", zh: "憑證" },
  created: { en: "Created", zh: "已建立" },
  bank_card_inline: {
    en: "Inline Bank Card Check",
    zh: "即時銀行卡資格驗證",
  },
  bank_partner: { en: "Bank Partner", zh: "銀行合作夥伴" },
  business_dispatch: { en: "Business Dispatch", zh: "商務派車" },
  credit_card_airport_transfer: {
    en: "Credit Card Airport Transfer",
    zh: "信用卡機場接送",
  },
  critical: { en: "Critical", zh: "重大" },
  degraded: { en: "Degraded", zh: "降級" },
  disabled: { en: "Disabled", zh: "已停用" },
  dispatch_failed: { en: "Dispatch Failed", zh: "派車失敗" },
  dispatch_matching: { en: "Dispatch Matching", zh: "派遣媒合中" },
  dispatch_assigned: { en: "Dispatch Assigned", zh: "派遣已指派" },
  dispatch_reassigned: { en: "Dispatch Reassigned", zh: "派遣已重新指派" },
  dispatch_recording_index: { en: "Dispatch Trace", zh: "派車追蹤" },
  dispatch_surface_degraded: {
    en: "Dispatch Surface Degraded",
    zh: "派遣頁面降級",
  },
  driver_accepted: { en: "Driver Accepted", zh: "司機已接單" },
  driver_arrived_pickup: {
    en: "Driver Arrived at Pickup",
    zh: "司機已到接送點",
  },
  driver_completed_trip: {
    en: "Driver Completed Trip",
    zh: "司機已完成行程",
  },
  driver_departed_pickup: {
    en: "Driver Departed to Pickup",
    zh: "司機前往接送點",
  },
  driver_proof_pending: {
    en: "Driver Proof Pending",
    zh: "司機待補證明",
  },
  driver_rejected: { en: "Driver Rejected", zh: "司機拒單" },
  driver_started_trip: { en: "Driver Started Trip", zh: "司機已開始行程" },
  driver_injury: { en: "Driver Injury", zh: "司機受傷" },
  driver_roster: { en: "Driver Roster", zh: "司機名冊" },
  driver_service: { en: "Driver Service", zh: "司機服務" },
  enterprise_dispatch: { en: "Enterprise Dispatch", zh: "企業派遣" },
  enterprise_partner: { en: "Enterprise Partner", zh: "企業合作夥伴" },
  enroute: { en: "En Route", zh: "前往中" },
  enroute_pickup: { en: "En Route to Pickup", zh: "前往接送點" },
  exception_hold: { en: "Exception Hold", zh: "異常暫停" },
  exception_hold_confirmation_window_expired: {
    en: "Confirmation Window Expired",
    zh: "確認視窗已到期",
  },
  exception_hold_driver_rejected_in_window: {
    en: "Driver Rejected In Window",
    zh: "確認視窗內司機拒單",
  },
  exception_hold_manual_escalation: {
    en: "Manual Escalation",
    zh: "人工升級",
  },
  exception_hold_no_eligible_supply: {
    en: "No Eligible Supply",
    zh: "無可用供給",
  },
  expired: { en: "Expired", zh: "已過期" },
  escalate_to_incident: { en: "Escalate To Incident", zh: "升級為事故" },
  export_view: { en: "Export View", zh: "匯出目前檢視" },
  external_platform: { en: "External Platform", zh: "外部平台" },
  failed: { en: "Failed", zh: "失敗" },
  failing: { en: "Failing", zh: "異常" },
  fare_dispute: { en: "Fare Dispute", zh: "車資爭議" },
  fare_version_history: { en: "Fare Version History", zh: "票價版本歷史" },
  filing: { en: "Filing", zh: "申報" },
  fleet_company_partner: { en: "Fleet Company Partner", zh: "車隊合作夥伴" },
  forwarded_shadow: { en: "Forwarded Shadow Order", zh: "轉派鏡像訂單" },
  fresh: { en: "Fresh", zh: "最新" },
  forwarder_broadcast: { en: "Forwarder Broadcast", zh: "轉派廣播" },
  forwarder_terminal_state: {
    en: "Forwarder Terminal State",
    zh: "轉派終態同步",
  },
  general_inquiry: { en: "General Inquiry", zh: "一般諮詢" },
  grab_taiwan: { en: "Grab Taiwan", zh: "Grab Taiwan" },
  high: { en: "High", zh: "高" },
  healthy: { en: "Healthy", zh: "健康" },
  hybrid: { en: "Hybrid", zh: "混合" },
  immutable: { en: "Immutable", zh: "不可變" },
  in_progress: { en: "In Progress", zh: "進行中" },
  incident_assigned: { en: "Incident Assigned", zh: "事故已指派" },
  incident_closed: { en: "Incident Closed", zh: "事故已關閉" },
  incident_created: { en: "Incident Created", zh: "事故已建立" },
  incident_hold: { en: "Incident Hold", zh: "事故暫停" },
  incident_register: { en: "Incident Register", zh: "事故名冊" },
  incident_resolved: { en: "Incident Resolved", zh: "事故已解決" },
  escalation_target_set: { en: "Escalation Target Set", zh: "升級對象已設定" },
  severity_escalated: { en: "Severity Escalated", zh: "嚴重程度已升級" },
  dispatch_exception_handoff: {
    en: "Dispatch Exception Handoff",
    zh: "派遣異常移交",
  },
  service_recovery_action: {
    en: "Service Recovery Action",
    zh: "服務恢復行動",
  },
  complaint_linked: { en: "Complaint Linked", zh: "客訴已連結" },
  inspection: { en: "Inspection", zh: "檢查" },
  insurance_roster: { en: "Insurance Roster", zh: "保險名冊" },
  invalid: { en: "Invalid", zh: "無效" },
  investigating: { en: "Investigating", zh: "調查中" },
  late_arrival: { en: "Late Arrival", zh: "延遲到達" },
  live: { en: "Live", zh: "即時" },
  lost_and_found: { en: "Lost and Found", zh: "失物招領" },
  lost_race: { en: "Lost Race", zh: "已失去競單" },
  low: { en: "Low", zh: "低" },
  limited: { en: "Limited", zh: "受限" },
  "line-taxi": { en: "LINE Taxi", zh: "LINE Taxi" },
  line_taxi: { en: "LINE Taxi", zh: "LINE Taxi" },
  maintenance_overview: { en: "Maintenance Overview", zh: "保養總覽" },
  matching: { en: "Matching", zh: "媒合中" },
  medium: { en: "Medium", zh: "中" },
  monthly_report: { en: "Monthly Report", zh: "月報" },
  monthly_trip_report: { en: "Monthly Trip Report", zh: "月度行程報表" },
  missing: { en: "Missing", zh: "缺漏" },
  manual_hold: { en: "Manual Hold", zh: "人工停派" },
  manual_fallback: { en: "Manual Fallback", zh: "人工備援" },
  manual_review_queue: { en: "Manual Review Queue", zh: "人工審查佇列" },
  mismatch: { en: "Mismatch", zh: "不一致" },
  missing_request: { en: "Request ID Required", zh: "請求編號為必填" },
  missing_request_or_reason: {
    en: "Request ID And Reason Required",
    zh: "請求編號與原因皆為必填",
  },
  mutable: { en: "Mutable", zh: "可變" },
  new: { en: "New", zh: "新建" },
  none: { en: "None", zh: "無" },
  no_data: { en: "No Data", zh: "無資料" },
  filtered_empty: { en: "Filtered Empty", zh: "篩選後無結果" },
  fetch_failed: { en: "Fetch Failed", zh: "載入失敗" },
  permission_denied: { en: "Permission Denied", zh: "權限不足" },
  external_unavailable: {
    en: "External Dependency Unavailable",
    zh: "外部依賴不可用",
  },
  not_provisioned: { en: "Not Provisioned", zh: "尚未開通" },
  driver_not_eligible: {
    en: "Driver Not Eligible",
    zh: "司機不符合資格",
  },
  no_arrival: { en: "No Arrival", zh: "未到場" },
  normal: { en: "Normal", zh: "一般" },
  not_applicable: { en: "Not Applicable", zh: "不適用" },
  not_configured: { en: "Not Configured", zh: "未設定" },
  offline: { en: "Offline", zh: "離線" },
  ok: { en: "OK", zh: "正常" },
  oil_change: { en: "Oil Change", zh: "換油" },
  on_trip: { en: "On Trip", zh: "行程中" },
  open: { en: "Open", zh: "開啟" },
  override_pending: { en: "Override Pending", zh: "等待覆核" },
  order_cancelled: { en: "Order Cancelled", zh: "訂單已取消" },
  order_exception_hold: { en: "Order Exception Hold", zh: "訂單進入異常暫停" },
  escalated_to_incident: { en: "Escalated to Incident", zh: "已升級為事故" },
  incident_linked: { en: "Incident Linked", zh: "已連結事故" },
  operational: { en: "Operational", zh: "營運" },
  ops: { en: "Ops", zh: "營運" },
  ops_approval_triage: { en: "Ops Approval Triage", zh: "營運審批分流" },
  ops_compliance: { en: "Ops Compliance", zh: "營運法遵" },
  ops_manager: { en: "Ops Manager", zh: "營運主管" },
  ops_user: { en: "Ops User", zh: "營運人員" },
  other: { en: "Other", zh: "其他" },
  ordered_chain: { en: "Ordered Chain", zh: "依序核准" },
  overdue: { en: "Overdue", zh: "逾期" },
  paid: { en: "Paid", zh: "已付款" },
  partial: { en: "Partial", zh: "部分出勤" },
  passenger_injury: { en: "Passenger Injury", zh: "乘客受傷" },
  paused: { en: "Paused", zh: "暫停" },
  pending: { en: "Pending", zh: "待處理" },
  pending_review: { en: "Pending Review", zh: "待審核" },
  phone: { en: "Phone", zh: "電話" },
  phone_dispatch: { en: "Phone Dispatch", zh: "電話叫車" },
  partner_airport: {
    en: "Partner Airport Transfer",
    zh: "合作方機場接送",
  },
  partner_api_key: { en: "Partner API Key", zh: "合作夥伴 API 金鑰" },
  portal: { en: "Portal", zh: "入口網站" },
  platform: { en: "Platform", zh: "平台" },
  preassigned: { en: "Preassigned", zh: "預先指派" },
  present: { en: "Present", zh: "出勤" },
  priority: { en: "Priority", zh: "優先" },
  production_ready: { en: "Production Ready", zh: "可投入生產" },
  proof_pending: { en: "Proof Pending", zh: "待補證明" },
  property_damage: { en: "Property Damage", zh: "財物損壞" },
  queued: { en: "Queued", zh: "排隊中" },
  queue: { en: "Queue", zh: "排隊" },
  queue_entry_created: { en: "Queue Entry Created", zh: "佇列項目已建立" },
  reference_required: { en: "Reference Required", zh: "需參照驗證" },
  received: { en: "Received", zh: "已接收" },
  ready_for_dispatch: { en: "Ready for Dispatch", zh: "待派車" },
  rate_limit: { en: "Rate Limit", zh: "速率限制" },
  realtime: { en: "Realtime", zh: "即時" },
  reauth_required: { en: "Reauth Required", zh: "需重新驗證" },
  recall: { en: "Recall", zh: "召回" },
  recording_pending: { en: "Recording Pending", zh: "待附錄音" },
  recording_gate_queue: { en: "Recording Gate Queue", zh: "錄音門檻佇列" },
  recording_missing_for_dispatch: {
    en: "Recording Missing For Dispatch",
    zh: "派遣前缺少錄音",
  },
  rejected: { en: "Rejected", zh: "已駁回" },
  redispatch_required: { en: "Redispatch Required", zh: "需重新派車" },
  redispatch_priority_queue: {
    en: "Redispatch Priority Queue",
    zh: "重派優先佇列",
  },
  redispatch_retry_required: {
    en: "Redispatch Retry Required",
    zh: "需重派重試",
  },
  dispatch_timeout: { en: "Dispatch Timeout", zh: "派車逾時" },
  no_supply: { en: "No Supply", zh: "無可用車輛" },
  delayed_queue: { en: "Delayed Queue", zh: "延遲佇列" },
  delayed_retry_queue: { en: "Delayed Retry Queue", zh: "延遲重試佇列" },
  down: { en: "Down", zh: "停擺" },
  timed_out: { en: "Timed Out", zh: "已逾時" },
  dispatch_timeout_retry: {
    en: "Dispatch Timeout Retry",
    zh: "派車逾時重試",
  },
  no_supply_delayed_retry: {
    en: "No Supply — Delayed Retry",
    zh: "無供給—延遲重試",
  },
  dispatch_no_supply_delayed: {
    en: "Dispatch No Supply Delayed",
    zh: "派遣無供給，轉入延遲重試",
  },
  dispatch_no_supply_escalated: {
    en: "Dispatch No Supply Escalated",
    zh: "派遣無供給，已升級處理",
  },
  dispatch_no_supply_resolved: {
    en: "Dispatch No Supply Resolved",
    zh: "無供給事件已處理",
  },
  no_supply_escalated_to_ops: {
    en: "No Supply — Escalated to Ops",
    zh: "無供給—已升級至營運",
  },
  operator_redispatch: { en: "Operator Redispatch", zh: "營運人員重派" },
  no_supply_available: { en: "No Supply Available", zh: "無可用供給" },
  vehicle_became_unavailable: {
    en: "Vehicle Became Unavailable",
    zh: "車輛變為不可用",
  },
  customer_request: { en: "Customer Request", zh: "客戶要求" },
  system_redispatch: { en: "System Redispatch", zh: "系統自動重派" },
  standard_taxi: { en: "Standard Taxi", zh: "標準計程車" },
  sedan: { en: "Sedan", zh: "轎車" },
  taichung_port: { en: "Taichung Port", zh: "台中港營運區" },
  taxi: { en: "Taxi", zh: "計程車" },
  tenant_enterprise: { en: "Tenant Enterprise", zh: "企業租戶" },
  operator_reassign: { en: "Operator Reassign", zh: "營運人員重新指派" },
  wheelchair_taxi: { en: "Wheelchair Taxi", zh: "輪椅計程車" },
  driver_unavailable: { en: "Driver Unavailable", zh: "司機不可用" },
  vehicle_swap: { en: "Vehicle Swap", zh: "換車" },
  load_balancing: { en: "Load Balancing", zh: "負載平衡" },
  acceptance_timeout: { en: "Acceptance Timeout", zh: "接單逾時" },
  matching_timeout: { en: "Matching Timeout", zh: "媒合逾時" },
  reopened: { en: "Reopened", zh: "重新開啟" },
  repair: { en: "Repair", zh: "維修" },
  reservation: { en: "Reservation", zh: "預約" },
  reservation_confirmation_queue: {
    en: "Reservation Confirmation Queue",
    zh: "預約確認佇列",
  },
  reservation_confirmation_window_open: {
    en: "Confirmation Window Open",
    zh: "確認視窗已開啟",
  },
  reservation_hold_created: {
    en: "Reservation Hold Created",
    zh: "預約保留已建立",
  },
  reservation_hold_released: {
    en: "Reservation Hold Released",
    zh: "預約保留已解除",
  },
  reconciliation: { en: "Reconciliation", zh: "對帳同步" },
  reserved: { en: "Reserved", zh: "已預約" },
  resolved: { en: "Resolved", zh: "已解決" },
  revenue_summary: { en: "Revenue Summary", zh: "收益摘要" },
  route_issue: { en: "Route Issue", zh: "路線問題" },
  running: { en: "Running", zh: "執行中" },
  realtime_ready_queue: {
    en: "Realtime Ready Queue",
    zh: "即時待派佇列",
  },
  realtime_ready_for_dispatch: {
    en: "Ready For Realtime Dispatch",
    zh: "即時單待派車",
  },
  safety: { en: "Safety", zh: "安全" },
  safety_concern: { en: "Safety Concern", zh: "安全疑慮" },
  sandbox: { en: "Sandbox", zh: "沙箱" },
  scheduled: { en: "Scheduled", zh: "已排程" },
  scheduled_service: { en: "Scheduled Service", zh: "定期保養" },
  six_month_statistics: { en: "Six-Month Statistics", zh: "半年統計" },
  stub: { en: "Stub", zh: "替身" },
  stale: { en: "Stale", zh: "資料過舊" },
  static: { en: "Static", zh: "靜態" },
  suspended: { en: "Suspended", zh: "停用" },
  system: { en: "System", zh: "系統" },
  tenant: { en: "Tenant", zh: "租戶" },
  tenant_admin: { en: "Tenant Admin", zh: "租戶管理員" },
  terminated: { en: "Terminated", zh: "已終止" },
  timeout_escalated: { en: "Timeout Escalated", zh: "逾時升級" },
  tire_replacement: { en: "Tire Replacement", zh: "輪胎更換" },
  traffic: { en: "Traffic", zh: "交通" },
  trip_summary: { en: "Trip Summary", zh: "行程摘要" },
  under_investigation: { en: "Under Investigation", zh: "調查中" },
  unavailable: { en: "Unavailable", zh: "不可用" },
  unknown: { en: "Unknown", zh: "未知" },
  unknown_error: { en: "Unknown Error", zh: "未知錯誤" },
  valid: { en: "Valid", zh: "有效" },
  vehicle_condition: { en: "Vehicle Condition", zh: "車況" },
  vehicle_damage: { en: "Vehicle Damage", zh: "車輛損壞" },
  vehicle_monthly_delta: { en: "Vehicle Monthly Delta", zh: "車輛月度變動" },
  vehicle_roster: { en: "Vehicle Roster", zh: "車輛名冊" },
  uber: { en: "Uber", zh: "Uber" },
  weather: { en: "Weather", zh: "天候" },
  web: { en: "Web", zh: "網站" },
  webhook: { en: "Webhook", zh: "回呼" },
  booking_updated: { en: "Booking Updated", zh: "訂單已更新" },
  resolved_with_apology: { en: "Resolved — Apology", zh: "已解決——致歉" },
  resolved_with_refund: { en: "Resolved — Refund", zh: "已解決——退款" },
  resolved_with_credit: { en: "Resolved — Credit", zh: "已解決——補償額度" },
  resolved_with_corrective_action: {
    en: "Resolved — Corrective Action",
    zh: "已解決——矯正措施",
  },
  resolved_driver_warning: {
    en: "Resolved — Driver Warning",
    zh: "已解決——司機警告",
  },
  resolved_driver_suspension: {
    en: "Resolved — Driver Suspension",
    zh: "已解決——司機停權",
  },
  resolved_no_fault: { en: "Resolved — No Fault", zh: "已解決——無過失" },
  resolved_duplicate: { en: "Resolved — Duplicate", zh: "已解決——重複案件" },
  resolved_withdrawn: { en: "Resolved — Withdrawn", zh: "已解決——撤回" },
  resolved_item_returned: {
    en: "Resolved — Item Returned",
    zh: "已解決——物品歸還",
  },
  resolved_item_not_found: {
    en: "Resolved — Item Not Found",
    zh: "已解決——物品未尋獲",
  },
  resolved_other: { en: "Resolved — Other", zh: "已解決——其他" },
  sla_recalculated: { en: "SLA Recalculated", zh: "SLA 重算" },
  case_created: { en: "Case Created", zh: "案件建立" },
  case_assigned: { en: "Case Assigned", zh: "案件指派" },
  case_note_added: { en: "Note Added", zh: "新增備註" },
  case_reopened: { en: "Case Reopened", zh: "案件重開" },
  sla_breached: { en: "SLA Breached", zh: "SLA 逾期" },
  case_resolved: { en: "Case Resolved", zh: "案件已解決" },
  case_closed: { en: "Case Closed", zh: "案件已結案" },
  revoked: { en: "Revoked", zh: "已撤銷" },
  dispatch_manual_review_required: {
    en: "Dispatch Manual Review Required",
    zh: "派遣前需人工審查",
  },
  contract_missing: { en: "No Active Contract", zh: "無有效合約" },
  contract_draft: { en: "Contract Draft", zh: "合約草稿中" },
  contract_expired: { en: "Contract Expired", zh: "合約已過期" },
  contract_terminated: { en: "Contract Terminated", zh: "合約已終止" },
  insurance_missing: { en: "No Policy", zh: "無保單" },
  insurance_pending: { en: "Policy Pending", zh: "保單待生效" },
  insurance_expired: { en: "Policy Expired", zh: "保單已過期" },
  insurance_cancelled: { en: "Policy Cancelled", zh: "保單已取消" },
  exclusivity_missing: { en: "No Exclusivity File", zh: "無排他聲明" },
  exclusivity_pending_review: {
    en: "Exclusivity Pending Review",
    zh: "排他審核中",
  },
  exclusivity_expired: { en: "Exclusivity Expired", zh: "排他已過期" },
  exclusivity_revoked: { en: "Exclusivity Revoked", zh: "排他已撤銷" },
  exclusivity_rejected: { en: "Exclusivity Rejected", zh: "排他遭退回" },
  offboarding_pending_debranding: {
    en: "Debranding Required",
    zh: "待完成除標識",
  },
  debranding_required: { en: "Debranding Required", zh: "待完成除標識" },
  not_required: { en: "Not Required", zh: "不需要" },
};

function formatTemplate(
  template: string,
  params?: Record<string, string | number>,
) {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key) =>
    String(params[key as keyof typeof params] ?? `{${key}}`),
  );
}

function humanizeCode(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const ZH_CODE_TOKEN_LABELS: Record<string, string> = {
  accept: "受理",
  action: "動作",
  actor: "操作者",
  active: "啟用中",
  adapter: "介接器",
  admin: "管理員",
  api: "API",
  approval: "審批",
  approve: "核准",
  arrived: "已到達",
  audit: "稽核",
  booking: "訂單",
  call: "通話",
  callback: "回撥",
  cancel: "取消",
  cancelled: "已取消",
  center: "中心",
  close: "關閉",
  closed: "已關閉",
  complaint: "客訴",
  completed: "已完成",
  config: "設定",
  console: "控制台",
  contract: "合約",
  create: "建立",
  credential: "憑證",
  critical: "重大",
  data: "資料",
  delayed: "延遲",
  detail: "明細",
  disabled: "停用",
  dispatch: "派遣",
  driver: "司機",
  endpoint: "端點",
  enroute: "前往中",
  error: "錯誤",
  exception: "例外",
  export: "匯出",
  external: "外部",
  failed: "失敗",
  fallback: "備援",
  fare: "車資",
  filing: "申報",
  fleet: "車隊",
  forwarder: "轉派",
  governance: "治理",
  health: "健康",
  hold: "暫停",
  id: "編號",
  incident: "事故",
  ingress: "入口",
  invoice: "發票",
  issue: "問題",
  job: "工作",
  key: "金鑰",
  lifecycle: "生命週期",
  list: "清單",
  log: "紀錄",
  maintenance: "保修",
  manual: "人工",
  matching: "媒合",
  mode: "模式",
  native: "原生",
  no: "無",
  notification: "通知",
  ops: "營運",
  order: "訂單",
  partner: "合作夥伴",
  payment: "付款",
  pending: "待處理",
  platform: "平台",
  proof: "憑證",
  queue: "佇列",
  read: "讀取",
  ready: "待命",
  reassigned: "重新指派",
  recording: "錄音",
  reconciliation: "對帳",
  redispatch: "重新派遣",
  registry: "名冊",
  rejected: "已拒絕",
  report: "報表",
  request: "請求",
  required: "需要",
  resolved: "已解決",
  retry: "重試",
  review: "審查",
  route: "路線",
  safety: "安全",
  service: "服務",
  session: "工作階段",
  source: "來源",
  status: "狀態",
  sync: "同步",
  system: "系統",
  task: "任務",
  tenant: "租戶",
  timeout: "逾時",
  trip: "行程",
  unavailable: "不可用",
  unknown: "未知",
  update: "更新",
  vehicle: "車輛",
  view: "檢視",
  webhook: "回呼",
  work: "工作",
};

function normalizeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.\s-]+/g, "_");
}

function formatUnknownZhCode(value: string) {
  const tokens = normalizeCode(value).split("_").filter(Boolean);
  if (tokens.length === 0) {
    return getOpsLabel("zh", "unknown");
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

export function getOpsLabel(
  locale: Locale,
  key: keyof typeof UI_LABELS,
  params?: Record<string, string | number>,
) {
  const labels = UI_LABELS[key];
  return formatTemplate(labels ? labels[locale] : String(key), params);
}

export function formatOpsCodeLabel(
  locale: Locale,
  value: string | null | undefined,
) {
  if (!value) {
    return getOpsLabel(locale, "unknown");
  }

  const normalized = normalizeCode(value);
  const variants = [
    normalized,
    normalized.replace(/[.\s]+/g, "_"),
    normalized.replace(/[.\s]+/g, "-"),
  ];
  const matchedKey = variants.find((candidate) => candidate in CODE_LABELS) as
    | keyof typeof CODE_LABELS
    | undefined;
  const matchedLabel = matchedKey ? CODE_LABELS[matchedKey] : undefined;
  if (matchedLabel) {
    return matchedLabel[locale];
  }
  return locale === "zh" ? formatUnknownZhCode(value) : humanizeCode(value);
}

export function formatOpsCodeList(
  locale: Locale,
  values: readonly string[] | null | undefined,
) {
  if (!values || values.length === 0) {
    return "-";
  }

  return values.map((value) => formatOpsCodeLabel(locale, value)).join(", ");
}
