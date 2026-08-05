import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  evaluateInternalKey,
  INTERNAL_KEY_EXCEPTION_REGISTRY,
  isExceptionExpired,
  validateExceptionMetadata,
  type InternalKeyExceptionMetadata,
} from "../../apps/api/src/common/auth/internal-key-exception-registry";

describe("InternalKeyExceptionRegistry (IAM-SVC-002)", () => {
  it("every registered production exception has complete metadata", () => {
    expect(INTERNAL_KEY_EXCEPTION_REGISTRY.length).toBeGreaterThan(0);

    for (const exception of INTERNAL_KEY_EXCEPTION_REGISTRY) {
      expect(() => validateExceptionMetadata(exception)).not.toThrow();
      expect(exception.exceptionId).toMatch(/^INTERNAL_KEY_EXCP_\d+$/);
      expect(exception.owner).toBeTruthy();
      expect(exception.purpose).toBeTruthy();
      expect(exception.scope.length).toBeGreaterThan(0);
      expect(exception.ttl).toBeTruthy();
      expect(exception.expiresAt).toBeTruthy();
      expect(exception.networkBoundary).toBeTruthy();
      expect(exception.rotationCadence).toBeTruthy();
      expect(exception.usageSignal).toBeTruthy();
      expect(exception.removalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(exception.removalPlan).toBeTruthy();
      expect(exception.header).toBeTruthy();
      expect(exception.envVar).toBeTruthy();
    }
  });

  it("throws metadata incomplete error when required field is missing or empty", () => {
    const incomplete = {
      ...INTERNAL_KEY_EXCEPTION_REGISTRY[0],
      owner: "",
    } as InternalKeyExceptionMetadata;

    let caughtError: unknown = null;
    try {
      validateExceptionMetadata(incomplete);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ApiRequestError);
    expect((caughtError as ApiRequestError).code).toBe(
      "INTERNAL_KEY_EXCEPTION_METADATA_INCOMPLETE",
    );
  });

  it("identifies expired exceptions correctly", () => {
    const activeException = INTERNAL_KEY_EXCEPTION_REGISTRY[0]!;
    expect(
      isExceptionExpired(activeException, new Date("2026-08-01T00:00:00Z")),
    ).toBe(false);

    const expiredException: InternalKeyExceptionMetadata = {
      ...activeException,
      expiresAt: "2026-01-01T00:00:00Z",
    };
    expect(
      isExceptionExpired(expiredException, new Date("2026-08-01T00:00:00Z")),
    ).toBe(true);
  });

  it("evaluates active primary key as valid", () => {
    const result = evaluateInternalKey(
      "secret-key-1234567890123456789012345",
      "secret-key-1234567890123456789012345",
      {
        headerName: "x-drts-internal-key",
      },
    );

    expect(result.valid).toBe(true);
    expect(result.keyState).toBe("active");
    expect(result.exception?.exceptionId).toBe("INTERNAL_KEY_EXCP_002");
  });

  it("evaluates rotated previous key as valid during rotation overlap", () => {
    const result = evaluateInternalKey(
      "old-rotated-key-123456789012345678",
      "new-primary-key-123456789012345678",
      {
        headerName: "x-drts-internal-key",
        previousKey: "old-rotated-key-123456789012345678",
      },
    );

    expect(result.valid).toBe(true);
    expect(result.keyState).toBe("rotated_previous");
  });

  it("rejects revoked key even if it matches primary or previous key", () => {
    const result = evaluateInternalKey(
      "revoked-key-12345678901234567890123",
      "revoked-key-12345678901234567890123",
      {
        headerName: "x-drts-internal-key",
        revokedKeys: ["revoked-key-12345678901234567890123"],
      },
    );

    expect(result.valid).toBe(false);
    expect(result.code).toBe("INTERNAL_KEY_REVOKED");
    expect(result.keyState).toBe("revoked");
  });

  it("rejects request with undocumented header", () => {
    const result = evaluateInternalKey(
      "any-key-value-123456789012345678901",
      "any-key-value-123456789012345678901",
      {
        headerName: "x-drts-undocumented-header",
      },
    );

    expect(result.valid).toBe(false);
    expect(result.code).toBe("INTERNAL_KEY_UNDOCUMENTED");
    expect(result.keyState).toBe("undocumented");
  });

  it("rejects request when exception has expired", () => {
    const expiredRegistry: InternalKeyExceptionMetadata[] = [
      {
        ...INTERNAL_KEY_EXCEPTION_REGISTRY[0]!,
        expiresAt: "2025-12-31T23:59:59Z",
      },
    ];

    const result = evaluateInternalKey(
      "key-value-1234567890123456789012345",
      "key-value-1234567890123456789012345",
      {
        headerName: "x-drts-referral-handoff-key",
        now: new Date("2026-08-01T00:00:00Z"),
        registry: expiredRegistry,
      },
    );

    expect(result.valid).toBe(false);
    expect(result.code).toBe("INTERNAL_KEY_EXPIRED");
    expect(result.keyState).toBe("expired");
  });

  it("enforces scope metadata and matches EXCP_003 correctly on ops and health routes", () => {
    // EXCP_003 matches GET health or POST ops/*
    const resultHealth = evaluateInternalKey(
      "secret-key-1234567890123456789012345",
      "secret-key-1234567890123456789012345",
      {
        headerName: "x-drts-internal-key",
        requestMethod: "GET",
        requestPath: "/health",
      },
    );
    expect(resultHealth.valid).toBe(true);
    expect(resultHealth.exception?.exceptionId).toBe("INTERNAL_KEY_EXCP_003");

    const resultOps = evaluateInternalKey(
      "secret-key-1234567890123456789012345",
      "secret-key-1234567890123456789012345",
      {
        headerName: "x-drts-internal-key",
        requestMethod: "POST",
        requestPath: "/api/ops/breakglass/activate",
      },
    );
    expect(resultOps.valid).toBe(true);
    expect(resultOps.exception?.exceptionId).toBe("INTERNAL_KEY_EXCP_003");

    // EXCP_002 matches POST partner/ingress/handoff or POST auth/token
    const resultHandoff = evaluateInternalKey(
      "secret-key-1234567890123456789012345",
      "secret-key-1234567890123456789012345",
      {
        headerName: "x-drts-internal-key",
        requestMethod: "POST",
        requestPath: "/api/partner/ingress/handoff",
      },
    );
    expect(resultHandoff.valid).toBe(true);
    expect(resultHandoff.exception?.exceptionId).toBe("INTERNAL_KEY_EXCP_002");

    // Out of scope route returns INTERNAL_KEY_UNDOCUMENTED
    const resultUnscoped = evaluateInternalKey(
      "secret-key-1234567890123456789012345",
      "secret-key-1234567890123456789012345",
      {
        headerName: "x-drts-internal-key",
        requestMethod: "DELETE",
        requestPath: "/api/users/123",
      },
    );
    expect(resultUnscoped.valid).toBe(false);
    expect(resultUnscoped.code).toBe("INTERNAL_KEY_UNDOCUMENTED");
    expect(resultUnscoped.keyState).toBe("undocumented");
  });

  it("triggers EXCP_003 expiration after 2026-08-31", () => {
    const resultPostExpiry = evaluateInternalKey(
      "secret-key-1234567890123456789012345",
      "secret-key-1234567890123456789012345",
      {
        headerName: "x-drts-internal-key",
        requestMethod: "POST",
        requestPath: "/api/ops/test",
        now: new Date("2026-09-01T00:00:00Z"),
      },
    );
    expect(resultPostExpiry.valid).toBe(false);
    expect(resultPostExpiry.code).toBe("INTERNAL_KEY_EXPIRED");
    expect(resultPostExpiry.exception?.exceptionId).toBe("INTERNAL_KEY_EXCP_003");
  });

  it("enforces expiration on rotation overlap key when previousKeyExpiresAt is passed", () => {
    const validOverlap = evaluateInternalKey(
      "old-key-12345678901234567890",
      "new-key-12345678901234567890",
      {
        headerName: "x-drts-internal-key",
        requestMethod: "POST",
        requestPath: "/api/auth/token",
        previousKey: "old-key-12345678901234567890",
        previousKeyExpiresAt: "2026-08-10T00:00:00Z",
        now: new Date("2026-08-05T00:00:00Z"),
      },
    );
    expect(validOverlap.valid).toBe(true);
    expect(validOverlap.keyState).toBe("rotated_previous");

    const expiredOverlap = evaluateInternalKey(
      "old-key-12345678901234567890",
      "new-key-12345678901234567890",
      {
        headerName: "x-drts-internal-key",
        requestMethod: "POST",
        requestPath: "/api/auth/token",
        previousKey: "old-key-12345678901234567890",
        previousKeyExpiresAt: "2026-08-01T00:00:00Z",
        now: new Date("2026-08-05T00:00:00Z"),
      },
    );
    expect(expiredOverlap.valid).toBe(false);
    expect(expiredOverlap.code).toBe("INTERNAL_KEY_EXPIRED");
    expect(expiredOverlap.keyState).toBe("expired");
  });
});
