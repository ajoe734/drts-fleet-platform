import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { IdentityContext, OwnedOrderRecord } from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
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
    approvalRequests: [],
    approvalDecisions: [],
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

function serializeQuotaScopePart(costCenterCode: string | null) {
  if (costCenterCode === null) {
    return "null";
  }

  return `value:${costCenterCode.length}:${costCenterCode}`;
}

function createTenantOrder(
  overrides: Partial<OwnedOrderRecord> = {},
): OwnedOrderRecord {
  return {
    orderId: overrides.orderId ?? "order-tenant-demo-001",
    orderNo: overrides.orderNo ?? "ORD-000001",
    orderSource: overrides.orderSource ?? "portal",
    orderDomain: "owned",
    tenantId: overrides.tenantId ?? "tenant-demo-001",
    partnerId: overrides.partnerId ?? null,
    partnerProgramId: overrides.partnerProgramId ?? null,
    partnerEntrySlug: overrides.partnerEntrySlug ?? null,
    eligibilityVerificationId: overrides.eligibilityVerificationId ?? null,
    issuerAuthorizationRef: overrides.issuerAuthorizationRef ?? null,
    serviceBucket: "business_dispatch",
    dispatchSemantics: overrides.dispatchSemantics ?? "reservation",
    businessDispatchSubtype:
      overrides.businessDispatchSubtype ?? "enterprise_dispatch",
    status: overrides.status ?? "created",
    pickup: overrides.pickup ?? { address: "A St", lat: null, lng: null },
    dropoff: overrides.dropoff ?? { address: "B St", lat: null, lng: null },
    passenger: overrides.passenger ?? {
      passengerId: "rider-001",
      name: "Rider One",
      phone: "0912000000",
      roles: ["employee"],
    },
    bookingId: overrides.bookingId ?? "booking-001",
    bookingType: overrides.bookingType ?? "scheduled",
    etaSnapshot: overrides.etaSnapshot ?? null,
    callId: overrides.callId ?? null,
    recordingId: overrides.recordingId ?? null,
    reservationWindowStart:
      overrides.reservationWindowStart ?? "2099-06-05T10:00:00.000Z",
    reservationWindowEnd:
      overrides.reservationWindowEnd ?? "2099-06-05T11:00:00.000Z",
    recurrenceRule: overrides.recurrenceRule ?? null,
    modifiableUntil: overrides.modifiableUntil ?? null,
    cancelableUntil: overrides.cancelableUntil ?? null,
    bookedBy: overrides.bookedBy ?? {
      name: "Ops Booker",
      email: "ops@example.com",
    },
    onsiteContact: overrides.onsiteContact ?? null,
    costCenter: overrides.costCenter ?? "ENG",
    vehiclePreference: overrides.vehiclePreference ?? null,
    benefitReference: overrides.benefitReference ?? null,
    direction: overrides.direction ?? null,
    flightNo: overrides.flightNo ?? null,
    terminal: overrides.terminal ?? null,
    luggageCount: overrides.luggageCount ?? null,
    notes: overrides.notes ?? null,
    fixedPrice: overrides.fixedPrice ?? true,
    quotedFare: overrides.quotedFare ?? {
      currency: "NTD",
      amountMinor: 100000,
    },
    quotedFareSource: overrides.quotedFareSource ?? "pricing_rule",
    quotedFareRuleVersion: overrides.quotedFareRuleVersion ?? "pricing-rule-v1",
    manualFareOverride: overrides.manualFareOverride ?? null,
    exceptionHold: overrides.exceptionHold ?? null,
    proofRequirements: overrides.proofRequirements ?? {
      minPhotoCount: 0,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    approvalState: overrides.approvalState ?? "not_required",
    approvalRequestIds: overrides.approvalRequestIds ?? [],
    complianceGates: overrides.complianceGates ?? [],
    complianceFlags: overrides.complianceFlags ?? [],
    cancelledAt: overrides.cancelledAt ?? null,
    cancelReason: overrides.cancelReason ?? null,
    reservationHoldStatus: overrides.reservationHoldStatus ?? "not_required",
    reservationHoldId: overrides.reservationHoldId ?? null,
    reservationHoldExpiresAt: overrides.reservationHoldExpiresAt ?? null,
    queueFamily: overrides.queueFamily ?? null,
    queueEntryReason: overrides.queueEntryReason ?? null,
    dispatchAttemptCount: overrides.dispatchAttemptCount ?? 0,
    lastDispatchFailureReason: overrides.lastDispatchFailureReason ?? null,
    noSupplyEscalation: overrides.noSupplyEscalation ?? null,
    dispatchTimeout: overrides.dispatchTimeout ?? null,
    createdAt: overrides.createdAt ?? "2026-03-01T09:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-01T09:00:00.000Z",
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

function withoutKeys<T>(
  current: readonly T[],
  keys: readonly string[] | undefined,
  keyOf: (value: T) => string,
) {
  if (!keys || keys.length === 0) {
    return [...current];
  }

  const removed = new Set(keys);
  return current.filter((value) => !removed.has(keyOf(value)));
}

function createInMemoryTenantPartnerRepository(
  initialState: TenantPartnerState = createEmptyRepositoryState(),
) {
  let state = cloneState(initialState);

  return {
    isEnabled: vi.fn(() => false),
    loadState: vi.fn(async () => cloneState(state)),
    persistChanges: vi.fn(async (changes: PersistTenantPartnerChanges) => {
      const nextState = {
        notificationPreferences: withoutKeys(
          state.notificationPreferences,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        webhookEndpoints: withoutKeys(
          state.webhookEndpoints,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        webhookDeliveries: withoutKeys(
          state.webhookDeliveries,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        slaProfiles: withoutKeys(
          state.slaProfiles,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        partnerEntries: withoutKeys(
          state.partnerEntries,
          changes.deletedPartnerEntrySlugs ?? changes.deletedTenantIds,
          (value) =>
            changes.deletedPartnerEntrySlugs ? value.entrySlug : value.tenantId,
        ),
        partnerIngressCredentials: withoutKeys(
          withoutKeys(
            state.partnerIngressCredentials,
            changes.deletedPartnerEntrySlugs,
            (value) => value.entrySlug,
          ),
          changes.deletedPartnerIngressCredentialIds,
          (value) => value.keyId,
        ),
        partnerEligibilityVerifications: withoutKeys(
          state.partnerEligibilityVerifications,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        approvalRules: withoutKeys(
          state.approvalRules,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        approvalRequests: withoutKeys(
          state.approvalRequests,
          changes.deletedApprovalRequestIds ?? changes.deletedTenantIds,
          (value) =>
            changes.deletedApprovalRequestIds
              ? value.approvalRequestId
              : value.tenantId,
        ),
        approvalDecisions: withoutKeys(
          withoutKeys(
            state.approvalDecisions,
            changes.deletedApprovalRequestIds,
            (value) => value.approvalRequestId,
          ),
          changes.deletedApprovalDecisionIds,
          (value) => value.decisionId,
        ),
        passengers: withoutKeys(
          state.passengers,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        addresses: withoutKeys(
          state.addresses,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        costCenters: withoutKeys(
          state.costCenters,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        quotaPolicies: withoutKeys(
          state.quotaPolicies,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        quotaLedger: withoutKeys(
          state.quotaLedger,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        quotaMonthlySnapshots: withoutKeys(
          state.quotaMonthlySnapshots,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        userRoles: withoutKeys(
          state.userRoles,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
        apiKeys: withoutKeys(
          state.apiKeys,
          changes.deletedTenantIds,
          (value) => value.tenantId,
        ),
      };

      state = {
        notificationPreferences: mergeByKey(
          nextState.notificationPreferences,
          changes.notificationPreferences,
          (value) => value.tenantId,
        ),
        webhookEndpoints: mergeByKey(
          nextState.webhookEndpoints,
          changes.webhookEndpoints,
          (value) => value.webhookId,
        ),
        webhookDeliveries: mergeByKey(
          nextState.webhookDeliveries,
          changes.webhookDeliveries,
          (value) => value.deliveryId,
        ),
        slaProfiles: mergeByKey(
          nextState.slaProfiles,
          changes.slaProfiles,
          (value) => value.tenantId,
        ),
        partnerEntries: mergeByKey(
          nextState.partnerEntries,
          changes.partnerEntries,
          (value) => value.entrySlug,
        ),
        partnerIngressCredentials: mergeByKey(
          nextState.partnerIngressCredentials,
          changes.partnerIngressCredentials,
          (value) => value.keyId,
        ),
        partnerEligibilityVerifications: mergeByKey(
          nextState.partnerEligibilityVerifications,
          changes.partnerEligibilityVerifications,
          (value) => value.eligibilityVerificationId,
        ),
        approvalRules: mergeByKey(
          nextState.approvalRules,
          changes.approvalRules,
          (value) => value.ruleId,
        ),
        approvalRequests: mergeByKey(
          nextState.approvalRequests,
          changes.approvalRequests,
          (value) => value.approvalRequestId,
        ),
        approvalDecisions: mergeByKey(
          nextState.approvalDecisions,
          changes.approvalDecisions,
          (value) => value.decisionId,
        ),
        passengers: mergeByKey(
          nextState.passengers,
          changes.passengers,
          (value) => value.passengerId,
        ),
        addresses: mergeByKey(
          nextState.addresses,
          changes.addresses,
          (value) => value.addressId,
        ),
        costCenters: mergeByKey(
          nextState.costCenters,
          changes.costCenters,
          (value) => `${value.tenantId}:${value.code}`,
        ),
        quotaPolicies: mergeByKey(
          nextState.quotaPolicies,
          changes.quotaPolicies,
          (value) =>
            `${value.tenantId}:${serializeQuotaScopePart(value.costCenterCode)}:${value.period}`,
        ),
        quotaLedger: mergeByKey(
          nextState.quotaLedger,
          changes.quotaLedger,
          (value) => value.ledgerEntryId,
        ),
        quotaMonthlySnapshots: mergeByKey(
          nextState.quotaMonthlySnapshots,
          changes.quotaMonthlySnapshots,
          (value) =>
            `${value.tenantId}:${serializeQuotaScopePart(value.costCenterCode)}:${value.period}:${value.periodKey}`,
        ),
        userRoles: mergeByKey(
          nextState.userRoles,
          changes.userRoles,
          (value) => value.userId,
        ),
        apiKeys: mergeByKey(
          nextState.apiKeys,
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
    loadQuotaLedgerForBookingForUpdate: vi.fn(async () => []),
    claimQuotaLedgerEntries: vi.fn(async (_tx, entries) => entries),
    persistQuotaReservation: vi.fn(async () => {}),
  };

  return { repository, executor };
}

describe("TenantPartnerService sensitive-data governance", () => {
  const originalDrtsEnv = process.env.DRTS_ENV;

  afterEach(() => {
    delete process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT;
    delete process.env.PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT;
    delete process.env.PARTNER_INGRESS_KEY_CTBC;
    delete process.env.PARTNER_INGRESS_KEY_CATHAY;
    delete process.env.PARTNER_INGRESS_KEY_TAISHIN;
    delete process.env.PARTNER_INGRESS_KEY_DBS;
    if (originalDrtsEnv === undefined) {
      delete process.env.DRTS_ENV;
    } else {
      process.env.DRTS_ENV = originalDrtsEnv;
    }
  });

  it("reconciles canonical partner-booking route seeds without duplicating persisted entries", async () => {
    const existingSeedService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const persistedState = createEmptyRepositoryState();
    persistedState.partnerEntries = [
      existingSeedService.getPartnerEntry("bank-demo-alpha-airport"),
    ];
    const repository = createInMemoryTenantPartnerRepository(persistedState);
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );

    await service.onModuleInit();

    expect(service.getPartnerEntry("ctbc")).toMatchObject({
      entrySlug: "ctbc",
      businessDispatchSubtype: "credit_card_airport_transfer",
      auditMetadata: {
        source: "dev_seed_partner_booking_surface",
        requestId: "seed-partner-booking-ctbc",
      },
    });
    expect(service.getPartnerEntry("cathay")).toMatchObject({
      entrySlug: "cathay",
      bankCode: "CATHAY",
      businessDispatchSubtype: "credit_card_airport_transfer",
    });
    expect(service.getPartnerEntry("taishin")).toMatchObject({
      entrySlug: "taishin",
      bankCode: "TAISHIN",
      businessDispatchSubtype: "credit_card_airport_transfer",
    });
    expect(service.getPartnerEntry("dbs")).toMatchObject({
      entrySlug: "dbs",
      bankCode: "DBS",
      businessDispatchSubtype: "credit_card_airport_transfer",
    });
    expect(service.getPartnerEntry("fubon")).toMatchObject({
      entrySlug: "fubon",
      businessDispatchSubtype: "insurance_replacement_vehicle",
    });
    expect(service.getPartnerEntry("lion")).toMatchObject({
      entrySlug: "lion",
      businessDispatchSubtype: "travel_agency_transfer",
    });

    const persistedPartnerEntries = repository.persistChanges.mock.calls
      .flatMap(([changes]) => changes.partnerEntries ?? [])
      .map((entry) => entry.entrySlug);
    expect(persistedPartnerEntries).toEqual(
      expect.arrayContaining([
        "ctbc",
        "cathay",
        "taishin",
        "dbs",
        "fubon",
        "lion",
      ]),
    );
    expect(
      persistedPartnerEntries.filter(
        (entrySlug) => entrySlug === "bank-demo-alpha-airport",
      ),
    ).toHaveLength(0);
  });

  it("reconciles newly configured issuer credentials into legacy persisted state", async () => {
    const persistedState = createEmptyRepositoryState();
    persistedState.partnerIngressCredentials = [
      {
        keyId: "partner-key-alpha-demo",
        entrySlug: "bank-demo-alpha-airport",
        keyPrefix: "env_bootstrap",
        maskedSuffix: "configured",
        source: "env_bootstrap",
        createdAt: "2026-04-10T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
        issuedBy: "system:env_bootstrap",
        revokedBy: null,
        rotationReason: null,
        revokeReason: null,
        keyHash: "a".repeat(64),
      } satisfies StoredPartnerIngressCredentialRecord,
    ];
    const repository = createInMemoryTenantPartnerRepository(persistedState);
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
      undefined,
      [
        {
          entrySlug: "bank-demo-alpha-airport",
          keyId: "partner-key-alpha-demo",
          apiKeyHash: "a".repeat(64),
        },
        {
          entrySlug: "ctbc",
          keyId: "partner-key-ctbc-dev",
          apiKeyHash: "b".repeat(64),
        },
      ],
    );

    await service.onModuleInit();

    expect(repository.getState().partnerIngressCredentials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyId: "partner-key-alpha-demo",
          entrySlug: "bank-demo-alpha-airport",
        }),
        expect.objectContaining({
          keyId: "partner-key-ctbc-dev",
          entrySlug: "ctbc",
          source: "env_bootstrap",
        }),
      ]),
    );
    await expect(
      service.issuePartnerIngressHandoff(
        {
          entrySlug: "ctbc",
          partnerUserRef: "ctbc-user-001",
        },
        "req-ctbc-handoff-001",
        { allowInternalBootstrap: true },
      ),
    ).resolves.toMatchObject({
      partnerEntry: { entrySlug: "ctbc" },
      identity: {
        actorType: "referral_passenger",
        partnerEntrySlug: "ctbc",
      },
    });
  });

  it("strips demo tenant graph from persisted state in strict auth environments", async () => {
    const localSeedService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const persistedState = createEmptyRepositoryState();
    persistedState.notificationPreferences = [
      localSeedService.getNotificationPreferences("tenant-demo-001"),
      {
        tenantId: "tenant-acme",
        bookingDigestEnabled: true,
        bookingDigestChannel: "email",
        bookingDigestRecipients: ["ops@acme.example"],
        approvalDigestEnabled: true,
        approvalDigestChannel: "email",
        approvalDigestRecipients: ["approvals@acme.example"],
        subscriptions: [],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ];
    persistedState.slaProfiles = [
      localSeedService.getSlaProfile("tenant-demo-001"),
      {
        tenantId: "tenant-acme",
        bookingResponseMinutes: 10,
        dispatchAssignmentMinutes: 15,
        driverArrivalMinutes: 20,
        completionGraceMinutes: 30,
        activeFlag: true,
        escalationRouting: ["ops"],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ];
    persistedState.partnerEntries = [localSeedService.getPartnerEntry("ctbc")];
    persistedState.partnerIngressCredentials = [
      {
        keyId: "partner-key-ctbc-dev",
        entrySlug: "ctbc",
        keyPrefix: "env_bootstrap",
        maskedSuffix: "configured",
        source: "env_bootstrap",
        createdAt: "2026-04-10T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
        issuedBy: "system:env_bootstrap",
        revokedBy: null,
        rotationReason: null,
        revokeReason: null,
        keyHash: "c".repeat(64),
      },
    ];
    persistedState.passengers = [
      localSeedService.listPassengers("tenant-demo-001")[0]!,
    ];
    persistedState.addresses = [localSeedService.listAddresses("tenant-demo-001")[0]!];
    persistedState.costCenters = localSeedService.listCostCenters("tenant-demo-001");
    persistedState.userRoles = localSeedService.listTenantUsers("tenant-demo-001");
    persistedState.apiKeys = [
      localSeedService.listApiKeys("tenant-demo-001")[0] as never,
    ];
    process.env.DRTS_ENV = "staging";
    const repository = createInMemoryTenantPartnerRepository(
      cloneState(persistedState),
    );
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );

    await service.onModuleInit();

    expect(service.listPassengers("tenant-demo-001")).toEqual([]);
    expect(service.listAddresses("tenant-demo-001")).toEqual([]);
    expect(service.listCostCenters("tenant-demo-001")).toEqual([]);
    expect(service.listTenantUsers("tenant-demo-001")).toEqual([]);
    expect(service.listApiKeys("tenant-demo-001")).toEqual([]);
    expect(() => service.getPartnerEntry("ctbc")).toThrow(ApiRequestError);
    expect(service.getNotificationPreferences("tenant-acme")).toMatchObject({
      tenantId: "tenant-acme",
    });
    expect(service.getSlaProfile("tenant-acme")).toMatchObject({
      tenantId: "tenant-acme",
    });
    expect(repository.persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationPreferences: [
          expect.objectContaining({ tenantId: "tenant-acme" }),
        ],
        deletedTenantIds: ["tenant-demo-001"],
        deletedPartnerEntrySlugs: ["ctbc"],
        deletedPartnerIngressCredentialIds: ["partner-key-ctbc-dev"],
        partnerEntries: [],
        userRoles: [],
      }),
    );
    expect(repository.getState().notificationPreferences).toEqual([
      expect.objectContaining({ tenantId: "tenant-acme" }),
    ]);
    expect(repository.getState().partnerEntries).toEqual([]);
    expect(repository.getState().userRoles).toEqual([]);
  });

  it("does not resurrect revoked credentials or replace rotated credentials from seeds", async () => {
    const persistedState = createEmptyRepositoryState();
    persistedState.partnerIngressCredentials = [
      {
        keyId: "partner-key-ctbc-revoked",
        entrySlug: "ctbc",
        keyPrefix: "pk_revoked",
        maskedSuffix: "0001",
        source: "platform_issued",
        createdAt: "2026-07-01T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: "2026-07-02T00:00:00.000Z",
        issuedBy: "platform-admin-001",
        revokedBy: "platform-admin-001",
        rotationReason: null,
        revokeReason: "partner_offboarding",
        keyHash: "c".repeat(64),
      },
      {
        keyId: "partner-key-cathay-rotated",
        entrySlug: "cathay",
        keyPrefix: "pk_rotated",
        maskedSuffix: "0002",
        source: "platform_issued",
        createdAt: "2026-07-03T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
        issuedBy: "platform-admin-001",
        revokedBy: null,
        rotationReason: "scheduled_rotation",
        revokeReason: null,
        keyHash: "d".repeat(64),
      },
    ];
    const repository = createInMemoryTenantPartnerRepository(persistedState);
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
      undefined,
      [
        {
          entrySlug: "ctbc",
          keyId: "partner-key-ctbc-dev",
          apiKeyHash: "e".repeat(64),
        },
        {
          entrySlug: "cathay",
          keyId: "partner-key-cathay-dev",
          apiKeyHash: "f".repeat(64),
        },
      ],
    );

    await service.onModuleInit();

    expect(repository.getState().partnerIngressCredentials).toEqual(
      persistedState.partnerIngressCredentials,
    );
    expect(
      repository.persistChanges.mock.calls.flatMap(
        ([changes]) => changes.partnerIngressCredentials ?? [],
      ),
    ).toHaveLength(0);
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

  it("loads canonical airport issuer ingress credentials from environment secrets", () => {
    process.env.PARTNER_INGRESS_KEY_CATHAY = "pk_test_cathay_ingress_secret";

    const service = new TenantPartnerService(new AuditNotificationService());
    const resolution = service.authenticatePartnerBootstrap(
      {
        entrySlug: "cathay",
        apiKey: "pk_test_cathay_ingress_secret",
      },
      "req-partner-cathay-001",
    );

    expect(resolution.identity).toMatchObject({
      actorType: "partner_api_key",
      actorId: "partner-key-cathay-dev",
      realm: "partner",
      tenantId: "tenant-demo-001",
      partnerEntrySlug: "cathay",
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

  it("allows a matching handoff passenger to verify partner eligibility", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    await expect(
      service.verifyPartnerEligibility(
        {
          entrySlug: "bank-demo-alpha-airport",
          cardLast4: "2468",
        },
        "req-eligibility-handoff-001",
        {
          actorType: "referral_passenger",
          actorId: "passenger-handoff-001",
          realm: "partner",
          tenantId: "tenant-demo-001",
          partnerId: "partner-bank-demo-001",
          partnerProgramId: "program-airport-alpha",
          partnerEntrySlug: "bank-demo-alpha-airport",
          requestId: "req-eligibility-handoff-001",
        },
      ),
    ).resolves.toMatchObject({
      partnerEntrySlug: "bank-demo-alpha-airport",
      verificationStatus: "eligible",
    });
  });

  it("rejects a handoff passenger scoped to another partner entry", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    await expect(
      service.verifyPartnerEligibility(
        {
          entrySlug: "bank-demo-beta-airport",
          cardLast4: "2468",
        },
        "req-eligibility-handoff-002",
        {
          actorType: "referral_passenger",
          actorId: "passenger-handoff-001",
          realm: "partner",
          tenantId: "tenant-demo-001",
          partnerId: "partner-bank-demo-001",
          partnerProgramId: "program-airport-alpha",
          partnerEntrySlug: "bank-demo-alpha-airport",
          requestId: "req-eligibility-handoff-002",
        },
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "PARTNER_SCOPE_MISMATCH",
        },
      },
    });
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
      status: "overlap_active",
      revokedAt: null,
      overlapEndsAt: expect.any(String),
      supersededByKeyId: issued.credential.keyId,
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
              code: "PARTNER_API_KEY_REVOKED",
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

  it("keeps rotated partner ingress credentials in overlap and fails closed for wrong-entry or auto-revoked keys", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-02T12:00:00.000Z"));
      process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
        "pk_test_alpha_ingress_secret";
      process.env.PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT =
        "pk_test_beta_ingress_secret";

      const service = new TenantPartnerService(new AuditNotificationService());
      const issued = service.issuePlatformPartnerIngressCredential(
        "bank-demo-alpha-airport",
        {
          rotationReason: "scheduled_rotation",
          overlapDays: 1,
        },
        "req-partner-overlap-001",
      );

      expect(issued.overlapEndsAt).toBe("2026-08-03T12:00:00.000Z");
      expect(
        service.listPlatformPartnerIngressCredentials("bank-demo-alpha-airport"),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyId: issued.credential.keyId,
            status: "active",
          }),
          expect.objectContaining({
            keyId: "partner-key-alpha-demo",
            status: "overlap_active",
            overlapEndsAt: "2026-08-03T12:00:00.000Z",
            supersededByKeyId: issued.credential.keyId,
          }),
        ]),
      );

      const overlapResolution = service.authenticatePartnerBootstrap(
        {
          entrySlug: "bank-demo-alpha-airport",
          apiKey: "pk_test_alpha_ingress_secret",
        },
        "req-partner-overlap-002",
      );
      expect(overlapResolution.identity.actorId).toBe("partner-key-alpha-demo");

      expect(() =>
        service.authenticatePartnerBootstrap(
          {
            entrySlug: "bank-demo-beta-airport",
            apiKey: "pk_test_alpha_ingress_secret",
          },
          "req-partner-overlap-003",
        ),
      ).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "PARTNER_API_KEY_INVALID",
            }),
          }),
        }),
      );

      vi.setSystemTime(new Date("2026-08-04T12:00:00.000Z"));

      expect(() =>
        service.authenticatePartnerBootstrap(
          {
            entrySlug: "bank-demo-alpha-airport",
            apiKey: "pk_test_alpha_ingress_secret",
          },
          "req-partner-overlap-004",
        ),
      ).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "PARTNER_API_KEY_REVOKED",
            }),
          }),
        }),
      );

      expect(
        service.listPlatformPartnerIngressCredentials("bank-demo-alpha-airport"),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyId: "partner-key-alpha-demo",
            status: "auto_revoked",
            autoRevokedAt: "2026-08-03T12:00:00.000Z",
            revokeReason: "rotation_overlap_elapsed",
          }),
        ]),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects expired partner credentials and records dormant partner credential use", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-02T08:00:00.000Z"));
      const auditNotificationService = new AuditNotificationService();
      const service = new TenantPartnerService(auditNotificationService);

      const expiring = service.issuePlatformPartnerIngressCredential(
        "bank-demo-alpha-airport",
        {
          rotationReason: "short_lived",
          expiresAt: "2026-08-02T09:00:00.000Z",
        },
        "req-partner-expiry-001",
      );

      vi.setSystemTime(new Date("2026-08-02T10:00:00.000Z"));

      expect(() =>
        service.authenticatePartnerBootstrap(
          {
            entrySlug: "bank-demo-alpha-airport",
            apiKey: expiring.plaintextKey,
          },
          "req-partner-expiry-002",
        ),
      ).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "PARTNER_API_KEY_EXPIRED",
            }),
          }),
        }),
      );

      const dormant = service.issuePlatformPartnerIngressCredential(
        "bank-demo-beta-airport",
        {
          rotationReason: "dormancy_probe",
        },
        "req-partner-dormant-001",
      );

      vi.setSystemTime(new Date("2026-09-05T10:00:00.000Z"));

      const dormantResolution = service.authenticatePartnerBootstrap(
        {
          entrySlug: "bank-demo-beta-airport",
          apiKey: dormant.plaintextKey,
        },
        "req-partner-dormant-002",
      );
      expect(dormantResolution.identity.actorId).toBe(dormant.credential.keyId);
      expect(auditNotificationService.listNotifications()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            channel: "ops_notice",
            title: "Dormant partner credential used",
          }),
        ]),
      );
      expect(
        service.listPlatformPartnerIngressCredentials("bank-demo-beta-airport"),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyId: dormant.credential.keyId,
            lastUsedWorkload: "partner_bootstrap",
          }),
        ]),
      );
    } finally {
      vi.useRealTimers();
    }
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
          revokedAt: null,
          revokeReason: null,
          status: "overlap_active",
          overlapEndsAt: expect.any(String),
          supersededByKeyId: issued.credential.keyId,
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
          revokedAt: null,
          revokeReason: null,
          status: "overlap_active",
          overlapEndsAt: expect.any(String),
          supersededByKeyId: issued.credential.keyId,
        }),
      ]),
    );
  });

  it("bootstraps tenant users when persisted snapshots exist without a user directory", async () => {
    const initialState = createEmptyRepositoryState();
    initialState.costCenters = [
      {
        tenantId: "tenant-demo-001",
        code: "CC-PERSISTED",
        name: "Persisted cost center",
        description: null,
        ownerUserId: null,
        ownerName: null,
        activeFlag: true,
        disabledAt: null,
        disabledReason: null,
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-04-10T00:00:00.000Z",
      },
    ];
    const repository = createInMemoryTenantPartnerRepository(initialState);
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );

    await service.onModuleInit();

    expect(service.listTenantUsers("tenant-demo-001")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "admin@acme.example",
          roleCode: "tenant_admin",
          status: "active",
        }),
        expect.objectContaining({
          email: "finance@acme.example",
          roleCode: "tenant_finance_admin",
          status: "active",
        }),
      ]),
    );
    expect(repository.getState().userRoles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "admin@acme.example",
          roleCode: "tenant_admin",
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

  it("does not expose an eligibility id before required persistence completes", async () => {
    let releasePersistence!: () => void;
    const persistence = new Promise<void>((resolvePersistence) => {
      releasePersistence = resolvePersistence;
    });
    const repository = {
      isEnabled: vi.fn(() => true),
      persistChanges: vi.fn(() => persistence),
      reportPersistenceFailure: vi.fn(),
    };
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );
    let settled = false;

    const verificationPromise = service
      .verifyPartnerEligibility({
        entrySlug: "bank-demo-alpha-airport",
        cardLast4: "1234",
      })
      .then((verification) => {
        settled = true;
        return verification;
      });

    await vi.waitFor(() => {
      expect(repository.persistChanges).toHaveBeenCalledOnce();
    });
    expect(settled).toBe(false);

    releasePersistence();
    const verification = await verificationPromise;
    expect(verification.verificationStatus).toBe("eligible");
    expect(repository.persistChanges).toHaveBeenCalledWith({
      partnerEligibilityVerifications: [
        expect.objectContaining({
          eligibilityVerificationId: verification.eligibilityVerificationId,
        }),
      ],
    });
  });

  it("resolves eligibility persisted by another API instance", async () => {
    const producer = new TenantPartnerService(new AuditNotificationService());
    const persistedVerification = await producer.verifyPartnerEligibility({
      entrySlug: "bank-demo-alpha-airport",
      cardLast4: "1234",
    });
    let authorityVerification = persistedVerification;
    const repository = {
      isEnabled: vi.fn(() => true),
      findPartnerEligibilityVerification: vi.fn(
        async () => authorityVerification,
      ),
      reportPersistenceFailure: vi.fn(),
    };
    const consumer = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );

    await expect(
      consumer.hydratePartnerEligibilityVerification(
        persistedVerification.eligibilityVerificationId,
        {
          actorType: "referral_passenger",
          actorId: "passenger-cross-instance-001",
          realm: "partner",
          tenantId: persistedVerification.tenantId,
          partnerId: persistedVerification.partnerId,
          partnerProgramId: persistedVerification.partnerProgramId,
          partnerEntrySlug: persistedVerification.partnerEntrySlug,
          scopes: ["partner:book"],
        },
      ),
    ).resolves.toBeUndefined();
    expect(
      consumer.getPartnerEligibilityVerification(
        persistedVerification.eligibilityVerificationId,
      ),
    ).toEqual(persistedVerification);
    authorityVerification = {
      ...persistedVerification,
      verificationStatus: "ineligible",
      updatedAt: new Date(
        Date.parse(persistedVerification.updatedAt) + 1_000,
      ).toISOString(),
    };
    await consumer.hydratePartnerEligibilityVerification(
      persistedVerification.eligibilityVerificationId,
      {
        actorType: "referral_passenger",
        actorId: "passenger-cross-instance-001",
        realm: "partner",
        tenantId: persistedVerification.tenantId,
        partnerId: persistedVerification.partnerId,
        partnerProgramId: persistedVerification.partnerProgramId,
        partnerEntrySlug: persistedVerification.partnerEntrySlug,
        scopes: ["partner:book"],
      },
    );
    expect(
      consumer.getPartnerEligibilityVerification(
        persistedVerification.eligibilityVerificationId,
      ).verificationStatus,
    ).toBe("ineligible");
    expect(repository.findPartnerEligibilityVerification).toHaveBeenCalledWith(
      persistedVerification.eligibilityVerificationId,
    );
    await expect(
      consumer.hydratePartnerEligibilityVerification(
        persistedVerification.eligibilityVerificationId,
        {
          actorType: "referral_passenger",
          actorId: "foreign-passenger-001",
          realm: "partner",
          tenantId: "tenant-foreign-001",
          partnerId: persistedVerification.partnerId,
          partnerProgramId: persistedVerification.partnerProgramId,
          partnerEntrySlug: persistedVerification.partnerEntrySlug,
          scopes: ["partner:book"],
        },
      ),
    ).rejects.toMatchObject({
      response: { error: { code: "PARTNER_SCOPE_MISMATCH" } },
    });
  });

  it("allows unscoped partner_api_key callers to hydrate partner eligibility verifications", async () => {
    const producer = new TenantPartnerService(new AuditNotificationService());
    const persistedVerification = await producer.verifyPartnerEligibility({
      entrySlug: "bank-demo-alpha-airport",
      cardLast4: "2468",
    });
    const repository = {
      isEnabled: vi.fn(() => true),
      findPartnerEligibilityVerification: vi.fn(
        async () => persistedVerification,
      ),
      reportPersistenceFailure: vi.fn(),
    };
    const consumer = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );

    await expect(
      consumer.hydratePartnerEligibilityVerification(
        persistedVerification.eligibilityVerificationId,
        {
          actorType: "partner_api_key",
          actorId: "partner-key-alpha-demo",
          realm: "partner",
          scopes: ["partner:book"],
        },
      ),
    ).resolves.toBeUndefined();

    expect(
      consumer.getPartnerEligibilityVerification(
        persistedVerification.eligibilityVerificationId,
      ),
    ).toEqual(persistedVerification);
  });

  it("loads and atomically resolves a review created by another API instance", async () => {
    const producer = new TenantPartnerService(new AuditNotificationService());
    const verified = await producer.verifyPartnerEligibility({
      entrySlug: "bank-demo-alpha-airport",
      cardLast4: "1234",
    });
    const persistedReview = {
      ...verified,
      verificationStatus: "manual_review" as const,
      verificationReasonCode: "ISSUER_REVIEW_REQUIRED",
    };
    const repository = {
      isEnabled: vi.fn(() => true),
      listPartnerEligibilityReviewQueue: vi
        .fn()
        .mockResolvedValue([persistedReview]),
      findPartnerEligibilityVerification: vi
        .fn()
        .mockResolvedValue(persistedReview),
      compareAndSetPartnerEligibilityVerification: vi
        .fn()
        .mockResolvedValue(true),
      reportPersistenceFailure: vi.fn(),
    };
    const consumer = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );

    await expect(
      consumer.resolvePartnerEligibilityReviewQueue(),
    ).resolves.toEqual([
      expect.objectContaining({
        eligibilityVerificationId: persistedReview.eligibilityVerificationId,
        verificationStatus: "manual_review",
      }),
    ]);
    await expect(
      consumer.resolvePartnerEligibilityReview({
        eligibilityVerificationId: persistedReview.eligibilityVerificationId,
        decision: "approve",
        reasonCode: "OFFLINE_ISSUER_CONFIRMATION_RECEIVED",
        notes: null,
      }),
    ).resolves.toMatchObject({
      previousStatus: "manual_review",
      resolvedStatus: "eligible",
    });
    expect(
      repository.compareAndSetPartnerEligibilityVerification,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        eligibilityVerificationId: persistedReview.eligibilityVerificationId,
        verificationStatus: "eligible",
      }),
      persistedReview.updatedAt,
    );
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
          actionName: "tenant.cost_center.created",
          resourceType: "tenant_cost_center",
          resourceId: "CC-RD-12",
        }),
        expect.objectContaining({
          actionName: "disable_cost_center",
          resourceType: "tenant_cost_center",
          resourceId: "CC-RD-12",
        }),
        expect.objectContaining({
          actionName: "tenant.cost_center.disabled",
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

  it("limits tenant API key rotation to dual overlap and auto-revokes elapsed overlaps", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));
      const service = new TenantPartnerService(new AuditNotificationService());

      const first = service.issueApiKey("tenant-demo-001", {
        keyName: "Partner sync key",
        scopes: ["tenant:write"],
        ownerRef: "tenant-admin-001",
        ownerName: "Tenant Admin",
        ownerType: "tenant_admin",
        purpose: "partner sync",
      });
      expect(first.apiKey).toMatchObject({
        ownerRef: "tenant-admin-001",
        ownerName: "Tenant Admin",
        ownerType: "tenant_admin",
        purpose: "partner sync",
        status: "active",
        signals: expect.objectContaining({
          approachingExpiry: false,
          expired: false,
        }),
      });

      vi.setSystemTime(new Date("2026-08-03T00:00:00.000Z"));
      const second = service.rotateApiKey(
        "tenant-demo-001",
        first.apiKey.apiKeyId,
        {
          overlapDays: 2,
        },
        "req-api-key-rotate-001",
      );

      vi.setSystemTime(new Date("2026-08-04T00:00:00.000Z"));
      const third = service.rotateApiKey(
        "tenant-demo-001",
        second.apiKey.apiKeyId,
        {
          overlapDays: 2,
        },
        "req-api-key-rotate-002",
      );

      expect(service.listApiKeys("tenant-demo-001")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            apiKeyId: third.apiKey.apiKeyId,
            status: "active",
            rotatedFromApiKeyId: second.apiKey.apiKeyId,
          }),
          expect.objectContaining({
            apiKeyId: second.apiKey.apiKeyId,
            status: "overlap_active",
            overlapEndsAt: "2026-08-06T00:00:00.000Z",
            supersededByApiKeyId: third.apiKey.apiKeyId,
          }),
          expect.objectContaining({
            apiKeyId: first.apiKey.apiKeyId,
            status: "revoked",
            revokeReason: "credential_rotated",
            overlapEndsAt: null,
          }),
        ]),
      );

      vi.setSystemTime(new Date("2026-08-07T00:00:00.000Z"));

      expect(service.listApiKeys("tenant-demo-001")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            apiKeyId: second.apiKey.apiKeyId,
            status: "auto_revoked",
            autoRevokedAt: "2026-08-06T00:00:00.000Z",
            revokeReason: "rotation_overlap_elapsed",
          }),
        ]),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns credential plaintext only on issue and never re-exposes key material", () => {
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_test_alpha_ingress_secret";

    const service = new TenantPartnerService(new AuditNotificationService());

    const issued = service.issueApiKey("tenant-demo-001", {
      keyName: "Plaintext once key",
      scopes: ["tenant:write"],
    });
    expect(typeof issued.plaintextKey).toBe("string");
    expect(issued.plaintextKey.length).toBeGreaterThan(0);
    expect(issued.apiKey).not.toHaveProperty("plaintextKey");
    expect(issued.apiKey).not.toHaveProperty("keyHash");
    expect(issued.apiKey).not.toHaveProperty("keyValue");

    const rotated = service.rotateApiKey(
      "tenant-demo-001",
      issued.apiKey.apiKeyId,
      { overlapDays: 1 },
      "req-plaintext-once-rotate-001",
    );
    expect(rotated.plaintextKey).not.toBe(issued.plaintextKey);

    const listedApiKeys = service.listApiKeys("tenant-demo-001");
    expect(listedApiKeys.length).toBeGreaterThanOrEqual(2);
    for (const apiKey of listedApiKeys) {
      expect(apiKey).not.toHaveProperty("plaintextKey");
      expect(apiKey).not.toHaveProperty("keyHash");
      expect(apiKey).not.toHaveProperty("keyValue");
      expect(JSON.stringify(apiKey)).not.toContain(issued.plaintextKey);
      expect(JSON.stringify(apiKey)).not.toContain(rotated.plaintextKey);
    }

    const partnerIssued = service.issuePlatformPartnerIngressCredential(
      "bank-demo-alpha-airport",
      { rotationReason: "scheduled_rotation" },
      "req-plaintext-once-partner-001",
    );
    expect(typeof partnerIssued.plaintextKey).toBe("string");
    expect(partnerIssued.credential).not.toHaveProperty("plaintextKey");
    expect(partnerIssued.credential).not.toHaveProperty("keyHash");

    const listedCredentials = service.listPlatformPartnerIngressCredentials(
      "bank-demo-alpha-airport",
    );
    expect(listedCredentials.length).toBeGreaterThanOrEqual(2);
    for (const credential of listedCredentials) {
      expect(credential).not.toHaveProperty("plaintextKey");
      expect(credential).not.toHaveProperty("keyHash");
      expect(JSON.stringify(credential)).not.toContain(
        partnerIssued.plaintextKey,
      );
    }
  });

  it("keeps raw webhook secret material out of rotation history and endpoint reads", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new TenantPartnerService(auditNotificationService);

    const created = service.createWebhookEndpoint(
      "tenant-demo-001",
      {
        url: "https://tenant.example/webhooks/secret-hygiene",
        secret: "whsec_initial_material",
        events: ["booking.created"],
        ownerRef: "tenant-admin-001",
        ownerName: "Tenant Admin",
        ownerType: "tenant_admin",
        purpose: "booking fanout",
      },
      "req-webhook-secret-hygiene-001",
    );

    service.rotateWebhookSecret(
      "tenant-demo-001",
      {
        webhookId: created.webhookId,
        secret: "whsec_rotated_material",
        rotationReason: "credential_rollover",
      },
      "req-webhook-secret-hygiene-002",
    );

    const [endpoint] = service.listWebhookEndpoints("tenant-demo-001");
    expect(endpoint.secretHistory.length).toBeGreaterThanOrEqual(2);
    for (const record of endpoint.secretHistory) {
      expect(record).not.toHaveProperty("secretValue");
    }
    for (const record of endpoint.runtimeMetadata.secretRotation.history ?? []) {
      expect(record).not.toHaveProperty("secretValue");
    }

    expect(endpoint.ownerRef).toBe("tenant-admin-001");
    expect(endpoint.secretExpiresAt).not.toBeNull();

    // The whole read surface must stay clean, not just the history arrays:
    // list reads, the update response, and the audit trail all serialize the
    // same webhook response shape.
    const updated = service.updateWebhookEndpoint(
      "tenant-demo-001",
      created.webhookId,
      { events: ["booking.created", "booking.cancelled"] },
      "req-webhook-secret-hygiene-003",
    );

    const webhookAuditLogs = auditNotificationService
      .listAuditLogs()
      .filter((log) => log.resourceType === "webhook_endpoint");
    expect(webhookAuditLogs.length).toBeGreaterThanOrEqual(2);

    const exposedSurfaces = JSON.stringify({
      listed: endpoint,
      updated,
      audit: webhookAuditLogs,
    });
    for (const material of [
      "whsec_initial_material",
      "whsec_rotated_material",
    ]) {
      expect(exposedSurfaces).not.toContain(material);
    }
    expect(exposedSurfaces).not.toContain('"secretValue"');
  });

  it("isolates tenant API key read and lifecycle operations across tenants", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    const alpha = service.issueApiKey("tenant-demo-001", {
      keyName: "Alpha tenant key",
      scopes: ["tenant:write"],
    });
    const beta = service.issueApiKey("tenant-demo-002", {
      keyName: "Beta tenant key",
      scopes: ["tenant:write"],
    });

    const alphaKeyIds = service
      .listApiKeys("tenant-demo-001")
      .map((apiKey) => apiKey.apiKeyId);
    const betaKeyIds = service
      .listApiKeys("tenant-demo-002")
      .map((apiKey) => apiKey.apiKeyId);
    expect(alphaKeyIds).toContain(alpha.apiKey.apiKeyId);
    expect(alphaKeyIds).not.toContain(beta.apiKey.apiKeyId);
    expect(betaKeyIds).toContain(beta.apiKey.apiKeyId);
    expect(betaKeyIds).not.toContain(alpha.apiKey.apiKeyId);

    const expectCrossTenantNotFound = (act: () => unknown) => {
      expect(act).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "API_KEY_NOT_FOUND",
            }),
          }),
        }),
      );
    };

    expectCrossTenantNotFound(() =>
      service.rotateApiKey(
        "tenant-demo-002",
        alpha.apiKey.apiKeyId,
        { overlapDays: 1 },
        "req-cross-tenant-rotate-001",
      ),
    );
    expectCrossTenantNotFound(() =>
      service.revokeApiKey(
        "tenant-demo-002",
        alpha.apiKey.apiKeyId,
        "req-cross-tenant-revoke-001",
      ),
    );

    expect(
      service
        .listApiKeys("tenant-demo-001")
        .find((apiKey) => apiKey.apiKeyId === alpha.apiKey.apiKeyId),
    ).toMatchObject({ status: "active", revokedAt: null });
  });

  it("audits credential owner, expiry, and last-used across the issue rotate revoke lifecycle", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));
      process.env.PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT =
        "pk_test_beta_ingress_secret";

      const auditNotificationService = new AuditNotificationService();
      const service = new TenantPartnerService(auditNotificationService);

      const issued = service.issueApiKey(
        "tenant-demo-001",
        {
          keyName: "Auditable owner key",
          scopes: ["tenant:write"],
          ownerRef: "tenant-admin-001",
          ownerName: "Tenant Admin",
          ownerType: "tenant_admin",
          purpose: "nightly reconciliation",
        },
        "req-credential-audit-issue-001",
      );

      const ownedApiKeySummary = {
        ownerRef: "tenant-admin-001",
        ownerName: "Tenant Admin",
        ownerType: "tenant_admin",
        purpose: "nightly reconciliation",
        expiresAt: issued.apiKey.expiresAt,
        lastUsedAt: null,
      };

      vi.setSystemTime(new Date("2026-08-03T00:00:00.000Z"));
      const rotated = service.rotateApiKey(
        "tenant-demo-001",
        issued.apiKey.apiKeyId,
        { overlapDays: 2 },
        "req-credential-audit-rotate-001",
      );

      service.revokeApiKey(
        "tenant-demo-001",
        rotated.apiKey.apiKeyId,
        "req-credential-audit-revoke-001",
      );

      const auditLogs = auditNotificationService.listAuditLogs();
      expect(auditLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actionName: "issue_api_key",
            resourceType: "tenant_api_key",
            resourceId: issued.apiKey.apiKeyId,
            newValuesSummary: expect.objectContaining(ownedApiKeySummary),
          }),
          expect.objectContaining({
            actionName: "rotate_api_key",
            resourceId: rotated.apiKey.apiKeyId,
            oldValuesSummary: expect.objectContaining({
              apiKeyId: issued.apiKey.apiKeyId,
              ...ownedApiKeySummary,
            }),
            newValuesSummary: expect.objectContaining({
              apiKeyId: rotated.apiKey.apiKeyId,
              ownerRef: "tenant-admin-001",
              ownerName: "Tenant Admin",
              expiresAt: rotated.apiKey.expiresAt,
            }),
          }),
          expect.objectContaining({
            actionName: "revoke_api_key",
            resourceId: rotated.apiKey.apiKeyId,
            newValuesSummary: expect.objectContaining({
              ownerRef: "tenant-admin-001",
              revokedAt: "2026-08-03T00:00:00.000Z",
            }),
          }),
        ]),
      );

      // Partner ingress credentials must carry the same owner/expiry/last-used
      // evidence, including a last-used timestamp observed from real traffic.
      const partnerIssued = service.issuePlatformPartnerIngressCredential(
        "bank-demo-beta-airport",
        { rotationReason: "scheduled_rotation" },
        "req-credential-audit-partner-issue-001",
      );
      expect(partnerIssued.credential.expiresAt).not.toBeNull();

      vi.setSystemTime(new Date("2026-08-04T00:00:00.000Z"));
      service.authenticatePartnerBootstrap(
        {
          entrySlug: "bank-demo-beta-airport",
          apiKey: partnerIssued.plaintextKey,
        },
        "req-credential-audit-partner-auth-001",
      );

      service.revokePlatformPartnerIngressCredential(
        "bank-demo-beta-airport",
        partnerIssued.credential.keyId,
        { revokeReason: "compromised" },
        "req-credential-audit-partner-revoke-001",
      );

      expect(auditNotificationService.listAuditLogs()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actionName: "revoke_partner_ingress_credential",
            resourceId: partnerIssued.credential.keyId,
            newValuesSummary: expect.objectContaining({
              ownerName: expect.any(String),
              expiresAt: partnerIssued.credential.expiresAt,
              lastUsedAt: "2026-08-04T00:00:00.000Z",
              lastUsedWorkload: "partner_bootstrap",
              revokeReason: "compromised",
            }),
          }),
        ]),
      );
    } finally {
      vi.useRealTimers();
    }
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

    const approveResolution = await service.resolvePartnerEligibilityReview(
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

    const denyResolution = await service.resolvePartnerEligibilityReview(
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
      await service.resolvePartnerEligibilityReview(
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
        disableReasonNote: null,
      }),
    });
  });

  it("retries webhook deliveries with the original secret version during overlap and fails closed after overlap expiry", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-02T09:00:00.000Z"));
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: false,
        status: 410,
      });
      const service = new TenantPartnerService(
        new AuditNotificationService(),
        undefined,
        new WebhookDispatchService(fetchImpl as never),
        [],
      );
      const tenantAdminIdentity = {
        actorType: "tenant_admin",
        actorId: "tenant-admin-001",
        realm: "tenant",
        tenantId: "tenant-demo-001",
        roles: ["tc_admin"],
        scopes: [
          "tenant:webhooks:read",
          "tenant:webhooks:write",
          "tenant:read",
        ],
      } as const;

      const created = service.createWebhookEndpoint(
        "tenant-demo-001",
        {
          url: "https://tenant.example/webhooks/overlap-secret",
          secret: "whsec_overlap_v1",
          events: ["booking.created"],
        },
        "req-webhook-overlap-001",
      );

      await service.sendTestWebhook(
        "tenant-demo-001",
        {
          webhookId: created.webhookId,
        },
        "req-webhook-overlap-002",
      );

      const [failedDelivery] = service.listWebhookDeliveriesByWebhook(
        "tenant-demo-001",
        created.webhookId,
        "req-webhook-overlap-003",
        tenantAdminIdentity,
      );
      expect(failedDelivery).toMatchObject({
        status: "delivery_failed",
        secretVersion: 1,
        signatureVersion: 1,
      });

      vi.setSystemTime(new Date("2026-08-02T12:00:00.000Z"));
      const rotated = service.rotateWebhookSecret(
        "tenant-demo-001",
        {
          webhookId: created.webhookId,
          secret: "whsec_overlap_v2",
          rotationReason: "scheduled_rotation",
          overlapDays: 1,
        },
        "req-webhook-overlap-004",
      );
      expect(rotated).toMatchObject({
        secretVersion: 2,
        overlapEndsAt: "2026-08-03T12:00:00.000Z",
      });

      const retriedDuringOverlap = await service.retryWebhookDelivery(
        "tenant-demo-001",
        created.webhookId,
        failedDelivery.deliveryId,
        "req-webhook-overlap-005",
        tenantAdminIdentity,
      );
      expect(retriedDuringOverlap).toMatchObject({
        deliveryId: failedDelivery.deliveryId,
        status: "delivery_failed",
        attempt: 2,
        httpStatus: 410,
        secretVersion: 1,
        signatureVersion: 1,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);

      const retryInit = fetchImpl.mock.calls[1]?.[1] as
        | (RequestInit & { headers: Record<string, string> })
        | undefined;
      const retryBody = String(retryInit?.body ?? "");
      const expectedSignature = createHmac("sha256", "whsec_overlap_v1")
        .update(`2026-08-02T12:00:00.000Z.${retryBody}`)
        .digest("hex");
      expect(retryInit?.headers["x-drts-webhook-signature"]).toBe(
        `v=1;t=2026-08-02T12:00:00.000Z;sig=${expectedSignature}`,
      );

      vi.setSystemTime(new Date("2026-08-04T12:00:00.000Z"));

      const retriedAfterOverlap = await service.retryWebhookDelivery(
        "tenant-demo-001",
        created.webhookId,
        failedDelivery.deliveryId,
        "req-webhook-overlap-006",
        tenantAdminIdentity,
      );
      expect(retriedAfterOverlap).toMatchObject({
        deliveryId: failedDelivery.deliveryId,
        status: "delivery_failed",
        attempt: 3,
        httpStatus: null,
        secretVersion: 1,
        signatureVersion: 1,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(service.listWebhookEndpoints("tenant-demo-001")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            webhookId: created.webhookId,
            secretVersion: 2,
            credentialStatus: "active",
            secretHistory: expect.arrayContaining([
              expect.objectContaining({
                secretVersion: 1,
                status: "auto_revoked",
                autoRevokedAt: "2026-08-03T12:00:00.000Z",
                supersededByVersion: 2,
              }),
              expect.objectContaining({
                secretVersion: 2,
                status: "active",
              }),
            ]),
          }),
        ]),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries failed webhook deliveries through the tenant command surface", async () => {
    const auditNotificationService = new AuditNotificationService();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 410,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
      });
    const service = new TenantPartnerService(
      auditNotificationService,
      undefined,
      new WebhookDispatchService(fetchImpl as never),
      [],
    );

    const created = service.createWebhookEndpoint(
      "tenant-demo-001",
      {
        url: "https://tenant.example/webhooks/retry-once",
        secret: "whsec_retry_once",
        events: ["booking.created"],
      },
      "req-webhook-create-retry-001",
    );

    await service.sendTestWebhook(
      "tenant-demo-001",
      {
        webhookId: created.webhookId,
      },
      "req-webhook-test-retry-001",
    );

    const [failedDelivery] = service.listWebhookDeliveriesByWebhook(
      "tenant-demo-001",
      created.webhookId,
      "req-webhook-deliveries-retry-001",
      {
        actorType: "tenant_admin",
        actorId: "tenant-admin-001",
        realm: "tenant",
        tenantId: "tenant-demo-001",
        roles: ["tc_admin"],
        scopes: [
          "tenant:webhooks:read",
          "tenant:webhooks:write",
          "tenant:read",
        ],
      },
    );
    expect(failedDelivery).toMatchObject({
      status: "delivery_failed",
      availableActions: expect.arrayContaining([
        expect.objectContaining({
          action: "retryFailedDelivery",
          enabled: true,
        }),
      ]),
    });

    const retried = await service.retryWebhookDelivery(
      "tenant-demo-001",
      created.webhookId,
      failedDelivery.deliveryId,
      "req-webhook-retry-001",
      {
        actorType: "tenant_admin",
        actorId: "tenant-admin-001",
        realm: "tenant",
        tenantId: "tenant-demo-001",
        roles: ["tc_admin"],
        scopes: [
          "tenant:webhooks:read",
          "tenant:webhooks:write",
          "tenant:read",
        ],
      },
    );

    expect(retried).toMatchObject({
      deliveryId: failedDelivery.deliveryId,
      status: "delivered",
      attempt: 2,
      httpStatus: 202,
    });
    expect(service.listWebhookEndpoints("tenant-demo-001")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          webhookId: created.webhookId,
          status: "active",
        }),
      ]),
    );
  });

  it("preserves manual disable reason notes on webhook endpoints", () => {
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      undefined,
      new WebhookDispatchService(
        vi.fn(async () => ({ ok: true, status: 202 })) as never,
      ),
      [],
    );

    const created = service.createWebhookEndpoint("tenant-demo-001", {
      url: "https://tenant.example/webhooks/manual-disable",
      secret: "whsec_manual_disable",
      events: ["booking.created"],
    });

    const updated = service.updateWebhookEndpoint(
      "tenant-demo-001",
      created.webhookId,
      {
        status: "disabled",
        disableReason: "Receiver maintenance window",
      },
      "req-webhook-disable-005",
    );

    expect(updated).toMatchObject({
      webhookId: created.webhookId,
      status: "disabled",
      runtimeMetadata: expect.objectContaining({
        disableReason: "manual_disable",
        disableReasonNote: "Receiver maintenance window",
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

describe("TenantPartnerService tenant business ops views", () => {
  it("builds dashboard metrics, tenant order filters, and service programs", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    service.registerOrderFeedProvider(() => [
      createTenantOrder({
        orderId: "order-upcoming-001",
        bookingId: "booking-upcoming-001",
        status: "created",
      }),
      createTenantOrder({
        orderId: "order-completed-001",
        bookingId: "booking-completed-001",
        status: "completed",
        reservationWindowStart: "2026-03-02T09:00:00.000Z",
        reservationWindowEnd: "2026-03-02T10:00:00.000Z",
        createdAt: "2026-03-01T08:00:00.000Z",
        updatedAt: "2026-03-02T10:00:00.000Z",
      }),
      createTenantOrder({
        orderId: "order-partner-001",
        bookingId: "booking-partner-001",
        status: "cancelled",
        businessDispatchSubtype: "credit_card_airport_transfer",
        partnerId: "partner-bank-demo-001",
        partnerProgramId: "program-airport-alpha",
        partnerEntrySlug: "bank-demo-alpha-airport",
        orderSource: "api",
        reservationWindowStart: "2026-03-03T09:00:00.000Z",
        reservationWindowEnd: "2026-03-03T10:00:00.000Z",
        createdAt: "2026-03-01T08:00:00.000Z",
        updatedAt: "2026-03-03T10:00:00.000Z",
      }),
    ]);

    const billingSettlementService = {
      listTenantInvoices: vi.fn(() => [
        {
          invoiceId: "invoice-001",
          tenantId: "tenant-demo-001",
          periodStart: "2026-03-01T00:00:00.000Z",
          periodEnd: "2026-03-31T23:59:59.999Z",
          amount: { currency: "NTD", amountMinor: 250000 },
          status: "issued",
          artifactUrl: null,
          pricingVersionSnapshot: "tenant-pricing-v1",
          lines: [
            {
              lineId: "line-001",
              orderId: "order-completed-001",
              description: "x",
              amount: { currency: "NTD", amountMinor: 250000 },
            },
          ],
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
      ]),
      getTenantPayableSummary: vi.fn(async () => ({
        tenantId: "tenant-demo-001",
        periodMonth: "2026-03",
        totalTrips: 2,
        completedTrips: 1,
        cancelledTrips: 1,
        noShowTrips: 0,
        grossAmountMinor: 300000,
        adjustmentAmountMinor: 0,
        taxAmountMinor: 0,
        payableAmountMinor: 300000,
        invoiceStatus: "issued",
      })),
    } as any;

    const dashboard = await service.getTenantDashboardSummary(
      "tenant-demo-001",
      billingSettlementService,
    );
    expect(dashboard).toMatchObject({
      tenantId: "tenant-demo-001",
      periodMonth: "2026-03",
      bookingCount: 3,
      completedTripCount: 1,
      cancelledTripCount: 1,
      estimatedPayableAmountMinor: 300000,
      issuedInvoiceAmountMinor: 250000,
      unpaidInvoiceAmountMinor: 250000,
    });

    const partnerOrders = service.listTenantOrders(
      "tenant-demo-001",
      {
        serviceProduct: "credit_card_airport_transfer",
        tenantServiceProgramId: "program-airport-alpha",
        sourcePlatform: "api",
      },
      billingSettlementService,
    );
    expect(partnerOrders.map((order) => order.orderId)).toEqual([
      "order-partner-001",
    ]);

    const draftOrders = service.listTenantOrders(
      "tenant-demo-001",
      { invoiceStatus: "draft" },
      billingSettlementService,
    );
    expect(draftOrders.map((order) => order.orderId)).toEqual(
      expect.arrayContaining(["order-upcoming-001", "order-partner-001"]),
    );

    const servicePrograms =
      service.listTenantServicePrograms("tenant-demo-001");
    expect(servicePrograms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          programId: "tenant-program-enterprise-dispatch",
          programType: "enterprise_dispatch",
        }),
        expect.objectContaining({
          programId: "program-airport-alpha",
          programType: "credit_card_airport_transfer",
          billingMode: "partner_settlement",
        }),
      ]),
    );
  });

  it("projects issuer contract SLA posture with masked exception references", () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    service.registerOrderFeedProvider(() => [
      createTenantOrder({
        orderId: "order-contract-completed-001",
        orderNo: "ORD-CONTRACT-001",
        bookingId: "booking-contract-completed-001",
        status: "completed",
        businessDispatchSubtype: "credit_card_airport_transfer",
        partnerId: "partner-bank-demo-001",
        partnerProgramId: "program-airport-alpha",
        partnerEntrySlug: "bank-demo-alpha-airport",
        issuerAuthorizationRef: "issuer-auth-sensitive-0001",
        benefitReference: "benefit-sensitive-0001",
        reservationWindowStart: "2026-03-02T09:00:00.000Z",
        reservationWindowEnd: "2026-03-02T10:00:00.000Z",
        createdAt: "2026-03-01T08:00:00.000Z",
        updatedAt: "2026-03-02T10:00:00.000Z",
      }),
      createTenantOrder({
        orderId: "order-contract-exception-001",
        orderNo: "ORD-CONTRACT-002",
        bookingId: "booking-contract-exception-001",
        status: "cancelled",
        businessDispatchSubtype: "credit_card_airport_transfer",
        partnerId: "partner-bank-demo-001",
        partnerProgramId: "program-airport-alpha",
        partnerEntrySlug: "bank-demo-alpha-airport",
        issuerAuthorizationRef: "issuer-auth-sensitive-9999",
        benefitReference: "benefit-sensitive-9999",
        reservationWindowStart: "2026-03-04T09:00:00.000Z",
        reservationWindowEnd: "2026-03-04T10:00:00.000Z",
        exceptionHold: {
          reasonCode: "no_eligible_supply",
          dispatchJobId: "dispatch-job-001",
          raisedAt: "2026-03-04T09:20:00.000Z",
          criteria: {
            isReservation: true,
            isWithinConfirmationWindow: false,
            hasEligibleSupply: false,
            reasonCode: "no_eligible_supply",
          },
          overrideAllowed: true,
          overrideActors: ["ops_user"],
          resolution: null,
          overrideRequest: null,
        },
        dispatchTimeout: {
          orderId: "order-contract-exception-001",
          dispatchJobId: "dispatch-job-001",
          timeoutAt: "2026-03-04T09:25:00.000Z",
          timeoutReasonCode: "matching_timeout",
          previousAssignmentId: null,
          escalationAction: "escalate_to_ops",
        },
        createdAt: "2026-03-04T08:00:00.000Z",
        updatedAt: "2026-03-04T09:25:00.000Z",
      }),
    ]);

    const contracts = service.listTenantContracts("tenant-demo-001");
    expect(contracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ programId: "program-airport-alpha" }),
        expect.objectContaining({ programId: "program-airport-beta" }),
        expect.objectContaining({ programId: "program-ctbc-world-elite" }),
      ]),
    );

    const airportAlpha = contracts.find(
      (contract) => contract.programId === "program-airport-alpha",
    );
    expect(airportAlpha).toMatchObject({
      contractId: "issuer-contract:program-airport-alpha",
      tenantId: "tenant-demo-001",
      programCode: "AIRPORT_ALPHA",
      status: "breached",
      periodAttainment: {
        period: "2026-03",
        completedTrips: 1,
        totalTrips: 2,
        completionRatePercent: 50,
      },
    });
    expect(airportAlpha?.exceptions).toEqual([
      expect.objectContaining({
        orderId: "order-contract-exception-001",
        benefitReferenceMasked: "benefit-...9999",
        issuerAuthorizationRefMasked: "issuer-a...9999",
        status: "open",
      }),
    ]);

    const single = service.getTenantContract(
      "tenant-demo-001",
      "issuer-contract:program-airport-alpha",
    );
    expect(single.programId).toBe("program-airport-alpha");

    expect(() =>
      service.getTenantContract("tenant-other-001", single.contractId),
    ).toThrow(ApiRequestError);
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
        expect.objectContaining({
          actionName: "booking.governance.evaluated",
          resourceType: "booking",
          resourceId: "booking-001",
        }),
        expect.objectContaining({
          actionName: "booking.cost_center.assigned",
          resourceType: "booking",
          resourceId: "booking-001",
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

  it("lists tenant program usage by program and period from the quota ledger", async () => {
    const repository = createInMemoryTenantPartnerRepository();
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );

    await service.onModuleInit();
    service.registerOrderFeedProvider(() => [
      createTenantOrder({
        orderId: "order-program-1",
        bookingId: "booking-program-1",
        partnerProgramId: "program-airport-alpha",
        businessDispatchSubtype: "credit_card_airport_transfer",
        passenger: {
          passengerId: "cardholder-001",
          name: "Cardholder One",
          phone: "0912000000",
          roles: ["cardholder"],
        },
        reservationWindowStart: "2026-05-10T10:00:00.000Z",
      }),
      createTenantOrder({
        orderId: "order-program-2",
        bookingId: "booking-program-2",
        partnerProgramId: "program-airport-alpha",
        businessDispatchSubtype: "credit_card_airport_transfer",
        passenger: {
          passengerId: "cardholder-001",
          name: "Cardholder One",
          phone: "0912000000",
          roles: ["cardholder"],
        },
        reservationWindowStart: "2026-05-12T10:00:00.000Z",
      }),
      createTenantOrder({
        orderId: "order-program-3",
        bookingId: "booking-program-3",
        partnerProgramId: "program-airport-beta",
        businessDispatchSubtype: "credit_card_airport_transfer",
        passenger: {
          passengerId: "cardholder-002",
          name: "Cardholder Two",
          phone: "0922000000",
          roles: ["cardholder"],
        },
        reservationWindowStart: "2026-05-15T10:00:00.000Z",
      }),
    ]);

    service.upsertTenantQuotaPolicy("tenant-demo-001", {
      period: "monthly",
      limit: {
        bookingCountLimit: 5,
        amountMinorLimit: null,
        currency: "TWD",
        enforcementMode: "warn_only",
      },
    });

    await service.reserveTenantQuota(null, {
      tenantId: "tenant-demo-001",
      bookingId: "booking-program-1",
      evaluationId: "eval-program-1",
      reservationWindowStart: "2026-05-10T10:00:00.000Z",
    });
    await service.reserveTenantQuota(null, {
      tenantId: "tenant-demo-001",
      bookingId: "booking-program-2",
      evaluationId: "eval-program-2",
      reservationWindowStart: "2026-05-12T10:00:00.000Z",
    });
    await service.reserveTenantQuota(null, {
      tenantId: "tenant-demo-001",
      bookingId: "booking-program-3",
      evaluationId: "eval-program-3",
      reservationWindowStart: "2026-05-15T10:00:00.000Z",
    });

    const usage = service.listTenantProgramUsage("tenant-demo-001");

    expect(usage).toEqual(
      expect.arrayContaining([
        {
          programId: "program-airport-alpha",
          programCode: "AIRPORT_ALPHA",
          period: "2026-05",
          cardholdersServed: 1,
          tripsConsumed: 2,
          quotaTotal: 5,
          quotaRemaining: 2,
        },
        {
          programId: "program-airport-beta",
          programCode: "AIRPORT_BETA",
          period: "2026-05",
          cardholdersServed: 1,
          tripsConsumed: 1,
          quotaTotal: 5,
          quotaRemaining: 2,
        },
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

  it("atomically consumes a database-backed quota reservation at trip completion", async () => {
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
    repository.loadQuotaLedgerForBookingForUpdate.mockResolvedValue([
      {
        ledgerEntryId: "quota-ledger-reserve-db-001",
        tenantId: "tenant-demo-001",
        costCenterCode: null,
        periodKey: "2026-05",
        dimension: "booking_count",
        amount: 1,
        entryType: "reserve",
        bookingId: "booking-db-consume-001",
        evaluationId: "eval-db-consume-001",
        createdAt: "2026-05-13T10:00:00.000Z",
      },
    ]);
    repository.loadQuotaMonthlySnapshotsForUpdate.mockResolvedValue([
      {
        tenantId: "tenant-demo-001",
        costCenterCode: null,
        period: "monthly",
        periodKey: "2026-05",
        limit: {
          bookingCountLimit: 1,
          amountMinorLimit: null,
          currency: "TWD",
          enforcementMode: "hard_block",
        },
        usage: {
          ...createEmptyTenantQuotaUsage({
            bookingCountLimit: 1,
            amountMinorLimit: null,
            currency: "TWD",
            enforcementMode: "hard_block",
          }),
          pendingReservedBookingCount: 1,
          bookingCountRemaining: 0,
        },
        refreshedAt: "2026-05-13T10:00:00.000Z",
      },
    ]);

    const result = await service.consumeTenantQuota(tx, {
      tenantId: "tenant-demo-001",
      bookingId: "booking-db-consume-001",
    });

    expect(repository.withTransaction).not.toHaveBeenCalled();
    expect(repository.loadQuotaLedgerForBookingForUpdate).toHaveBeenCalledWith(
      tx,
      "tenant-demo-001",
      "booking-db-consume-001",
    );
    expect(repository.claimQuotaLedgerEntries).toHaveBeenCalledWith(tx, [
      expect.objectContaining({
        bookingId: "booking-db-consume-001",
        dimension: "booking_count",
        amount: 1,
        entryType: "consume",
      }),
    ]);
    expect(repository.persistQuotaReservation).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        quotaMonthlySnapshots: [
          expect.objectContaining({
            usage: expect.objectContaining({
              pendingReservedBookingCount: 0,
              confirmedBookingCount: 1,
            }),
          }),
        ],
      }),
    );
    expect(result.ledgerEntries).toEqual([
      expect.objectContaining({ entryType: "consume", amount: 1 }),
    ]);
  });

  it("does not mutate in-memory quota state when a database-backed consume rolls back", async () => {
    const { repository } = createDatabaseQuotaRepository();
    const auditNotificationService = new AuditNotificationService();
    const recordAuditLog = vi.spyOn(auditNotificationService, "recordAuditLog");
    const service = new TenantPartnerService(
      auditNotificationService,
      repository as never,
    );
    repository.withTransaction.mockImplementationOnce(async (work) => {
      await work({
        query: vi.fn(async () => ({ rows: [] })) as never,
      });
      throw new Error("quota commit failed");
    });
    repository.loadQuotaLedgerForBookingForUpdate.mockResolvedValue([
      {
        ledgerEntryId: "quota-ledger-reserve-db-rollback-001",
        tenantId: "tenant-demo-001",
        costCenterCode: null,
        periodKey: "2026-05",
        dimension: "booking_count",
        amount: 1,
        entryType: "reserve",
        bookingId: "booking-db-consume-rollback-001",
        evaluationId: "eval-db-consume-rollback-001",
        createdAt: "2026-05-13T10:00:00.000Z",
      },
    ]);

    await expect(
      service.consumeTenantQuota({
        tenantId: "tenant-demo-001",
        bookingId: "booking-db-consume-rollback-001",
      }),
    ).rejects.toThrow("quota commit failed");

    expect(
      service.listTenantQuotaLedger("tenant-demo-001", {
        periodKey: "2026-05",
      }),
    ).toEqual([]);
    expect(
      service.getTenantQuotaSummary(
        "tenant-demo-001",
        "2026-05-13T10:00:00.000Z",
      ).usage,
    ).toMatchObject({
      pendingReservedBookingCount: 0,
      confirmedBookingCount: 0,
    });
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("keeps database-backed quota consumption idempotent", async () => {
    const { repository } = createDatabaseQuotaRepository();
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );
    repository.loadQuotaLedgerForBookingForUpdate.mockResolvedValue([
      {
        ledgerEntryId: "quota-ledger-reserve-db-002",
        tenantId: "tenant-demo-001",
        costCenterCode: null,
        periodKey: "2026-05",
        dimension: "booking_count",
        amount: 1,
        entryType: "reserve",
        bookingId: "booking-db-consume-002",
        evaluationId: "eval-db-consume-002",
        createdAt: "2026-05-13T10:00:00.000Z",
      },
      {
        ledgerEntryId: "quota-ledger-consume-db-002",
        tenantId: "tenant-demo-001",
        costCenterCode: null,
        periodKey: "2026-05",
        dimension: "booking_count",
        amount: 1,
        entryType: "consume",
        bookingId: "booking-db-consume-002",
        evaluationId: "eval-db-consume-002",
        createdAt: "2026-05-13T11:00:00.000Z",
      },
    ]);

    const result = await service.consumeTenantQuota({
      tenantId: "tenant-demo-001",
      bookingId: "booking-db-consume-002",
    });

    expect(result.ledgerEntries).toEqual([]);
    expect(repository.claimQuotaLedgerEntries).not.toHaveBeenCalled();
    expect(repository.persistQuotaReservation).not.toHaveBeenCalled();
  });

  it("skips snapshot refresh when a concurrent database-backed consume loses the claim race", async () => {
    const { repository } = createDatabaseQuotaRepository();
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repository as never,
    );
    repository.loadQuotaLedgerForBookingForUpdate.mockResolvedValue([
      {
        ledgerEntryId: "quota-ledger-reserve-db-003",
        tenantId: "tenant-demo-001",
        costCenterCode: null,
        periodKey: "2026-05",
        dimension: "booking_count",
        amount: 1,
        entryType: "reserve",
        bookingId: "booking-db-consume-003",
        evaluationId: "eval-db-consume-003",
        createdAt: "2026-05-13T10:00:00.000Z",
      },
    ]);
    repository.claimQuotaLedgerEntries.mockResolvedValue([]);

    const result = await service.consumeTenantQuota({
      tenantId: "tenant-demo-001",
      bookingId: "booking-db-consume-003",
    });

    expect(result.ledgerEntries).toEqual([]);
    expect(
      repository.loadQuotaMonthlySnapshotsForUpdate,
    ).not.toHaveBeenCalled();
    expect(repository.persistQuotaReservation).not.toHaveBeenCalled();
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
      service.getTenantQuotaSummary(
        "tenant-demo-001",
        "2026-05-13T10:00:00.000Z",
      ).usage.pendingReservedBookingCount,
    ).toBe(1);
  });

  it("ships a tenant governance dashboard with the required panels and metric bindings", () => {
    const dashboard = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "..",
          "..",
          "infra/grafana/dashboards/tenant-governance.json",
        ),
        "utf8",
      ),
    ) as {
      panels: Array<{ title?: string; targets?: Array<{ expr?: string }> }>;
    };
    const panelTitles = dashboard.panels.map((panel) => panel.title);
    const allExpressions = dashboard.panels.flatMap((panel) =>
      (panel.targets ?? []).map((target) => target.expr ?? ""),
    );

    expect(panelTitles).toEqual(
      expect.arrayContaining([
        "Pending Approvals + P95 Age",
        "Quota Usage By Tenant",
        "Evaluator Latency P50/P95/P99",
        "Ledger Writes / Sec",
        "Race Failures / Min",
        "Validation Rejects / Min",
      ]),
    );
    expect(allExpressions.join("\n")).toContain(
      "tenant_governance_approval_pending_count",
    );
    expect(allExpressions.join("\n")).toContain(
      "tenant_governance_quota_usage_percent",
    );
    expect(allExpressions.join("\n")).toContain(
      "tenant_governance_approval_evaluator_latency_ms",
    );
    expect(allExpressions.join("\n")).toContain(
      "tenant_governance_quota_ledger_write_total",
    );
    expect(allExpressions.join("\n")).toContain(
      "tenant_governance_quota_race_failure_total",
    );
    expect(allExpressions.join("\n")).toContain(
      "tenant_governance_cost_center_validation_reject_total",
    );
  });

  it("returns partner-scoped referral portal usage revenue and statements", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    const billingSettlementService = new BillingSettlementService(
      new AuditNotificationService(),
    );
    const identity: IdentityContext = {
      actorType: "partner_api_key",
      actorId: "partner-referral-demo-001",
      realm: "partner",
      authMode: "bootstrap_headers",
      roleFamilies: ["partner"],
      roles: ["partner"],
      scopes: ["billing:read"],
      tenantId: "tenant-demo-001",
      partnerId: "partner-referral-demo-001",
      partnerProgramId: "program-referral-community",
      partnerEntrySlug: "referral-demo-community",
      supportedExecutionModes: ["discussion_planning"],
    };

    const [dashboard, usage, revenue, statements] = await Promise.all([
      service.getPartnerReferralDashboard(
        identity,
        billingSettlementService,
        "2026-06",
      ),
      service.listPartnerReferralUsage(identity, billingSettlementService),
      service.listPartnerReferralRevenue(identity, billingSettlementService),
      service.listPartnerReferralStatements(identity, billingSettlementService),
    ]);

    expect(dashboard).toMatchObject({
      partnerEntrySlug: "referral-demo-community",
      period: "2026-06",
      activeUserCount: 2,
      tripCount: 2,
      latestStatementPeriod: "2026-06",
      pendingStatementCount: 1,
    });
    expect(dashboard.gmv.amountMinor).toBe(150000);
    expect(dashboard.estimatedShareAmount.amountMinor).toBe(22500);

    expect(usage).toEqual([
      expect.objectContaining({
        partnerEntrySlug: "referral-demo-community",
        period: "2026-06",
        activeUserCount: 2,
        tripCount: 2,
      }),
    ]);
    expect(usage[0]?.gmv.amountMinor).toBe(150000);

    expect(revenue).toEqual([
      expect.objectContaining({
        partnerEntrySlug: "referral-demo-community",
        period: "2026-06",
        tripCount: 2,
        statementStatus: "due",
      }),
    ]);
    expect(revenue[0]?.shareAmount.amountMinor).toBe(22500);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({
      partnerEntrySlug: "referral-demo-community",
      period: "2026-06",
    });
  });

  it("rejects referral portal reads when partner identity scope does not match the provisioned entry", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    const billingSettlementService = new BillingSettlementService(
      new AuditNotificationService(),
    );

    await expect(
      service.listPartnerReferralStatements(
        {
          actorType: "partner_api_key",
          actorId: "partner-referral-demo-001",
          realm: "partner",
          authMode: "bootstrap_headers",
          roleFamilies: ["partner"],
          roles: ["partner"],
          scopes: ["billing:read"],
          tenantId: "tenant-demo-001",
          partnerId: "partner-bank-demo-001",
          partnerProgramId: "program-airport-alpha",
          partnerEntrySlug: "referral-demo-community",
          supportedExecutionModes: ["discussion_planning"],
        },
        billingSettlementService,
      ),
    ).rejects.toMatchObject({
      status: 403,
      response: {
        error: {
          code: "PARTNER_SCOPE_MISMATCH",
        },
      },
    } satisfies Partial<ApiRequestError>);
  });

  it("rejects referral portal reads from non-referral partner entries", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    const billingSettlementService = new BillingSettlementService(
      new AuditNotificationService(),
    );

    await expect(
      service.listPartnerReferralRevenue(
        {
          actorType: "partner_api_key",
          actorId: "partner-bank-demo-001",
          realm: "partner",
          authMode: "bootstrap_headers",
          roleFamilies: ["partner"],
          roles: ["partner"],
          scopes: ["billing:read"],
          tenantId: "tenant-demo-001",
          partnerId: "partner-bank-demo-001",
          partnerProgramId: "program-airport-alpha",
          partnerEntrySlug: "bank-demo-alpha-airport",
          supportedExecutionModes: ["discussion_planning"],
        },
        billingSettlementService,
      ),
    ).rejects.toMatchObject({
      status: 403,
      response: {
        error: {
          code: "PARTNER_SCOPE_UNSUPPORTED",
        },
      },
    } satisfies Partial<ApiRequestError>);
  });
});
