import type { Locale } from "./translations";

type LocalizedText = {
  en: string;
  zh: string;
};

const UI_LABELS: Record<string, LocalizedText> = {
  error: { en: "Error", zh: "錯誤" },
  switchLanguage: { en: "Switch language", zh: "切換語言" },
  id: { en: "ID", zh: "編號" },
  code: { en: "Code", zh: "代碼" },
  status: { en: "Status", zh: "狀態" },
  updated: { en: "Updated", zh: "更新時間" },
  pricingSnapshot: { en: "Pricing Snapshot", zh: "定價快照" },
  artifact: { en: "Artifact", zh: "成品" },
  feePlan: { en: "Fee Plan", zh: "費用方案" },
  gross: { en: "Gross", zh: "總額" },
  serviceFee: { en: "Service Fee", zh: "服務費" },
  subsidy: { en: "Subsidy", zh: "補助" },
  payout: { en: "Payout", zh: "付款" },
  statement: { en: "Statement", zh: "結算單" },
  total: { en: "Total", zh: "總額" },
  workflow: { en: "Workflow", zh: "流程" },
  remittance: { en: "Remittance", zh: "匯款" },
  items: { en: "Items", zh: "項目" },
  approvedAt: { en: "Approved {value}", zh: "已核准 {value}" },
  paidAt: { en: "Paid {value}", zh: "已付款 {value}" },
  remittanceProofExample: { en: "remit-proof-001", zh: "匯款證明-001" },
  applicableTo: { en: "Applicable To", zh: "適用對象" },
  call: { en: "Call", zh: "客服" },
  complaint: { en: "Complaint", zh: "客訴" },
  pendingArtifactId: { en: "pending-artifact-id", zh: "待產生成品 ID" },
  defaultPlanName: {
    en: "Phase 1 Driver Fee Plan",
    zh: "第一階段司機費用方案",
  },
  maintenanceReasonExample: {
    en: "e.g. Scheduled upgrade window",
    zh: "例如：排定的升級維護時段",
  },
  placardSourceNone: {
    en: "Select a source public info version to keep placard lineage traceable.",
    zh: "請選擇公開資訊來源版本，以保持立牌沿革可追溯。",
  },
  placardSourcePublished: {
    en: "Published source selected: generated placard will inherit the live disclosure timestamp.",
    zh: "已選擇已發布來源：新產生的立牌會沿用正式公開揭露時間戳。",
  },
  placardSourceRetired: {
    en: "Retired source selected: generate is blocked because placards must be linked to an active draft or published disclosure version.",
    zh: "已選擇退役來源：目前禁止產生，因為立牌必須連結到有效草稿或已發布揭露版本。",
  },
  placardSourceDraft: {
    en: "Draft source selected: generated placard stays draft until the linked public info is published.",
    zh: "已選擇草稿來源：產生的立牌會維持草稿，直到關聯的公開資訊發布。",
  },
  placardRetiredSourceUnavailable: {
    en: "{title} (retired source unavailable)",
    zh: "{title}（已退役來源，不可使用）",
  },
  placardRetiredSourceAuditNote: {
    en: "Retired public info versions remain visible for audit history, but cannot be used to generate new placards.",
    zh: "已退役的公開資訊版本仍會保留於稽核歷史中，但不可再用來產生新立牌。",
  },
  placardVersionCodeConflict: {
    en: "Version code already exists in placard {placardId}. Choose a unique code before generating.",
    zh: "版本代碼已存在於立牌 {placardId}。請改用唯一代碼後再產生。",
  },
};

