import { t, type Locale } from "./translations";

const UI_LABEL_KEYS = {
  error: "platformLabel.error",
  switchLanguage: "platformLabel.switchLanguage",
  id: "platformLabel.id",
  code: "platformLabel.code",
  status: "platformLabel.status",
  updated: "platformLabel.updated",
  pricingSnapshot: "platformLabel.pricingSnapshot",
  artifact: "platformLabel.artifact",
  feePlan: "platformLabel.feePlan",
  gross: "platformLabel.gross",
  serviceFee: "platformLabel.serviceFee",
  subsidy: "platformLabel.subsidy",
  payout: "platformLabel.payout",
  statement: "platformLabel.statement",
  total: "platformLabel.total",
  workflow: "platformLabel.workflow",
  remittance: "platformLabel.remittance",
  items: "platformLabel.items",
  approvedAt: "platformLabel.approvedAt",
  paidAt: "platformLabel.paidAt",
  remittanceProofExample: "platformLabel.remittanceProofExample",
  applicableTo: "platformLabel.applicableTo",
  call: "platformLabel.call",
  complaint: "platformLabel.complaint",
  pendingArtifactId: "platformLabel.pendingArtifactId",
  defaultPlanName: "platformLabel.defaultPlanName",
  maintenanceReasonExample: "platformLabel.maintenanceReasonExample",
  placardSourceNone: "platformLabel.placardSourceNone",
  placardSourcePublished: "platformLabel.placardSourcePublished",
  placardSourceRetired: "platformLabel.placardSourceRetired",
  placardSourceDraft: "platformLabel.placardSourceDraft",
  placardRetiredSourceUnavailable:
    "platformLabel.placardRetiredSourceUnavailable",
  placardRetiredSourceAuditNote: "platformLabel.placardRetiredSourceAuditNote",
  placardVersionCodeConflict: "platformLabel.placardVersionCodeConflict",
} as const;

const CODE_LABEL_KEYS = {
  active: "platformCode.active",
  admin: "platformCode.admin",
  all: "platformCode.all",
  api_key: "platformCode.api_key",
  api_key_and_webhook: "platformCode.api_key_and_webhook",
  approved: "platformCode.approved",
  archived: "platformCode.archived",
  available: "platformCode.available",
  blocked: "platformCode.blocked",
  billing: "platformCode.billing",
  completed: "platformCode.completed",
  contract_draft: "platformCode.contract_draft",
  contract_expired: "platformCode.contract_expired",
  contract_missing: "platformCode.contract_missing",
  contract_terminated: "platformCode.contract_terminated",
  critical: "platformCode.critical",
  debranding_required: "platformCode.debranding_required",
  degraded: "platformCode.degraded",
  down: "platformCode.down",
  draft: "platformCode.draft",
  drivers: "platformCode.drivers",
  enterprise_dispatch: "platformCode.enterprise_dispatch",
  exclusivity_expired: "platformCode.exclusivity_expired",
  exclusivity_missing: "platformCode.exclusivity_missing",
  exclusivity_pending_review: "platformCode.exclusivity_pending_review",
  exclusivity_rejected: "platformCode.exclusivity_rejected",
  exclusivity_revoked: "platformCode.exclusivity_revoked",
  healthy: "platformCode.healthy",
  inactive: "platformCode.inactive",
  info: "platformCode.info",
  insurance_cancelled: "platformCode.insurance_cancelled",
  insurance_expired: "platformCode.insurance_expired",
  insurance_missing: "platformCode.insurance_missing",
  insurance_pending: "platformCode.insurance_pending",
  invited: "platformCode.invited",
  issued: "platformCode.issued",
  manual_hold: "platformCode.manual_hold",
  missing: "platformCode.missing",
  mixed: "platformCode.mixed",
  none: "platformCode.none",
  offboarding_pending_debranding: "platformCode.offboarding_pending_debranding",
  not_required: "platformCode.not_required",
  operator: "platformCode.operator",
  ops: "platformCode.ops",
  ops_user: "platformCode.ops_user",
  paid: "platformCode.paid",
  partner_managed: "platformCode.partner_managed",
  paused: "platformCode.paused",
  pending: "platformCode.pending",
  pending_review: "platformCode.pending_review",
  pilot: "platformCode.pilot",
  platform_admin: "platformCode.platform_admin",
  platform_funded: "platformCode.platform_funded",
  production: "platformCode.production",
  published: "platformCode.published",
  ready: "platformCode.ready",
  reporting: "platformCode.reporting",
  resolved: "platformCode.resolved",
  retired: "platformCode.retired",
  revoked: "platformCode.revoked",
  rollback_hold: "platformCode.rollback_hold",
  sandbox: "platformCode.sandbox",
  scheduled: "platformCode.scheduled",
  superadmin: "platformCode.superadmin",
  suspended: "platformCode.suspended",
  system: "platformCode.system",
  tenant_admin: "platformCode.tenant_admin",
  tenants: "platformCode.tenants",
  terminated: "platformCode.terminated",
  unknown: "platformCode.unknown",
  unhealthy: "platformCode.unhealthy",
  viewer: "platformCode.viewer",
  warning: "platformCode.warning",
  webhooks: "platformCode.webhooks",
} as const;

function humanizeCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getPlatformLabel(
  locale: Locale,
  key: keyof typeof UI_LABEL_KEYS,
  params?: Record<string, string | number>,
) {
  return t(UI_LABEL_KEYS[key], locale, params);
}

export function formatPlatformCodeLabel(
  locale: Locale,
  value: string | null | undefined,
) {
  if (!value) {
    return t("platformCode.unknown", locale);
  }

  const normalized = value.trim().toLowerCase();
  const key = CODE_LABEL_KEYS[normalized as keyof typeof CODE_LABEL_KEYS];
  return key ? t(key, locale) : humanizeCode(value);
}
