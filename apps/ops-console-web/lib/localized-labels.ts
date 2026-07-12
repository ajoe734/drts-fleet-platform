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

  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  const key = `opsCode.${normalized}`;
  return key in translations.en ? t(key, locale) : humanizeCode(value);
}

const OPS_ACTION_LABEL_KEYS: Record<string, string> = {
  ack: "opsAction.ack",
  add_note: "complaints.action.addNote",
  assign: "complaints.action.assign",
  close: "complaints.action.close",
  create: "complaints.action.create",
  escalate_to_incident: "complaints.action.escalateToIncident",
  export_view: "complaints.action.exportView",
  fallback_to_human: "opsAction.fallbackToHuman",
  mark_sla_breach: "complaints.action.markSlaBreach",
  notify: "opsAction.notify",
  open_incident: "opsAction.openIncident",
  operational_hold: "opsAction.operationalHold",
  request_safety_action: "opsAction.requestSafetyAction",
  reopen: "complaints.action.reopen",
  resolve: "complaints.action.resolve",
  start_evidence_freeze: "opsAction.startEvidenceFreeze",
  stop_new_dispatch: "opsAction.stopNewDispatch",
};

export function formatOpsActionLabel(
  locale: Locale,
  action: string | null | undefined,
) {
  if (!action) {
    return getOpsLabel(locale, "unknown");
  }

  const normalized = action.trim().toLowerCase().replace(/-/g, "_");
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
