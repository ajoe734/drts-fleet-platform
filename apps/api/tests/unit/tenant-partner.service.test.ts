import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BankCardInlineEligibilityAdapter } from "../../src/modules/tenant-partner/bank-card-inline-eligibility.adapter";
import {
  PartnerEligibilityAdapterError,
  type PartnerEligibilityAdapterInterface,
} from "../../src/modules/tenant-partner/partner-eligibility-adapter.interface";
import type {
  PersistTenantPartnerChanges,
  StoredPartnerIngressCredentialRecord,
  TenantPartnerState,
} from "../../src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../src/modules/tenant-partner/webhook-dispatch.service";

function cloneState(state: TenantPartnerState): TenantPartnerState {
  return JSON.parse(JSON.stringify(state)) as TenantPartnerState;
}

function createEmptyRepositoryState(): TenantPartnerState {
  return {
    notificationPreferences: [],
    webhookEndpoints: [],
    webhookDeliveries: [],
    slaProfiles: [],
    partnerEntries: [],
    partnerIngressCredentials: [],
    partnerEligibilityVerifications: [],
    passengers: [],
    addresses: [],
    userRoles: [],
    apiKeys: [],
  };
}

function mergeByKey<T>(
  current: readonly T[],
  incoming: readonly T[] | undefined,
  keyOf: (value: T) => string,
) {
  const merged = new Map(current.map((value) => [keyOf(value), value]));
  for (const value of incoming ?? []) {
    merged.set(keyOf(value), value);
  }
  return [...merged.values()];
}

function createInMemoryTenantPartnerRepository(
  initialState: TenantPartnerState = createEmptyRepositoryState(),
) {
  let state = cloneState(initialState);

  return {
    loadState: vi.fn(async () => cloneState(state)),
    persistChanges: vi.fn(async (changes: PersistTenantPartnerChanges) => {
      state = {
        notificationPreferences: mergeByKey(
          state.notificationPreferences,
          changes.notificationPreferences,
          (value) => value.tenantId,
        ),
        webhookEndpoints: mergeByKey(
          state.webhookEndpoints,
          changes.webhookEndpoints,
          (value) => value.webhookId,
        ),
        webhookDeliveries: mergeByKey(
          state.webhookDeliveries,
          changes.webhookDeliveries,
          (value) => value.deliveryId,
        ),
        slaProfiles: mergeByKey(
          state.slaProfiles,
          changes.slaProfiles,
          (value) => value.tenantId,
        ),
        partnerEntries: mergeByKey(
          state.partnerEntries,
          changes.partnerEntries,
          (value) => value.entrySlug,
        ),
        partnerIngressCredentials: mergeByKey(
          state.partnerIngressCredentials,
          changes.partnerIngressCredentials,
          (value) => value.keyId,
        ),
        partnerEligibilityVerifications: mergeByKey(
          state.partnerEligibilityVerifications,
          changes.partnerEligibilityVerifications,
          (value) => value.eligibilityVerificationId,
        ),
        passengers: mergeByKey(
          state.passengers,
          changes.passengers,
          (value) => value.passengerId,
        ),
        addresses: mergeByKey(
          state.addresses,
          changes.addresses,
          (value) => value.addressId,
        ),
        userRoles: mergeByKey(
          state.userRoles,
          changes.userRoles,
          (value) => value.userId,
        ),
        apiKeys: mergeByKey(
          state.apiKeys,
          changes.apiKeys,
          (value) => value.apiKeyId,
        ),
      };
    }),
    reportPersistenceFailure: vi.fn(),
    getState: () => cloneState(state),
  };
}

