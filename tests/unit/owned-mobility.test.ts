import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import type { MultiTaxiOperatingAuthorizationRecord } from "@drts/contracts";
import { OpsDispatchEventsService } from "../../apps/api/src/common/ops-dispatch-events.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityRepository } from "../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityTaskEventsService } from "../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import {
  type PersistTenantPartnerChanges,
  type TenantPartnerState,
  type TenantPartnerRepository,
} from "../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

function createService(
  repository?: OwnedMobilityRepository,
  tenantPartnerService?: TenantPartnerService,
) {
  const auditService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditService);
  const regulatoryRegistryService = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    auditService,
    new DriverProfileService(auditService),
  );
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditService,
    callcenterService,
    new OwnedMobilityTaskEventsService(new EventEmitter() as never),
    new OpsDispatchEventsService(new EventEmitter() as never),
    repository,
    tenantPartnerService,
  );

  ownedMobilityService.registerCallRecordingListeners();
  return {
    auditService,
    callcenterService,
    regulatoryRegistryService,
    ownedMobilityService,
  };
}

function createMemoryOwnedMobilityRepository() {
  const state = {
    orders: [] as Record<string, unknown>[],
    dispatchJobs: [] as Record<string, unknown>[],
    dispatchAttempts: [] as Record<string, unknown>[],
    dispatchAssignments: [] as Record<string, unknown>[],
    driverTasks: [] as Record<string, unknown>[],
    dispatchTraceLogs: [] as Record<string, unknown>[],
  };

  const replaceByKey = <T extends Record<string, unknown>>(
    current: T[],
    incoming: readonly T[] | undefined,
    key: keyof T,
  ) => {
    if (!incoming) {
      return current;
    }

    const next = new Map<string, T>(
      current.map((item) => [
        String(item[key]),
        JSON.parse(JSON.stringify(item)) as T,
      ]),
    );
    for (const item of incoming) {
      next.set(String(item[key]), JSON.parse(JSON.stringify(item)) as T);
    }
    return [...next.values()];
  };

  return {
    isEnabled: () => true,
    loadState: vi.fn(async () => JSON.parse(JSON.stringify(state))),
    persistChanges: vi.fn(async (changes: Record<string, unknown>) => {
      state.orders = replaceByKey(
        state.orders,
        changes.orders as Record<string, unknown>[] | undefined,
        "orderId",
      );
      state.dispatchJobs = replaceByKey(
        state.dispatchJobs,
        changes.dispatchJobs as Record<string, unknown>[] | undefined,
        "dispatchJobId",
      );
      state.dispatchAttempts = replaceByKey(
        state.dispatchAttempts,
        changes.dispatchAttempts as Record<string, unknown>[] | undefined,
        "attemptId",
      );
      state.dispatchAssignments = replaceByKey(
        state.dispatchAssignments,
        changes.dispatchAssignments as Record<string, unknown>[] | undefined,
        "assignmentId",
      );
      state.driverTasks = replaceByKey(
        state.driverTasks,
        changes.driverTasks as Record<string, unknown>[] | undefined,
        "taskId",
      );
      state.dispatchTraceLogs = replaceByKey(
        state.dispatchTraceLogs,
        changes.dispatchTraceLogs as Record<string, unknown>[] | undefined,
        "traceLogId",
      );
    }),
    reportPersistenceFailure: vi.fn(),
  } as unknown as OwnedMobilityRepository;
}

const TENANT_ACME = "tenant-acme-001";
const TENANT_NEWCO = "tenant-newco-001";
const PARTNER_TENANT = "tenant-demo-001";
const SAMPLE_PROOF_PHOTO = "cHJvb2YtcGhvdG8tMDAx";

function clonePartnerState(state: TenantPartnerState): TenantPartnerState {
  return JSON.parse(JSON.stringify(state)) as TenantPartnerState;
}

