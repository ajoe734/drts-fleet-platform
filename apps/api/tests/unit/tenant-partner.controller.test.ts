import { afterEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import type { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import type { ReferralStatementRecord } from "../../src/modules/billing-settlement/referral-statement.types";
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
      {} as never,
    ),
  };
}

describe("tenant partner ingress handoff controller", () => {
  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.DRTS_INTERNAL_KEY;
    delete process.env.DRTS_REFERRAL_EMBED_HANDOFF_KEY;
    delete process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT;
    delete process.env.PARTNER_INGRESS_KEY_YUHE_RESIDENCE;
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
      undefined,
      "req-partner-handoff-001",
    );
    const second = await controller.issuePartnerIngressHandoff(
      {
        entrySlug: "bank-demo-alpha-airport",
        apiKey: "pk_demo_alpha_airport_20260428",
        partnerUserRef: "partner-user-001",
      },
      undefined,
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
        scopes: [
          "partner:handoff",
          "partner:eligibility:read",
          "partner:eligibility:write",
          "partner:book",
        ],
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
        undefined,
        "req-partner-handoff-003",
      ),
    ).rejects.toThrowError(ApiRequestError);
  });

  it("allows internal callers to resolve the credential server-side", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
    process.env.DRTS_INTERNAL_KEY = "internal-dev-key";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_demo_alpha_airport_20260428";

    const { controller } = createController();

    const response = await controller.issuePartnerIngressHandoff(
      {
        entrySlug: "bank-demo-alpha-airport",
        partnerUserRef: "partner-user-002",
      },
      {
        headers: {
          "x-drts-internal-key": "internal-dev-key",
        },
        method: "POST",
        originalUrl: "/api/partner/ingress/handoff",
      },
      "req-partner-handoff-004",
    );

    expect(response.data).toMatchObject({
      tokenType: "Bearer",
      partnerEntrySlug: "bank-demo-alpha-airport",
      identity: {
        actorType: "referral_passenger",
        partnerEntrySlug: "bank-demo-alpha-airport",
      },
    });
  });

  it("rejects internal bootstrap when the internal key header is missing", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.DRTS_INTERNAL_KEY = "internal-dev-key";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_demo_alpha_airport_20260428";

    const { controller } = createController();

    try {
      await controller.issuePartnerIngressHandoff(
        {
          entrySlug: "bank-demo-alpha-airport",
          partnerUserRef: "partner-user-003",
        },
        {
          headers: {},
          method: "POST",
          originalUrl: "/api/partner/ingress/handoff",
        },
        "req-partner-handoff-005",
      );
      expect.fail("expected internal bootstrap without key to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getStatus()).toBe(401);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "INTERNAL_KEY_REQUIRED",
        },
      });
    }
  });

  it("rejects internal bootstrap when only a bearer token is present", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.DRTS_INTERNAL_KEY = "internal-dev-key";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_demo_alpha_airport_20260428";

    const { controller } = createController();

    try {
      await controller.issuePartnerIngressHandoff(
        {
          entrySlug: "bank-demo-alpha-airport",
          partnerUserRef: "partner-user-004",
        },
        {
          headers: {
            authorization: "Bearer forged-browser-token",
          },
          method: "POST",
          originalUrl: "/api/partner/ingress/handoff",
        },
        "req-partner-handoff-006",
      );
      expect.fail("expected bearer-only internal bootstrap to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getStatus()).toBe(401);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "INTERNAL_KEY_REQUIRED",
        },
      });
    }
  });

  it("fails closed when internal bootstrap is requested without DRTS_INTERNAL_KEY configured", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_demo_alpha_airport_20260428";

    const { controller } = createController();

    try {
      await controller.issuePartnerIngressHandoff(
        {
          entrySlug: "bank-demo-alpha-airport",
          partnerUserRef: "partner-user-005",
        },
        {
          headers: {},
          method: "POST",
          originalUrl: "/api/partner/ingress/handoff",
        },
        "req-partner-handoff-007",
      );
      expect.fail("expected missing internal-key config to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getStatus()).toBe(503);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "INTERNAL_KEY_NOT_CONFIGURED",
        },
      });
    }
  });

  it("requires a dedicated key for referral embed handoff issuance and consume", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.DRTS_INTERNAL_KEY = "general-internal-key";
    process.env.DRTS_REFERRAL_EMBED_HANDOFF_KEY = "referral-handoff-key";
    process.env.PARTNER_INGRESS_KEY_YUHE_RESIDENCE = "yuhe-partner-key";

    const { controller } = createController();
    const command = {
      entrySlug: "yuhe-residence",
      entryHost: "app.yuhe-living.com.tw",
      partnerUserRef: "resident-001",
    };

    await expect(
      controller.issueReferralEmbedHandoffArtifact(
        command,
        {
          headers: { "x-drts-internal-key": "general-internal-key" },
          method: "POST",
          originalUrl: "/api/partner/ingress/referral-embed-handoff",
        },
        "req-referral-handoff-wrong-key",
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_KEY_REQUIRED" });

    await expect(
      controller.issueReferralEmbedHandoffArtifact(
        command,
        {
          headers: { "x-drts-referral-handoff-key": "forged-key" },
          method: "POST",
          originalUrl: "/api/partner/ingress/referral-embed-handoff",
        },
        "req-referral-handoff-forged-key",
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_KEY_INVALID" });

    const issued = await controller.issueReferralEmbedHandoffArtifact(
      command,
      {
        headers: {
          "x-drts-referral-handoff-key": "referral-handoff-key",
        },
        method: "POST",
        originalUrl: "/api/partner/ingress/referral-embed-handoff",
      },
      "req-referral-handoff-authorized",
    );

    const scopedRequest = {
      headers: { "x-drts-referral-handoff-key": "referral-handoff-key" },
      method: "POST",
      originalUrl: "/api/partner/ingress/referral-embed-handoff/consume",
    };
    const consumed = await controller.consumeReferralEmbedHandoffArtifact(
      {
        artifact: issued.data.artifact,
        entrySlug: command.entrySlug,
        entryHost: command.entryHost,
      },
      scopedRequest,
      "req-referral-handoff-consume",
    );

    expect(consumed.data).toMatchObject({
      handoffId: issued.data.handoffId,
      partnerEntrySlug: command.entrySlug,
      entryHost: command.entryHost,
    });

    await expect(
      controller.consumeReferralEmbedHandoffArtifact(
        {
          artifact: issued.data.artifact,
          entrySlug: command.entrySlug,
          entryHost: command.entryHost,
        },
        scopedRequest,
        "req-referral-handoff-replay",
      ),
    ).rejects.toMatchObject({ code: "REFERRAL_HANDOFF_REPLAYED" });
  });

  it("renders the authorised referral statement as a safe downloadable artifact", async () => {
    const statement: ReferralStatementRecord = {
      statementId: "referral-statement-demo-2026-06",
      partnerEntrySlug: "referral-demo-community",
      period: "2026-06",
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.999Z",
      channelKey: "partner_referral",
      direction: "drts_pays_partner",
      currency: "TWD",
      status: "due",
      lines: [
        {
          tripId: "=formula-not-executed",
          completedAt: "2026-06-15T10:00:00.000Z",
          partnerEntrySlug: "referral-demo-community",
          fare: { amountMinor: 150000, currency: "TWD" },
          rateType: "percent",
          rateValue: 15,
          shareAmount: { amountMinor: 22500, currency: "TWD" },
        },
      ],
      totals: {
        tripCount: 1,
        activeRiderCount: 1,
        gmv: { amountMinor: 150000, currency: "TWD" },
        shareTotal: { amountMinor: 22500, currency: "TWD" },
      },
      artifactRef: {
        artifactId: "referral-statement-demo-2026-06",
        kind: "referral_settlement_statement",
        manifestHash: "manifest-hash-001",
      },
      generatedAt: "2026-07-01T00:00:00.000Z",
    };
    const tenantPartnerService = {
      getPartnerReferralStatement: () => statement,
    } as unknown as TenantPartnerService;
    const controller = new TenantPartnerController(
      tenantPartnerService,
      {} as BillingSettlementService,
      {} as OwnedMobilityService,
      new JwtAuthService(),
      {} as never,
    );

    const artifact = controller.getPartnerReferralStatementArtifact(
      null,
      statement.period,
      "req-referral-statement-artifact",
    );
    const chunks: Buffer[] = [];
    for await (const chunk of artifact.getStream()) {
      chunks.push(Buffer.from(chunk));
    }

    expect(Buffer.concat(chunks).toString("utf8")).toContain(
      "'=formula-not-executed",
    );
  });
});
