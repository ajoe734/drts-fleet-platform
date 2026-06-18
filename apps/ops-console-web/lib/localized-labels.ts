import { t, translations, type Locale } from "./translations";

// Bilingual copy for these labels lives centrally in translations.ts under the
// "opsLabel.*" and "opsCode.*" key namespaces. These helpers are thin wrappers
// over t() so all user-facing strings flow through the central catalog.

export type OpsLabelKey =
  | "error"
  | "switchLanguage"
  | "unknown"
  | "dispatchEtaUnavailable"
  | "dispatchLastUpdated"
  | "order"
  | "vehicle"
  | "complaint"
  | "dispatchSource"
  | "dispatchId"
  | "dispatchStatus"
  | "incidentsPriorityQueue"
  | "incidentsCriticalQueue"
  | "incidentsActiveCritical"
  | "incidentsReviewActivity"
  | "incidentsAllClear"
  | "incidentsLoading"
  | "incidentsNoLinkedEntities"
  | "incidentsSelectHint"
  | "reportsPeriodExample"
  | "reportsClosedMonthExample"
  | "reportsRequestedByExample"
  | "driverRegistryUnavailableSubtitle"
  | "openDriverDetail";

function humanizeCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getOpsLabel(
  locale: Locale,
  key: OpsLabelKey,
  params?: Record<string, string | number>,
) {
  return t(`opsLabel.${key}`, locale, params);
}

export function formatOpsCodeLabel(
  locale: Locale,
  value: string | null | undefined,
) {
  if (!value) {
    return getOpsLabel(locale, "unknown");
  }

  const normalized = value.trim().toLowerCase();
  const key = `opsCode.${normalized}`;
  return key in translations.en ? t(key, locale) : humanizeCode(value);
}

const OPS_ACTION_LABEL_KEYS: Record<string, string> = {
  add_note: "complaints.action.addNote",
  assign: "complaints.action.assign",
  close: "complaints.action.close",
  create: "complaints.action.create",
  escalate_to_incident: "complaints.action.escalateToIncident",
  export_view: "complaints.action.exportView",
  mark_sla_breach: "complaints.action.markSlaBreach",
  reopen: "complaints.action.reopen",
  resolve: "complaints.action.resolve",
};

export function formatOpsActionLabel(
  locale: Locale,
  action: string | null | undefined,
) {
  if (!action) {
    return getOpsLabel(locale, "unknown");
  }

  const normalized = action.trim().toLowerCase();
  const key = OPS_ACTION_LABEL_KEYS[normalized];
  return key ? t(key, locale) : formatOpsCodeLabel(locale, action);
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
