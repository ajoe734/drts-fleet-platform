import { createHash } from "node:crypto";
import type {
  CanonicalIdentitySessionRecord,
  MaskedDeviceSummary,
  MaskedIdentitySessionRecord,
} from "@drts/contracts";

export function maskIpAddress(ip: string | null | undefined): string | null {
  if (!ip || typeof ip !== "string") {
    return null;
  }
  const trimmed = ip.trim();
  if (!trimmed) {
    return null;
  }
  const first = trimmed.split(",")[0]?.trim() ?? trimmed;

  if (first.includes(".")) {
    const segments = first.split(".");
    if (segments.length === 4) {
      return `${segments[0]}.${segments[1]}.${segments[2]}.0/24`;
    }
  }
  if (first.includes(":")) {
    const parts = first.split(":");
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}::/64`;
    }
  }
  return "masked-ip";
}

export function maskDeviceSummary(
  deviceSummary: Record<string, unknown> | null | undefined,
): MaskedDeviceSummary {
  if (!deviceSummary || typeof deviceSummary !== "object") {
    return {};
  }
  const masked: MaskedDeviceSummary = {};

  const rawIp =
    (deviceSummary.ip as string | undefined) ||
    (deviceSummary.rawIp as string | undefined) ||
    (deviceSummary.remoteAddress as string | undefined) ||
    (deviceSummary.clientIp as string | undefined) ||
    (deviceSummary.ipPrefix as string | undefined);

  if (rawIp) {
    const maskedIp = maskIpAddress(rawIp);
    if (maskedIp) {
      masked.ipPrefix = maskedIp;
    }
  }

  const rawUserAgent = deviceSummary.userAgent as string | undefined;
  if (rawUserAgent) {
    masked.userAgentHash = `sha256:${createHash("sha256").update(rawUserAgent.trim()).digest("hex")}`;
  } else if (typeof deviceSummary.userAgentHash === "string") {
    masked.userAgentHash = deviceSummary.userAgentHash;
  }

  if (typeof deviceSummary.browser === "string") {
    masked.browser = deviceSummary.browser;
  }
  if (typeof deviceSummary.os === "string") {
    masked.os = deviceSummary.os;
  }
  if (typeof deviceSummary.deviceType === "string") {
    masked.deviceType = deviceSummary.deviceType;
  }

  const rawDeviceId = deviceSummary.deviceId as string | undefined;
  if (rawDeviceId) {
    masked.deviceIdPreview =
      rawDeviceId.length > 8
        ? `${rawDeviceId.slice(0, 4)}...${rawDeviceId.slice(-4)}`
        : rawDeviceId;
  }

  return masked;
}

export function maskSessionRecord(
  session: CanonicalIdentitySessionRecord,
  currentSessionId?: string | null,
): MaskedIdentitySessionRecord {
  return {
    sessionId: session.sessionId,
    sourceRef: session.sourceRef ?? null,
    principalId: session.principalId,
    membershipId: session.membershipId ?? null,
    realm: session.realm,
    actorType: session.actorType ?? null,
    actorId: session.actorId ?? null,
    tenantId: session.tenantId ?? null,
    partnerId: session.partnerId ?? null,
    status: session.status,
    authTime: session.authTime,
    authMethods: session.authMethods || [],
    tokenVersion: session.tokenVersion,
    idleExpiresAt: session.idleExpiresAt ?? null,
    absoluteExpiresAt: session.absoluteExpiresAt,
    revokedAt: session.revokedAt ?? null,
    revokedByPrincipalId: session.revokedByPrincipalId ?? null,
    revokeReason: session.revokeReason ?? null,
    deviceSummary: maskDeviceSummary(session.deviceSummary),
    riskSummary: session.riskSummary || {},
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    isCurrentSession: Boolean(
      currentSessionId && session.sessionId === currentSessionId,
    ),
  };
}