const CODE_LABELS: Record<string, LocalizedText> = {
  active: { en: "Active", zh: "啟用中" },
  admin: { en: "Admin", zh: "管理員" },
  all: { en: "All", zh: "全部" },
  audit_log: { en: "Audit Log", zh: "稽核紀錄" },
  audit_notification: { en: "Audit Notification", zh: "稽核通知" },
  "audit-notification": { en: "Audit Notification", zh: "稽核通知" },
  api_key: { en: "API Key", zh: "API 金鑰" },
  api_key_and_webhook: {
    en: "API Key + Webhook",
    zh: "API 金鑰 + 回呼",
  },
  attach_recording_callback: {
    en: "Attach Recording Callback",
    zh: "綁定錄音回呼",
  },
  approved: { en: "Approved", zh: "已核准" },
  assigned: { en: "Assigned", zh: "已指派" },
  accept: { en: "Accept", zh: "受理" },
  archived: { en: "Archived", zh: "已封存" },
  actor: { en: "Actor", zh: "操作者" },
  airport: { en: "Airport", zh: "機場" },
  airport_transfer: { en: "Airport Transfer", zh: "機場接送" },
  bank_card_inline: { en: "Bank Card Inline", zh: "銀行卡即時驗證" },
  bank_partner: { en: "Bank Partner", zh: "銀行合作夥伴" },
  bootstrap_seeded: { en: "Bootstrap Seeded", zh: "初始化種子資料" },
  available: { en: "Available", zh: "可派遣" },
  business: { en: "Business", zh: "商務" },
  business_dispatch: { en: "Business Dispatch", zh: "商務派遣" },
  card_bin: { en: "Card BIN", zh: "卡 BIN" },
  credit_card_airport_transfer: {
    en: "Credit Card Airport Transfer",
    zh: "信用卡機場接送",
  },
  "credential.issued": { en: "Credential Issued", zh: "憑證已發行" },
  "credential.revoked": { en: "Credential Revoked", zh: "憑證已撤銷" },
  blocked: { en: "Blocked", zh: "阻擋" },
  callback_task: { en: "Callback Task", zh: "回撥任務" },
  call_recording: { en: "Call Recording", zh: "通話錄音" },
  call_session: { en: "Call Session", zh: "通話工作階段" },
  callcenter: { en: "Callcenter", zh: "客服中心" },
  complete_report_job: { en: "Complete Report Job", zh: "完成報表工作" },
  complete_debranding: { en: "Complete Debranding", zh: "完成除標識" },
  create_report_job: { en: "Create Report Job", zh: "建立報表工作" },
  create_contract: { en: "Create Contract", zh: "建立合約" },
  create_driver: { en: "Create Driver", zh: "新增司機" },
  critical: { en: "Critical", zh: "重大" },
  deprecated: { en: "Deprecated", zh: "已淘汰" },
  debranding_pending: { en: "Debranding Pending", zh: "等待除標識" },
  debranding_verified: { en: "Debranding Verified", zh: "除標識已驗證" },
  degraded: { en: "Degraded", zh: "降級" },
  draft: { en: "Draft", zh: "草稿" },
  down: { en: "Down", zh: "停機" },
  device_binding: { en: "Device Binding", zh: "裝置綁定" },
  dispatch_compliance_license_warn_30d: {
    en: "License warning within 30 days",
    zh: "駕照 30 天內到期警示",
  },
  dispatch_disabled: { en: "Dispatch Disabled", zh: "已停用派遣" },
  driver_fee: { en: "Driver Fee", zh: "司機費用" },
  "entry.created": { en: "Entry Created", zh: "入口已建立" },
  "entry.updated": { en: "Entry Updated", zh: "入口已更新" },
  eligibility_verification: {
    en: "Eligibility Verification",
    zh: "資格驗證",
  },
  evidence_deletion_exception: {
    en: "Evidence Deletion Exception",
    zh: "證據刪除例外",
  },
  evidence_legal_hold: { en: "Evidence Legal Hold", zh: "證據法定保留" },
  exclusivity: { en: "Exclusivity", zh: "排他治理" },
  exclusivity_approved: { en: "Exclusivity Approved", zh: "排他已核准" },
  expiring: { en: "Expiring", zh: "即將到期" },
  exclusivity_pending: { en: "Exclusivity Pending", zh: "排他待審" },
  external_unavailable: {
    en: "External Unavailable",
    zh: "外部依賴不可用",
  },
  fail_report_job: { en: "Fail Report Job", zh: "報表工作失敗" },
  fetch_failed: { en: "Fetch Failed", zh: "讀取失敗" },
  filing_package: { en: "Filing Package", zh: "申報封包" },
  filtered_empty: { en: "Filtered Empty", zh: "篩選後無資料" },
  finance_manual: { en: "Finance Manual", zh: "財務人工" },
  fleet_partner: { en: "Fleet Partner", zh: "車隊合作夥伴" },
  forwarder_auto: { en: "Forwarder Auto", zh: "轉發器自動" },
  forwarder_status_mismatch: {
    en: "Forwarder Status Mismatch",
    zh: "轉發狀態不一致",
  },
  fresh: { en: "Fresh", zh: "最新" },
  governance_offboarding: { en: "Governance Offboarding", zh: "治理退場" },
  drivers: { en: "Drivers", zh: "司機" },
  enterprise_dispatch: { en: "Enterprise Dispatch", zh: "企業派遣" },
  external_owner_confirmed: {
    en: "External Owner Confirmed",
    zh: "已確認外部責任方",
  },
  external_combined: { en: "External Combined", zh: "外部整合介接" },
  external_rest: { en: "External REST", zh: "外部介接服務" },
  external_webhook: { en: "External Webhook", zh: "外部回呼介接" },
  exported: { en: "Exported", zh: "已匯出" },
  foundation_manifest: { en: "Foundation Manifest", zh: "基礎設定清單" },
  issue_filing_package_download: {
    en: "Issue Filing Package Download",
    zh: "簽發申報封包下載",
  },
  issue_report_artifact_download: {
    en: "Issue Report Artifact Download",
    zh: "簽發報表成品下載",
  },
  mirror_resynced: { en: "Mirror Resynced", zh: "鏡像已重新同步" },
  healthy: { en: "Healthy", zh: "正常" },
  inactive: { en: "Inactive", zh: "停用" },
  info: { en: "Info", zh: "資訊" },
  invalid: { en: "Invalid", zh: "無效" },
  invited: { en: "Invited", zh: "已邀請" },
  issued: { en: "Issued", zh: "已開立" },
  medium_slow: { en: "Medium Slow", zh: "中慢速" },
  list_call_recording_evidence: {
    en: "List Call Recording Evidence",
    zh: "列出通話錄音證據",
  },
  list_filing_package_evidence: {
    en: "List Filing Package Evidence",
    zh: "列出申報封包證據",
  },
  list_partner_eligibility_review_queue: {
    en: "List Partner Eligibility Review Queue",
    zh: "列出合作夥伴資格審查佇列",
  },
  list_report_artifact_evidence: {
    en: "List Report Artifact Evidence",
    zh: "列出報表成品證據",
  },
  mixed: { en: "Mixed", zh: "混合" },
  mid_rollout: { en: "Mid-rollout", zh: "進行中推進" },
  missing: { en: "Missing", zh: "缺漏" },
  manual_hold: { en: "Manual Hold", zh: "人工停派" },
  live: { en: "Live", zh: "即時" },
  no_data: { en: "No Data", zh: "無資料" },
  none: { en: "None", zh: "未設定" },
  notification_batch: { en: "Notification Batch", zh: "通知批次" },
  not_provisioned: { en: "Not Provisioned", zh: "尚未配置" },
  operator: { en: "Operator", zh: "營運人員" },
  "operational-observability": {
    en: "Operational Observability",
    zh: "營運可觀測性",
  },
  ops: { en: "Ops", zh: "營運" },
  ops_console: { en: "Ops Console", zh: "營運控制台" },
  ops_user: { en: "Ops User", zh: "營運使用者" },
  paid: { en: "Paid", zh: "已付款" },
  paused: { en: "Paused", zh: "暫停" },
  pending: { en: "Pending", zh: "待處理" },
  pending_approval: { en: "Pending Approval", zh: "待核准" },
  partner_entry: { en: "Partner Entry", zh: "合作夥伴入口" },
  partner_eligibility: { en: "Partner Eligibility", zh: "合作夥伴資格" },
  partner_api_key: { en: "Partner API Key", zh: "合作夥伴 API 金鑰" },
  partner_ingress_credential: {
    en: "Partner Ingress Credential",
    zh: "合作夥伴入口憑證",
  },
  partner_managed: { en: "Partner Managed", zh: "夥伴管理" },
  partner_sponsor_mismatch: {
    en: "Partner Sponsor Mismatch",
    zh: "合作夥伴贊助對帳不符",
  },
  passenger: { en: "Passenger", zh: "乘客" },
  pilot: { en: "Pilot", zh: "試點" },
  platform_admin: { en: "Platform Admin", zh: "平台管理員" },
  "platform-admin": { en: "Platform Admin", zh: "平台管理員" },
  "platform-admin.preview": {
    en: "Platform Admin Preview",
    zh: "平台管理員預覽",
  },
  platform_default: { en: "Platform Default", zh: "平台預設" },
  platform_funded: { en: "Platform Funded", zh: "平台資助" },
  platform_only: { en: "Platform Only", zh: "僅平台" },
  platform_pricing_rule: {
    en: "Platform Pricing Rule",
    zh: "平台定價規則",
  },
  pricing_rule: { en: "Pricing Rule", zh: "定價規則" },
  production: { en: "Production", zh: "正式環境" },
  published: { en: "Published", zh: "已發布" },
  pending_review: { en: "Pending Review", zh: "待審核" },
  permission_denied: { en: "Permission Denied", zh: "權限不足" },
  proof_bundle: { en: "Proof Bundle", zh: "憑證包" },
  ready: { en: "Ready", zh: "就緒" },
  reconciled: { en: "Reconciled", zh: "已對帳" },
  reconciliation_adjustment: {
    en: "Reconciliation Adjustment",
    zh: "對帳調整",
  },
  reopened: { en: "Reopened", zh: "已重開" },
  refresh_tab: { en: "Refresh", zh: "重新整理" },
  reason: { en: "Reason", zh: "原因" },
  retry: { en: "Retry", zh: "重試" },
  revoke_device_binding: {
    en: "Revoke Device Binding",
    zh: "解除裝置綁定",
  },
  rolled_out: { en: "Rolled Out", zh: "已全面推出" },
  sponsor_corrected: { en: "Sponsor Corrected", zh: "贊助資料已修正" },
  register_evidence_deletion_exception: {
    en: "Register Evidence Deletion Exception",
    zh: "登記證據刪除例外",
  },
  release_evidence_legal_hold: {
    en: "Release Evidence Legal Hold",
    zh: "解除證據法定保留",
  },
  report_artifact: { en: "Report Artifact", zh: "報表成品" },
  report_job: { en: "Report Job", zh: "報表工作" },
  "reporting-filing": { en: "Reporting Filing", zh: "申報與報表" },
  resolved: { en: "Resolved", zh: "已解決" },
  resolved_other: { en: "Resolved Other", zh: "其他方式結案" },
  resolve_evidence_deletion_exception: {
    en: "Resolve Evidence Deletion Exception",
    zh: "解除證據刪除例外",
  },
  resolve_partner_eligibility_review: {
    en: "Resolve Partner Eligibility Review",
    zh: "完成合作夥伴資格審查",
  },
  retired: { en: "Retired", zh: "已退役" },
  rollback_hold: { en: "Rollback Hold", zh: "回滾保留" },
  revoked: { en: "Revoked", zh: "已撤銷" },
  reporting: { en: "Reporting", zh: "報表" },
  sandbox: { en: "Sandbox", zh: "沙箱" },
  scheduled: { en: "Scheduled", zh: "已排程" },
  standard: { en: "Standard", zh: "標準" },
  standard_taxi: { en: "Standard Taxi", zh: "一般計程車" },
  stale: { en: "Stale", zh: "過舊" },
  status_reason_only: { en: "Status + Reason Only", zh: "僅狀態與原因" },
  superadmin: { en: "Superadmin", zh: "超級管理員" },
  suspended: { en: "Suspended", zh: "停用" },
  system: { en: "System", zh: "系統" },
  "tenant-partner": { en: "Tenant Partner", zh: "租戶合作夥伴" },
  tenant_approval_request: {
    en: "Tenant Approval Request",
    zh: "租戶審批請求",
  },
  tenant_admin: { en: "Tenant Admin", zh: "租戶管理員" },
  tenant_console: { en: "Tenant Console", zh: "租戶控制台" },
  "tenant-console": { en: "Tenant Console", zh: "租戶控制台" },
  tenants: { en: "Tenants", zh: "租戶" },
  terminated: { en: "Terminated", zh: "已終止" },
  trace_id: { en: "Trace ID", zh: "追蹤編號" },
  unknown: { en: "Unknown", zh: "未知" },
  unhealthy: { en: "Unhealthy", zh: "異常" },
  update_vehicle_compliance: {
    en: "Update Compliance",
    zh: "更新合規狀態",
  },
  issuer_card_lookup: { en: "Issuer Card Lookup", zh: "發卡行卡片查詢" },
  valid: { en: "Valid", zh: "有效" },
  writeoff_approved: { en: "Write-off Approved", zh: "核准沖銷" },
  view_call_recording_evidence: {
    en: "View Call Recording Evidence",
    zh: "查看通話錄音證據",
  },
  duplicate_closed: { en: "Duplicate Closed", zh: "重複案件已關閉" },
  no_action_required: { en: "No Action Required", zh: "無需處理" },
  verify_partner_eligibility: {
    en: "Verify Partner Eligibility",
    zh: "驗證合作夥伴資格",
  },
  viewer: { en: "Viewer", zh: "檢視者" },
  view_audit_log_evidence: {
    en: "View Audit Log Evidence",
    zh: "查看稽核紀錄證據",
  },
  view_partner_eligibility_evidence: {
    en: "View Partner Eligibility Evidence",
    zh: "查看合作夥伴資格證據",
  },
  view_webhook_delivery_evidence: {
    en: "View Webhook Delivery Evidence",
    zh: "查看回呼投遞證據",
  },
  warning: { en: "Warning", zh: "警示" },
  wheelchair: { en: "Wheelchair", zh: "輪椅" },
  webhooks: { en: "Webhooks", zh: "回呼" },
  webhook_delivery: { en: "Webhook Delivery", zh: "回呼投遞" },
  billing: { en: "Billing", zh: "帳務" },
  working: { en: "Working", zh: "處理中" },
  "owned-mobility": { en: "Owned Mobility", zh: "自營運輸" },
  unavailable: { en: "Unavailable", zh: "目前不可用" },
  read_only: { en: "Read-only", zh: "唯讀" },
  open_ops_driver: { en: "Open Ops Console", zh: "開啟營運控制台" },
  open_ops_vehicle: { en: "Open Ops Console", zh: "開啟營運控制台" },
  activate_driver: { en: "Activate Driver", zh: "啟用司機" },
  approve_exclusivity: { en: "Approve Exclusivity", zh: "核准排他聲明" },
  reject_exclusivity: { en: "Reject Exclusivity", zh: "退回排他聲明" },
  initiate_offboarding: { en: "Initiate Offboarding", zh: "啟動退場流程" },
  advance_offboarding_step: {
    en: "Advance Offboarding",
    zh: "推進退場流程",
  },
  suspend_driver: { en: "Suspend Driver", zh: "停用司機" },
  retire_driver: { en: "Retire Driver", zh: "司機退役" },
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
  owned_dispatch: { en: "DRTS Native Dispatch", zh: "DRTS 原生派遣" },
  drts_native_dispatch: {
    en: "DRTS Native Dispatch",
    zh: "DRTS 原生派遣",
  },
  cityride_forwarder: {
    en: "CityRide Forwarded Orders",
    zh: "CityRide 轉派訂單",
  },
  cityride_forwarded_orders: {
    en: "CityRide Forwarded Orders",
    zh: "CityRide 轉派訂單",
  },
  completed: { en: "Completed", zh: "已完成" },
};

