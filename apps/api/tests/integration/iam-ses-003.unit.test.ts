import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { maskDeviceSummary, maskIpAddress, maskSessionRecord } from "../../src/common/auth/session-masking.util";
import type { CanonicalIdentitySessionRecord } from "@drts/contracts";

describe("IAM-SES-003 Session Inventory, Logout, & Admin Revoke Unit & Masking Tests", () => {
  it("masks IPv4 and IPv6 addresses correctly into prefixes", () => {
    expect(maskIpAddress("192.168.1.150")).toBe("192.168.1.0/24");
    expect(maskIpAddress("10.0.8.42, 172.16.0.1")).toBe("10.0.8.0/24");
    expect(maskIpAddress("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8::/64");
    expect(maskIpAddress(null)).toBeNull();
    expect(maskIpAddress("")).toBeNull();
  });

  it("masks device summary exposing only ipPrefix, userAgentHash and deviceIdPreview", () => {
    const rawDevice = {
      ip: "192.168.1.150",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      browser: "Chrome",
      os: "macOS",
      deviceType: "desktop",
      deviceId: "device_id_abcdef123456789",
    };

    const masked = maskDeviceSummary(rawDevice);

    expect(masked.ipPrefix).toBe("192.168.1.0/24");
    expect(masked.userAgentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(masked.browser).toBe("Chrome");
    expect(masked.os).toBe("macOS");
    expect(masked.deviceType).toBe("desktop");
    expect(masked.deviceIdPreview).toBe("devi...6789");

    // Ensure raw IP and raw UserAgent are not present
    expect((masked as Record<string, unknown>).ip).toBeUndefined();
    expect((masked as Record<string, unknown>).userAgent).toBeUndefined();
    expect((masked as Record<string, unknown>).deviceId).toBeUndefined();
  });

  it("masks session record and highlights current session", () => {
    const now = new Date().toISOString();
    const session: CanonicalIdentitySessionRecord = {
      sessionId: "sid_test_123",
      sourceRef: "test_ref",
      principalId: "usr_principal_001",
      membershipId: "mem_001",
      realm: "tenant",
      actorType: "tenant_admin",
      actorId: "actor_001",
      tenantId: "tenant_alpha",
      status: "active",
      authTime: now,
      authMethods: ["oidc", "mfa"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {
        rawIp: "10.0.1.50",
        userAgent: "Mozilla/5.0",
      },
      riskSummary: {},
      createdAt: now,
      updatedAt: now,
    };

    const maskedRecord = maskSessionRecord(session, "sid_test_123");

    expect(maskedRecord.sessionId).toBe("sid_test_123");
    expect(maskedRecord.principalId).toBe("usr_principal_001");
    expect(maskedRecord.tenantId).toBe("tenant_alpha");
    expect(maskedRecord.isCurrentSession).toBe(true);
    expect(maskedRecord.deviceSummary.ipPrefix).toBe("10.0.1.0/24");
    expect(maskedRecord.deviceSummary.userAgentHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const otherRecord = maskSessionRecord(session, "sid_other_456");
    expect(otherRecord.isCurrentSession).toBe(false);
  });
});
