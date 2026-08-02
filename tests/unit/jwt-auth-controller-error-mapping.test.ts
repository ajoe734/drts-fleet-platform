import { afterEach, describe, expect, it, vi } from "vitest";

import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { JwtSessionClaimsService } from "../../apps/api/src/modules/auth/jwt-session-claims.service";
import { TenantPartnerController } from "../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import type { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const ORIGINAL_ENV = { ...process.env };

function getErrorEnvelope(error: unknown) {
  return (
    (
      error as {
        getResponse?: () => {
          error?: {
            code?: string;
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

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("JWT controller error mapping", () => {
  it("maps AuthController signing key gaps to JWT_NOT_CONFIGURED", async () => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;

    const controller = new AuthController(
      new JwtAuthService(),
      {} as never,
      {} as never,
      new JwtSessionClaimsService(),
    );

    let thrown: unknown;
    try {
      await controller.issueToken({
        headers: {
          "x-actor-type": "tenant_admin",
          "x-actor-id": "tenant-user-001",
          "x-realm": "tenant",
          "x-tenant-id": "tenant-alpha",
        },
        method: "POST",
        originalUrl: "/api/auth/token",
      });
    } catch (error) {
      thrown = error;
    }

    const envelope = getErrorEnvelope(thrown);
    expect(getHttpStatus(thrown)).toBe(503);
    expect(envelope?.code).toBe("JWT_NOT_CONFIGURED");
    expect(envelope?.details).toMatchObject({
      requiredEnv: "JWT_PRIVATE_KEY or JWT_SECRET",
    });
  });

  it("maps TenantPartnerController signing key gaps to JWT_NOT_CONFIGURED", async () => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;

    const tenantPartnerService = {
      issuePartnerIngressHandoff: vi.fn(async () => ({
        identity: {
          authMode: "jwt_bearer",
          actorType: "referral_passenger",
          actorId: "passenger-123",
          realm: "partner",
          tenantId: "tenant-alpha",
          partnerId: "partner-alpha",
          partnerProgramId: null,
          partnerEntrySlug: "entry-alpha",
          roleFamilies: ["partner"],
          roles: ["referral_passenger"],
          scopes: ["partner:handoff"],
        },
        partnerEntry: {
          entrySlug: "entry-alpha",
        },
        drtsPassengerId: "passenger-123",
      })),
    } as unknown as TenantPartnerService;

    const controller = new TenantPartnerController(
      tenantPartnerService,
      {} as never,
      {} as never,
      new JwtAuthService(),
    );

    let thrown: unknown;
    try {
      await controller.issuePartnerIngressHandoff(
        { apiKey: "partner-api-key" } as never,
        undefined,
        "req-handoff-001",
      );
    } catch (error) {
      thrown = error;
    }

    const envelope = getErrorEnvelope(thrown);
    expect(getHttpStatus(thrown)).toBe(503);
    expect(envelope?.code).toBe("JWT_NOT_CONFIGURED");
    expect(envelope?.details).toMatchObject({
      requiredEnv: "JWT_PRIVATE_KEY or JWT_SECRET",
    });
  });
});
