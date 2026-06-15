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

export function formatOpsCodeList(
  locale: Locale,
  values: readonly string[] | null | undefined,
) {
  if (!values || values.length === 0) {
    return "-";
  }

  return values
    .map((value) => formatOpsCodeLabel(locale, value))
    .join(t("common.listSeparator", locale));
}
