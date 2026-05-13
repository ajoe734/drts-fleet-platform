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
  TenantPartnerQueryExecutor,
} from "../../src/modules/tenant-partner/tenant-partner.repository";
import { createEmptyTenantQuotaUsage } from "../../src/modules/tenant-partner/tenant-quota-ledger";
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
    approvalRules: [],
    passengers: [],
    addresses: [],
    costCenters: [],
    quotaPolicies: [],
    quotaLedger: [],
    quotaMonthlySnapshots: [],
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
        approvalRules: mergeByKey(
          state.approvalRules,
          changes.approvalRules,
          (value) => value.ruleId,
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
        costCenters: mergeByKey(
          state.costCenters,
          changes.costCenters,
          (value) => `${value.tenantId}:${value.code}`,
        ),
        quotaPolicies: mergeByKey(
          state.quotaPolicies,
          changes.quotaPolicies,
          (value) =>
            `${value.tenantId}:${value.costCenterCode ?? "~"}:${value.period}`,
        ),
        quotaLedger: mergeByKey(
          state.quotaLedger,
          changes.quotaLedger,
          (value) => value.ledgerEntryId,
        ),
        quotaMonthlySnapshots: mergeByKey(
          state.quotaMonthlySnapshots,
          changes.quotaMonthlySnapshots,
          (value) =>
            `${value.tenantId}:${value.costCenterCode ?? "~"}:${value.period}:${value.periodKey}`,
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

function createDatabaseQuotaRepository(options?: {
  bookingCountLimit?: number | null;
  amountMinorLimit?: number | null;
  enforcementMode?: "hard_block" | "require_approval" | "warn_only";
}) {
  const limit = {
    bookingCountLimit: options?.bookingCountLimit ?? 1,
    amountMinorLimit: options?.amountMinorLimit ?? null,
    currency: "TWD",
    enforcementMode: options?.enforcementMode ?? "hard_block",
  } as const;
  const executor: TenantPartnerQueryExecutor = {
    query: vi.fn(async () => ({ rows: [] })) as never,
  };
  const repository = {
    isEnabled: vi.fn(() => true),
    loadState: vi.fn(async () => createEmptyRepositoryState()),
    persistChanges: vi.fn(async () => {}),
    reportPersistenceFailure: vi.fn(),
    withTransaction: vi.fn(
      async <T>(work: (tx: TenantPartnerQueryExecutor) => Promise<T>) =>
        work(executor),
    ),
    loadQuotaPoliciesForUpdate: vi.fn(async () => [
      {
        tenantId: "tenant-demo-001",
        costCenterCode: null,
        period: "monthly",
        limit: { ...limit },
        inheritedFromTenant: false,
        createdAt: "2026-05-13T10:00:00.000Z",
        updatedAt: "2026-05-13T10:05:00.000Z",
      },
    ]),
    ensureQuotaMonthlySnapshots: vi.fn(async () => {}),
    loadQuotaMonthlySnapshotsForUpdate: vi.fn(
      async (
        _tx: TenantPartnerQueryExecutor,
        tenantId: string,
        _costCenterCode: string | null,
        periodKey: string,
      ) => [
        {
          tenantId,
          costCenterCode: null,
          period: "monthly",
          periodKey,
          limit: { ...limit },
          usage: createEmptyTenantQuotaUsage(limit),
          refreshedAt: "2026-05-13T10:10:00.000Z",
        },
      ],
    ),
    persistQuotaReservation: vi.fn(async () => {}),
  };

  return { repository, executor };
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

  it("lists, upserts, and disables tenant cost centers with owner resolution", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new TenantPartnerService(auditNotificationService);

    const seeded = service.listCostCenters("tenant-demo-001", {
      activeOnly: true,
    });
    expect(seeded.some((costCenter) => costCenter.code === "CC-FIN-04")).toBe(
      true,
    );

    const created = service.upsertCostCenter(
      "tenant-demo-001",
      {
        code: "cc-rd-12",
        name: "R&D Fab18",
        description: "Airport and overnight engineering travel",
        ownerUserId: "tenant-user-demo-002",
      },
      "req-cost-center-create-001",
    );

    expect(created).toMatchObject({
      code: "CC-RD-12",
      name: "R&D Fab18",
      ownerUserId: "tenant-user-demo-002",
      ownerName: "Acme Tenant Ops",
      activeFlag: true,
      disabledAt: null,
    });

    const detail = service.getCostCenter("tenant-demo-001", "cc-rd-12");
    expect(detail.code).toBe("CC-RD-12");

    const filtered = service.listCostCenters("tenant-demo-001", {
      search: "fab18",
      ownerUserId: "tenant-user-demo-002",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.code).toBe("CC-RD-12");

    const disabled = service.disableCostCenter(
      "tenant-demo-001",
      {
        code: "cc-rd-12",
        reason: "department sunset",
      },
      "req-cost-center-disable-001",
    );

    expect(disabled).toMatchObject({
      code: "CC-RD-12",
      activeFlag: false,
      disabledReason: "department sunset",
      disabledAt: expect.any(String),
    });
    expect(
      service.listCostCenters("tenant-demo-001", {
        activeOnly: true,
        search: "fab18",
      }),
    ).toEqual([]);

    expect(auditNotificationService.listAuditLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "upsert_cost_center",
          resourceType: "tenant_cost_center",
          resourceId: "CC-RD-12",
        }),
        expect.objectContaining({
          actionName: "disable_cost_center",
          resourceType: "tenant_cost_center",
          resourceId: "CC-RD-12",
        }),
      ]),
    );
  });

  it("persists tenant cost-center lifecycle changes through the repository", async () => {
    const repository = createInMemoryTenantPartnerRepository();
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );

    await service.onModuleInit();

    service.upsertCostCenter("tenant-demo-001", {
      code: "CC-BD-09",
      name: "業務開發",
      ownerName: "Regional GM",
    });
    service.disableCostCenter("tenant-demo-001", {
      code: "CC-BD-09",
      reason: "merged into ops",
    });

    const reloaded = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );
    await reloaded.onModuleInit();

    expect(reloaded.getCostCenter("tenant-demo-001", "CC-BD-09")).toMatchObject(
      {
        code: "CC-BD-09",
        name: "業務開發",
        ownerName: "Regional GM",
        activeFlag: false,
        disabledReason: "merged into ops",
      },
    );
  });

  it("allows duplicate cost-center codes across different tenants", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    const otherTenantCostCenter = service.upsertCostCenter("tenant-demo-002", {
      code: "cc-fin-04",
      name: "Shared Finance Code",
      description: "Scoped to a different tenant",
    });

    expect(otherTenantCostCenter).toMatchObject({
      tenantId: "tenant-demo-002",
      code: "CC-FIN-04",
      name: "Shared Finance Code",
      description: "Scoped to a different tenant",
      activeFlag: true,
    });

    expect(service.getCostCenter("tenant-demo-001", "cc-fin-04")).toMatchObject(
      {
        tenantId: "tenant-demo-001",
        code: "CC-FIN-04",
        name: "財務處",
      },
    );
    expect(service.getCostCenter("tenant-demo-002", "cc-fin-04")).toMatchObject(
      {
        tenantId: "tenant-demo-002",
        code: "CC-FIN-04",
        name: "Shared Finance Code",
      },
    );
  });

  it("validateBookingCostCenter accepts canonical active codes and rejects unknown, disabled, or malformed entries", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    // Seeded tenant has CC-FIN-04 active by default.
    const seededResult = service.validateBookingCostCenter(
      "tenant-demo-001",
      "cc-fin-04",
    );
    expect(seededResult).toEqual({
      value: "CC-FIN-04",
      matchedDirectory: true,
    });

    // Null/blank inputs short-circuit to null without consulting the directory.
    expect(service.validateBookingCostCenter("tenant-demo-001", null)).toEqual({
      value: null,
      matchedDirectory: false,
    });
    expect(service.validateBookingCostCenter("tenant-demo-001", "   ")).toEqual(
      { value: null, matchedDirectory: false },
    );

    // Unknown code for a tenant whose directory is populated must throw.
    try {
      service.validateBookingCostCenter("tenant-demo-001", "CC-DOES-NOT-EXIST");
      throw new Error("Expected BOOKING_COST_CENTER_UNKNOWN to throw.");
    } catch (error) {
      expect(
        (
          error as { getResponse: () => { error: { code: string } } }
        ).getResponse().error.code,
      ).toBe("BOOKING_COST_CENTER_UNKNOWN");
    }

    // Malformed code (spaces / lowercase punctuation) rejected as INVALID.
    try {
      service.validateBookingCostCenter("tenant-demo-001", "bad code!");
      throw new Error("Expected BOOKING_COST_CENTER_INVALID to throw.");
    } catch (error) {
      expect(
        (
          error as { getResponse: () => { error: { code: string } } }
        ).getResponse().error.code,
      ).toBe("BOOKING_COST_CENTER_INVALID");
    }

    // Disabled code rejected with the dedicated error code.
    service.disableCostCenter("tenant-demo-001", {
      code: "CC-OPS-02",
      reason: "sunset",
    });
    try {
      service.validateBookingCostCenter("tenant-demo-001", "cc-ops-02");
      throw new Error("Expected BOOKING_COST_CENTER_DISABLED to throw.");
    } catch (error) {
      expect(
        (
          error as { getResponse: () => { error: { code: string } } }
        ).getResponse().error.code,
      ).toBe("BOOKING_COST_CENTER_DISABLED");
    }
  });

  it("validateBookingCostCenter grandfathers tenants whose directory is empty and isolates lookups by tenant", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    // Tenant with no cost centers: free-text accepted, no normalization to
    // avoid breaking historical bookings before tenant_admin onboards the
    // directory.
    const grandfather = service.validateBookingCostCenter(
      "tenant-no-directory-001",
      "Legacy / cost text",
    );
    expect(grandfather).toEqual({
      value: "Legacy / cost text",
      matchedDirectory: false,
    });

    // Seeded fixture tenant gets canonical validation.
    expect(
      service.validateBookingCostCenter("tenant-demo-001", "cc-fin-04"),
    ).toEqual({ value: "CC-FIN-04", matchedDirectory: true });

    // After tenant B onboards CC-X, tenant A still cannot use CC-X.
    service.upsertCostCenter("tenant-demo-002", {
      code: "CC-X",
      name: "Tenant B Special",
    });
    try {
      service.validateBookingCostCenter("tenant-demo-001", "CC-X");
      throw new Error(
        "Expected cross-tenant lookup to throw BOOKING_COST_CENTER_UNKNOWN.",
      );
    } catch (error) {
      expect(
        (
          error as { getResponse: () => { error: { code: string } } }
        ).getResponse().error.code,
      ).toBe("BOOKING_COST_CENTER_UNKNOWN");
    }
    expect(
      service.validateBookingCostCenter("tenant-demo-002", "cc-x"),
    ).toEqual({ value: "CC-X", matchedDirectory: true });
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
      requestHints: expect.objectContaining({
        flightNo: "BR102",
      }),
      attemptCount: 3,
      latestAttemptStatus: "error",
      latestAttemptReasonCode: "ISSUER_UNAVAILABLE",
    });
    expect(queue[1]).toMatchObject({
      partnerEntrySlug: "bank-demo-alpha-airport",
      verificationStatus: "ineligible",
      verificationReasonCode: "CARD_PROGRAM_NOT_ELIGIBLE",
      manualFallback: expect.objectContaining({
        required: false,
      }),
      requestHints: expect.objectContaining({
        cardLast4: "1357",
        flightNo: "CI220",
      }),
      attemptCount: 1,
      latestAttemptStatus: "ineligible",
      latestAttemptReasonCode: "CARD_PROGRAM_NOT_ELIGIBLE",
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

  it("review queue omits evidence-grade fields while evidence endpoint returns them", async () => {
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

    const verification = await service.verifyPartnerEligibility(
      {
        entrySlug: "bank-demo-beta-airport",
        referenceToken: "secret-token-redaction-test",
        cardholderName: "Redacted Traveler",
        flightNo: "BR999",
      },
      "req-eligibility-redaction-001",
    );

    const queue = service.listPartnerEligibilityReviewQueue(
      "req-eligibility-redaction-queue",
      {
        actorType: "ops_user",
        actorId: "ops-reviewer-002",
        realm: "ops",
        scopes: ["ops:dispatch:read"],
        requestId: "req-eligibility-redaction-queue",
      },
    );

    expect(queue).toHaveLength(1);
    const queueItem = queue[0];

    // Queue item must NOT contain evidence-grade fields
    expect(queueItem).not.toHaveProperty("referenceTokenHash");
    expect(queueItem).not.toHaveProperty("benefitReference");
    expect(queueItem).not.toHaveProperty("issuerAuthorizationRef");
    expect(queueItem).not.toHaveProperty("requestMetadata");
    expect(queueItem).not.toHaveProperty("contractSnapshot");
    expect(queueItem).not.toHaveProperty("attempts");
    expect(queueItem).not.toHaveProperty("adapterCode");
    expect(queueItem).not.toHaveProperty("adapterVersion");
    expect(queueItem).not.toHaveProperty("auditMetadata");

    // Queue item must contain triage-safe fields
    expect(queueItem).toMatchObject({
      eligibilityVerificationId: verification.eligibilityVerificationId,
      partnerEntrySlug: "bank-demo-beta-airport",
      verificationStatus: "manual_review",
      attemptCount: 3,
      requestHints: { cardLast4: null, flightNo: "BR999" },
    });

    // Evidence endpoint must still return all fields including secrets
    const detail = service.getPartnerEligibilityVerification(
      verification.eligibilityVerificationId,
      "req-eligibility-redaction-evidence",
    );
    expect(detail).toHaveProperty("referenceTokenHash");
    expect(detail).toHaveProperty("benefitReference");
    expect(detail).toHaveProperty("issuerAuthorizationRef");
    expect(detail.requestMetadata).toHaveProperty("cardholderName");
    expect(detail).toHaveProperty("contractSnapshot");
    expect(detail).toHaveProperty("attempts");
    expect(detail.attempts).toHaveLength(3);
    expect(detail).toHaveProperty("auditMetadata");
  });

  it("resolves manual-review and denial cases through the ops review lane", async () => {
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

    const denied = await service.verifyPartnerEligibility(
      {
        entrySlug: "bank-demo-alpha-airport",
        cardLast4: "1357",
        cardholderName: "Traveler Denied",
      },
      "req-eligibility-denied-resolve-001",
    );
    const manualReview = await service.verifyPartnerEligibility(
      {
        entrySlug: "bank-demo-beta-airport",
        referenceToken: "manual-review-token",
      },
      "req-eligibility-manual-resolve-001",
    );

    const approveResolution = service.resolvePartnerEligibilityReview(
      {
        eligibilityVerificationId: manualReview.eligibilityVerificationId,
        decision: "approve",
        reasonCode: "OFFLINE_ISSUER_CONFIRMATION_RECEIVED",
        notes: "Issuer helpdesk confirmed eligibility offline.",
      },
      "req-eligibility-resolve-approve-001",
      {
        actorType: "ops_user",
        actorId: "ops-reviewer-approve-001",
        realm: "ops",
        scopes: ["ops:dispatch:write"],
      },
    );
    expect(approveResolution).toMatchObject({
      eligibilityVerificationId: manualReview.eligibilityVerificationId,
      previousStatus: "manual_review",
      resolvedStatus: "eligible",
      decision: "approve",
      reasonCode: "OFFLINE_ISSUER_CONFIRMATION_RECEIVED",
      resolvedBy: "ops-reviewer-approve-001",
    });

    const denyResolution = service.resolvePartnerEligibilityReview(
      {
        eligibilityVerificationId: denied.eligibilityVerificationId,
        decision: "deny",
        reasonCode: "DENIAL_CONFIRMED_BY_REVIEW",
        notes: "Ops verified the issuer denial should stand.",
      },
      "req-eligibility-resolve-deny-001",
      {
        actorType: "ops_user",
        actorId: "ops-reviewer-deny-001",
        realm: "ops",
        scopes: ["ops:dispatch:write"],
      },
    );
    expect(denyResolution).toMatchObject({
      eligibilityVerificationId: denied.eligibilityVerificationId,
      previousStatus: "ineligible",
      resolvedStatus: "ineligible",
      decision: "deny",
      reasonCode: "DENIAL_CONFIRMED_BY_REVIEW",
      resolvedBy: "ops-reviewer-deny-001",
    });

    try {
      service.resolvePartnerEligibilityReview(
        {
          eligibilityVerificationId: denied.eligibilityVerificationId,
          decision: "approve",
          reasonCode: "OVERRIDE_REQUESTED_WITHOUT_APPROVAL",
          notes: "Attempted to release an explicit issuer denial.",
        },
        "req-eligibility-resolve-invalid-approve-001",
        {
          actorType: "ops_user",
          actorId: "ops-reviewer-invalid-approve-001",
          realm: "ops",
          scopes: ["ops:dispatch:write"],
        },
      );
      expect.unreachable(
        "approve on ineligible should require a separate override workflow",
      );
    } catch (error) {
      expect(error).toMatchObject({
        status: 409,
        response: {
          error: {
            code: "ELIGIBILITY_OVERRIDE_REQUIRED",
            details: expect.objectContaining({
              eligibilityVerificationId: denied.eligibilityVerificationId,
              currentStatus: "ineligible",
            }),
          },
        },
      });
    }

    const queueAfterResolution = service.listPartnerEligibilityReviewQueue(
      "req-eligibility-queue-post-resolve-001",
      {
        actorType: "ops_user",
        actorId: "ops-reviewer-queue-001",
        realm: "ops",
        scopes: ["ops:dispatch:read"],
      },
    );
    expect(queueAfterResolution).toHaveLength(1);
    expect(queueAfterResolution[0]).toMatchObject({
      eligibilityVerificationId: denied.eligibilityVerificationId,
      verificationStatus: "ineligible",
      decisionSource: "ops_manual_review",
      verificationReasonCode: "DENIAL_CONFIRMED_BY_REVIEW",
    });

    const resolvedDeniedReview = service.getPartnerEligibilityVerification(
      denied.eligibilityVerificationId,
      "req-eligibility-denied-detail-001",
    );
    expect(resolvedDeniedReview).toMatchObject({
      verificationStatus: "ineligible",
      decisionSource: "ops_manual_review",
      verificationReasonCode: "DENIAL_CONFIRMED_BY_REVIEW",
      manualFallback: expect.objectContaining({
        notes: "Ops verified the issuer denial should stand.",
      }),
      auditMetadata: expect.objectContaining({
        updatedBy: "ops-reviewer-deny-001",
      }),
    });

    const resolvedManualReview = service.getPartnerEligibilityVerification(
      manualReview.eligibilityVerificationId,
      "req-eligibility-manual-detail-001",
    );
    expect(resolvedManualReview).toMatchObject({
      verificationStatus: "eligible",
      decisionSource: "ops_manual_review",
      verificationReasonCode: "OFFLINE_ISSUER_CONFIRMATION_RECEIVED",
      manualFallback: expect.objectContaining({
        notes: "Issuer helpdesk confirmed eligibility offline.",
      }),
      auditMetadata: expect.objectContaining({
        updatedBy: "ops-reviewer-approve-001",
      }),
    });

    expect(auditNotificationService.listAuditLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "resolve_partner_eligibility_review",
          actorType: "ops_user",
          newValuesSummary: expect.objectContaining({
            previousStatus: "manual_review",
            resolvedStatus: "eligible",
            decision: "approve",
          }),
        }),
        expect.objectContaining({
          actionName: "resolve_partner_eligibility_review",
          actorType: "ops_user",
          newValuesSummary: expect.objectContaining({
            previousStatus: "ineligible",
            resolvedStatus: "ineligible",
            decision: "deny",
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

describe("TenantPartnerService approval rules", () => {
  it("creates, reorders, disables, and evaluates approval rules with audit events", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new TenantPartnerService(auditNotificationService);

    const created = service.upsertApprovalRule(
      "tenant-demo-001",
      {
        ruleName: "High-value approval",
        priority: 20,
        conditions: [
          {
            field: "booking.amount_minor",
            op: "gte",
            value: 100_000,
          },
        ],
        action: "require_approval",
        approvers: [{ kind: "tenant_admin" }],
      },
      "req-approval-rule-create-001",
    );

    const second = service.upsertApprovalRule(
      "tenant-demo-001",
      {
        ruleName: "Manual review passenger",
        priority: 30,
        conditions: [
          {
            field: "booking.passenger.role",
            op: "eq",
            value: "guest",
          },
        ],
        action: "flag_manual_review",
        approvers: [{ kind: "tenant_role", roleCode: "finance_admin" }],
      },
      "req-approval-rule-create-002",
    );

    const reordered = service.reorderApprovalRules(
      "tenant-demo-001",
      {
        orderedRuleIds: [second.ruleId, created.ruleId],
      },
      "req-approval-rule-reorder-001",
    );

    const disabled = service.disableApprovalRule(
      "tenant-demo-001",
      created.ruleId,
      "req-approval-rule-disable-001",
    );

    const evaluation = service.evaluateApprovalRules(
      "tenant-demo-001",
      {
        subject: {
          subjectType: "booking",
          bookingId: "booking-001",
          draftId: null,
          operation: "dry_run",
        },
        inputSnapshot: {
          costCenterCode: "CC-FIN-04",
          businessDispatchSubtype: "enterprise_dispatch",
          reservationWindowStart: "2026-05-13T10:00:00.000Z",
          passengerId: "passenger-001",
          passengerRole: "guest",
          amountMinor: 300_000,
          currency: "TWD",
          vehiclePreference: "standard_taxi",
        },
      },
      "req-approval-rule-evaluate-001",
    );

    expect(reordered.map((rule) => rule.priority)).toEqual([10, 20]);
    expect(disabled.activeFlag).toBe(false);
    expect(evaluation.outcome?.decision).toBe("manual_review");

    expect(auditNotificationService.listAuditLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "tenant.approval_rule.created",
          resourceId: created.ruleId,
        }),
        expect.objectContaining({
          actionName: "tenant.approval_rule.reordered",
          resourceId: "tenant-demo-001",
        }),
        expect.objectContaining({
          actionName: "tenant.approval_rule.disabled",
          resourceId: created.ruleId,
        }),
        expect.objectContaining({
          actionName: "booking.approval_rules.evaluated",
          resourceId: "tenant-demo-001",
        }),
      ]),
    );
  });

  it("rejects duplicate orderedRuleIds when reordering approval rules", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    const first = service.upsertApprovalRule("tenant-demo-001", {
      ruleName: "Rule one",
      priority: 10,
      conditions: [{ field: "booking.amount_minor", op: "gte", value: 1 }],
      action: "warn",
    });
    const second = service.upsertApprovalRule("tenant-demo-001", {
      ruleName: "Rule two",
      priority: 20,
      conditions: [{ field: "booking.amount_minor", op: "gte", value: 2 }],
      action: "warn",
    });

    expect(() =>
      service.reorderApprovalRules("tenant-demo-001", {
        orderedRuleIds: [second.ruleId, second.ruleId],
      }),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "TENANT_APPROVAL_RULE_REORDER_DUPLICATE_IDS",
          }),
        }),
      }),
    );

    expect(
      service.listApprovalRules("tenant-demo-001").map((rule) => rule.ruleId),
    ).toEqual([first.ruleId, second.ruleId]);
  });

  it("persists approval rule changes into the repository contract state", async () => {
    const repository = createInMemoryTenantPartnerRepository();
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );

    await service.onModuleInit();
    const created = service.upsertApprovalRule("tenant-demo-001", {
      ruleName: "Persisted approval",
      priority: 10,
      conditions: [
        {
          field: "booking.amount_minor",
          op: "gte",
          value: 1,
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_admin" }],
    });

    expect(repository.persistChanges).toHaveBeenCalled();
    expect(repository.getState().approvalRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: created.ruleId,
          tenantId: "tenant-demo-001",
        }),
      ]),
    );
  });

  it("records tenant quota policies and previews cost-center impacts", async () => {
    const repository = createInMemoryTenantPartnerRepository();
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );

    await service.onModuleInit();
    service.upsertTenantQuotaPolicy("tenant-demo-001", {
      period: "monthly",
      limit: {
        bookingCountLimit: 2,
        amountMinorLimit: 200_000,
        currency: "twd",
        enforcementMode: "require_approval",
      },
    });

    const preview = service.previewBookingQuotaImpact("tenant-demo-001", {
      costCenterCode: "CC-FIN-04",
      estimatedAmountMinor: 80_000,
      reservationWindowStart: "2026-05-31T15:30:00.000Z",
    });

    expect(preview.periodKey).toBe("2026-05");
    expect(preview.impacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "tenant",
          dimension: "booking_count",
          remainingBefore: 2,
          remainingAfter: 1,
        }),
        expect.objectContaining({
          scope: "cost_center",
          costCenterCode: "CC-FIN-04",
          dimension: "amount_minor",
          remainingBefore: 200_000,
          remainingAfter: 120_000,
        }),
      ]),
    );
    expect(repository.getState().quotaPolicies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: "tenant-demo-001",
          costCenterCode: null,
          period: "monthly",
        }),
      ]),
    );
  });

  it("throws QUOTA_INSUFFICIENT_AT_COMMIT when a hard-block reserve exceeds the limit", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    service.upsertTenantQuotaPolicy("tenant-demo-001", {
      period: "monthly",
      limit: {
        bookingCountLimit: 0,
        amountMinorLimit: null,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });

    await expect(
      service.reserveTenantQuota(null, {
        tenantId: "tenant-demo-001",
        bookingId: "booking-over-limit",
        evaluationId: "eval-over-limit",
        reservationWindowStart: "2026-05-13T10:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "QUOTA_INSUFFICIENT_AT_COMMIT",
        },
      },
    });
  });

  it("uses the caller transaction for database-backed quota reservations", async () => {
    const { repository } = createDatabaseQuotaRepository({
      bookingCountLimit: 1,
    });
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );
    const tx: TenantPartnerQueryExecutor = {
      query: vi.fn(async () => ({ rows: [] })) as never,
    };

    const result = await service.reserveTenantQuota(tx, {
      tenantId: "tenant-demo-001",
      bookingId: "booking-db-tx-001",
      evaluationId: "eval-db-tx-001",
      reservationWindowStart: "2026-05-13T10:00:00.000Z",
    });

    expect(repository.withTransaction).not.toHaveBeenCalled();
    expect(repository.loadQuotaPoliciesForUpdate).toHaveBeenCalledWith(
      tx,
      "tenant-demo-001",
      null,
    );
    expect(repository.loadQuotaMonthlySnapshotsForUpdate).toHaveBeenCalledWith(
      tx,
      "tenant-demo-001",
      null,
      "2026-05",
    );
    expect(repository.persistQuotaReservation).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        quotaLedger: [
          expect.objectContaining({
            bookingId: "booking-db-tx-001",
            dimension: "booking_count",
            entryType: "reserve",
            periodKey: "2026-05",
          }),
        ],
      }),
    );
    expect(result.ledgerEntries).toHaveLength(1);
  });

  it("blocks over-limit reservations on the database path before persisting ledger rows", async () => {
    const { repository } = createDatabaseQuotaRepository({
      bookingCountLimit: 0,
    });
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );

    await expect(
      service.reserveTenantQuota(null, {
        tenantId: "tenant-demo-001",
        bookingId: "booking-db-block-001",
        evaluationId: "eval-db-block-001",
        reservationWindowStart: "2026-05-13T10:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "QUOTA_INSUFFICIENT_AT_COMMIT",
        },
      },
    });

    expect(repository.withTransaction).toHaveBeenCalledTimes(1);
    expect(repository.persistQuotaReservation).not.toHaveBeenCalled();
  });

  it("serializes concurrent reserve calls so only one claimant gets the last quota unit", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    service.upsertTenantQuotaPolicy("tenant-demo-001", {
      period: "monthly",
      limit: {
        bookingCountLimit: 1,
        amountMinorLimit: null,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });

    const results = await Promise.allSettled([
      service.reserveTenantQuota(null, {
        tenantId: "tenant-demo-001",
        bookingId: "booking-race-1",
        evaluationId: "eval-race-1",
        reservationWindowStart: "2026-05-13T10:00:00.000Z",
      }),
      service.reserveTenantQuota(null, {
        tenantId: "tenant-demo-001",
        bookingId: "booking-race-2",
        evaluationId: "eval-race-2",
        reservationWindowStart: "2026-05-13T10:00:00.000Z",
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      service.getTenantQuotaSummary("tenant-demo-001").usage
        .pendingReservedBookingCount,
    ).toBe(1);
  });
});
