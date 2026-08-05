import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(INTERNAL_KEY_EXCEPTION_REGISTRY.length).toBe(3);

    const ids = INTERNAL_KEY_EXCEPTION_REGISTRY.map((e) => e.exceptionId);
    expect(ids).toContain("INTERNAL_KEY_EXCP_001");
    expect(ids).toContain("INTERNAL_KEY_EXCP_002");
    expect(ids).toContain("INTERNAL_KEY_EXCP_003");

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

  it("allows dual-key rotation overlap where both active primary and previous keys succeed", () => {
    const primaryKey = "primary-key-32-chars-long-secret-key-1";
    const previousKey = "previous-key-32-chars-long-secret-key-2";

    process.env.DRTS_INTERNAL_KEY = primaryKey;
    process.env.DRTS_INTERNAL_KEY_PREVIOUS = previousKey;

    // 1. Primary key request succeeds
    expect(() =>
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
    ).not.toThrow();

    // 2. Previous key request during rotation overlap succeeds
    expect(() =>
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
    ).not.toThrow();
  });

  it("rejects revoked key even during rotation window with generic 401 INTERNAL_KEY_INVALID and no leaked metadata", () => {
    const primaryKey = "primary-key-32-chars-long-secret-key-1";
    const revokedKey = "revoked-key-32-chars-long-secret-key-x";

    process.env.DRTS_INTERNAL_KEY = primaryKey;
    process.env.DRTS_INTERNAL_KEY_REVOKED_KEYS = `${revokedKey},some-other-revoked-key`;

    let caught: ApiRequestError | null = null;
    try {
      validateInternalKey(
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

  it("supports rotation overlap and revocation on scoped internal keys", () => {
    const primaryScopedKey = "referral-primary-key-32-chars-value";
    const previousScopedKey = "referral-previous-key-32-chars-value";
    const revokedScopedKey = "referral-revoked-key-32-chars-value";

    process.env.DRTS_REFERRAL_EMBED_HANDOFF_KEY = primaryScopedKey;
    process.env.DRTS_REFERRAL_EMBED_HANDOFF_KEY_PREVIOUS = previousScopedKey;
    process.env.DRTS_REFERRAL_EMBED_HANDOFF_KEY_REVOKED_KEYS = revokedScopedKey;

    const reqOptions = {
      header: "x-drts-referral-handoff-key",
      requiredEnv: "DRTS_REFERRAL_EMBED_HANDOFF_KEY",
    };

    // Primary succeeds
    expect(() =>
      requireScopedInternalKey(
        {
          method: "POST",
          originalUrl: "/api/partner/ingress/referral-embed-handoff",
          headers: {
            "x-drts-referral-handoff-key": primaryScopedKey,
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
          originalUrl: "/api/partner/ingress/referral-embed-handoff",
          headers: {
            "x-drts-referral-handoff-key": previousScopedKey,
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
          originalUrl: "/api/partner/ingress/referral-embed-handoff",
          headers: {
            "x-drts-referral-handoff-key": revokedScopedKey,
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

  it("fails closed when an internal key exception is expired with generic 401 INTERNAL_KEY_INVALID", () => {
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
        validateInternalKey(
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
