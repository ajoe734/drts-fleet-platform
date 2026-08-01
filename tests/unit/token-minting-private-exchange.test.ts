import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";

const ORIGINAL_ENV = { ...process.env };

function getErrorResponse(error: unknown) {
  return (
    (
      error as {
        getResponse?: () => {
          error?: {
            code?: string;
            message?: string;
            details?: Record<string, unknown>;
          };
        };
      }
    ).getResponse?.().error ?? null
  );
}

function getHttpStatus(error: unknown): number | null {
  return (error as { getStatus?: () => number }).getStatus?.() ?? null;
}

describe("IAM-P0-002: Token minting private verified exchange", () => {
  let controller: AuthController;
  let jwtAuthService: JwtAuthService;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      JWT_SECRET: "test-secret-key-32-chars-long-security",
      JWT_AUDIENCE: "drts-api",
      JWT_ISSUER: "drts-auth-service",
      DRTS_INTERNAL_KEY: "internal-secret",
    };

    jwtAuthService = new JwtAuthService();
    controller = new AuthController(
      jwtAuthService,
      {} as never,
      {} as never,
    );
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("1. Caller privilege claims cannot affect minted tokens (escalation is denied)", () => {
    let thrown: unknown;
    try {
      controller.issueToken({
        headers: {
          "x-drts-internal-key": "internal-secret",
          "x-goog-authenticated-user-email": "ops@platform.drts",
          "x-roles": "platform_superadmin",
        },
      });
    } catch (error) {
      thrown = error;
    }

    const resp = getErrorResponse(thrown);
    expect(getHttpStatus(thrown)).toBe(403);
    expect(resp?.code).toBe("AUTH_PRIVILEGE_ESCALATION_DENIED");
  });

  it("2. Wrong audience, issuer, or realm is denied", () => {
    // Wrong audience
    let thrownAudience: unknown;
    try {
      controller.issueToken({
        headers: {
          "x-drts-internal-key": "internal-secret",
          "x-goog-authenticated-user-email": "admin@platform.drts",
          "x-target-audience": "wrong-audience",
        },
      });
    } catch (error) {
      thrownAudience = error;
    }
    const respAudience = getErrorResponse(thrownAudience);
    expect(getHttpStatus(thrownAudience)).toBe(403);
    expect(respAudience?.code).toBe("AUTH_AUDIENCE_MISMATCH");

    // Wrong issuer
    let thrownIssuer: unknown;
    try {
      controller.issueToken({
        headers: {
          "x-drts-internal-key": "internal-secret",
          "x-goog-authenticated-user-email": "admin@platform.drts",
          "x-target-issuer": "wrong-issuer",
        },
      });
    } catch (error) {
      thrownIssuer = error;
    }
    const respIssuer = getErrorResponse(thrownIssuer);
    expect(getHttpStatus(thrownIssuer)).toBe(403);
    expect(respIssuer?.code).toBe("AUTH_ISSUER_MISMATCH");

    // Wrong realm
    let thrownRealm: unknown;
    try {
      controller.issueToken({
        headers: {
          "x-drts-internal-key": "internal-secret",
          "x-goog-authenticated-user-email": "admin@platform.drts",
          "x-realm": "tenant",
        },
      });
    } catch (error) {
      thrownRealm = error;
    }
    const respRealm = getErrorResponse(thrownRealm);
    expect(getHttpStatus(thrownRealm)).toBe(403);
    expect(respRealm?.code).toBe("AUTH_REALM_DENIED");
  });

  it("3. Inactive principals cannot mint", () => {
    let thrown: unknown;
    try {
      controller.issueToken({
        headers: {
          "x-drts-internal-key": "internal-secret",
          "x-goog-authenticated-user-email": "admin@platform.drts",
          "x-principal-status": "suspended",
        },
      });
    } catch (error) {
      thrown = error;
    }

    const resp = getErrorResponse(thrown);
    expect(getHttpStatus(thrown)).toBe(403);
    expect(resp?.code).toBe("ACCOUNT_NOT_ACTIVE");
  });

  it("4. Resolved token boundaries match durable memberships", () => {
    // Platform admin verified exchange
    const platformRes = controller.issueToken({
      headers: {
        "x-drts-internal-key": "internal-secret",
        "x-goog-authenticated-user-email": "admin@platform.drts",
      },
    });

    expect(platformRes.token).toBeDefined();
    const platformPayload = jwtAuthService.verify(platformRes.token);
    expect(platformPayload?.sub).toBe("pa-admin-001");
    expect(platformPayload?.realm).toBe("platform");
    expect(platformPayload?.roles).toContain("superadmin");

    // Ops user verified exchange
    const opsRes = controller.issueToken({
      headers: {
        "x-drts-internal-key": "internal-secret",
        "x-goog-authenticated-user-email": "ops@platform.drts",
      },
    });

    expect(opsRes.token).toBeDefined();
    const opsPayload = jwtAuthService.verify(opsRes.token);
    expect(opsPayload?.sub).toBe("pa-operator-001");
    expect(opsPayload?.realm).toBe("ops");
    expect(opsPayload?.roles).toContain("ops_user");

    // Workload service verified exchange
    const workloadRes = controller.issueToken({
      headers: {
        "x-drts-internal-key": "internal-secret",
        "x-drts-workload-subject": "service-dispatch-v1",
      },
    });

    expect(workloadRes.token).toBeDefined();
    const workloadPayload = jwtAuthService.verify(workloadRes.token);
    expect(workloadPayload?.sub).toBe("service-dispatch-v1");
    expect(workloadPayload?.realm).toBe("system");
    expect(workloadPayload?.roles).toContain("system_service");
  });

  it("5. Escalation and direct-path tests pass", () => {
    // Direct path without proof fails
    let thrownNoProof: unknown;
    try {
      controller.issueToken({
        headers: {
          "x-drts-internal-key": "internal-secret",
        },
      });
    } catch (error) {
      thrownNoProof = error;
    }
    const respNoProof = getErrorResponse(thrownNoProof);
    expect(getHttpStatus(thrownNoProof)).toBe(400);
    expect(respNoProof?.code).toBe("IDENTITY_REQUIRED");

    // Valid direct path with workload proof passes
    const validRes = controller.issueToken({
      headers: {
        "x-drts-internal-key": "internal-secret",
        "x-drts-workload-subject": "billing-service",
      },
    });
    expect(validRes.token).toBeDefined();
    expect(validRes.expiresIn).toBe("1h");
  });
});
