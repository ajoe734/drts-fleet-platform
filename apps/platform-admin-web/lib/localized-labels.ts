import { type Locale, t, translations } from "./translations";

// Platform label keys are centralized in translations.ts under the
// "platformLabel." namespace. This union keeps call sites type-checked while
// the bilingual copy itself lives in the central dictionary.
export type PlatformLabelKey =
  | "error"
  | "switchLanguage"
  | "id"
  | "code"
  | "status"
  | "updated"
  | "pricingSnapshot"
  | "artifact"
  | "feePlan"
  | "gross"
  | "serviceFee"
  | "subsidy"
  | "payout"
  | "statement"
  | "total"
  | "workflow"
  | "remittance"
  | "items"
  | "approvedAt"
  | "paidAt"
  | "remittanceProofExample"
  | "applicableTo"
  | "call"
  | "complaint"
  | "pendingArtifactId"
  | "defaultPlanName"
  | "maintenanceReasonExample"
  | "placardSourceNone"
  | "placardSourcePublished"
  | "placardSourceRetired"
  | "placardSourceDraft"
  | "placardRetiredSourceUnavailable"
  | "placardRetiredSourceAuditNote"
  | "placardVersionCodeConflict";

function humanizeCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getPlatformLabel(
  locale: Locale,
  key: PlatformLabelKey,
  params?: Record<string, string | number>,
) {
  return t(`platformLabel.${key}`, locale, params);
}

export function formatPlatformCodeLabel(
  locale: Locale,
  value: string | null | undefined,
) {
  if (!value) {
    return t("code.unknown", locale);
  }

  const normalized = value.trim().toLowerCase();
  const key = `code.${normalized}`;
  if (key in translations.en) {
    return t(key, locale);
  }
  return humanizeCode(value);
}