describe("TenantPartnerService sensitive-data governance", () => {
  afterEach(() => {
    delete process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT;
    delete process.env.PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT;
  });

  it("loads partner ingress credentials from environment secrets", () => {
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_test_alpha_ingress_secret";

    const service = new TenantPartnerService(new AuditNotificationService());
    const resolution = service.authenticatePartnerBootstrap(
      {
        entrySlug: "bank-demo-alpha-airport",
        apiKey: "pk_test_alpha_ingress_secret",
      },
      "req-partner-env-001",
    );

    expect(resolution.identity).toMatchObject({
      actorType: "partner_api_key",
      actorId: "partner-key-alpha-demo",
      realm: "partner",
      tenantId: "tenant-demo-001",
      partnerEntrySlug: "bank-demo-alpha-airport",
    });
  });

  it("rejects partner eligibility verification when the authenticated partner scope targets another entry", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new TenantPartnerService(auditNotificationService);

    await expect(
      service.verifyPartnerEligibility(
        {
          entrySlug: "bank-demo-beta-airport",
          referenceToken: "raw-secret-token-scope-001",
        },
        "req-eligibility-scope-001",
        {
          actorType: "partner_api_key",
          actorId: "partner-key-alpha-demo",
          realm: "partner",
          scopes: [
            "partner:entries:read",
            "partner:eligibility:read",
            "partner:eligibility:write",
          ],
          tenantId: "tenant-demo-001",
          partnerId: "partner-bank-demo-001",
          partnerProgramId: "program-airport-alpha",
          partnerEntrySlug: "bank-demo-alpha-airport",
          requestId: "req-eligibility-scope-001",
        },
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "PARTNER_SCOPE_MISMATCH",
        },
      },
    });

    expect(auditNotificationService.listAuditLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "partner_ingress_rejected",
          resourceId: "bank-demo-beta-airport",
          newValuesSummary: expect.objectContaining({
            reason: "identity_scope_mismatch",
            identityPartnerEntrySlug: "bank-demo-alpha-airport",
          }),
        }),
      ]),
    );
  });

  it("redacts webhook delivery signatures and tenant passenger audit payloads", async () => {
    const auditNotificationService = new AuditNotificationService();
    const webhookDispatchService = new WebhookDispatchService(
      vi.fn(async () => ({ ok: true, status: 202 })) as never,
    );
    const service = new TenantPartnerService(
      auditNotificationService,
      undefined,
      webhookDispatchService,
      [],
    );

    service.upsertPassenger(
      "tenant-demo-001",
      {
        fullName: "王小美",
        mobile: "0911222333",
        email: "xiaomei.wang@acme.example",
        departmentName: "總務部",
        activeFlag: true,
      },
      "req-passenger-audit-001",
    );

    const createdWebhook = service.createWebhookEndpoint(
      "tenant-demo-001",
      {
        url: "https://tenant.example/webhooks/dispatch",
        secret: "whsec_test_alpha",
        events: ["tenant.webhook.test"],
      },
      "req-webhook-001",
    );
    await service.sendTestWebhook(
      "tenant-demo-001",
      {
        webhookId: createdWebhook.webhookId,
      },
      "req-webhook-002",
    );

    const passengerAudit = auditNotificationService
      .listAuditLogs()
      .find((entry) => entry.actionName === "upsert_passenger");
    expect(passengerAudit).toBeDefined();
    expect(
      JSON.stringify(passengerAudit?.newValuesSummary ?? {}),
    ).not.toContain("0911222333");
    expect(
      JSON.stringify(passengerAudit?.newValuesSummary ?? {}),
    ).not.toContain("xiaomei.wang@acme.example");
    expect(passengerAudit?.newValuesSummary).toMatchObject({
      fullName: "王*美",
      mobile: "******2333",
      email: "x***@acme.example",
      metadataKeys: [],
    });

    const [delivery] = service.listWebhookDeliveriesByWebhook(
      "tenant-demo-001",
      createdWebhook.webhookId,
    ) as Array<Record<string, unknown>>;
    expect(delivery.signature).toMatch(/^[0-9a-f]{20}$/);
    expect(delivery).toMatchObject({
      secretVersion: 1,
      signatureVersion: 1,
    });
    expect(delivery).not.toHaveProperty("rawBody");
    expect(delivery).not.toHaveProperty("retryPolicySnapshot");
  });

  it("creates and updates partner entries through the platform-admin lifecycle with audit metadata", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new TenantPartnerService(auditNotificationService);

    const created = service.createPlatformPartnerEntry(
      {
        tenantId: "tenant-demo-001",
        partnerCode: "bank_growth_plus",
        partnerType: "bank_partner",
        programId: "program-growth-plus-airport",
        programCode: "GROWTH_PLUS",
        bankCode: "BANK_GROWTH_PLUS",
        entrySlug: "bank-growth-plus-airport",
        displayName: "Bank Growth Plus Airport",
        businessDispatchSubtype: "credit_card_airport_transfer",
        authMode: "partner_api_key",
        eligibilityMode: "reference_required",
        entryHost: "partner.bank-growth.example",
        entryPath: "/airport-transfer",
        themeAccent: "#1254c7",
        brandingMetadata: {
          supportEmail: "growth-plus@bank.example",
          supportPhone: "0800-123-456",
        },
      },
      "req-partner-create-001",
    );

    expect(created).toMatchObject({
      partnerCode: "bank_growth_plus",
      programId: "program-growth-plus-airport",
      entrySlug: "bank-growth-plus-airport",
      authMode: "partner_api_key",
      eligibilityMode: "reference_required",
      status: "active",
      activeFlag: true,
      brandingMetadata: {
        supportEmail: "growth-plus@bank.example",
        supportPhone: "0800-123-456",
      },
      auditMetadata: {
        source: "platform_admin_console",
        requestId: "req-partner-create-001",
        createdBy: "platform_admin",
        updatedBy: "platform_admin",
      },
    });

    const updated = service.updatePlatformPartnerEntry(
      created.entrySlug,
      {
        displayName: "Bank Growth Plus Premium Airport",
        eligibilityMode: "bank_card_inline",
        entryPath: "/airport-transfer/premium",
        status: "inactive",
        brandingMetadata: {
          supportEmail: "premium@bank.example",
        },
      },
      "req-partner-update-001",
    );

    expect(updated).toMatchObject({
      displayName: "Bank Growth Plus Premium Airport",
      eligibilityMode: "bank_card_inline",
      entryPath: "/airport-transfer/premium",
      status: "inactive",
      activeFlag: false,
      brandingMetadata: {
        supportEmail: "premium@bank.example",
        supportPhone: "0800-123-456",
      },
      auditMetadata: {
        source: "platform_admin_console",
        requestId: "req-partner-update-001",
        updatedBy: "platform_admin",
      },
    });

    expect(service.listPlatformPartnerEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entrySlug: "bank-growth-plus-airport",
          status: "inactive",
        }),
      ]),
    );

    expect(auditNotificationService.listAuditLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "create_partner_entry",
          resourceType: "partner_entry",
          resourceId: "bank-growth-plus-airport",
        }),
        expect.objectContaining({
          actionName: "update_partner_entry",
          resourceType: "partner_entry",
          resourceId: "bank-growth-plus-airport",
        }),
      ]),
    );
  });

  it("revokes partner entries and blocks public lookup plus bootstrap auth", () => {
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_test_alpha_ingress_secret";

    const auditNotificationService = new AuditNotificationService();
    const service = new TenantPartnerService(auditNotificationService);

    const revoked = service.revokePlatformPartnerEntry(
      "bank-demo-alpha-airport",
      "req-partner-revoke-001",
    );

    expect(revoked).toMatchObject({
      status: "revoked",
      activeFlag: false,
      revokedBy: "platform_admin",
      revokeReason: "partner_entry_revoked",
    });

    expect(() =>
      service.getPartnerEntry("bank-demo-alpha-airport"),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "PARTNER_ENTRY_REVOKED",
          }),
        }),
      }),
    );

    expect(() =>
      service.authenticatePartnerBootstrap(
        {
          entrySlug: "bank-demo-alpha-airport",
          apiKey: "pk_test_alpha_ingress_secret",
        },
        "req-partner-bootstrap-revoked-001",
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "PARTNER_ENTRY_REVOKED",
          }),
        }),
      }),
    );
  });

  it("rotates and revokes partner ingress credentials with audit evidence", () => {
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_test_alpha_ingress_secret";

    const auditNotificationService = new AuditNotificationService();
    const service = new TenantPartnerService(auditNotificationService);

    const issued = service.issuePlatformPartnerIngressCredential(
      "bank-demo-alpha-airport",
      {
        rotationReason: "scheduled_rotation",
      },
      "req-partner-credential-issue-001",
    );

    expect(issued.revokedCredentialId).toBe("partner-key-alpha-demo");
    expect(issued.credential).toMatchObject({
      entrySlug: "bank-demo-alpha-airport",
      source: "platform_admin",
      revokedAt: null,
      rotationReason: "scheduled_rotation",
    });

    const credentialsAfterRotate =
      service.listPlatformPartnerIngressCredentials("bank-demo-alpha-airport");
    expect(credentialsAfterRotate[0]).toMatchObject({
      keyId: issued.credential.keyId,
      revokedAt: null,
    });
    expect(credentialsAfterRotate[1]).toMatchObject({
      keyId: "partner-key-alpha-demo",
      revokedAt: expect.any(String),
    });

    const resolution = service.authenticatePartnerBootstrap(
      {
        entrySlug: "bank-demo-alpha-airport",
        apiKey: issued.plaintextKey,
      },
      "req-partner-credential-auth-001",
    );
    expect(resolution.identity.actorId).toBe(issued.credential.keyId);

    const revoked = service.revokePlatformPartnerIngressCredential(
      "bank-demo-alpha-airport",
      issued.credential.keyId,
      {
        revokeReason: "compromised",
      },
      "req-partner-credential-revoke-001",
    );
    expect(revoked).toMatchObject({
      keyId: issued.credential.keyId,
      revokeReason: "compromised",
      revokedAt: expect.any(String),
    });

    expect(() =>
      service.authenticatePartnerBootstrap(
        {
          entrySlug: "bank-demo-alpha-airport",
          apiKey: issued.plaintextKey,
        },
        "req-partner-credential-auth-002",
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "PARTNER_AUTH_NOT_CONFIGURED",
          }),
        }),
      }),
    );

    expect(auditNotificationService.listAuditLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "rotate_partner_ingress_credential",
          resourceType: "partner_ingress_credential",
          resourceId: issued.credential.keyId,
        }),
        expect.objectContaining({
          actionName: "revoke_partner_ingress_credential",
          resourceType: "partner_ingress_credential",
          resourceId: issued.credential.keyId,
        }),
      ]),
    );
  });

  it("persists partner ingress credential lifecycle changes and reloads them", async () => {
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_test_alpha_ingress_secret";

    const repository = createInMemoryTenantPartnerRepository();
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );
    await service.onModuleInit();

    const issued = service.issuePlatformPartnerIngressCredential(
      "bank-demo-alpha-airport",
      {
        rotationReason: "scheduled_rotation",
      },
      "req-partner-credential-persist-001",
    );
    service.revokePlatformPartnerIngressCredential(
      "bank-demo-alpha-airport",
      issued.credential.keyId,
      {
        revokeReason: "compromised",
      },
      "req-partner-credential-persist-002",
    );

    const persistedState = repository.getState();
    expect(persistedState.partnerIngressCredentials).toEqual(
      expect.arrayContaining<Partial<StoredPartnerIngressCredentialRecord>>([
        expect.objectContaining({
          keyId: "partner-key-alpha-demo",
          entrySlug: "bank-demo-alpha-airport",
          revokedAt: expect.any(String),
          revokeReason: "scheduled_rotation",
        }),
        expect.objectContaining({
          keyId: issued.credential.keyId,
          entrySlug: "bank-demo-alpha-airport",
          revokedAt: expect.any(String),
          revokeReason: "compromised",
          keyHash: expect.any(String),
        }),
      ]),
    );

    const reloaded = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
      undefined,
      [],
    );
    await reloaded.onModuleInit();

    expect(
      reloaded.listPlatformPartnerIngressCredentials("bank-demo-alpha-airport"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyId: issued.credential.keyId,
          revokedAt: expect.any(String),
          revokeReason: "compromised",
        }),
        expect.objectContaining({
          keyId: "partner-key-alpha-demo",
          revokedAt: expect.any(String),
          revokeReason: "scheduled_rotation",
        }),
      ]),
    );
  });

  it("persists entry revoke metadata together with credential revocation", async () => {
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_test_alpha_ingress_secret";

    const repository = createInMemoryTenantPartnerRepository();
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );
    await service.onModuleInit();

    service.revokePlatformPartnerEntry(
      "bank-demo-alpha-airport",
      "req-partner-entry-persist-001",
    );

    const persistedState = repository.getState();
    const persistedEntry = persistedState.partnerEntries.find(
      (entry) => entry.entrySlug === "bank-demo-alpha-airport",
    );
    const persistedCredential = persistedState.partnerIngressCredentials.find(
      (credential) => credential.keyId === "partner-key-alpha-demo",
    );

    expect(persistedEntry).toMatchObject({
      status: "revoked",
      revokedBy: "platform_admin",
      revokeReason: "partner_entry_revoked",
    });
    expect(persistedCredential).toMatchObject({
      entrySlug: "bank-demo-alpha-airport",
      revokedBy: "platform_admin",
      revokeReason: "partner_entry_revoked",
      revokedAt: expect.any(String),
    });
  });

  it("publishes the formal eligibility contract and hashes reference tokens instead of persisting raw values", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    const entry = service.getPartnerEntry("bank-demo-beta-airport");
    expect(entry.eligibilityContract).toMatchObject({
      adapterCode: "issuer_reference_lookup_v1",
      adapterKind: "issuer_reference_lookup",
      eligibilityMode: "reference_required",
      retryPolicy: expect.objectContaining({
        timeoutMs: 3000,
        maxAttempts: 3,
      }),
      manualFallbackPolicy: expect.objectContaining({
        queue: "ops_console",
      }),
      sensitiveDataPolicy: expect.objectContaining({
        referenceTokenStorage: "hash_only",
        rawTokenExposure: "never",
      }),
    });

    const rawReferenceToken = "raw-secret-token-987654";
    const verification = await service.verifyPartnerEligibility(
      {
        entrySlug: "bank-demo-beta-airport",
        referenceToken: rawReferenceToken,
      },
      "req-eligibility-reference-001",
    );

    expect(verification.referenceTokenHash).toMatch(/^sha256:/);
    expect(verification.referenceTokenHash).not.toContain(rawReferenceToken);
    expect(verification.benefitReference).not.toBe(rawReferenceToken);
    expect(verification.benefitReference).not.toContain(rawReferenceToken);
    expect(verification.issuerAuthorizationRef).not.toContain(
      rawReferenceToken,
    );
    expect(verification).toMatchObject({
      verificationStatus: "eligible",
      decisionSource: "issuer_reference_lookup",
      adapterCode: "issuer_reference_lookup_v1",
      manualFallback: expect.objectContaining({
        required: false,
      }),
      contractSnapshot: expect.objectContaining({
        adapterCode: "issuer_reference_lookup_v1",
      }),
    });
    expect(verification.attempts).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "eligible",
        reasonCode: "REFERENCE_ACCEPTED",
      }),
    ]);
  });

  it("applies passenger/address governance quality rules and masks export views", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    const passenger = service.upsertPassenger("tenant-demo-001", {
      passengerId: "passenger-governance-001",
      fullName: "王小美",
      roles: ["employee", "passenger"],
    });

    expect(passenger.roles).toEqual(["employee", "passenger"]);
    expect(passenger.qualityIssues).toEqual(
      expect.arrayContaining(["missing_contact", "missing_employee_no"]),
    );

    const address = service.upsertAddress("tenant-demo-001", {
      addressId: "address-governance-001",
      ownerPassengerId: passenger.passengerId,
      addressName: "Sensitive Pickup",
      addressText: "台北市大安區仁愛路四段 100 號 12 樓",
      sensitiveFlag: true,
      tags: ["vip"],
    });

    expect(address.tags).toEqual(expect.arrayContaining(["sensitive", "vip"]));
    expect(address.qualityIssues).toEqual(["missing_geocode"]);
    expect(address.maskedAddressText).not.toContain("100 號 12 樓");

    const [exportView] = service
      .listAddressExportView("tenant-demo-001")
      .filter((candidate) => candidate.addressId === address.addressId);
    expect(exportView).toMatchObject({
      addressId: address.addressId,
      sensitiveFlag: true,
      geocodeSource: "none",
      qualityIssues: ["missing_geocode"],
    });
    expect(exportView.maskedAddressText).not.toContain("100 號 12 樓");
  });

  it("normalizes tenant API key scopes and enforces the rotation window", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    const issued = service.issueApiKey("tenant-demo-001", {
      keyName: "Sandbox integration key",
      scopes: ["tenant:bookings:write", "tenant:reports:read"],
    });

    expect(issued.apiKey.scopes).toEqual(["reports:read", "tenant:write"]);
    expect(issued.apiKey.expiresAt).not.toBeNull();

    const expiresAt = Date.parse(issued.apiKey.expiresAt ?? "");
    const now = Date.now();
    expect(expiresAt).toBeGreaterThan(now + 50 * 24 * 60 * 60 * 1000);
    expect(expiresAt).toBeLessThan(now + 61 * 24 * 60 * 60 * 1000);

    try {
      service.issueApiKey("tenant-demo-001", {
        keyName: "Too long",
        scopes: ["tenant:write"],
        expiresAt: new Date(now + 120 * 24 * 60 * 60 * 1000).toISOString(),
      });
      throw new Error("Expected tenant API key lifetime validation to fail.");
    } catch (error) {
      expect(
        (
          error as { getResponse: () => { error: { code: string } } }
        ).getResponse().error.code,
      ).toBe("TENANT_API_KEY_EXPIRY_TOO_FAR");
    }

    const governance =
      service.getIntegrationGovernancePackage("tenant-demo-001");
    expect(governance.apiKeyPolicy).toMatchObject({
      defaultLifetimeDays: 60,
      maxLifetimeDays: 90,
      breakGlassRequiresPlatformApproval: true,
      revokeEffect: "immediate",
    });
    expect(governance.apiKeyPolicy.compatibilityAliases).toMatchObject({
      "tenant:bookings:write": "tenant:write",
      "tenant:reports:read": "reports:read",
    });
    expect(governance.baselineWebhookEvents).toContain("dispatch.assigned");
  });

  it("falls back to manual review after retry exhaustion with explicit adapter attempt history", async () => {
    const retryingAdapter: PartnerEligibilityAdapterInterface = {
      adapterCode: "issuer_reference_lookup_v1",
      adapterVersion: "v1",
      supports: (contract) =>
        contract.adapterCode === "issuer_reference_lookup_v1",
      async verify() {
        throw new PartnerEligibilityAdapterError(
          "ISSUER_UNAVAILABLE",
          "Sandbox issuer adapter unavailable.",
          {
            retryable: true,
            upstreamHttpStatus: 503,
            manualFallbackReasonCode: "ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED",
          },
        );
      },
    };
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      [retryingAdapter],
    );

    const verification = await service.verifyPartnerEligibility(
      {
        entrySlug: "bank-demo-beta-airport",
        referenceToken: "manual-review-token",
      },
      "req-eligibility-review-001",
    );

    expect(verification).toMatchObject({
      verificationStatus: "manual_review",
      decisionSource: "manual_fallback",
      verificationReasonCode: "ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED",
      adapterCode: "issuer_reference_lookup_v1",
      manualFallback: expect.objectContaining({
        required: true,
        reasonCode: "ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED",
        requestedBy: "system:auto_fallback",
      }),
    });
    expect(verification.attempts).toHaveLength(3);
    expect(
      verification.attempts.every(
        (attempt) =>
          attempt.status === "error" &&
          attempt.reasonCode === "ISSUER_UNAVAILABLE" &&
          attempt.retryable === true,
      ),
    ).toBe(true);
  });

  it("lists manual-review and denial cases for ops review with manual-review first", async () => {
    const auditNotificationService = new AuditNotificationService();
    const retryingAdapter: PartnerEligibilityAdapterInterface = {
      adapterCode: "issuer_reference_lookup_v1",
      adapterVersion: "v1",
      supports: (contract) =>
        contract.adapterCode === "issuer_reference_lookup_v1",
      async verify() {
        throw new PartnerEligibilityAdapterError(
          "ISSUER_UNAVAILABLE",
          "Sandbox issuer adapter unavailable.",
          {
            retryable: true,
            upstreamHttpStatus: 503,
            manualFallbackReasonCode: "ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED",
          },
        );
      },
    };
    const service = new TenantPartnerService(
      auditNotificationService,
      undefined,
      undefined,
      undefined,
      [new BankCardInlineEligibilityAdapter(), retryingAdapter],
    );

    await service.verifyPartnerEligibility(
      {
        entrySlug: "bank-demo-alpha-airport",
        cardLast4: "1357",
        cardholderName: "Traveler Denied",
        flightNo: "CI220",
      },
      "req-eligibility-denied-001",
    );
    await service.verifyPartnerEligibility(
      {
        entrySlug: "bank-demo-beta-airport",
        referenceToken: "manual-review-token",
        flightNo: "BR102",
      },
      "req-eligibility-review-002",
    );

    const queue = service.listPartnerEligibilityReviewQueue(
      "req-eligibility-queue-001",
      {
        actorType: "ops_user",
        actorId: "ops-reviewer-001",
        realm: "ops",
        scopes: ["ops:dispatch:read"],
        requestId: "req-eligibility-queue-001",
      },
    );

    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({
      partnerEntrySlug: "bank-demo-beta-airport",
      verificationStatus: "manual_review",
      manualFallback: expect.objectContaining({
        required: true,
        reasonCode: "ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED",
      }),
      requestMetadata: expect.objectContaining({
        flightNo: "BR102",
      }),
    });
    expect(queue[0].attempts).toHaveLength(3);
    expect(queue[0].attempts.at(-1)).toMatchObject({
      status: "error",
      reasonCode: "ISSUER_UNAVAILABLE",
    });
    expect(queue[1]).toMatchObject({
      partnerEntrySlug: "bank-demo-alpha-airport",
      verificationStatus: "ineligible",
      verificationReasonCode: "CARD_PROGRAM_NOT_ELIGIBLE",
      manualFallback: expect.objectContaining({
        required: false,
      }),
      requestMetadata: expect.objectContaining({
        cardLast4: "1357",
        flightNo: "CI220",
      }),
    });
    expect(queue[1].attempts).toHaveLength(1);
    expect(queue[1].attempts[0]).toMatchObject({
      status: "ineligible",
      reasonCode: "CARD_PROGRAM_NOT_ELIGIBLE",
    });

    expect(auditNotificationService.listAuditLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "list_partner_eligibility_review_queue",
          actorType: "ops_user",
          newValuesSummary: expect.objectContaining({
            queueSize: 2,
            manualReviewCount: 1,
            deniedCount: 1,
          }),
        }),
      ]),
    );
  });

  it("disables failing webhook endpoints and returns them to test_pending on secret rotation", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new TenantPartnerService(
      auditNotificationService,
      undefined,
      new WebhookDispatchService(
        vi.fn(async () => ({
          ok: false,
          status: 410,
        })) as never,
      ),
      [],
    );

    const created = service.createWebhookEndpoint(
      "tenant-demo-001",
      {
        url: "https://tenant.example/webhooks/failing",
        secret: "whsec_test_failure",
        events: ["booking.created"],
      },
      "req-webhook-create-002",
    );
    expect(created.status).toBe("test_pending");

    await service.sendTestWebhook(
      "tenant-demo-001",
      {
        webhookId: created.webhookId,
      },
      "req-webhook-test-003",
    );

    const [disabledWebhook] = service.listWebhookEndpoints("tenant-demo-001");
    expect(disabledWebhook).toMatchObject({
      webhookId: created.webhookId,
      status: "disabled",
      runtimeMetadata: expect.objectContaining({
        disableReason: "delivery_failed",
      }),
    });
    expect(auditNotificationService.listNotifications()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: "tenant-demo-001",
          channel: "ops_notice",
          title: "Tenant webhook disabled after repeated delivery failures",
        }),
      ]),
    );

    service.rotateWebhookSecret(
      "tenant-demo-001",
      {
        webhookId: created.webhookId,
        secret: "whsec_test_rotated",
        rotationReason: "credential_rollover",
      },
      "req-webhook-rotate-004",
    );

    const [revalidationPending] =
      service.listWebhookEndpoints("tenant-demo-001");
    expect(revalidationPending).toMatchObject({
      webhookId: created.webhookId,
      status: "test_pending",
      runtimeMetadata: expect.objectContaining({
        disableReason: null,
      }),
    });
  });

  it("audits webhook-delivery and eligibility evidence reads with tenant and partner scope checks", async () => {
    const auditNotificationService = new AuditNotificationService();
    const webhookDispatchService = new WebhookDispatchService(
      vi.fn(async () => ({ ok: true, status: 202 })) as never,
    );
    const service = new TenantPartnerService(
      auditNotificationService,
      undefined,
      webhookDispatchService,
      [],
    );

    const webhook = service.createWebhookEndpoint(
      "tenant-demo-001",
      {
        url: "https://tenant.example/webhooks/evidence",
        secret: "whsec_test_evidence",
        events: ["tenant.webhook.test"],
      },
      "req-webhook-create-003",
    );
    await service.sendTestWebhook(
      "tenant-demo-001",
      {
        webhookId: webhook.webhookId,
      },
      "req-webhook-test-010",
    );

    const tenantIdentity = {
      actorType: "tenant_admin" as const,
      actorId: "tenant-admin-001",
      realm: "tenant" as const,
      scopes: ["tenant:webhooks:read", "tenant:read"],
      tenantId: "tenant-demo-001",
    };
    const deliveries = service.listWebhookDeliveries(
      "tenant-demo-001",
      "req-webhook-read-010",
      tenantIdentity,
    );
    expect(deliveries.length).toBeGreaterThan(0);

    expect(() =>
      service.listWebhookDeliveries("tenant-demo-001", "req-webhook-read-011", {
        ...tenantIdentity,
        tenantId: "tenant-other-001",
      }),
    ).toThrowError(ApiRequestError);

    const verification = await service.verifyPartnerEligibility(
      {
        entrySlug: "bank-demo-beta-airport",
        referenceToken: "raw-secret-token-eligibility-010",
      },
      "req-eligibility-reference-010",
    );
    const partnerIdentity = {
      actorType: "partner_api_key" as const,
      actorId: "partner-key-beta-demo",
      realm: "partner" as const,
      scopes: [],
      tenantId: verification.tenantId,
      partnerId: verification.partnerId,
      partnerProgramId: verification.partnerProgramId,
      partnerEntrySlug: verification.partnerEntrySlug,
      requestId: "req-eligibility-read-010",
    };

    const detail = service.getPartnerEligibilityVerification(
      verification.eligibilityVerificationId,
      "req-eligibility-read-010",
      partnerIdentity,
    );
    expect(detail.eligibilityVerificationId).toBe(
      verification.eligibilityVerificationId,
    );

    expect(() =>
      service.getPartnerEligibilityVerification(
        verification.eligibilityVerificationId,
        "req-eligibility-read-011",
        {
          ...partnerIdentity,
          partnerEntrySlug: "bank-demo-alpha-airport",
        },
      ),
    ).toThrowError(ApiRequestError);

    expect(auditNotificationService.listAuditLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "view_webhook_delivery_evidence",
          actorType: "tenant_admin",
          newValuesSummary: expect.objectContaining({
            evidenceFamily: "webhook_delivery",
          }),
        }),
        expect.objectContaining({
          actionName: "view_partner_eligibility_evidence",
          actorType: "partner_api_key",
          newValuesSummary: expect.objectContaining({
            evidenceFamily: "eligibility_verification",
          }),
        }),
      ]),
    );
  });
});
