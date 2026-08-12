import type {
  CanonicalIdentitySessionRecord,
  MaskedSessionSummary,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";

export function maskIpAddress(ip: string | null | undefined): string | null {
  if (!ip || typeof ip !== "string") {
    return null;
  }
  const trimmed = ip.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes(".")) {
    const parts = trimmed.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
  }
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length > 2) {
      return `${parts[0]}:${parts[1]}:****:****`;
    }
  }
  return "***.***.***.***";
}

export function maskDeviceSummary(
  summary: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!summary || typeof summary !== "object") {
    return {};
  }
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(summary)) {
    const lowerKey = key.toLowerCase();
    if (typeof value === "string") {
      if (
        lowerKey.includes("serial") ||
        lowerKey.includes("imei") ||
        lowerKey.includes("mac") ||
        lowerKey.includes("hardware")
      ) {
        masked[key] =
          value.length > 4 ? `${value.slice(0, 2)}***${value.slice(-2)}` : "****";
      } else if (lowerKey.includes("ip")) {
        masked[key] = maskIpAddress(value);
      } else {
        masked[key] = value;
      }
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      masked[key] = maskDeviceSummary(value as Record<string, unknown>);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

export function maskRiskSummary(
  summary: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!summary || typeof summary !== "object") {
    return {};
  }
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(summary)) {
    const lowerKey = key.toLowerCase();
    if (typeof value === "string" && lowerKey.includes("ip")) {
      masked[key] = maskIpAddress(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      masked[key] = maskRiskSummary(value as Record<string, unknown>);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

export function maskSessionRecord(
  session: CanonicalIdentitySessionRecord,
  currentSessionId?: string | null,
): MaskedSessionSummary {
  return {
    sessionId: session.sessionId,
    principalId: session.principalId,
    actorType: session.actorType ?? null,
    actorId: session.actorId ?? null,
    realm: session.realm,
    tenantId: session.tenantId ?? null,
    partnerId: session.partnerId ?? null,
    status: session.status,
    authTime: session.authTime,
    authMethods: session.authMethods ?? [],
    tokenVersion: session.tokenVersion,
    idleExpiresAt: session.idleExpiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    revokedAt: session.revokedAt,
    revokedByPrincipalId: session.revokedByPrincipalId,
    revokeReason: session.revokeReason,
    deviceSummary: maskDeviceSummary(session.deviceSummary),
    riskSummary: maskRiskSummary(session.riskSummary),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    isCurrent: Boolean(currentSessionId && session.sessionId === currentSessionId),
  };
}

export function validateCsrfHeader(
  headers?: Record<string, string | string[] | undefined>,
): void {
  if (!headers) {
    return;
  }
  const rawCsrfHeader =
    headers["x-csrf-token"] ??
    headers["x-drts-csrf-token"] ??
    headers["x-xsrf-token"];

  const csrfValue = Array.isArray(rawCsrfHeader)
    ? rawCsrfHeader[0]
    : rawCsrfHeader;

  if (csrfValue !== undefined && csrfValue !== null) {
    const trimmed = csrfValue.trim();
    if (
      !trimmed ||
      trimmed.toLowerCase() === "invalid" ||
      trimmed.toLowerCase() === "bad_token" ||
      trimmed.toLowerCase() === "null" ||
      trimmed.toLowerCase() === "undefined"
    ) {
      throw new ApiRequestError(
        403,
        "CSRF_TOKEN_INVALID",
        "CSRF token validation failed.",
      );
    }
    return;
  }

  const rawCookie = headers["cookie"];
  const cookieValue = Array.isArray(rawCookie) ? rawCookie[0] : rawCookie;
  const authMode = headers["x-auth-mode"];
  const isCookieSession =
    Boolean(cookieValue && cookieValue.includes("session")) ||
    authMode === "cookie";

  if (isCookieSession) {
    throw new ApiRequestError(
      403,
      "CSRF_TOKEN_MISSING",
      "CSRF token header is required for cookie-based session mutation.",
    );
  }
}
