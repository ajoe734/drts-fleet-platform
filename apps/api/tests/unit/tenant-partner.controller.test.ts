import { afterEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import type { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import type { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { TenantPartnerController } from "../../src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

function createController(jwtAuthService = new JwtAuthService()) {
  const tenantPartnerService = new TenantPartnerService(
    new AuditNotificationService(),
  );

  return {
    jwtAuthService,
    tenantPartnerService,
    controller: new TenantPartnerController(
      tenantPartnerService,
      {} as BillingSettlementService,
      {} as OwnedMobilityService,
      jwtAuthService,
    ),
  };
}

describe("tenant partner ingress handoff controller", () => {
  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT;
  });

  it("issues a short-lived passenger bearer session and reuses the binding on reopen", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_demo_alpha_airport_20260428";

    const { controller, jwtAuthService } = createController();

    const first = await controller.issuePartnerIngressHandoff(
      {
        entrySlug: "bank-demo-alpha-airport",
        apiKey: "pk_demo_alpha_airport_20260428",
        partnerUserRef: "partner-user-001",
      },
      "req-partner-handoff-001",
    );
    const second = await controller.issuePartnerIngressHandoff(
      {
        entrySlug: "bank-demo-alpha-airport",
        apiKey: "pk_demo_alpha_airport_20260428",
        partnerUserRef: "partner-user-001",
      },
      "req-partner-handoff-002",
    );

    expect(first.data).toMatchObject({
      tokenType: "Bearer",
      expiresIn: "15m",
      partnerEntrySlug: "bank-demo-alpha-airport",
      drtsPassengerId: expect.stringMatching(/^passenger_/),
      identity: {
        actorType: "referral_passenger",
        actorId: expect.any(String),
        authMode: "jwt_bearer",
        realm: "partner",
        tenantId: "tenant-demo-001",
        partnerId: "partner-bank-demo-001",
        partnerProgramId: "program-airport-alpha",
        partnerEntrySlug: "bank-demo-alpha-airport",
        drtsPassengerId: expect.any(String),
        scopes: ["partner:handoff"],
      },
    });
    expect(second.data.drtsPassengerId).toBe(first.data.drtsPassengerId);

    const verifiedPayload = jwtAuthService.verify(first.data.accessToken);
    expect(verifiedPayload).toMatchObject({
      sub: first.data.drtsPassengerId,
      actorType: "referral_passenger",
      realm: "partner",
      tenantId: "tenant-demo-001",
      partnerId: "partner-bank-demo-001",
      partnerProgramId: "program-airport-alpha",
      partnerEntrySlug: "bank-demo-alpha-airport",
      drtsPassengerId: first.data.drtsPassengerId,
    });
  });

  it("rejects partner ingress handoff for an invalid api key", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_demo_alpha_airport_20260428";

    const { controller } = createController();

    await expect(() =>
      controller.issuePartnerIngressHandoff(
        {
          entrySlug: "bank-demo-alpha-airport",
          apiKey: "wrong-demo-key",
          partnerUserRef: "partner-user-001",
        },
        "req-partner-handoff-003",
      ),
    ).rejects.toThrowError(ApiRequestError);
  });
});
