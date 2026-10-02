import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  requireScopedInternalKey,
  validateInternalKey,
} from "../../apps/api/src/common/auth/internal-key.middleware";
import {
  INTERNAL_KEY_EXCEPTION_REGISTRY,
  validateExceptionMetadata,
} from "../../apps/api/src/common/auth/internal-key-exception-registry";

const ORIGINAL_ENV = { ...process.env };

describe("Internal Key Exception Rotation & Retirement Integration (IAM-SVC-002)", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.APP_ENV = "staging";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("verifies every production internal-key exception has complete metadata", () => {
    expect(INTERNAL_KEY_EXCEPTION_REGISTRY.length).toBe(1);

    const ids = INTERNAL_KEY_EXCEPTION_REGISTRY.map((e) => e.exceptionId);
    // EXCP_001 retired 2026-10-02 to WIF (SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002); see internal-key-exceptions.md.
    expect(ids).not.toContain("INTERNAL_KEY_EXCP_001");
    expect(ids).toContain("INTERNAL_KEY_EXCP_002");
    // EXCP_003 retired 2026-09-01 to IAM-BG-001; see internal-key-exceptions.md.
    expect(ids).not.toContain("INTERNAL_KEY_EXCP_003");

    for (const excp of INTERNAL_KEY_EXCEPTION_REGISTRY) {
      expect(() => validateExceptionMetadata(excp)).not.toThrow();
      expect(excp.owner).toBeTruthy();
      expect(excp.purpose).toBeTruthy();
      expect(excp.scope.length).toBeGreaterThan(0);
      expect(excp.networkBoundary).toBeTruthy();
      expect(excp.removalDate).toBeTruthy();
      expect(excp.removalPlan).toBeTruthy();
    }
  });

  it("allows dual-key rotation overlap where both active primary and previous keys succeed", async () => {
    const primaryKey = "primary-key-32-chars-long-secret-key-1";
    const previousKey = "previous-key-32-chars-long-secret-key-2";

    process.env.DRTS_INTERNAL_KEY = primaryKey;
    process.env.DRTS_INTERNAL_KEY_PREVIOUS = previousKey;

    // 1. Primary key request succeeds
    await expect(
      validateInternalKey(
        {
          method: "POST",
          originalUrl: "/api/partner/ingress/handoff",
          headers: {
            "x-drts-internal-key": primaryKey,
          },
        },
        primaryKey,
      ),
    ).resolves.not.toThrow();

    // 2. Previous key request during rotation overlap succeeds
    await expect(
      validateInternalKey(
        {
          method: "POST",
          originalUrl: "/api/partner/ingress/handoff",
          headers: {
            "x-drts-internal-key": previousKey,
          },
        },
        primaryKey,
      ),
    ).resolves.not.toThrow();
  });

  it("rejects revoked key even during rotation window with generic 401 INTERNAL_KEY_INVALID and no leaked metadata", async () => {
    const primaryKey = "primary-key-32-chars-long-secret-key-1";
    const revokedKey = "revoked-key-32-chars-long-secret-key-x";

    process.env.DRTS_INTERNAL_KEY = primaryKey;
    process.env.DRTS_INTERNAL_KEY_REVOKED_KEYS = `${revokedKey},some-other-revoked-key`;

    let caught: ApiRequestError | null = null;
    try {
      await validateInternalKey(
        {
          method: "POST",
          originalUrl: "/api/partner/ingress/handoff",
          headers: {
            "x-drts-internal-key": revokedKey,
          },
        },
        primaryKey,
      );
    } catch (err) {
      caught = err as ApiRequestError;
    }

    expect(caught?.getStatus()).toBe(401);
    expect(caught?.code).toBe("INTERNAL_KEY_INVALID");
    const responsePayload = caught?.getResponse() as Record<string, unknown>;
    expect(responsePayload).not.toHaveProperty("exceptionId");
    expect(responsePayload).not.toHaveProperty("keyState");
  });

  // INTERNAL_KEY_EXCP_001 (x-drts-referral-handoff-key) was retired and
  // removed from INTERNAL_KEY_EXCEPTION_REGISTRY
  // (SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002): the referral embed
  // handoff routes now verify a Google workload identity assertion instead
  // (apps/api/tests/unit/tenant-partner.controller.test.ts), and
  // requireScopedInternalKey would reject that header as undocumented on any
  // route. This test exercises requireScopedInternalKey's generic
  // rotation/revocation mechanism via EXCP_002's still-active
  // x-drts-internal-key exception instead.
  it("supports rotation overlap and revocation on scoped internal keys", () => {
    const primaryScopedKey = "general-primary-key-32-chars-value";
    const previousScopedKey = "general-previous-key-32-chars-value";
    const revokedScopedKey = "general-revoked-key-32-chars-value";

    process.env.DRTS_INTERNAL_KEY = primaryScopedKey;
    process.env.DRTS_INTERNAL_KEY_PREVIOUS = previousScopedKey;
    process.env.DRTS_INTERNAL_KEY_REVOKED_KEYS = revokedScopedKey;

    const reqOptions = {
      header: "x-drts-internal-key",
      requiredEnv: "DRTS_INTERNAL_KEY",
    };

    // Primary succeeds
    expect(() =>
      requireScopedInternalKey(
        {
          method: "POST",
          originalUrl: "/api/partner/ingress/handoff",
          headers: {
            "x-drts-internal-key": primaryScopedKey,
          },
        },
        primaryScopedKey,
        reqOptions,
      ),
    ).not.toThrow();

    // Previous succeeds
    expect(() =>
      requireScopedInternalKey(
        {
          method: "POST",
          originalUrl: "/api/partner/ingress/handoff",
          headers: {
            "x-drts-internal-key": previousScopedKey,
          },
        },
        primaryScopedKey,
        reqOptions,
      ),
    ).not.toThrow();

    // Revoked fails
    let caught: ApiRequestError | null = null;
    try {
      requireScopedInternalKey(
        {
          method: "POST",
          originalUrl: "/api/partner/ingress/handoff",
          headers: {
            "x-drts-internal-key": revokedScopedKey,
          },
        },
        primaryScopedKey,
        reqOptions,
      );
    } catch (err) {
      caught = err as ApiRequestError;
    }

    expect(caught?.getStatus()).toBe(401);
    expect(caught?.code).toBe("INTERNAL_KEY_INVALID");
  });

  it("fails closed when an internal key exception is expired with generic 401 INTERNAL_KEY_INVALID", async () => {
    const targetExcp = INTERNAL_KEY_EXCEPTION_REGISTRY.find(
      (e) => e.exceptionId === "INTERNAL_KEY_EXCP_002",
    )!;

    const originalExpiresAt = targetExcp.expiresAt;
    try {
      // Force exception expiration
      targetExcp.expiresAt = "2025-01-01T00:00:00Z";

      const key = "valid-key-format-32-chars-value-x";
      process.env.DRTS_INTERNAL_KEY = key;

      let caught: ApiRequestError | null = null;
      try {
        await validateInternalKey(
          {
            method: "POST",
            originalUrl: "/api/partner/ingress/handoff",
            headers: {
              "x-drts-internal-key": key,
            },
          },
          key,
        );
      } catch (err) {
        caught = err as ApiRequestError;
      }

      expect(caught?.getStatus()).toBe(401);
      expect(caught?.code).toBe("INTERNAL_KEY_INVALID");
    } finally {
      targetExcp.expiresAt = originalExpiresAt;
    }
  });

  it("fails closed when an undocumented internal key header is used", () => {
    const key = "some-key-value-32-chars-minimum-x";
    let caught: ApiRequestError | null = null;

    try {
      requireScopedInternalKey(
        {
          method: "POST",
          originalUrl: "/api/some/custom/path",
          headers: {
            "x-drts-undocumented-header": key,
          },
        },
        key,
        {
          header: "x-drts-undocumented-header",
          requiredEnv: "DRTS_UNDOCUMENTED_KEY",
        },
      );
    } catch (err) {
      caught = err as ApiRequestError;
    }

    expect(caught?.getStatus()).toBe(401);
    expect(caught?.code).toBe("INTERNAL_KEY_INVALID");
  });
});
