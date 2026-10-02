import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  requireScopedInternalKey,
  validateInternalKey,
} from "../../apps/api/src/common/auth/internal-key.middleware";
import {
  evaluateInternalKey,
  INTERNAL_KEY_EXCEPTION_REGISTRY,
  validateExceptionMetadata,
  type InternalKeyExceptionMetadata,
} from "../../apps/api/src/common/auth/internal-key-exception-registry";

const ORIGINAL_ENV = { ...process.env };

// INTERNAL_KEY_EXCP_002 was retired 2026-10-02 by
// SEC-INTERNAL-KEY-WIF-MIGRATION-20260930: every caller migrated to the
// Google workload identity assertion, so no registry entry uses the
// x-drts-internal-key header anymore. The dual-key rotation/revocation
// mechanism itself is still generic, reusable code, so it keeps coverage
// here via this retired fixture passed explicitly to evaluateInternalKey,
// rather than depending on a live registry entry for that header.
const RETIRED_CONTROL_PLANE_PROXY: InternalKeyExceptionMetadata = {
  exceptionId: "INTERNAL_KEY_EXCP_002",
  owner: "control-plane-ops",
  purpose:
    "Legacy control-plane proxy serverless fallback key when GCP WIF identity assertion is absent in transitional environment",
  scope: ["* *", "POST partner/ingress/handoff", "POST auth/token"],
  ttl: "2026-10-31T23:59:59Z",
  expiresAt: "2026-10-31T23:59:59Z",
  networkBoundary: "control-plane-proxy-to-api",
  rotationCadence: "14d",
  usageSignal: "AUTH_LEGACY_INTERNAL_KEY_USED",
  removalDate: "2026-10-31",
  removalPlan: "Retired 2026-10-02 by SEC-INTERNAL-KEY-WIF-MIGRATION-20260930.",
  header: "x-drts-internal-key",
  envVar: "DRTS_INTERNAL_KEY",
  rotationEnvVar: "DRTS_INTERNAL_KEY_PREVIOUS",
  revokedKeysEnvVar: "DRTS_INTERNAL_KEY_REVOKED_KEYS",
  status: "active",
};

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
    expect(ids).toContain("INTERNAL_KEY_EXCP_001");
    // EXCP_003 retired 2026-09-01 to IAM-BG-001; EXCP_002 retired 2026-10-02
    // to WIF assertions; see internal-key-exceptions.md.
    expect(ids).not.toContain("INTERNAL_KEY_EXCP_003");
    expect(ids).not.toContain("INTERNAL_KEY_EXCP_002");

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

  it("validateInternalKey now rejects x-drts-internal-key outright (INTERNAL_KEY_EXCP_002 retired, no registry entry uses that header)", async () => {
    const primaryKey = "primary-key-32-chars-long-secret-key-1";
    process.env.DRTS_INTERNAL_KEY = primaryKey;

    let caught: ApiRequestError | null = null;
    try {
      await validateInternalKey(
        {
          method: "POST",
          originalUrl: "/api/partner/ingress/handoff",
          headers: {
            "x-drts-internal-key": primaryKey,
          },
        },
        primaryKey,
      );
    } catch (err) {
      caught = err as ApiRequestError;
    }

    expect(caught?.getStatus()).toBe(401);
    expect(caught?.code).toBe("INTERNAL_KEY_INVALID");
  });

  it("the dual-key rotation/revocation mechanism itself still works, exercised directly via evaluateInternalKey against a retired fixture", () => {
    const primaryKey = "primary-key-32-chars-long-secret-key-1";
    const previousKey = "previous-key-32-chars-long-secret-key-2";
    const revokedKey = "revoked-key-32-chars-long-secret-key-x";

    // 1. Primary key request succeeds
    expect(
      evaluateInternalKey(primaryKey, primaryKey, {
        headerName: "x-drts-internal-key",
        requestMethod: "POST",
        requestPath: "/api/partner/ingress/handoff",
        registry: [RETIRED_CONTROL_PLANE_PROXY],
      }).valid,
    ).toBe(true);

    // 2. Previous key request during rotation overlap succeeds
    expect(
      evaluateInternalKey(previousKey, primaryKey, {
        headerName: "x-drts-internal-key",
        requestMethod: "POST",
        requestPath: "/api/partner/ingress/handoff",
        previousKey,
        registry: [RETIRED_CONTROL_PLANE_PROXY],
      }).valid,
    ).toBe(true);

    // 3. Revoked key is rejected even though it matches neither primary nor
    // previous -- revocation is checked up front.
    const revokedResult = evaluateInternalKey(revokedKey, primaryKey, {
      headerName: "x-drts-internal-key",
      requestMethod: "POST",
      requestPath: "/api/partner/ingress/handoff",
      revokedKeys: [revokedKey, "some-other-revoked-key"],
      registry: [RETIRED_CONTROL_PLANE_PROXY],
    });
    expect(revokedResult.valid).toBe(false);
    expect(revokedResult.code).toBe("INTERNAL_KEY_REVOKED");
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
    const expiredFixture: InternalKeyExceptionMetadata = {
      ...RETIRED_CONTROL_PLANE_PROXY,
      expiresAt: "2025-01-01T00:00:00Z",
    };
    const key = "valid-key-format-32-chars-value-x";

    const result = evaluateInternalKey(key, key, {
      headerName: "x-drts-internal-key",
      requestMethod: "POST",
      requestPath: "/api/partner/ingress/handoff",
      registry: [expiredFixture],
    });

    expect(result.valid).toBe(false);
    expect(result.code).toBe("INTERNAL_KEY_EXPIRED");
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
