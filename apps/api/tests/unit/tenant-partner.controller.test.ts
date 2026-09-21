import { afterEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import type { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import type { ReferralStatementRecord } from "../../src/modules/billing-settlement/referral-statement.types";
import type { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import type { IdentityContext } from "@drts/contracts";
import {
  TenantApiKeyAuthGuard,
  TenantPartnerController,
} from "../../src/modules/tenant-partner/tenant-partner.controller";
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
      entryHost: "app.fabrikam-living.example",
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

  it("rejects cross-tenant SLA update when identity tenant does not match x-tenant-id", () => {
    const { controller } = createController();
    const identity: IdentityContext = {
      actorType: "tenant_admin",
      actorId: "admin-a",
      realm: "tenant",
      authMode: "jwt_bearer",
      roleFamilies: ["tenant"],
      roles: ["tenant_admin"],
      scopes: ["tenant:sla:write"],
      tenantId: "tenant-a",
      supportedExecutionModes: ["supervisor_managed_execution"],
    };

    expect(() =>
      controller.updateSlaProfile(
        { waitThresholdMin: 15 },
        identity,
        "tenant-b",
        "admin-a",
        "req-cross-tenant-sla",
      ),
    ).toThrowError(
      expect.objectContaining({
        status: 403,
        code: "TENANT_SCOPE_MISMATCH",
      }),
    );
  });

  it("allows same-tenant SLA update with matching identity", () => {
    const { controller } = createController();
    const identity: IdentityContext = {
      actorType: "tenant_admin",
      actorId: "admin-a",
      realm: "tenant",
      authMode: "jwt_bearer",
      roleFamilies: ["tenant"],
      roles: ["tenant_admin"],
      scopes: ["tenant:sla:write"],
      tenantId: "tenant-a",
      supportedExecutionModes: ["supervisor_managed_execution"],
    };

    const response = controller.updateSlaProfile(
      { waitThresholdMin: 15 },
      identity,
      "tenant-a",
      "admin-a",
      "req-same-tenant-sla",
    );

    expect(response.data).toMatchObject({
      resourceType: "tenant_sla",
      resourceId: "tenant-a",
      status: "completed",
    });
  });

  it("rejects SLA update with negative threshold minutes", () => {
    const { controller } = createController();
    const identity: IdentityContext = {
      actorType: "tenant_admin",
      actorId: "admin-a",
      realm: "tenant",
      authMode: "jwt_bearer",
      roleFamilies: ["tenant"],
      roles: ["tenant_admin"],
      scopes: ["tenant:sla:write"],
      tenantId: "tenant-a",
      supportedExecutionModes: ["supervisor_managed_execution"],
    };

    for (const field of [
      "waitThresholdMin",
      "arrivalThresholdMin",
      "completionThresholdMin",
    ] as const) {
      expect(() =>
        controller.updateSlaProfile(
          { [field]: -1 },
          identity,
          "tenant-a",
          "admin-a",
          "req-neg-sla",
        ),
      ).toThrowError(
        expect.objectContaining({
          status: 400,
          code: "INVALID_SLA_THRESHOLD",
        }),
      );
    }
  });
});

describe("tenant API key authoritative consumer and usage tracking", () => {
  it("authenticates and updates usage tracking on listApiKeys when API key header is provided", async () => {
    const { controller, tenantPartnerService } = createController();

    const issued = tenantPartnerService.issueApiKey("tenant-demo-001", {
      keyName: "Consumer key",
      scopes: ["tenant:read"],
    });

    expect(issued.apiKey.lastUsedAt).toBeNull();

    // Call listApiKeys passing the plaintext API key via x-api-key header
    const response = await controller.listApiKeys(
      "tenant-demo-001",
      "req-list-with-key-001",
      null,
      issued.plaintextKey,
    );

    expect(response.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          apiKeyId: issued.apiKey.apiKeyId,
          lastUsedAt: expect.any(String),
          lastUsedWorkload: "tenant_api_list",
        }),
      ]),
    );

    // Call listApiKeys with Authorization: Bearer tk_...
    const bearerResponse = await controller.listApiKeys(
      "tenant-demo-001",
      "req-list-bearer-001",
      null,
      undefined,
      undefined,
      `Bearer ${issued.plaintextKey}`,
    );
    expect(bearerResponse.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          apiKeyId: issued.apiKey.apiKeyId,
          lastUsedAt: expect.any(String),
          lastUsedWorkload: "tenant_api_list",
        }),
      ]),
    );
  });

  it("authenticates and exchanges credentials through dedicated controller endpoints", async () => {
    const { controller, tenantPartnerService } = createController();

    const issued = tenantPartnerService.issueApiKey("tenant-demo-001", {
      keyName: "Exchange key",
      scopes: ["tenant:read", "tenant:write"],
    });

    // POST tenant/api-keys/authenticate
    const authResult = await controller.authenticateApiKey(
      { apiKey: issued.plaintextKey, requiredScopes: ["tenant:read"] },
      undefined,
      undefined,
      undefined,
      "tenant-demo-001",
      "req-auth-endpoint-001",
    );
    expect(authResult.data).toMatchObject({
      authenticated: true,
      apiKey: expect.objectContaining({
        apiKeyId: issued.apiKey.apiKeyId,
        lastUsedAt: expect.any(String),
        lastUsedWorkload: "tenant_api_authenticate",
      }),
      identity: expect.objectContaining({
        actorType: "tenant_admin",
        actorId: issued.apiKey.apiKeyId,
        tenantId: "tenant-demo-001",
      }),
    });

    // POST tenant/api-keys/exchange
    const exchangeResult = await controller.exchangeApiKey(
      undefined,
      issued.plaintextKey,
      undefined,
      undefined,
      "tenant-demo-001",
      "req-exchange-endpoint-001",
    );
    expect(exchangeResult.data).toMatchObject({
      tokenType: "Bearer",
      apiKeyId: issued.apiKey.apiKeyId,
      tenantId: "tenant-demo-001",
      scopes: expect.arrayContaining(["tenant:read", "tenant:write"]),
      identity: expect.objectContaining({
        actorType: "tenant_admin",
        tenantId: "tenant-demo-001",
      }),
    });
  });

  it("enforces TenantApiKeyAuthGuard on incoming requests", async () => {
    const { tenantPartnerService } = createController();
    const guard = new TenantApiKeyAuthGuard(tenantPartnerService);

    const issued = tenantPartnerService.issueApiKey("tenant-demo-001", {
      keyName: "Guard test key",
      scopes: ["tenant:read"],
    });

    // Valid header via x-api-key
    const mockRequest1: any = {
      headers: {
        "x-api-key": issued.plaintextKey,
        "x-tenant-id": "tenant-demo-001",
        "x-request-id": "req-guard-001",
      },
    };
    const context1: any = {
      switchToHttp: () => ({
        getRequest: () => mockRequest1,
      }),
    };

    const allowed1 = await guard.canActivate(context1);
    expect(allowed1).toBe(true);
    expect(mockRequest1.identity).toMatchObject({
      actorType: "tenant_admin",
      actorId: issued.apiKey.apiKeyId,
      tenantId: "tenant-demo-001",
    });
    expect(mockRequest1.authenticatedApiKey.lastUsedWorkload).toBe(
      "tenant_api_guard",
    );

    // Valid header via Authorization: Bearer tk_...
    const mockRequest2: any = {
      headers: {
        authorization: `Bearer ${issued.plaintextKey}`,
        "x-tenant-id": "tenant-demo-001",
      },
    };
    const context2: any = {
      switchToHttp: () => ({
        getRequest: () => mockRequest2,
      }),
    };
    const allowed2 = await guard.canActivate(context2);
    expect(allowed2).toBe(true);

    // Missing key fails with 401
    const mockRequest3: any = {
      headers: {},
    };
    const context3: any = {
      switchToHttp: () => ({
        getRequest: () => mockRequest3,
      }),
    };
    await expect(guard.canActivate(context3)).rejects.toMatchObject({
      status: 401,
      response: {
        error: {
          code: "TENANT_API_KEY_REQUIRED",
        },
      },
    });
  });
});