const ZH_CODE_TOKEN_LABELS: Record<string, string> = {
  accept: "受理",
  active: "啟用中",
  action: "動作",
  actor: "操作者",
  adapter: "介接器",
  adapters: "介接器",
  admin: "管理員",
  api: "API",
  approve: "核准",
  approved: "已核准",
  archive: "封存",
  archived: "已封存",
  artifact: "成品",
  artifacts: "成品",
  audit: "稽核",
  auth: "驗證",
  authority: "權限",
  billing: "帳務",
  booking: "預約",
  bookings: "預約",
  bundle: "包",
  call: "通話",
  callcenter: "客服中心",
  callback: "回呼",
  cancel: "取消",
  cancelled: "已取消",
  card: "卡片",
  close: "關閉",
  closed: "已關閉",
  code: "代碼",
  complete: "完成",
  completed: "已完成",
  compliance: "法遵",
  config: "設定",
  console: "控制台",
  contract: "合約",
  create: "建立",
  credential: "憑證",
  credentials: "憑證",
  critical: "重大",
  cross: "跨",
  csv: "CSV",
  data: "資料",
  delete: "刪除",
  deletion: "刪除",
  delivery: "投遞",
  detail: "詳情",
  disabled: "停用",
  dispatch: "派遣",
  download: "下載",
  driver: "司機",
  drivers: "司機",
  enabled: "啟用",
  endpoint: "端點",
  endpoints: "端點",
  entry: "入口",
  eligibility: "資格",
  error: "錯誤",
  evidence: "證據",
  exception: "例外",
  export: "匯出",
  external: "外部",
  fail: "失敗",
  failed: "失敗",
  fallback: "備援",
  feature: "功能",
  fee: "費用",
  filing: "申報",
  finance: "財務",
  fleet: "車隊",
  gate: "閘門",
  governance: "治理",
  health: "健康",
  hold: "保留",
  id: "編號",
  inactive: "停用",
  info: "資訊",
  ingress: "入口",
  issue: "簽發",
  key: "金鑰",
  legal: "法定",
  list: "列出",
  log: "紀錄",
  maintenance: "維護",
  manual: "人工",
  mode: "模式",
  module: "模組",
  notice: "公告",
  notification: "通知",
  observability: "可觀測性",
  operational: "營運",
  ops: "營運",
  order: "訂單",
  orders: "訂單",
  owner: "負責方",
  package: "封包",
  partner: "合作夥伴",
  passenger: "乘客",
  payment: "付款",
  payments: "付款",
  pending: "待處理",
  placard: "立牌",
  platform: "平台",
  policy: "政策",
  pricing: "定價",
  proof: "憑證",
  public: "公開",
  queue: "佇列",
  read: "讀取",
  receipt: "收據",
  reconciliation: "對帳",
  recording: "錄音",
  refresh: "重新整理",
  registry: "註冊表",
  reject: "退回",
  rejected: "已退回",
  release: "解除",
  reporting: "申報與報表",
  report: "報表",
  request: "請求",
  resource: "資源",
  retention: "保存",
  retry: "重試",
  review: "審查",
  revoke: "撤銷",
  route: "路由",
  rule: "規則",
  sandbox: "沙箱",
  session: "工作階段",
  source: "來源",
  sponsor: "贊助",
  status: "狀態",
  submit: "送出",
  subsidy: "補助",
  success: "成功",
  sync: "同步",
  system: "系統",
  task: "任務",
  tenant: "租戶",
  tenants: "租戶",
  trace: "追蹤",
  type: "類型",
  unavailable: "不可用",
  unknown: "未知",
  update: "更新",
  upload: "上傳",
  url: "網址",
  user: "使用者",
  users: "使用者",
  vehicle: "車輛",
  view: "查看",
  warning: "警示",
  webhook: "回呼",
  write: "寫入",
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

function normalizeCode(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[.\s-]+/g, "_")
    .toLowerCase();
}

