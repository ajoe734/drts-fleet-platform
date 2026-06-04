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
    zh: "Phase 1 司機費用方案",
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
  approved: { en: "Approved", zh: "已核准" },
  archived: { en: "Archived", zh: "已封存" },
  available: { en: "Available", zh: "可派遣" },
  critical: { en: "Critical", zh: "重大" },
  degraded: { en: "Degraded", zh: "降級" },
  draft: { en: "Draft", zh: "草稿" },
  down: { en: "Down", zh: "停機" },
  drivers: { en: "Drivers", zh: "司機" },
  enterprise_dispatch: { en: "Enterprise Dispatch", zh: "企業派遣" },
  healthy: { en: "Healthy", zh: "正常" },
  inactive: { en: "Inactive", zh: "停用" },
  info: { en: "Info", zh: "資訊" },
  invited: { en: "Invited", zh: "已邀請" },
  issued: { en: "Issued", zh: "已開立" },
  mixed: { en: "Mixed", zh: "混合" },
  missing: { en: "Missing", zh: "缺漏" },
  manual_hold: { en: "Manual Hold", zh: "人工停派" },
  operator: { en: "Operator", zh: "營運人員" },
  ops: { en: "Ops", zh: "營運" },
  ops_user: { en: "Ops User", zh: "營運使用者" },
  paid: { en: "Paid", zh: "已付款" },
  paused: { en: "Paused", zh: "暫停" },
  pending: { en: "Pending", zh: "待處理" },
  platform_admin: { en: "Platform Admin", zh: "平台管理員" },
  platform_funded: { en: "Platform Funded", zh: "平台資助" },
  published: { en: "Published", zh: "已發布" },
  pending_review: { en: "Pending Review", zh: "待審核" },
  resolved: { en: "Resolved", zh: "已解決" },
  retired: { en: "Retired", zh: "已退役" },
  rollback_hold: { en: "Rollback Hold", zh: "回滾保留" },
  revoked: { en: "Revoked", zh: "已撤銷" },
  reporting: { en: "Reporting", zh: "報表" },
  scheduled: { en: "Scheduled", zh: "已排程" },
  superadmin: { en: "Superadmin", zh: "超級管理員" },
  suspended: { en: "Suspended", zh: "停用" },
  system: { en: "System", zh: "系統" },
  tenant_admin: { en: "Tenant Admin", zh: "租戶管理員" },
  tenants: { en: "Tenants", zh: "租戶" },
  terminated: { en: "Terminated", zh: "已終止" },
  unknown: { en: "Unknown", zh: "未知" },
  unhealthy: { en: "Unhealthy", zh: "異常" },
  viewer: { en: "Viewer", zh: "檢視者" },
  warning: { en: "Warning", zh: "警示" },
  webhooks: { en: "Webhooks", zh: "Webhook" },
  billing: { en: "Billing", zh: "帳務" },
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
  completed: { en: "Completed", zh: "已完成" },
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

  const normalized = value.trim().toLowerCase();
  return CODE_LABELS[normalized]?.[locale] ?? humanizeCode(value);
}
