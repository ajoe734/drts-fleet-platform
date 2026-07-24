import type {
  MultiTaxiTripOperationalAdminView,
  MultiTaxiTripOperationalExportJobStatus,
  MultiTaxiTripOperationalRecordQuery,
} from "@drts/contracts";

export const RETENTION_FLOOR_DAYS = 730;
export const TAIPEI_TIME_ZONE = "Asia/Taipei";

export function normalizeRecordsScope(
  query: MultiTaxiTripOperationalRecordQuery,
): MultiTaxiTripOperationalRecordQuery {
  const normalized: MultiTaxiTripOperationalRecordQuery = {};
  const month = query.month?.trim();
  const search = query.q?.trim();

  if (month) {
    normalized.month = month;
  }
  if (search) {
    normalized.q = search;
  }
  if (query.legalHold && query.legalHold !== "all") {
    normalized.legalHold = query.legalHold;
  }
  return normalized;
}

export function buildRecordsQueryPath(
  query: MultiTaxiTripOperationalRecordQuery,
) {
  const scope = normalizeRecordsScope(query);
  const params = new URLSearchParams();
  if (scope.month) {
    params.set("month", scope.month);
  }
  if (scope.q) {
    params.set("q", scope.q);
  }
  if (scope.legalHold) {
    params.set("legalHold", scope.legalHold);
  }
  const suffix = params.toString();
  return `/api/platform-admin/multi-taxi-trip-records${suffix ? `?${suffix}` : ""}`;
}

export function isRetentionFloorMet(
  record: Pick<
    MultiTaxiTripOperationalAdminView,
    "generatedAt" | "retainUntil"
  >,
) {
  const generatedAt = Date.parse(record.generatedAt);
  const retainUntil = Date.parse(record.retainUntil);
  if (!Number.isFinite(generatedAt) || !Number.isFinite(retainUntil)) {
    return false;
  }
  return (
    retainUntil - generatedAt >= RETENTION_FLOOR_DAYS * 24 * 60 * 60 * 1000
  );
}

export function calculateRetentionCoverage(
  records: readonly MultiTaxiTripOperationalAdminView[],
) {
  const covered = records.filter(isRetentionFloorMet).length;
  return {
    covered,
    total: records.length,
    percent:
      records.length === 0 ? 100 : Math.round((covered / records.length) * 100),
  };
}

export function isExportTerminal(
  status: MultiTaxiTripOperationalExportJobStatus,
) {
  return status === "completed" || status === "failed";
}

export function createExportIdempotencyKey() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `p5-records-${globalThis.crypto.randomUUID()}`;
  }
  return `p5-records-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function requireControlledDownloadUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Controlled download URL must use HTTPS.");
  }
  return url.toString();
}

export function formatRecordDateTime(
  value: string | null,
  locale: "zh" | "en",
) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TAIPEI_TIME_ZONE,
    timeZoneName: "short",
  }).format(timestamp);
}

export function formatRecordMoney(amountMinor: number, locale: "zh" | "en") {
  return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export function formatRecordDistance(distanceMeters: number | null) {
  if (distanceMeters === null) {
    return null;
  }
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }
  return `${distanceMeters} m`;
}

export function formatRecordDuration(durationSeconds: number | null) {
  if (durationSeconds === null) {
    return null;
  }
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "apiMessage" in error &&
    typeof error.apiMessage === "string" &&
    error.apiMessage.trim()
  ) {
    return error.apiMessage;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function isPermissionError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    error.statusCode === 403,
  );
}
