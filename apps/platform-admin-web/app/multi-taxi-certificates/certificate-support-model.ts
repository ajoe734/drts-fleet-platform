export const CERTIFICATE_SUPPORT_STATES = [
  "available",
  "generating",
  "unavailable",
  "failed",
  "access_denied",
  "superseded",
] as const;

export type CertificateSupportState =
  (typeof CERTIFICATE_SUPPORT_STATES)[number];

export interface CertificateSupportView {
  certificateId: string;
  certificateNo: string;
  orderId: string;
  tripId: string | null;
  state: CertificateSupportState;
  certificateVersion: string | null;
  issuedAt: string;
  plateNo: string | null;
  pickupAt: string | null;
  dropoffAt: string | null;
  travelDurationSeconds: number | null;
  routeSummary: string | null;
  distanceMeters: number | null;
  fareMinor: number;
  tollMinor: number | null;
  currency: string;
  consumerServicePhone: string | null;
  authorityComplaintPhone: string | null;
  htmlUrl: string | null;
  pdfUrl: string | null;
  supersededByCertificateId: string | null;
  regeneration: {
    enabled: boolean;
    reasonCode: string | null;
  };
}

export interface CertificateRegenerationResult {
  certificate: CertificateSupportView;
  actionReceipt: {
    actionId: string;
    auditId: string;
    resourceType: string;
    resourceId: string;
    status: "accepted" | "completed" | "failed";
    message: string;
  };
}

export interface CertificateSupportList {
  items: CertificateSupportView[];
  total: number;
  query: string | null;
}

export type CertificateSupportErrorKind =
  | "access_denied"
  | "not_found"
  | "failed";

export function hasCertificateReadScope(scopes: readonly string[]) {
  return scopes.includes("foundation:read");
}

export function hasCertificateWriteScope(scopes: readonly string[]) {
  return scopes.includes("foundation:write");
}

export function parseCertificateSupportList(
  value: unknown,
): CertificateSupportList {
  if (
    !isObject(value) ||
    !Array.isArray(value.items) ||
    typeof value.total !== "number" ||
    (value.query !== null && typeof value.query !== "string")
  ) {
    throw new Error("CERTIFICATE_SUPPORT_LIST_INVALID");
  }
  const items = value.items.map(parseCertificateSupportView);
  if (value.total !== items.length) {
    throw new Error("CERTIFICATE_SUPPORT_TOTAL_INVALID");
  }
  return { items, total: value.total, query: value.query };
}

export function parseCertificateSupportView(
  value: unknown,
): CertificateSupportView {
  if (
    !isObject(value) ||
    typeof value.certificateId !== "string" ||
    typeof value.certificateNo !== "string" ||
    typeof value.orderId !== "string" ||
    !CERTIFICATE_SUPPORT_STATES.includes(
      value.state as CertificateSupportState,
    ) ||
    typeof value.issuedAt !== "string" ||
    typeof value.fareMinor !== "number" ||
    typeof value.currency !== "string" ||
    !isNullableString(value.tripId) ||
    !isNullableString(value.certificateVersion) ||
    !isNullableString(value.plateNo) ||
    !isNullableString(value.pickupAt) ||
    !isNullableString(value.dropoffAt) ||
    !isNullableNumber(value.travelDurationSeconds) ||
    !isNullableString(value.routeSummary) ||
    !isNullableNumber(value.distanceMeters) ||
    !isNullableNumber(value.tollMinor) ||
    !isNullableString(value.consumerServicePhone) ||
    !isNullableString(value.authorityComplaintPhone) ||
    !isNullableString(value.htmlUrl) ||
    !isNullableString(value.pdfUrl) ||
    !isNullableString(value.supersededByCertificateId) ||
    !isObject(value.regeneration) ||
    typeof value.regeneration.enabled !== "boolean" ||
    !isNullableString(value.regeneration.reasonCode) ||
    (value.regeneration.enabled && value.regeneration.reasonCode !== null)
  ) {
    throw new Error("CERTIFICATE_SUPPORT_VIEW_INVALID");
  }
  return structuredClone(value) as unknown as CertificateSupportView;
}

export function parseCertificateRegenerationResult(
  value: unknown,
): CertificateRegenerationResult {
  if (
    !isObject(value) ||
    !isObject(value.actionReceipt) ||
    typeof value.actionReceipt.actionId !== "string" ||
    typeof value.actionReceipt.auditId !== "string" ||
    typeof value.actionReceipt.resourceType !== "string" ||
    typeof value.actionReceipt.resourceId !== "string" ||
    !["accepted", "completed", "failed"].includes(
      String(value.actionReceipt.status),
    ) ||
    typeof value.actionReceipt.message !== "string"
  ) {
    throw new Error("CERTIFICATE_REGENERATION_RESULT_INVALID");
  }
  return {
    certificate: parseCertificateSupportView(value.certificate),
    actionReceipt: structuredClone(
      value.actionReceipt,
    ) as CertificateRegenerationResult["actionReceipt"],
  };
}

export function classifyCertificateSupportError(
  error: unknown,
): CertificateSupportErrorKind {
  const text = errorText(error);
  if (/403|forbidden|scope_denied|access.denied/i.test(text)) {
    return "access_denied";
  }
  if (/404|not_found|not found/i.test(text)) {
    return "not_found";
  }
  return "failed";
}

export function displayValue(value: string | number | null) {
  return value === null || value === "" ? "未取得" : String(value);
}

export function formatMoney(value: number | null, currency = "NTD") {
  if (value === null) return "未取得";
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function formatDuration(seconds: number | null) {
  if (seconds === null) return "未取得";
  return `${Math.floor(seconds / 60)} 分`;
}

export function formatDistance(meters: number | null) {
  if (meters === null) return "未取得";
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString("zh-TW", {
        maximumFractionDigits: 1,
      })} km`
    : `${meters.toLocaleString("zh-TW")} m`;
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}
