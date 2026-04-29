import type { Locale } from "./translations";

type LocalizedText = {
  en: string;
  zh: string;
};

const UI_LABELS: Record<string, LocalizedText> = {
  error: { en: "Error", zh: "錯誤" },
  switchLanguage: { en: "Switch language", zh: "切換語言" },
  unknown: { en: "Unknown", zh: "未知" },
  dispatchEtaUnavailable: { en: "ETA not available", zh: "暫無 ETA" },
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
  incidentsCriticalQueue: { en: "Critical / SOS queue", zh: "重大 / SOS 佇列" },
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
  reportsRequestedByExample: { en: "ops-console", zh: "ops-console" },
  driverRegistryUnavailableSubtitle: {
    en: "Unable to load driver registry data for {driverId}.",
    zh: "無法載入司機名冊資料：{driverId}。",
  },
};

const CODE_LABELS: Record<string, LocalizedText> = {
  active: { en: "Active", zh: "啟用中" },
  absent: { en: "Absent", zh: "缺勤" },
  approved: { en: "Approved", zh: "已核准" },
  app: { en: "App", zh: "App" },
  arrived: { en: "Arrived", zh: "已到達" },
  arrived_pickup: { en: "Arrived at Pickup", zh: "已到接送點" },
  booking: { en: "Booking", zh: "訂車" },
  brake_service: { en: "Brake Service", zh: "煞車保養" },
  callback: { en: "Callback", zh: "回撥" },
  cancelled: { en: "Cancelled", zh: "已取消" },
  closed: { en: "Closed", zh: "已關閉" },
  complaint: { en: "Complaint", zh: "客訴" },
  complaint_case_detail: { en: "Complaint Case Detail", zh: "客訴案件明細" },
  completed: { en: "Completed", zh: "已完成" },
  concierge: { en: "Concierge", zh: "禮賓" },
  contract_roster: { en: "Contract Roster", zh: "合約名冊" },
  created: { en: "Created", zh: "已建立" },
  credit_card_airport_transfer: {
    en: "Credit Card Airport Transfer",
    zh: "信用卡機場接送",
  },
  critical: { en: "Critical", zh: "重大" },
  dispatch_failed: { en: "Dispatch Failed", zh: "派車失敗" },
  dispatch_recording_index: { en: "Dispatch Trace", zh: "派車追蹤" },
  driver_accepted: { en: "Driver Accepted", zh: "司機已接單" },
  driver_injury: { en: "Driver Injury", zh: "司機受傷" },
  driver_roster: { en: "Driver Roster", zh: "司機名冊" },
  driver_service: { en: "Driver Service", zh: "司機服務" },
  enterprise_dispatch: { en: "Enterprise Dispatch", zh: "企業派遣" },
  enroute: { en: "En Route", zh: "前往中" },
  enroute_pickup: { en: "En Route to Pickup", zh: "前往接送點" },
  exception_hold: { en: "Exception Hold", zh: "異常暫停" },
  expired: { en: "Expired", zh: "已過期" },
  failed: { en: "Failed", zh: "失敗" },
  fare_dispute: { en: "Fare Dispute", zh: "車資爭議" },
  fare_version_history: { en: "Fare Version History", zh: "票價版本歷史" },
  filing: { en: "Filing", zh: "申報" },
  forwarder_broadcast: { en: "Forwarder Broadcast", zh: "轉派廣播" },
  general_inquiry: { en: "General Inquiry", zh: "一般諮詢" },
  high: { en: "High", zh: "高" },
  immutable: { en: "Immutable", zh: "不可變" },
  in_progress: { en: "In Progress", zh: "進行中" },
  incident_hold: { en: "Incident Hold", zh: "事故暫停" },
  incident_register: { en: "Incident Register", zh: "事故名冊" },
  inspection: { en: "Inspection", zh: "檢查" },
  insurance_roster: { en: "Insurance Roster", zh: "保險名冊" },
  investigating: { en: "Investigating", zh: "調查中" },
  late_arrival: { en: "Late Arrival", zh: "延遲到達" },
  lost_and_found: { en: "Lost and Found", zh: "失物招領" },
  low: { en: "Low", zh: "低" },
  maintenance_overview: { en: "Maintenance Overview", zh: "保養總覽" },
  matching: { en: "Matching", zh: "媒合中" },
  medium: { en: "Medium", zh: "中" },
  monthly_report: { en: "Monthly Report", zh: "月報" },
  monthly_trip_report: { en: "Monthly Trip Report", zh: "月度行程報表" },
  missing: { en: "Missing", zh: "缺漏" },
  manual_hold: { en: "Manual Hold", zh: "人工停派" },
  mutable: { en: "Mutable", zh: "可變" },
  new: { en: "New", zh: "新建" },
  no_arrival: { en: "No Arrival", zh: "未到場" },
  normal: { en: "Normal", zh: "一般" },
  offline: { en: "Offline", zh: "離線" },
  oil_change: { en: "Oil Change", zh: "換油" },
  on_trip: { en: "On Trip", zh: "行程中" },
  open: { en: "Open", zh: "開啟" },
  operational: { en: "Operational", zh: "營運" },
  ops: { en: "Ops", zh: "營運" },
  other: { en: "Other", zh: "其他" },
  overdue: { en: "Overdue", zh: "逾期" },
  paid: { en: "Paid", zh: "已付款" },
  partial: { en: "Partial", zh: "部分出勤" },
  passenger_injury: { en: "Passenger Injury", zh: "乘客受傷" },
  paused: { en: "Paused", zh: "暫停" },
  pending: { en: "Pending", zh: "待處理" },
  pending_review: { en: "Pending Review", zh: "待審核" },
  phone: { en: "Phone", zh: "電話" },
  portal: { en: "Portal", zh: "入口網站" },
  preassigned: { en: "Preassigned", zh: "預先指派" },
  present: { en: "Present", zh: "出勤" },
  priority: { en: "Priority", zh: "優先" },
  proof_pending: { en: "Proof Pending", zh: "待補證明" },
  property_damage: { en: "Property Damage", zh: "財物損壞" },
  queued: { en: "Queued", zh: "排隊中" },
  queue: { en: "Queue", zh: "排隊" },
  ready_for_dispatch: { en: "Ready for Dispatch", zh: "待派車" },
  realtime: { en: "Realtime", zh: "即時" },
  recall: { en: "Recall", zh: "召回" },
  recording_pending: { en: "Recording Pending", zh: "待附錄音" },
  redispatch_required: { en: "Redispatch Required", zh: "需重新派車" },
  reopened: { en: "Reopened", zh: "重新開啟" },
  repair: { en: "Repair", zh: "維修" },
  reservation: { en: "Reservation", zh: "預約" },
  reserved: { en: "Reserved", zh: "已預約" },
  resolved: { en: "Resolved", zh: "已解決" },
  revenue_summary: { en: "Revenue Summary", zh: "收益摘要" },
  route_issue: { en: "Route Issue", zh: "路線問題" },
  running: { en: "Running", zh: "執行中" },
  safety: { en: "Safety", zh: "安全" },
  safety_concern: { en: "Safety Concern", zh: "安全疑慮" },
  scheduled: { en: "Scheduled", zh: "已排程" },
  scheduled_service: { en: "Scheduled Service", zh: "定期保養" },
  six_month_statistics: { en: "Six-Month Statistics", zh: "半年統計" },
  suspended: { en: "Suspended", zh: "停用" },
  system: { en: "System", zh: "系統" },
  terminated: { en: "Terminated", zh: "已終止" },
  tire_replacement: { en: "Tire Replacement", zh: "輪胎更換" },
  traffic: { en: "Traffic", zh: "交通" },
  trip_summary: { en: "Trip Summary", zh: "行程摘要" },
  under_investigation: { en: "Under Investigation", zh: "調查中" },
  vehicle_condition: { en: "Vehicle Condition", zh: "車況" },
  vehicle_damage: { en: "Vehicle Damage", zh: "車輛損壞" },
  vehicle_monthly_delta: { en: "Vehicle Monthly Delta", zh: "車輛月度變動" },
  vehicle_roster: { en: "Vehicle Roster", zh: "車輛名冊" },
  weather: { en: "Weather", zh: "天候" },
  web: { en: "Web", zh: "網站" },
  revoked: { en: "Revoked", zh: "已撤銷" },
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
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

  const normalized = value.trim().toLowerCase();
  return CODE_LABELS[normalized]?.[locale] ?? humanizeCode(value);
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