function createMemoryTenantPartnerRepository(): TenantPartnerRepository {
  const state: TenantPartnerState = {
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

  const mergeUniqueByKey = <T extends object>(
    items: readonly T[],
    key: keyof T,
    existing: T[],
  ) => {
    const merged = new Map<string, T>();
    for (const item of existing) {
      merged.set(String(item[key]), JSON.parse(JSON.stringify(item)) as T);
    }
    for (const item of items) {
      merged.set(String(item[key]), JSON.parse(JSON.stringify(item)) as T);
    }
    return Array.from(merged.values());
  };

  return {
    isEnabled: () => true,
    loadState: vi.fn(async () => clonePartnerState(state)),
    withTransaction: vi.fn(async <T>(work: (executor: unknown) => Promise<T>) =>
      work({}),
    ),
    loadQuotaPoliciesForUpdate: vi.fn(async () => []),
    loadQuotaMonthlySnapshotsForUpdate: vi.fn(async () => []),
    ensureQuotaMonthlySnapshots: vi.fn(async () => {}),
    persistQuotaReservation: vi.fn(async () => {}),
    persistApprovalWorkflow: vi.fn(async () => {}),
    persistChanges: vi.fn(async (changes: PersistTenantPartnerChanges) => {
      if (changes.notificationPreferences) {
        state.notificationPreferences = mergeUniqueByKey(
          changes.notificationPreferences,
          "tenantId",
          state.notificationPreferences,
        );
      }
      if (changes.webhookEndpoints) {
        state.webhookEndpoints = mergeUniqueByKey(
          changes.webhookEndpoints,
          "webhookId",
          state.webhookEndpoints,
        );
      }
      if (changes.webhookDeliveries) {
        state.webhookDeliveries = mergeUniqueByKey(
          changes.webhookDeliveries,
          "deliveryId",
          state.webhookDeliveries,
        );
      }
      if (changes.slaProfiles) {
        state.slaProfiles = mergeUniqueByKey(
          changes.slaProfiles,
          "tenantId",
          state.slaProfiles,
        );
      }
      if (changes.partnerEntries) {
        state.partnerEntries = mergeUniqueByKey(
          changes.partnerEntries,
          "entrySlug",
          state.partnerEntries,
        );
      }
      if (changes.partnerEligibilityVerifications) {
        state.partnerEligibilityVerifications = mergeUniqueByKey(
          changes.partnerEligibilityVerifications,
          "eligibilityVerificationId",
          state.partnerEligibilityVerifications,
        );
      }
      if (changes.passengers) {
        state.passengers = mergeUniqueByKey(
          changes.passengers,
          "passengerId",
          state.passengers,
        );
      }
      if (changes.addresses) {
        state.addresses = mergeUniqueByKey(
          changes.addresses,
          "addressId",
          state.addresses,
        );
      }
      if (changes.userRoles) {
        state.userRoles = mergeUniqueByKey(
          changes.userRoles,
          "userId",
          state.userRoles,
        );
      }
      if (changes.apiKeys) {
        state.apiKeys = mergeUniqueByKey(
          changes.apiKeys,
          "apiKeyId",
          state.apiKeys,
        );
      }
    }),
    reportPersistenceFailure: vi.fn(),
  } as unknown as TenantPartnerRepository;
}

function getErrorCode(error: unknown) {
  const response = (
    error as {
      getResponse?: () => {
        error?: {
          code?: string;
        };
      };
    }
  ).getResponse?.();

  return response?.error?.code ?? null;
}

async function completeOrderForRating(
  ownedMobilityService: OwnedMobilityService,
  orderId: string,
) {
  const orderStore = (
    ownedMobilityService as unknown as {
      orders:
        | Map<
            string,
            {
              orderId?: string;
              status: string;
              completedAt?: string;
              updatedAt?: string;
            }
          >
        | Array<{
            orderId: string;
            status: string;
            completedAt?: string;
            updatedAt?: string;
          }>;
    }
  ).orders;

  const order = Array.isArray(orderStore)
    ? orderStore.find((item) => item.orderId === orderId)
    : orderStore.get(orderId);

  if (!order) {
    throw new Error(`Missing order ${orderId}`);
  }

  order.status = "completed";
  order.completedAt = "2026-04-10T09:45:00Z";
  order.updatedAt = "2026-04-10T09:45:00Z";
}

async function flushWebhookDispatch() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("owned mobility service", () => {
  it("runs the standard taxi dispatch and driver-task loop to completion", async () => {
    const { auditService, ownedMobilityService } = createService();
    const order = ownedMobilityService.createPassengerOrder({
      pickup: {
        address: "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: "台中市大安區興安路378號",
      },
      passenger: {
        name: "李先生",
        phone: "0911222333",
      },
    });

    const dispatchJob = ownedMobilityService.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const candidate = (
      await ownedMobilityService.listDispatchCandidates(
        dispatchJob.dispatchJobId,
      )
    )[0];

    expect(dispatchJob.status).toBe("matching");
    expect(candidate).toBeDefined();

    const assignment = await ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: candidate!.vehicleId,
      driverId: candidate!.driverId,
    });

    ownedMobilityService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-10T09:02:00Z",
    });
    ownedMobilityService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-10T09:03:00Z",
      currentLocation: {
        lat: 24.266,
        lng: 120.522,
      },
    });
    ownedMobilityService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-10T09:08:00Z",
    });
    await ownedMobilityService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-10T09:10:00Z",
    });
    const completedTask = await ownedMobilityService.completeDriverTask(
      assignment.taskId,
      {
        completedAt: "2026-04-10T09:45:00Z",
        actualDistanceKm: 22.4,
        actualDurationSec: 2100,
        fare: {
          currency: "NTD",
          amountMinor: 150000,
        },
        proof: {
          photos: [],
        },
      },
    );

    expect(completedTask.status).toBe("completed");
    expect(ownedMobilityService.getOrder(order.orderId).status).toBe(
      "completed",
    );
    expect(
      auditService
        .listNotifications()
        .some((notification) => notification.channel === "driver_task"),
    ).toBe(true);
  });

  it("creates a phone order without recording_id and binds it later", async () => {
    const { callcenterService, ownedMobilityService } = createService();
    const order = ownedMobilityService.createCallCenterOrder({
      callId: "CALL-20260410-000120",
      agentId: "AGENT-0088",
      pickup: {
        address: "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: "台中市大安區興安路378號",
      },
      passenger: {
        name: "李先生",
        phone: "0911222333",
      },
    });

    expect(order.orderSource).toBe("phone");
    expect(order.callId).toBe("CALL-20260410-000120");
    expect(order.recordingId).toBeNull();
    expect(order.status).toBe("recording_pending");
    expect(order.complianceFlags).toContain("recording_pending");

    const session = callcenterService.getCallSession("CALL-20260410-000120");
    expect(session.linkedOrderId).toBe(order.orderId);
    expect(session.recordingId).toBeNull();
    expect(session.flags).toContain("recording_pending");

    const attachedSession = callcenterService.attachRecordingCallback(
      "CALL-20260410-000120",
      {
        recordingId: "REC-20260410-000120",
        providerRecordingRef: "cti-ref-001",
        recordingUrl: "https://recordings.example.com/REC-20260410-000120",
        agentId: "AGENT-0088",
      },
    );

    expect(attachedSession.recordingId).toBe("REC-20260410-000120");
    expect(attachedSession.flags).toContain("recording_bound");
    expect(attachedSession.flags).not.toContain("recording_pending");
    expect(ownedMobilityService.getOrder(order.orderId).recordingId).toBe(
      "REC-20260410-000120",
    );
    expect(ownedMobilityService.getOrder(order.orderId).status).toBe(
      "ready_for_dispatch",
    );
    expect(
      ownedMobilityService.getOrder(order.orderId).complianceFlags,
    ).toEqual(["recording_bound"]);
  });

  it("prevents trip start before arrived_pickup", async () => {
    const { ownedMobilityService } = createService();
    const order = ownedMobilityService.createPassengerOrder({
      pickup: {
        address: "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: "台中市大安區興安路378號",
      },
      passenger: {
        name: "李先生",
        phone: "0911222333",
      },
    });
    const dispatchJob = ownedMobilityService.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const candidate = (
      await ownedMobilityService.listDispatchCandidates(
        dispatchJob.dispatchJobId,
      )
    )[0]!;
    const assignment = await ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: candidate.vehicleId,
      driverId: candidate.driverId,
    });
    ownedMobilityService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-10T09:02:00Z",
    });
    ownedMobilityService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-10T09:03:00Z",
    });

    try {
      await ownedMobilityService.startDriverTask(assignment.taskId, {
        startedAt: "2026-04-10T09:10:00Z",
      });
      expect.unreachable("startDriverTask should fail before arrived_pickup");
    } catch (error) {
      expect(getErrorCode(error)).toBe("PICKUP_NOT_ARRIVED");
    }
  });

  it("enforces airport flight number and business proof rules", async () => {
    const { ownedMobilityService } = createService();

    try {
      ownedMobilityService.createTenantBooking(
        {
          businessDispatchSubtype: "credit_card_airport_transfer",
          direction: "pickup",
          pickup: {
            address: "桃園機場第二航廈",
          },
          dropoff: {
            address: "台中市梧棲區中二路一段9號",
          },
          reservationWindowStart: "2026-04-18T10:00:00Z",
          reservationWindowEnd: "2026-04-18T10:20:00Z",
          passenger: {
            name: "陳小姐",
            phone: "0900123456",
          },
        },
        TENANT_ACME,
      );
      expect.unreachable("airport pickup should require flight_no");
    } catch (error) {
      expect(getErrorCode(error)).toBe("FLIGHT_NO_REQUIRED");
    }

    // Tenant booking channels no longer accept quotedFare directly — pricing
    // is now resolved through the platform pricing rule pipeline.
    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: {
          address: "台北市信義區松仁路100號",
        },
        dropoff: {
          address: "桃園機場第二航廈",
        },
        reservationWindowStart: "2026-04-15T08:30:00Z",
        reservationWindowEnd: "2026-04-15T08:45:00Z",
        passenger: {
          name: "王小明",
          phone: "0912000111",
        },
        signoffRequired: true,
        minPhotoCount: 1,
      },
      TENANT_ACME,
    );
    const dispatchJob = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const candidate = (
      await ownedMobilityService.listDispatchCandidates(
        dispatchJob.dispatchJobId,
      )
    )[0]!;
    const assignment = await ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: candidate.vehicleId,
      driverId: candidate.driverId,
    });

    ownedMobilityService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-10T09:02:00Z",
    });
    ownedMobilityService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-10T09:03:00Z",
    });
    ownedMobilityService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-10T09:08:00Z",
    });
    await ownedMobilityService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-10T09:10:00Z",
    });

    try {
      await ownedMobilityService.completeDriverTask(assignment.taskId, {
        completedAt: "2026-04-10T09:45:00Z",
        actualDistanceKm: 22.4,
        actualDurationSec: 2100,
        fare: {
          currency: "NTD",
          amountMinor: 140000,
        },
        proof: {
          photos: [SAMPLE_PROOF_PHOTO],
          signatureId: "FILE-2001",
        },
      });
      expect.unreachable(
        "fixed-price business booking should reject fare change",
      );
    } catch (error) {
      expect(getErrorCode(error)).toBe("FIXED_PRICE_IMMUTABLE");
    }

    try {
      await ownedMobilityService.completeDriverTask(assignment.taskId, {
        completedAt: "2026-04-10T09:45:00Z",
        actualDistanceKm: 22.4,
        actualDurationSec: 2100,
        fare: {
          currency: "NTD",
          amountMinor: 150000,
        },
        proof: {
          photos: [SAMPLE_PROOF_PHOTO],
        },
      });
      expect.unreachable("enterprise booking should require signoff proof");
    } catch (error) {
      expect(getErrorCode(error)).toBe("PROOF_REQUIRED");
    }
  });

  it("persists partner provenance on eligible airport-transfer bookings", async () => {
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const verification = await tenantPartnerService.verifyPartnerEligibility({
      entrySlug: "bank-demo-alpha-airport",
      cardLast4: "2468",
    });
    const { auditService, ownedMobilityService } = createService(
      undefined,
      tenantPartnerService,
    );
    const handoffIdentity = {
      authMode: "jwt_bearer",
      actorType: "referral_passenger",
      actorId: "passenger-partner-001",
      realm: "partner",
      tenantId: PARTNER_TENANT,
      partnerId: "partner-bank-demo-001",
      partnerProgramId: "program-airport-alpha",
      partnerEntrySlug: "bank-demo-alpha-airport",
      roleFamilies: ["partner"],
      roles: ["referral_passenger"],
      scopes: [
        "partner:handoff",
        "partner:eligibility:read",
        "partner:eligibility:write",
        "partner:book",
      ],
      requestId: "req-partner-booking-001",
    } satisfies BootstrapRequestIdentity;

    const created = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "credit_card_airport_transfer",
        partnerEntrySlug: "bank-demo-alpha-airport",
        eligibilityVerificationId: verification.eligibilityVerificationId,
        direction: "pickup",
        pickup: {
          address: "桃園機場第二航廈",
        },
        dropoff: {
          address: "台北市信義區松高路11號",
        },
        reservationWindowStart: "2026-04-18T10:00:00Z",
        reservationWindowEnd: "2026-04-18T10:20:00Z",
        passenger: {
          name: "陳小姐",
          phone: "0900123456",
        },
        flightNo: "CI-001",
      },
      PARTNER_TENANT,
      handoffIdentity,
    );

    const booking = await ownedMobilityService.getTenantBooking(
      PARTNER_TENANT,
      created.bookingId,
      handoffIdentity,
    );
    const order = ownedMobilityService.getOrder(
      created.orderId,
      handoffIdentity,
    );

    expect(order).toMatchObject({
      tenantId: PARTNER_TENANT,
      partnerId: "partner-bank-demo-001",
      partnerProgramId: "program-airport-alpha",
      partnerEntrySlug: "bank-demo-alpha-airport",
      eligibilityVerificationId: verification.eligibilityVerificationId,
      issuerAuthorizationRef: "issuer-auth-bank_demo_alpha-2468",
      benefitReference: "benefit-bank_demo_alpha-2468",
    });
    expect(booking).toMatchObject({
      partnerId: "partner-bank-demo-001",
      partnerProgramId: "program-airport-alpha",
      partnerEntrySlug: "bank-demo-alpha-airport",
      eligibilityVerificationId: verification.eligibilityVerificationId,
      issuerAuthorizationRef: "issuer-auth-bank_demo_alpha-2468",
      benefitReference: "benefit-bank_demo_alpha-2468",
    });
    expect(auditService.listAuditLogs()[0]).toMatchObject({
      actionName: "create_tenant_booking",
      newValuesSummary: {
        partnerId: "partner-bank-demo-001",
        partnerProgramId: "program-airport-alpha",
        partnerEntrySlug: "bank-demo-alpha-airport",
        eligibilityVerificationId: verification.eligibilityVerificationId,
        issuerAuthorizationRef: "issuer-auth-bank_demo_alpha-2468",
        benefitReference: "benefit-bank_demo_alpha-2468",
      },
    });

    const otherEntry = tenantPartnerService.getPartnerEntry(
      "bank-demo-beta-airport",
    );
    const wrongEntryIdentity = {
      ...handoffIdentity,
      partnerId: otherEntry.partnerId,
      partnerProgramId: otherEntry.programId,
      partnerEntrySlug: otherEntry.entrySlug,
    };

    try {
      ownedMobilityService.getOrder(created.orderId, wrongEntryIdentity);
      expect.unreachable("another partner entry must not read the order");
    } catch (error) {
      expect(getErrorCode(error)).toBe("PARTNER_SCOPE_MISMATCH");
    }
  });

  it("reuses persisted eligibility verification after tenant-partner reload", async () => {
    const repository = createMemoryTenantPartnerRepository();
    const firstTenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
      repository,
    );
    await firstTenantPartnerService.onModuleInit();

    const verification =
      await firstTenantPartnerService.verifyPartnerEligibility(
        {
          entrySlug: "bank-demo-alpha-airport",
          cardLast4: "2468",
        },
        "owned-mobility-reuse-request",
      );
    await Promise.resolve();

    const reloadedTenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
      repository,
    );
    await reloadedTenantPartnerService.onModuleInit();

    const { ownedMobilityService } = createService(
      undefined,
      reloadedTenantPartnerService,
    );

    const created = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "credit_card_airport_transfer",
        partnerEntrySlug: "bank-demo-alpha-airport",
        eligibilityVerificationId: verification.eligibilityVerificationId,
        direction: "pickup",
        pickup: {
          address: "桃園機場第二航廈",
        },
        dropoff: {
          address: "台北市信義區松高路11號",
        },
        reservationWindowStart: "2026-04-18T10:00:00Z",
        reservationWindowEnd: "2026-04-18T10:20:00Z",
        passenger: {
          name: "陳小姐",
          phone: "0900123456",
        },
        flightNo: "CI-001",
      },
      PARTNER_TENANT,
    );

    expect(ownedMobilityService.getOrder(created.orderId)).toMatchObject({
      partnerEntrySlug: "bank-demo-alpha-airport",
      eligibilityVerificationId: verification.eligibilityVerificationId,
      issuerAuthorizationRef: "issuer-auth-bank_demo_alpha-2468",
    });
  });

  it("requires eligibility verification for partner airport-transfer entries", async () => {
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const { ownedMobilityService } = createService(
      undefined,
      tenantPartnerService,
    );

    try {
      ownedMobilityService.createTenantBooking(
        {
          businessDispatchSubtype: "credit_card_airport_transfer",
          partnerEntrySlug: "bank-demo-alpha-airport",
          direction: "pickup",
          pickup: {
            address: "桃園機場第二航廈",
          },
          dropoff: {
            address: "台北市信義區松高路11號",
          },
          reservationWindowStart: "2026-04-18T10:00:00Z",
          reservationWindowEnd: "2026-04-18T10:20:00Z",
          passenger: {
            name: "陳小姐",
            phone: "0900123456",
          },
          flightNo: "CI-001",
        },
        PARTNER_TENANT,
      );
      expect.unreachable(
        "partner airport-transfer booking should require eligibility verification",
      );
    } catch (error) {
      expect(getErrorCode(error)).toBe("ELIGIBILITY_VERIFICATION_REQUIRED");
    }
  });

  it("rejects completion proof payloads that exceed photo count or size limits", async () => {
    const { ownedMobilityService } = createService();
    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: {
          address: "台北市信義區松仁路100號",
        },
        dropoff: {
          address: "桃園機場第二航廈",
        },
        reservationWindowStart: "2026-04-15T08:30:00Z",
        reservationWindowEnd: "2026-04-15T08:45:00Z",
        passenger: {
          name: "王小明",
          phone: "0912000111",
        },
        signoffRequired: false,
        minPhotoCount: 1,
      },
      TENANT_ACME,
    );
    const dispatchJob = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const candidate = (
      await ownedMobilityService.listDispatchCandidates(
        dispatchJob.dispatchJobId,
      )
    )[0]!;
    const assignment = await ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: candidate.vehicleId,
      driverId: candidate.driverId,
    });

    ownedMobilityService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-10T09:02:00Z",
    });
    ownedMobilityService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-10T09:03:00Z",
    });
    ownedMobilityService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-10T09:08:00Z",
    });
    await ownedMobilityService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-10T09:10:00Z",
    });

    try {
      await ownedMobilityService.completeDriverTask(assignment.taskId, {
        completedAt: "2026-04-10T09:45:00Z",
        actualDistanceKm: 22.4,
        actualDurationSec: 2100,
        proof: {
          photos: Array.from({ length: 6 }, () => SAMPLE_PROOF_PHOTO),
        },
      });
      expect.unreachable(
        "completion should reject more than five proof photos",
      );
    } catch (error) {
      expect(getErrorCode(error)).toBe("PHOTO_LIMIT_EXCEEDED");
    }

    try {
      await ownedMobilityService.completeDriverTask(assignment.taskId, {
        completedAt: "2026-04-10T09:45:00Z",
        actualDistanceKm: 22.4,
        actualDurationSec: 2100,
        proof: {
          photos: [Buffer.alloc(600 * 1024 + 1, 1).toString("base64")],
        },
      });
      expect.unreachable(
        "completion should reject base64 proof photos above the size limit",
      );
    } catch (error) {
      expect(getErrorCode(error)).toBe("PROOF_PHOTO_TOO_LARGE");
    }
  });

  it("lists, updates, and cancels tenant bookings within the SLA windows", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T08:00:00Z"));

    const { ownedMobilityService } = createService();
    const created = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: {
          address: "台北市信義區松仁路100號",
        },
        dropoff: {
          address: "桃園機場第二航廈",
        },
        reservationWindowStart: "2026-04-14T10:00:00Z",
        reservationWindowEnd: "2026-04-14T10:20:00Z",
        passenger: {
          name: "王小明",
          phone: "0912000111",
        },
        costCenter: "OPS-01",
        notes: "原始預約",
      },
      TENANT_ACME,
    );

    const listed = ownedMobilityService.listTenantBookings(TENANT_ACME);
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.bookingId).toBe(created.bookingId);
    expect(listed.items[0]?.tenantId).toBe(TENANT_ACME);
    expect(listed.items[0]?.modifiableUntil).toBe("2026-04-14T09:30:00.000Z");
    expect(ownedMobilityService.getOrder(created.orderId).tenantId).toBe(
      TENANT_ACME,
    );

    const updated = await ownedMobilityService.updateTenantBooking(
      TENANT_ACME,
      created.bookingId,
      {
        reservationWindowStart: "2026-04-14T11:00:00Z",
        reservationWindowEnd: "2026-04-14T11:15:00Z",
        costCenter: "OPS-02",
        notes: "改到十一點出發",
      },
    );
    expect(updated.reservationWindowStart).toBe("2026-04-14T11:00:00Z");
    expect(updated.modifiableUntil).toBe("2026-04-14T10:30:00.000Z");
    expect(updated.costCenter).toBe("OPS-02");
    expect(updated.notes).toBe("改到十一點出發");

    const cancelled = await ownedMobilityService.cancelTenantBooking(
      TENANT_ACME,
      created.bookingId,
      {
        reason: "passenger_rescheduled",
      },
    );
    expect(cancelled.status).toBe("cancelled");
    expect(ownedMobilityService.getOrder(created.orderId).status).toBe(
      "cancelled",
    );

    vi.useRealTimers();
  });

  it("enforces tenant isolation for booking list, detail, update, and cancel", async () => {
    const { ownedMobilityService } = createService();
    const acmeBooking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: {
          address: "台北市信義區松仁路100號",
        },
        dropoff: {
          address: "桃園機場第二航廈",
        },
        reservationWindowStart: "2026-04-16T10:00:00Z",
        reservationWindowEnd: "2026-04-16T10:20:00Z",
        passenger: {
          name: "ACME Admin",
          phone: "0912000001",
        },
      },
      TENANT_ACME,
    );
    const newcoBooking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: {
          address: "新竹高鐵站",
        },
        dropoff: {
          address: "台北南港展覽館",
        },
        reservationWindowStart: "2026-04-16T11:00:00Z",
        reservationWindowEnd: "2026-04-16T11:20:00Z",
        passenger: {
          name: "NEWCO Admin",
          phone: "0912000002",
        },
      },
      TENANT_NEWCO,
    );

    const acmeList = ownedMobilityService.listTenantBookings(TENANT_ACME);
    expect(acmeList.items).toHaveLength(1);
    expect(acmeList.items[0]?.bookingId).toBe(acmeBooking.bookingId);
    expect(acmeList.items[0]?.tenantId).toBe(TENANT_ACME);

    expect(
      ownedMobilityService.getTenantBooking(
        TENANT_NEWCO,
        newcoBooking.bookingId,
      ).tenantId,
    ).toBe(TENANT_NEWCO);

    try {
      ownedMobilityService.getTenantBooking(
        TENANT_ACME,
        newcoBooking.bookingId,
      );
      expect.unreachable("cross-tenant booking read should fail");
    } catch (error) {
      expect(getErrorCode(error)).toBe("BOOKING_NOT_FOUND");
    }

    try {
      ownedMobilityService.updateTenantBooking(
        TENANT_ACME,
        newcoBooking.bookingId,
        {
          notes: "malicious edit",
        },
      );
      expect.unreachable("cross-tenant booking update should fail");
    } catch (error) {
      expect(getErrorCode(error)).toBe("BOOKING_NOT_FOUND");
    }

    try {
      ownedMobilityService.cancelTenantBooking(
        TENANT_ACME,
        newcoBooking.bookingId,
        {
          reason: "malicious cancel",
        },
      );
      expect.unreachable("cross-tenant booking cancel should fail");
    } catch (error) {
      expect(getErrorCode(error)).toBe("BOOKING_NOT_FOUND");
    }

    expect(ownedMobilityService.getOrder(newcoBooking.orderId).status).toBe(
      "created",
    );
  });

  it("projects completed tenant bookings as completed after the driver lifecycle closes", async () => {
    const { ownedMobilityService } = createService();
    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: {
          address: "台中高鐵站",
        },
        dropoff: {
          address: "台中市梧棲區中二路一段9號",
        },
        reservationWindowStart: "2026-04-16T10:00:00Z",
        reservationWindowEnd: "2026-04-16T10:20:00Z",
        passenger: {
          name: "企業旅客",
          phone: "0912000003",
        },
      },
      TENANT_ACME,
    );
    const dispatchJob = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const candidate = (
      await ownedMobilityService.listDispatchCandidates(
        dispatchJob.dispatchJobId,
      )
    )[0];
    const assignment = await ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: candidate!.vehicleId,
      driverId: candidate!.driverId,
    });

    ownedMobilityService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-16T10:02:00Z",
    });
    ownedMobilityService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-16T10:03:00Z",
      currentLocation: {
        lat: 24.266,
        lng: 120.522,
      },
    });
    ownedMobilityService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-16T10:08:00Z",
    });
    await ownedMobilityService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-16T10:10:00Z",
    });
    await ownedMobilityService.completeDriverTask(assignment.taskId, {
      completedAt: "2026-04-16T10:45:00Z",
      actualDistanceKm: 18.2,
      actualDurationSec: 2100,
      proof: {
        photos: [SAMPLE_PROOF_PHOTO],
      },
    });

    const completedBooking = await ownedMobilityService.getTenantBooking(
      TENANT_ACME,
      booking.bookingId,
    );

    expect(completedBooking.status).toBe("completed");
    expect(completedBooking.orderStatus).toBe("completed");
  });

  it("publishes tenant webhook deliveries for created, cancelled, and completed order events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T08:00:00Z"));

    try {
      const auditService = new AuditNotificationService();
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 204,
      }));
      const tenantPartnerService = new TenantPartnerService(
        auditService,
        undefined,
        new WebhookDispatchService(fetchMock),
      );

      const acmeEndpoint = tenantPartnerService.createWebhookEndpoint(
        TENANT_ACME,
        {
          url: "https://acme.example.com/webhooks/orders",
          secret: "acme-secret",
          events: ["order.created", "order.cancelled"],
        },
      );
      const newcoEndpoint = tenantPartnerService.createWebhookEndpoint(
        TENANT_NEWCO,
        {
          url: "https://newco.example.com/webhooks/orders",
          secret: "newco-secret",
          events: ["order.completed"],
        },
      );

      // Endpoints are created in "test_pending"; a successful test webhook
      // flips them to "active" so subsequent business events get dispatched.
      await tenantPartnerService.sendTestWebhook(TENANT_ACME, {
        webhookId: acmeEndpoint.webhookId,
      });
      await tenantPartnerService.sendTestWebhook(TENANT_NEWCO, {
        webhookId: newcoEndpoint.webhookId,
      });
      fetchMock.mockClear();

      const { ownedMobilityService } = createService(
        undefined,
        tenantPartnerService,
      );

      const acmeBooking = await ownedMobilityService.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          pickup: {
            address: "台北市信義區松仁路100號",
          },
          dropoff: {
            address: "桃園機場第二航廈",
          },
          reservationWindowStart: "2026-04-16T10:00:00Z",
          reservationWindowEnd: "2026-04-16T10:20:00Z",
          passenger: {
            name: "ACME Admin",
            phone: "0912000001",
          },
        },
        TENANT_ACME,
      );
      await flushWebhookDispatch();

      expect(
        tenantPartnerService
          .listWebhookDeliveries(TENANT_ACME)
          .filter((delivery) => delivery.eventType !== "tenant.webhook.test")
          .map((delivery) => ({
            eventType: delivery.eventType,
            status: delivery.status,
          })),
      ).toEqual([
        {
          eventType: "order.created",
          status: "delivered",
        },
      ]);
      expect(
        tenantPartnerService
          .listWebhookDeliveries(TENANT_NEWCO)
          .filter((delivery) => delivery.eventType !== "tenant.webhook.test"),
      ).toEqual([]);

      ownedMobilityService.cancelTenantBooking(
        TENANT_ACME,
        acmeBooking.bookingId,
        {
          reason: "passenger_cancelled",
        },
      );
      await flushWebhookDispatch();

      expect(
        tenantPartnerService
          .listWebhookDeliveries(TENANT_ACME)
          .filter((delivery) => delivery.eventType !== "tenant.webhook.test")
          .map((delivery) => delivery.eventType),
      ).toEqual(["order.cancelled", "order.created"]);

      const newcoBooking = await ownedMobilityService.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          pickup: {
            address: "新竹高鐵站",
          },
          dropoff: {
            address: "台北南港展覽館",
          },
          reservationWindowStart: "2026-04-16T11:00:00Z",
          reservationWindowEnd: "2026-04-16T11:20:00Z",
          passenger: {
            name: "NEWCO Admin",
            phone: "0912000002",
          },
        },
        TENANT_NEWCO,
      );
      const dispatchJob = ownedMobilityService.dispatchOrder(
        newcoBooking.orderId,
        {
          mode: "auto",
        },
      );
      const candidate = (
        await ownedMobilityService.listDispatchCandidates(
          dispatchJob.dispatchJobId,
        )
      )[0]!;
      const assignment = await ownedMobilityService.assignDispatch({
        dispatchJobId: dispatchJob.dispatchJobId,
        vehicleId: candidate.vehicleId,
        driverId: candidate.driverId,
      });

      ownedMobilityService.acceptDriverTask(assignment.taskId, {
        acceptedAt: "2026-04-16T11:02:00Z",
      });
      ownedMobilityService.departDriverTask(assignment.taskId, {
        departedAt: "2026-04-16T11:03:00Z",
      });
      ownedMobilityService.arrivedPickup(assignment.taskId, {
        arrivedAt: "2026-04-16T11:08:00Z",
      });
      await ownedMobilityService.startDriverTask(assignment.taskId, {
        startedAt: "2026-04-16T11:10:00Z",
      });
      await ownedMobilityService.completeDriverTask(assignment.taskId, {
        completedAt: "2026-04-16T11:45:00Z",
        actualDistanceKm: 22.4,
        actualDurationSec: 2100,
        proof: {
          photos: [SAMPLE_PROOF_PHOTO],
        },
      });
      await flushWebhookDispatch();

      expect(
        tenantPartnerService
          .listWebhookDeliveries(TENANT_NEWCO)
          .filter((delivery) => delivery.eventType !== "tenant.webhook.test")
          .map((delivery) => delivery.eventType),
      ).toEqual(["order.completed"]);
      // fetchMock was cleared after the two test-webhook activations, so this
      // count covers only the three business event deliveries that follow.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires an explicit dispatch step before reservation bookings appear in the dispatch queue", async () => {
    const { ownedMobilityService } = createService();
    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: {
          address: "台北市信義區松仁路100號",
        },
        dropoff: {
          address: "桃園機場第二航廈",
        },
        reservationWindowStart: "2026-04-16T10:00:00Z",
        reservationWindowEnd: "2026-04-16T10:20:00Z",
        passenger: {
          name: "王小明",
          phone: "0912000111",
        },
      },
      TENANT_ACME,
    );

    expect(booking.status).toBe("created");
    expect(ownedMobilityService.listDispatchJobs()).toHaveLength(0);

    const dispatchJob = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    expect(dispatchJob.status).toBe("reserved");
    expect(ownedMobilityService.listDispatchJobs()).toHaveLength(1);
    expect(ownedMobilityService.listDispatchJobs()[0]?.orderId).toBe(
      booking.orderId,
    );
    expect(ownedMobilityService.getOrder(booking.orderId).status).toBe(
      "preassigned",
    );
  });

  it("rejects tenant booking changes after modifiable_until", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T08:00:00Z"));

    const { ownedMobilityService } = createService();
    const created = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: {
          address: "台中高鐵站",
        },
        dropoff: {
          address: "台中市梧棲區中二路一段9號",
        },
        reservationWindowStart: "2026-04-15T10:00:00Z",
        reservationWindowEnd: "2026-04-15T10:20:00Z",
        passenger: {
          name: "李秘書",
          phone: "0933555777",
        },
      },
      TENANT_ACME,
    );

    vi.setSystemTime(new Date("2026-04-15T09:31:00Z"));

    try {
      ownedMobilityService.updateTenantBooking(TENANT_ACME, created.bookingId, {
        notes: "延後十分鐘",
      });
      expect.unreachable("booking update should fail after modifiable_until");
    } catch (error) {
      expect(getErrorCode(error)).toBe("ORDER_NOT_MODIFIABLE");
    }

    vi.useRealTimers();
  });

  it("routes reservation failures into redispatch queue or exception_hold", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T06:00:00Z"));

    const { auditService, regulatoryRegistryService, ownedMobilityService } =
      createService();
    regulatoryRegistryService.updateDriverWorkState("drv-demo-001", {
      workState: "offline",
    });
    // drv-demo-004 (business_vehicle, business_dispatch) is also dispatchable
    // supply; take it offline too so this scenario has no eligible candidate and
    // exercises the redispatch-queue / exception_hold path.
    regulatoryRegistryService.updateDriverWorkState("drv-demo-004", {
      workState: "offline",
    });
    regulatoryRegistryService.updateDriverWorkState("safety-op-001", {
      workState: "offline",
    });
    const initialEscalationNotifications = auditService
      .listNotifications()
      .filter((notification) =>
        ["ops_notice", "tenant_sla"].includes(notification.channel),
      ).length;

    const queuedBooking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: {
          address: "台中高鐵站",
        },
        dropoff: {
          address: "台中市梧棲區中二路一段9號",
        },
        reservationWindowStart: "2026-04-15T08:00:00Z",
        reservationWindowEnd: "2026-04-15T08:20:00Z",
        passenger: {
          name: "企業旅客 A",
          phone: "0911000001",
        },
      },
      TENANT_ACME,
    );
    const queuedDispatch = ownedMobilityService.dispatchOrder(
      queuedBooking.orderId,
      {
        mode: "auto",
      },
    );

    expect(queuedDispatch.status).toBe("queued");
    expect(ownedMobilityService.getOrder(queuedBooking.orderId).status).toBe(
      "redispatch_required",
    );

    const holdBooking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: {
          address: "台中高鐵站",
        },
        dropoff: {
          address: "台中市梧棲區中二路一段9號",
        },
        reservationWindowStart: "2026-04-15T06:20:00Z",
        reservationWindowEnd: "2026-04-15T06:35:00Z",
        passenger: {
          name: "企業旅客 B",
          phone: "0911000002",
        },
      },
      TENANT_ACME,
    );
    const holdDispatch = ownedMobilityService.dispatchOrder(
      holdBooking.orderId,
      {
        mode: "auto",
      },
    );

    expect(holdDispatch.status).toBe("failed");
    expect(ownedMobilityService.getOrder(holdBooking.orderId).status).toBe(
      "exception_hold",
    );
    expect(
      auditService
        .listNotifications()
        .filter((notification) =>
          ["ops_notice", "tenant_sla"].includes(notification.channel),
        ),
    ).toHaveLength(initialEscalationNotifications + 4);

    vi.useRealTimers();
  });

  it("cancels assigned standard taxi orders and closes active dispatch state", async () => {
    const { ownedMobilityService } = createService();
    const order = ownedMobilityService.createPassengerOrder({
      pickup: {
        address: "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: "台中市大安區興安路378號",
      },
      passenger: {
        name: "李先生",
        phone: "0911222333",
      },
    });
    const dispatchJob = ownedMobilityService.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const candidate = (
      await ownedMobilityService.listDispatchCandidates(
        dispatchJob.dispatchJobId,
      )
    )[0]!;
    const assignment = await ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: candidate.vehicleId,
      driverId: candidate.driverId,
    });

    const cancelledOrder = await ownedMobilityService.cancelOwnedOrder(
      order.orderId,
      {
        reason: "passenger_cancelled",
      },
    );

    expect(cancelledOrder.status).toBe("cancelled");
    expect(
      ownedMobilityService
        .listDispatchJobs()
        .find((job) => job.dispatchJobId === dispatchJob.dispatchJobId)?.status,
    ).toBe("closed");
    expect(ownedMobilityService.getDriverTask(assignment.taskId).status).toBe(
      "cancelled",
    );
  });

  it("persists queue check-in and check-out traces through the repository", async () => {
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      loadState: vi.fn(async () => ({
        orders: [],
        dispatchJobs: [],
        dispatchAttempts: [],
        dispatchAssignments: [],
        driverTasks: [],
        dispatchTraceLogs: [],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as OwnedMobilityRepository;

    const { ownedMobilityService } = createService(repository);
    await ownedMobilityService.onModuleInit();

    const checkedIn = ownedMobilityService.queueCheckIn({
      vehicleId: "veh-demo-001",
      siteId: "site-demo-001",
    });
    const checkedOut = ownedMobilityService.queueCheckOut({
      vehicleId: "veh-demo-001",
      siteId: "site-demo-001",
    });

    expect(checkedIn.status).toBe("checked_in");
    expect(checkedOut.status).toBe("checked_out");
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchTraceLogs: [
          expect.objectContaining({
            eventType: "queue.entry.created",
          }),
        ],
      }),
    );
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchTraceLogs: [
          expect.objectContaining({
            eventType: "queue.entry.closed",
          }),
        ],
      }),
    );
  });

  it("rehydrates persisted orders and writes dispatch snapshots through the repository", async () => {
    const auditService = new AuditNotificationService();
    const callcenterService = new CallcenterService(auditService);
    const regulatoryRegistryService = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter() as never),
      auditService,
      new DriverProfileService(auditService),
    );
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      loadState: vi.fn(async () => ({
        orders: [
          {
            orderId: "order-persisted-001",
            orderNo: "O-20260410-000099",
            orderSource: "app",
            orderDomain: "owned",
            tenantId: null,
            partnerId: null,
            partnerProgramId: null,
            partnerEntrySlug: null,
            eligibilityVerificationId: null,
            issuerAuthorizationRef: null,
            serviceBucket: "standard_taxi",
            dispatchSemantics: "realtime",
            businessDispatchSubtype: null,
            status: "ready_for_dispatch",
            pickup: {
              address: "台中市梧棲區中二路一段9號",
            },
            dropoff: {
              address: "台中市大安區興安路378號",
            },
            passenger: {
              name: "李先生",
              phone: "0911222333",
            },
            bookingId: null,
            bookingType: null,
            etaSnapshot: {
              etaMinutes: 8,
              calculatedAt: "2026-04-10T09:00:00Z",
            },
            callId: null,
            recordingId: null,
            reservationWindowStart: null,
            reservationWindowEnd: null,
            recurrenceRule: null,
            modifiableUntil: null,
            cancelableUntil: null,
            bookedBy: null,
            onsiteContact: null,
            costCenter: null,
            vehiclePreference: null,
            benefitReference: null,
            direction: null,
            flightNo: null,
            terminal: null,
            luggageCount: null,
            notes: null,
            fixedPrice: false,
            quotedFare: null,
            quotedFareSource: null,
            quotedFareRuleVersion: null,
            manualFareOverride: null,
            exceptionHold: null,
            proofRequirements: {
              minPhotoCount: 0,
              signoffRequired: false,
              expenseProofRequired: false,
            },
            approvalState: "not_required",
            approvalRequestIds: [],
            complianceFlags: [],
            cancelledAt: null,
            cancelReason: null,
            reservationHoldStatus: "none",
            reservationHoldId: null,
            reservationHoldExpiresAt: null,
            dispatchAttemptCount: 0,
            lastDispatchFailureReason: null,
            noSupplyEscalation: null,
            dispatchTimeout: null,
            createdAt: "2026-04-10T09:00:00Z",
            updatedAt: "2026-04-10T09:00:00Z",
          },
        ],
        dispatchJobs: [],
        dispatchAttempts: [],
        dispatchAssignments: [],
        driverTasks: [],
        dispatchTraceLogs: [],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as OwnedMobilityRepository;

    const ownedMobilityService = new OwnedMobilityService(
      regulatoryRegistryService,
      auditService,
      callcenterService,
      new OwnedMobilityTaskEventsService(new EventEmitter() as never),
      new OpsDispatchEventsService(new EventEmitter() as never),
      repository,
    );

    await ownedMobilityService.onModuleInit();

    expect(ownedMobilityService.getOrder("order-persisted-001").orderNo).toBe(
      "O-20260410-000099",
    );

    const dispatchJob = ownedMobilityService.dispatchOrder(
      "order-persisted-001",
      {
        mode: "auto",
      },
    );

    await Promise.resolve();

    expect(dispatchJob.status).toBe("matching");
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchJobs: [
          expect.objectContaining({
            dispatchJobId: dispatchJob.dispatchJobId,
            orderId: "order-persisted-001",
          }),
        ],
        dispatchAttempts: [
          expect.objectContaining({
            dispatchJobId: dispatchJob.dispatchJobId,
            outcome: "candidate_found",
          }),
        ],
        dispatchTraceLogs: [
          expect.objectContaining({
            orderId: "order-persisted-001",
            eventType: "dispatch.matching",
          }),
        ],
      }),
    );
  });

  it("rejects public runtime-profile overrides on every generic intake route", async () => {
    const { ownedMobilityService } = createService();

    const immediateCommand = {
      pickup: { address: "Pickup St" },
      dropoff: { address: "Dropoff St" },
      passenger: { name: "Test" },
    } as any;

    await expect(async () => {
      ownedMobilityService.createPassengerOrder(
        immediateCommand,
        null,
        "req-123",
        "multi_taxi_direct",
      );
    }).rejects.toThrowError(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "PUBLIC_RUNTIME_PROFILE_OVERRIDE_FORBIDDEN",
          }),
        }),
      }),
    );

    const callCenterCommand = {
      callId: "call-123",
      pickup: { address: "Pickup St" },
      dropoff: { address: "Dropoff St" },
      passenger: { name: "Test" },
    } as any;

    await expect(async () => {
      ownedMobilityService.createCallCenterOrder(
        callCenterCommand,
        "req-123",
        "multi_taxi_direct",
      );
    }).rejects.toThrowError(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "PUBLIC_RUNTIME_PROFILE_OVERRIDE_FORBIDDEN",
          }),
        }),
      }),
    );

    const wrongProductBookingCommand = {
      businessDispatchSubtype: "enterprise_dispatch",
      pickup: { address: "Pickup St" },
      dropoff: { address: "Dropoff St" },
      reservationWindowStart: "2026-07-20T10:00:00Z",
    } as any;

    await expect(async () => {
      await ownedMobilityService.createTenantBooking(
        wrongProductBookingCommand,
        "tenant-123",
        null,
        "req-123",
        "multi_taxi_direct",
      );
    }).rejects.toThrowError(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "PUBLIC_RUNTIME_PROFILE_OVERRIDE_FORBIDDEN",
          }),
        }),
      }),
    );
  });

  describe("referral passenger authority and lifecycle endpoints", () => {
    it("idempotent create replay returns TenantBookingResult shape without PII leak", async () => {
      const tenantPartnerService = new TenantPartnerService(
        new AuditNotificationService(),
      );
      const { ownedMobilityService } = createService(
        undefined,
        tenantPartnerService,
      );
      const identity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "referral_passenger",
        actorId: "pax-ref-001",
        realm: "partner",
        tenantId: "tenant-demo-001",
        partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
        partnerProgramId: "program-referral-community",
        partnerEntrySlug: "yuhe-residence",
        drtsPassengerId: "pax-ref-001",
        roleFamilies: ["partner"],
        roles: ["referral_passenger"],
        scopes: [],
        requestId: "req-ref-001",
      };

      const bookingCommand = {
        entrySlug: "yuhe-residence",
        pickupAddress: "123 Main St",
        dropoffAddress: "456 Market St",
        idempotencyKey: "idemp-test-key-100",
      };

      const result1 = await ownedMobilityService.createReferralPassengerBooking(
        bookingCommand,
        identity,
      );

      expect(result1.orderId).toBeDefined();
      expect(result1.bookingId).toBeDefined();
      expect(result1.serviceBucket).toBe("business_dispatch");
      expect(result1.replayed).toBe(false);

      const result2 = await ownedMobilityService.createReferralPassengerBooking(
        bookingCommand,
        identity,
      );

      expect(result2.orderId).toBe(result1.orderId);
      expect(result2.replayed).toBe(true);
      expect((result2 as any).passenger).toBeUndefined();
      expect((result2 as any).passengerName).toBeUndefined();
      expect((result2 as any).passengerPhone).toBeUndefined();
    });

    it("allows partner_api_key identities to create bookings within the same partner entry scope", async () => {
      const tenantPartnerService = new TenantPartnerService(
        new AuditNotificationService(),
      );
      const verification = await tenantPartnerService.verifyPartnerEligibility({
        entrySlug: "bank-demo-alpha-airport",
        cardLast4: "2468",
      });
      const { ownedMobilityService } = createService(
        undefined,
        tenantPartnerService,
      );
      const identity: BootstrapRequestIdentity = {
        authMode: "partner_api_key",
        actorType: "partner_api_key",
        actorId: "partner-key-001",
        realm: "partner",
        tenantId: PARTNER_TENANT,
        partnerId: "partner-bank-demo-001",
        partnerProgramId: "program-airport-alpha",
        partnerEntrySlug: "bank-demo-alpha-airport",
        roleFamilies: ["partner"],
        roles: ["partner_api_key"],
        scopes: ["partner:book"],
        requestId: "req-partner-api-booking-001",
      };

      const created = await ownedMobilityService.createTenantBooking(
        {
          businessDispatchSubtype: "credit_card_airport_transfer",
          partnerEntrySlug: "bank-demo-alpha-airport",
          eligibilityVerificationId: verification.eligibilityVerificationId,
          direction: "pickup",
          pickup: {
            address: "桃園機場第二航廈",
          },
          dropoff: {
            address: "台北市信義區松高路11號",
          },
          reservationWindowStart: "2026-04-18T10:00:00Z",
          reservationWindowEnd: "2026-04-18T10:20:00Z",
          passenger: {
            name: "陳小姐",
            phone: "0900123456",
          },
          flightNo: "CI-001",
        },
        PARTNER_TENANT,
        identity,
      );

      expect(created).toMatchObject({
        orderId: expect.any(String),
        bookingId: expect.any(String),
        replayed: false,
      });
      expect(
        ownedMobilityService.getOrder(created.orderId, identity),
      ).toMatchObject({
        partnerId: "partner-bank-demo-001",
        partnerProgramId: "program-airport-alpha",
        partnerEntrySlug: "bank-demo-alpha-airport",
        eligibilityVerificationId: verification.eligibilityVerificationId,
      });
    });

    it("prevents cross-passenger and cross-partner access", async () => {
      const tenantPartnerService = new TenantPartnerService(
        new AuditNotificationService(),
      );
      const { ownedMobilityService } = createService(
        undefined,
        tenantPartnerService,
      );
      const identity1: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "referral_passenger",
        actorId: "pax-ref-001",
        realm: "partner",
        tenantId: "tenant-demo-001",
        partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
        partnerProgramId: "program-referral-community",
        partnerEntrySlug: "yuhe-residence",
        drtsPassengerId: "pax-ref-001",
        roleFamilies: ["partner"],
        roles: ["referral_passenger"],
        scopes: [],
        requestId: "req-ref-001",
      };

      const identity2: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "referral_passenger",
        actorId: "pax-ref-002",
        realm: "partner",
        tenantId: "tenant-demo-001",
        partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
        partnerProgramId: "program-referral-community",
        partnerEntrySlug: "yuhe-residence",
        drtsPassengerId: "pax-ref-002",
        roleFamilies: ["partner"],
        roles: ["referral_passenger"],
        scopes: [],
        requestId: "req-ref-002",
      };

      const booking = await ownedMobilityService.createReferralPassengerBooking(
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Pickup Spot",
          dropoffAddress: "Dropoff Spot",
        },
        identity1,
      );

      let caught: any = null;
      try {
        ownedMobilityService.getReferralPassengerReceipt(
          booking.orderId,
          identity2,
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).not.toBeNull();
      expect(caught.getStatus()).toBe(403);
      expect(caught.getResponse().error.code).toMatch(
        /PASSENGER_SCOPE_MISMATCH|PARTNER_SCOPE_MISMATCH/,
      );
    });

    it("returns dynamic trip details and downloadUrl in receipt", async () => {
      const tenantPartnerService = new TenantPartnerService(
        new AuditNotificationService(),
      );
      const { ownedMobilityService } = createService(
        undefined,
        tenantPartnerService,
      );
      const identity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "referral_passenger",
        actorId: "pax-ref-001",
        realm: "partner",
        tenantId: "tenant-demo-001",
        partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
        partnerProgramId: "program-referral-community",
        partnerEntrySlug: "yuhe-residence",
        drtsPassengerId: "pax-ref-001",
        roleFamilies: ["partner"],
        roles: ["referral_passenger"],
        scopes: [],
        requestId: "req-ref-001",
      };

      const booking = await ownedMobilityService.createReferralPassengerBooking(
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Pickup Spot",
          dropoffAddress: "Dropoff Spot",
        },
        identity,
      );

      const activeTrip =
        ownedMobilityService.getReferralPassengerActiveTrip(identity);
      expect(activeTrip.active).toBe(true);
      expect(activeTrip.trip?.orderId).toBe(booking.orderId);

      const history =
        ownedMobilityService.listReferralPassengerHistory(identity);
      expect(history.items.length).toBeGreaterThan(0);
      expect(history.items[0]?.orderId).toBe(booking.orderId);

      const receipt = ownedMobilityService.getReferralPassengerReceipt(
        booking.orderId,
        identity,
      );
      expect(receipt.orderId).toBe(booking.orderId);
      expect(receipt.downloadUrl).toBe(
        `/api/referral/receipt/${booking.orderId}/download`,
      );
    });

    it("only allows referral ratings after completion and keeps duplicates idempotent", async () => {
      const tenantPartnerService = new TenantPartnerService(
        new AuditNotificationService(),
      );
      const { ownedMobilityService } = createService(
        undefined,
        tenantPartnerService,
      );
      const identity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "referral_passenger",
        actorId: "pax-ref-001",
        realm: "partner",
        tenantId: "tenant-demo-001",
        partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
        partnerProgramId: "program-referral-community",
        partnerEntrySlug: "yuhe-residence",
        drtsPassengerId: "pax-ref-001",
        roleFamilies: ["partner"],
        roles: ["referral_passenger"],
        scopes: [],
        requestId: "req-ref-rating-001",
      };

      const booking = await ownedMobilityService.createReferralPassengerBooking(
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Pickup Spot",
          dropoffAddress: "Dropoff Spot",
        },
        identity,
      );

      try {
        await ownedMobilityService.submitReferralPassengerRating(
          booking.orderId,
          {
            orderId: booking.orderId,
            score: 5,
            comment: " Great ride ",
            tags: [" polite ", "fast", "fast"],
          },
          identity,
        );
        expect.unreachable("rating before completion should fail");
      } catch (error) {
        expect(getErrorCode(error)).toBe("PASSENGER_RATING_TRIP_NOT_COMPLETED");
      }

      await completeOrderForRating(ownedMobilityService, booking.orderId);

      const firstRating =
        await ownedMobilityService.submitReferralPassengerRating(
          booking.orderId,
          {
            orderId: booking.orderId,
            score: 5,
            comment: " Great ride ",
            tags: [" polite ", "fast", "fast"],
            idempotencyKey: "rating-idemp-001",
          },
          identity,
        );
      expect(firstRating).toMatchObject({
        orderId: booking.orderId,
        score: 5,
        comment: "Great ride",
        tags: ["fast", "polite"],
      });

      const replayRating =
        await ownedMobilityService.submitReferralPassengerRating(
          booking.orderId,
          {
            orderId: booking.orderId,
            score: 5,
            comment: "Great ride",
            tags: ["fast", "polite"],
            idempotencyKey: "rating-idemp-002",
          },
          identity,
        );
      expect(replayRating).toEqual(firstRating);

      try {
        await ownedMobilityService.submitReferralPassengerRating(
          booking.orderId,
          {
            orderId: booking.orderId,
            score: 4,
            comment: "Different payload",
            tags: ["slow"],
          },
          identity,
        );
        expect.unreachable("different duplicate rating should conflict");
      } catch (error) {
        expect(getErrorCode(error)).toBe("PASSENGER_RATING_ALREADY_SUBMITTED");
      }
    });

    it("replays referral booking and rating after repository reload", async () => {
      const repository = createMemoryOwnedMobilityRepository();
      const tenantPartnerService = new TenantPartnerService(
        new AuditNotificationService(),
      );
      const identity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "referral_passenger",
        actorId: "pax-ref-001",
        realm: "partner",
        tenantId: "tenant-demo-001",
        partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
        partnerProgramId: "program-referral-community",
        partnerEntrySlug: "yuhe-residence",
        drtsPassengerId: "pax-ref-001",
        roleFamilies: ["partner"],
        roles: ["referral_passenger"],
        scopes: [],
        requestId: "req-ref-reload-001",
      };
      const bookingCommand = {
        entrySlug: "yuhe-residence",
        pickupAddress: "Pickup Spot",
        dropoffAddress: "Dropoff Spot",
        idempotencyKey: "referral-create-reload-001",
      };

      const { ownedMobilityService: firstService } = createService(
        repository,
        tenantPartnerService,
      );
      await firstService.onModuleInit();

      const created = await firstService.createReferralPassengerBooking(
        bookingCommand,
        identity,
      );
      await completeOrderForRating(firstService, created.orderId);
      const firstRating = await firstService.submitReferralPassengerRating(
        created.orderId,
        {
          orderId: created.orderId,
          score: 5,
          comment: "Smooth ride",
          tags: ["clean", "on-time"],
          idempotencyKey: "referral-rating-reload-001",
        },
        identity,
      );

      const { ownedMobilityService: reloadedService } = createService(
        repository,
        tenantPartnerService,
      );
      await reloadedService.onModuleInit();

      const replayed = await reloadedService.createReferralPassengerBooking(
        bookingCommand,
        identity,
      );
      expect(replayed.orderId).toBe(created.orderId);
      expect(replayed.replayed).toBe(true);

      const replayedRating =
        await reloadedService.submitReferralPassengerRating(
          created.orderId,
          {
            orderId: created.orderId,
            score: 5,
            comment: "Smooth ride",
            tags: ["clean", "on-time"],
            idempotencyKey: "referral-rating-reload-002",
          },
          identity,
        );
      expect(replayedRating).toEqual(firstRating);
    });
  });

  describe("GAP-CONF-06 minimum lead time validation and configuration", () => {
    const dummyAuth: MultiTaxiOperatingAuthorizationRecord = {
      authorizationId: "auth-leadtime-001",
      operatorId: "operator-001",
      authorityCode: "TPE-MTX-001",
      businessPlanVersion: "1.0",
      status: "approved",
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: "fare-ver-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    it("rejects scheduled booking inside default 15-minute lead time with TOO_SOON_TO_BOOK", () => {
      const { ownedMobilityService } = createService();
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      try {
        ownedMobilityService.createMultiTaxiRide(
          {
            pickup: { address: "台北車站" },
            dropoff: { address: "松山機場" },
            passenger: { name: "測試乘客", phone: "0911222333" },
            requestedPickupAt: fiveMinutesFromNow,
            timingMode: "scheduled",
            paymentMethodTokenRef: null,
          },
          dummyAuth,
        );
        expect.unreachable("should have thrown ApiRequestError");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.code).toBe("TOO_SOON_TO_BOOK");
        expect(apiError.getStatus()).toBe(400);
        const response = apiError.getResponse() as { error: { details?: Record<string, unknown> } };
        expect(response.error.details).toMatchObject({
          requestedPickupAt: fiveMinutesFromNow,
          minLeadTimeMinutes: 15,
        });
      }
    });

    it("rejects scheduled booking with pickup in the past with TOO_SOON_TO_BOOK", () => {
      const { ownedMobilityService } = createService();
      const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      try {
        ownedMobilityService.createMultiTaxiRide(
          {
            pickup: { address: "台北車站" },
            dropoff: { address: "松山機場" },
            passenger: { name: "測試乘客", phone: "0911222333" },
            requestedPickupAt: pastTime,
            timingMode: "scheduled",
            paymentMethodTokenRef: null,
          },
          dummyAuth,
        );
        expect.unreachable("should have thrown ApiRequestError");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiError = error as ApiRequestError;
        expect(apiError.code).toBe("TOO_SOON_TO_BOOK");
        expect(apiError.getStatus()).toBe(400);
      }
    });

    it("accepts scheduled booking with pickup beyond minimum lead time", () => {
      const { ownedMobilityService } = createService();
      const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const order = ownedMobilityService.createMultiTaxiRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: thirtyMinutesFromNow,
          timingMode: "scheduled",
          paymentMethodTokenRef: null,
        },
        dummyAuth,
      );

      expect(order).toBeDefined();
      expect(order.timingMode).toBe("scheduled");
      expect(order.dispatchSemantics).toBe("reservation");
      expect(order.reservationWindowStart).toBe(thirtyMinutesFromNow);
    });

    it("allows dynamically reconfiguring lead time via setMinLeadTimeMinutes", () => {
      const { ownedMobilityService } = createService();
      ownedMobilityService.setMinLeadTimeMinutes(60); // 60 minutes minimum

      const fortyMinutesFromNow = new Date(Date.now() + 40 * 60 * 1000).toISOString();

      // 40 minutes is now inside 60-minute lead time -> rejected
      expect(() =>
        ownedMobilityService.createMultiTaxiRide(
          {
            pickup: { address: "台北車站" },
            dropoff: { address: "松山機場" },
            passenger: { name: "測試乘客", phone: "0911222333" },
            requestedPickupAt: fortyMinutesFromNow,
            timingMode: "scheduled",
            paymentMethodTokenRef: null,
          },
          dummyAuth,
        ),
      ).toThrowError();

      // 70 minutes is beyond 60-minute lead time -> accepted
      const seventyMinutesFromNow = new Date(Date.now() + 70 * 60 * 1000).toISOString();
      const order = ownedMobilityService.createMultiTaxiRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: seventyMinutesFromNow,
          timingMode: "scheduled",
          paymentMethodTokenRef: null,
        },
        dummyAuth,
      );
      expect(order.timingMode).toBe("scheduled");
    });

    it("allows immediate future scheduled booking when minLeadTimeMinutes is 0", () => {
      const { ownedMobilityService } = createService();
      ownedMobilityService.setMinLeadTimeMinutes(0);

      const oneMinuteFromNow = new Date(Date.now() + 60 * 1000).toISOString();
      const order = ownedMobilityService.createMultiTaxiRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: oneMinuteFromNow,
          timingMode: "scheduled",
          paymentMethodTokenRef: null,
        },
        dummyAuth,
      );
      expect(order.timingMode).toBe("scheduled");
    });

    it("allows on-demand rides with immediate pickup time without lead time restriction", () => {
      const { ownedMobilityService } = createService();
      const nowIso = new Date().toISOString();

      const order = ownedMobilityService.createMultiTaxiRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: nowIso,
          timingMode: "on_demand",
          paymentMethodTokenRef: null,
        },
        dummyAuth,
      );
      expect(order.timingMode).toBe("on_demand");
      expect(order.dispatchSemantics).toBe("realtime");
    });

    it("respects SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES environment variable", () => {
      const originalEnv = process.env.SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES;
      try {
        process.env.SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES = "45";
        const { ownedMobilityService } = createService();
        expect(ownedMobilityService.getMinLeadTimeMinutes()).toBe(45);

        const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        expect(() =>
          ownedMobilityService.createMultiTaxiRide(
            {
              pickup: { address: "台北車站" },
              dropoff: { address: "松山機場" },
              passenger: { name: "測試乘客", phone: "0911222333" },
              requestedPickupAt: thirtyMinutesFromNow,
              timingMode: "scheduled",
              paymentMethodTokenRef: null,
            },
            dummyAuth,
          ),
        ).toThrowError();
      } finally {
        if (originalEnv === undefined) {
          delete process.env.SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES;
        } else {
          process.env.SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES = originalEnv;
        }
      }
    });
  });
});
