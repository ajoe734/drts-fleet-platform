import { type Locale, type TranslationKey, t } from "./translations";

/** BUREAU-R13 §4: a missing source value is shown as 未提供 / Not provided, never as 0. */
export const NOT_PROVIDED = "未提供";

export function notProvided(locale: Locale = "zh"): string {
  return t("common.notProvided", undefined, locale);
}

export function display(
  value: string | number | null | undefined,
  locale: Locale = "zh",
): string {
  if (value === null || value === undefined) return notProvided(locale);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return notProvided(locale);
    return String(value);
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return notProvided(locale);
  }
  return String(value);
}

export function displayDateTime(
  value: string | null | undefined,
  locale: Locale = "zh",
): string {
  if (!value) return notProvided(locale);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return notProvided(locale);
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(parsed));
}

export function displayPercent(
  rate: number | null | undefined,
  locale: Locale = "zh",
): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) {
    return notProvided(locale);
  }
  return `${(rate * 100).toFixed(2)}%`;
}

export function displayMinor(
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
  locale: Locale = "zh",
): string {
  if (
    amountMinor === null ||
    amountMinor === undefined ||
    !Number.isFinite(amountMinor)
  ) {
    return notProvided(locale);
  }
  const formatted = new Intl.NumberFormat(
    locale === "zh" ? "zh-TW" : "en-US",
  ).format(amountMinor);
  return `${formatted} ${currency ?? ""}`.trim();
}

export function displayBoolean(
  value: boolean | null | undefined,
  locale: Locale = "zh",
): string {
  if (value === null || value === undefined) return notProvided(locale);
  return value
    ? t("common.yes", undefined, locale)
    : t("common.no", undefined, locale);
}

export const EXPIRY_STATUS_LABELS: Record<string, string> = {
  expired: "已過期",
  expiring: "即將到期",
  valid: "有效",
  unavailable: NOT_PROVIDED,
};

const EXPIRY_STATUS_KEYS: Record<string, TranslationKey> = {
  expired: "expiry.expired",
  expiring: "expiry.expiring",
  valid: "expiry.valid",
  unavailable: "expiry.unavailable",
};

export function displayExpiryStatus(
  status: string | null | undefined,
  locale: Locale = "zh",
): string {
  if (!status || status.trim().length === 0) return notProvided(locale);
  const key = EXPIRY_STATUS_KEYS[status];
  return key ? t(key, undefined, locale) : status;
}

const ROLE_KEYS: Record<string, TranslationKey> = {
  agency_viewer: "role.agency_viewer",
  agency_exporter: "role.agency_exporter",
};

export function displayRoleCode(
  roleCode: string | null | undefined,
  locale: Locale = "zh",
): string {
  if (!roleCode || roleCode.trim().length === 0) return notProvided(locale);
  const key = ROLE_KEYS[roleCode];
  return key ? t(key, undefined, locale) : roleCode;
}

const LEGAL_HOLD_KEYS: Record<string, TranslationKey> = {
  active: "legalHold.active",
  none: "legalHold.none",
  unavailable: "legalHold.unavailable",
};

export function displayLegalHoldState(
  state: string | null | undefined,
  locale: Locale = "zh",
): string {
  if (!state || state.trim().length === 0) return notProvided(locale);
  const key = LEGAL_HOLD_KEYS[state];
  return key ? t(key, undefined, locale) : state;
}

const ROUTE_SOURCE_KEYS: Record<string, TranslationKey> = {
  driver_gps: "routeSource.driver_gps",
  mixed: "routeSource.mixed",
  pickup_dropoff_summary: "routeSource.pickup_dropoff_summary",
  provider_route: "routeSource.provider_route",
  unavailable: "routeSource.unavailable",
};

export function displayRouteSource(
  source: string | null | undefined,
  locale: Locale = "zh",
): string {
  if (!source || source.trim().length === 0) return notProvided(locale);
  const key = ROUTE_SOURCE_KEYS[source];
  return key ? t(key, undefined, locale) : source;
}

const PAYMENT_STATUS_KEYS: Record<string, TranslationKey> = {
  captured: "paymentStatus.captured",
  refunded: "paymentStatus.refunded",
  authorized: "paymentStatus.authorized",
  not_selected: "paymentStatus.not_selected",
  failed: "paymentStatus.failed",
  manual_recovery: "paymentStatus.manual_recovery",
  unknown: "paymentStatus.unknown",
};

export function displayPaymentStatus(
  status: string | null | undefined,
  locale: Locale = "zh",
): string {
  if (!status || status.trim().length === 0) return notProvided(locale);
  const key = PAYMENT_STATUS_KEYS[status];
  return key ? t(key, undefined, locale) : status;
}

const TOLL_SOURCE_KEYS: Record<string, TranslationKey> = {
  driver_proof: "tollSource.driver_proof",
  electronic_receipt: "tollSource.electronic_receipt",
  none: "tollSource.none",
  unavailable: "tollSource.unavailable",
};

export function displayTollSource(
  source: string | null | undefined,
  locale: Locale = "zh",
): string {
  if (!source || source.trim().length === 0) return notProvided(locale);
  const key = TOLL_SOURCE_KEYS[source];
  return key ? t(key, undefined, locale) : source;
}

const STATUS_CODE_KEYS: Record<string, TranslationKey> = {
  active: "status.active",
  suspended: "status.suspended",
  inactive: "status.inactive",
  retired: "status.retired",
  offboarded: "status.offboarded",
  pending_offboard: "status.pending_offboard",
  none: "status.none",
  completed: "status.completed",
  cancelled: "status.cancelled",
  no_show: "status.no_show",
  assigned: "status.assigned",
  pending: "status.pending",
  running: "status.running",
  failed: "status.failed",
  queued: "status.queued",
  expired: "expiry.expired",
  expiring: "expiry.expiring",
  valid: "expiry.valid",
  unavailable: "expiry.unavailable",
};

export function displayStatusCode(
  status: string | null | undefined,
  locale: Locale = "zh",
): string {
  if (!status || status.trim().length === 0) return notProvided(locale);
  const key = STATUS_CODE_KEYS[status];
  return key ? t(key, undefined, locale) : status;
}

export function errorMessage(
  error: { code: string | null; message: string | null } | null,
  status: number,
  locale: Locale = "zh",
): string {
  if (status === 403) return t("common.error.forbidden403", undefined, locale);
  if (status === 503) {
    return t("common.error.auditUnavailable503", undefined, locale);
  }
  return (
    error?.message ||
    error?.code ||
    t("common.error.queryFailed", { status }, locale)
  );
}
