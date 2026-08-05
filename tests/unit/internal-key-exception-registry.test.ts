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
});