function humanizeCode(value: string) {
  return normalizeCode(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatUnknownZhCode(value: string) {
  const tokens = normalizeCode(value).split("_").filter(Boolean);
  if (tokens.length === 0) {
    return "未定義";
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

function resolveCodeLabel(locale: Locale, value: string) {
  const normalized = normalizeCode(value);
  const hyphenated = normalized.replaceAll("_", "-");
  return CODE_LABELS[normalized]?.[locale] ?? CODE_LABELS[hyphenated]?.[locale];
}

export function getPlatformLabel(
  locale: Locale,
  key: keyof typeof UI_LABELS,
  params?: Record<string, string | number>,
) {
  const labels = UI_LABELS[key];
  return formatTemplate(labels ? labels[locale] : String(key), params);
}

export function formatPlatformCodeLabel(
  locale: Locale,
  value: string | null | undefined,
) {
  if (!value) {
    const unknownLabels = CODE_LABELS.unknown;
    return unknownLabels ? unknownLabels[locale] : "Unknown";
  }

  const resolved = resolveCodeLabel(locale, value);
  if (resolved) {
    return resolved;
  }

  return locale === "zh" ? formatUnknownZhCode(value) : humanizeCode(value);
}

export function formatPlatformAdapterLabel(
  locale: Locale,
  adapter: {
    id?: string | null;
    name?: string | null;
  },
) {
  const candidates = [adapter.id, adapter.name].filter(
    (value): value is string => Boolean(value?.trim()),
  );

  for (const candidate of candidates) {
    const localized = resolveCodeLabel(locale, candidate);
    if (localized) {
      return localized;
    }
  }

  return candidates[0] ?? (locale === "zh" ? "未知介接器" : "Unknown adapter");
}
