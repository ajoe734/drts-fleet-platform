import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuditLogRecord, TenantUserRoleRecord } from "@drts/contracts";

import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import type {
  PersistTenantPartnerChanges,
  TenantPartnerState,
} from "../../src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

const SAMPLE_PROOF_PHOTO = "cHJvb2YtcGhvdG8tZWUyLTAwMQ==";

const EXPECTED_AUDIT_ACTIONS = [
  "tenant.cost_center.created",
  "tenant.cost_center.updated",
  "tenant.cost_center.disabled",
  "tenant.cost_center.coverage_listed",
  "booking.cost_center.assigned",
  "tenant.approval_rule.created",
  "tenant.approval_rule.updated",
  "tenant.approval_rule.disabled",
  "tenant.approval_rule.reordered",
  "booking.approval_rules.evaluated",
  "tenant.quota_policy.updated",
  "tenant.quota_ledger.entry_added",
  "tenant.quota_snapshot.refreshed",
  "booking.governance.evaluated",
  "booking.approval_request.created",
  "booking.approval_request.approved",
  "booking.approval_request.rejected",
  "booking.approval_request.timeout_escalated",
  "booking.approval_request.cancelled_by_re_evaluation",
  "booking.approval_state.changed",
  "approver_fallback_used",
] as const;

function cloneState(state: TenantPartnerState): TenantPartnerState {
  return JSON.parse(JSON.stringify(state)) as TenantPartnerState;
}

function createEmptyTenantPartnerState(): TenantPartnerState {
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
  initialState: TenantPartnerState,
) {
  let state = cloneState(initialState);

  return {
    isEnabled: vi.fn(() => false),
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
        approvalRequests: mergeByKey(
          state.approvalRequests,
          changes.approvalRequests,
          (value) => value.approvalRequestId,
        ),
        approvalDecisions: mergeByKey(
          state.approvalDecisions,
          changes.approvalDecisions,
          (value) => value.decisionId,
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

function createTenantUsers(tenantId: string): TenantUserRoleRecord[] {
  return [
    {
      userId: `${tenantId}-admin`,
      tenantId,
      email: `${tenantId}.admin@example.com`,
      displayName: "Tenant Admin",
      roleCode: "tenant_admin",
      status: "active",
      invitedAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z",
    },
    {
      userId: `${tenantId}-finance`,
      tenantId,
      email: `${tenantId}.finance@example.com`,
      displayName: "Finance Lead",
      roleCode: "tenant_finance_admin",
      status: "active",
      invitedAt: "2026-04-29T00:05:00.000Z",
      updatedAt: "2026-04-29T00:05:00.000Z",
    },
    {
      userId: `${tenantId}-ops`,
      tenantId,
      email: `${tenantId}.ops@example.com`,
      displayName: "Ops Lead",
      roleCode: "tenant_ops_admin",
      status: "active",
      invitedAt: "2026-04-29T00:10:00.000Z",
      updatedAt: "2026-04-29T00:10:00.000Z",
    },
  ];
}

async function createHarness(tenantId: string) {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerRepository = createInMemoryTenantPartnerRepository({
    ...createEmptyTenantPartnerState(),
    userRoles: createTenantUsers(tenantId),
  });
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService,
    tenantPartnerRepository as never,
  );
  await tenantPartnerService.onModuleInit();

  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => [
      {
        driverId: "driver-001",
        vehicleId: "vehicle-001",
        etaMinutes: 6,
        operatingArea: "taipei",
        serviceBuckets: ["business_dispatch"],
      },
    ]),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };
  const taskEventsService = new OwnedMobilityTaskEventsService(
    new EventEmitter2(),
  );
  const opsDispatchEventsService = new OpsDispatchEventsService(
    new EventEmitter2(),
  );
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    opsDispatchEventsService,
    undefined,
    tenantPartnerService,
  );

  tenantPartnerService.registerOrderFeedProvider(() =>
    ownedMobilityService.listOrders(),
  );

  const billingSettlementRepository = {
    isEnabled: vi.fn(() => true),
    loadState: vi.fn(async () => ({
      tenantBillingProfiles: [],
      tenantInvoices: [],
      driverFeePlans: [],
      driverStatements: [],
      reimbursementBatches: [],
      reconciliationIssues: [],
    })),
    persistChanges: vi.fn(async () => {}),
    reportPersistenceFailure: vi.fn(),
    listLiveCompletedTenantTrips: vi.fn(
      async (
        requestedTenantId: string,
        periodStart: string,
        periodEnd: string,
      ) => {
        const start = new Date(periodStart).getTime();
        const end = new Date(periodEnd).getTime();
        const ordersById = new Map(
          ownedMobilityService
            .listOrders()
            .filter((order) => order.tenantId === requestedTenantId)
            .map((order) => [order.orderId, order]),
        );

        return ownedMobilityService
          .listDriverTasks()
          .filter(
            (task) =>
              task.status === "completed" &&
              task.completedAt &&
              new Date(task.completedAt).getTime() >= start &&
              new Date(task.completedAt).getTime() <= end,
          )
          .flatMap((task) => {
            const order = ordersById.get(task.orderId);
            if (!order) {
              return [];
            }

            return [
              {
                tenantId: order.tenantId ?? requestedTenantId,
                driverId: task.driverId,
                orderId: order.orderId,
                completedAt: task.completedAt ?? order.updatedAt,
                grossEarning: task.fare ??
                  order.quotedFare ?? {
                    currency: "NTD",
                    amountMinor: 0,
                  },
                costCenter: order.costCenter,
                orderSource: order.orderSource,
                serviceBucket: order.serviceBucket,
                businessDispatchSubtype: order.businessDispatchSubtype,
                partnerId: order.partnerId,
                partnerProgramId: order.partnerProgramId,
                partnerEntrySlug: order.partnerEntrySlug,
                eligibilityVerificationId: order.eligibilityVerificationId,
                issuerAuthorizationRef: order.issuerAuthorizationRef,
                benefitReference: order.benefitReference,
              },
            ];
          });
      },
    ),
    listLiveDriverTripsInPeriod: vi.fn(async () => []),
    listLiveDriverTripsInPeriodForDriver: vi.fn(async () => []),
  };
  const billingSettlementService = new BillingSettlementService(
    auditNotificationService,
    billingSettlementRepository as never,
    undefined,
    tenantPartnerService,
  );

  return {
    auditNotificationService,
    tenantPartnerService,
    ownedMobilityService,
    billingSettlementService,
  };
}

function listGovernanceAuditLogs(
  auditNotificationService: AuditNotificationService,
) {
  const expected = new Set<string>(EXPECTED_AUDIT_ACTIONS);
  return auditNotificationService
    .listAuditLogs()
    .filter((auditLog) => expected.has(auditLog.actionName));
}

function expectBookingAudit(log: AuditLogRecord) {
  expect(log.resourceType).toBe("booking");
  expect(log.resourceId).toEqual(expect.stringMatching(/^booking-/));
}

describe("tenant governance e2e integration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs booking -> approval -> dispatch -> completion -> billing with quota consumption", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));

    const tenantId = "tenant-governance-e2e-001";
    const {
      tenantPartnerService,
      ownedMobilityService,
      billingSettlementService,
    } = await createHarness(tenantId);

    tenantPartnerService.upsertCostCenter(tenantId, {
      code: "CC-FIN",
      name: "Finance",
      ownerUserId: `${tenantId}-finance`,
    });
    tenantPartnerService.upsertTenantQuotaPolicy(tenantId, {
      period: "monthly",
      limit: {
        bookingCountLimit: 4,
        amountMinorLimit: 1_000_000,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });
    tenantPartnerService.upsertApprovalRule(tenantId, {
      ruleName: "High-value finance approval",
      priority: 10,
      conditions: [
        {
          field: "booking.amount_minor",
          op: "gte",
          value: 100_000,
        },
      ],
      action: "require_approval",
      approvalMode: "any_of",
      approvers: [{ kind: "tenant_finance_admin" }],
    });

    const created = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T14:00:00.000Z",
        reservationWindowEnd: "2026-04-29T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "E2E Rider", phone: "0912000000" },
        costCenter: "CC-FIN",
      },
      tenantId,
      {
        actorType: "tenant_admin",
        actorId: `${tenantId}-admin`,
      } as never,
      "req-e2e-create-001",
    );

    const pendingBooking = ownedMobilityService.getTenantBooking(
      tenantId,
      created.bookingId,
    );
    const approvalRequest = tenantPartnerService.listApprovalRequests(
      tenantId,
      {
        bookingId: created.bookingId,
      },
    )[0];
    const quotaLedgerAfterCreate = tenantPartnerService.listTenantQuotaLedger(
      tenantId,
      {
        bookingId: created.bookingId,
      },
    );

    expect(pendingBooking.approvalState).toBe("pending");
    expect(approvalRequest).toBeDefined();
    expect(approvalRequest?.status).toBe("pending");
    expect(approvalRequest?.evaluationSnapshot.outcome.approvalRequired).toBe(
      true,
    );
    expect(quotaLedgerAfterCreate).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: created.bookingId,
          entryType: "reserve",
        }),
      ]),
    );
    expect(
      tenantPartnerService.getTenantQuotaSummary(
        tenantId,
        "2026-04-29T14:00:00.000Z",
      ).usage,
    ).toMatchObject({
      bookingCountReserved: 1,
      bookingCountConsumed: 0,
      amountMinorReserved: 150_000,
      amountMinorConsumed: 0,
    });

    expect(() =>
      ownedMobilityService.dispatchOrder(created.orderId, {
        mode: "auto",
      }),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "BOOKING_APPROVAL_PENDING",
          }),
        }),
      }),
    );

    await ownedMobilityService.approveTenantBookingApprovalRequest(
      tenantId,
      approvalRequest!.approvalRequestId,
      `${tenantId}-finance`,
      null,
      {},
      "req-e2e-approve-001",
    );

    const approvedBooking = ownedMobilityService.getTenantBooking(
      tenantId,
      created.bookingId,
    );
    expect(approvedBooking.approvalState).toBe("approved");
    expect(approvedBooking.approvalRequestIds).toEqual([]);

    const dispatchJob = ownedMobilityService.dispatchOrder(
      created.orderId,
      { mode: "auto" },
      "req-e2e-dispatch-001",
    );
    const assignment = ownedMobilityService.assignDispatch(
      {
        dispatchJobId: dispatchJob.dispatchJobId,
        vehicleId: "vehicle-001",
        driverId: "driver-001",
      },
      "req-e2e-assign-001",
    );
    ownedMobilityService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    ownedMobilityService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    ownedMobilityService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    ownedMobilityService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });
    await ownedMobilityService.completeDriverTask(
      assignment.taskId,
      {
        completedAt: "2026-04-29T12:45:00.000Z",
        actualDistanceKm: 14.2,
        actualDurationSec: 1200,
        proof: {
          photos: [SAMPLE_PROOF_PHOTO],
        },
      },
      "req-e2e-complete-001",
    );

    const quotaLedgerAfterComplete = tenantPartnerService.listTenantQuotaLedger(
      tenantId,
      {
        bookingId: created.bookingId,
      },
    );
    expect(quotaLedgerAfterComplete).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: created.bookingId,
          entryType: "consume",
        }),
      ]),
    );
    expect(
      tenantPartnerService.getTenantQuotaSummary(
        tenantId,
        "2026-04-29T14:00:00.000Z",
      ).usage,
    ).toMatchObject({
      bookingCountReserved: 0,
      bookingCountConsumed: 1,
      amountMinorReserved: 0,
      amountMinorConsumed: 150_000,
    });

    vi.setSystemTime(new Date("2026-05-13T12:00:00.000Z"));
    const invoice = await billingSettlementService.generateTenantInvoice(
      tenantId,
      {
        tenantId,
        periodStart: "2026-04-01T00:00:00.000Z",
        periodEnd: "2026-04-30T23:59:59.000Z",
      },
      "req-e2e-invoice-001",
    );

    expect(invoice.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: created.orderId,
          costCenterCode: "CC-FIN",
          costCenterName: "Finance",
          ownerUserId: `${tenantId}-finance`,
        }),
      ]),
    );
  });

  it("cancels stale approvals and creates a new request when governance fields change", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));

    const tenantId = "tenant-governance-e2e-002";
    const { tenantPartnerService, ownedMobilityService } =
      await createHarness(tenantId);

    tenantPartnerService.upsertCostCenter(tenantId, {
      code: "CC-OPS",
      name: "Operations",
      ownerUserId: `${tenantId}-ops`,
    });
    tenantPartnerService.upsertCostCenter(tenantId, {
      code: "CC-FIN",
      name: "Finance",
      ownerUserId: `${tenantId}-finance`,
    });
    tenantPartnerService.upsertTenantQuotaPolicy(tenantId, {
      period: "monthly",
      limit: {
        bookingCountLimit: 6,
        amountMinorLimit: 1_000_000,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });
    tenantPartnerService.upsertApprovalRule(tenantId, {
      ruleName: "Ops approval",
      priority: 10,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: "CC-OPS",
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_admin" }],
    });
    tenantPartnerService.upsertApprovalRule(tenantId, {
      ruleName: "Finance approval",
      priority: 20,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: "CC-FIN",
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_finance_admin" }],
    });

    const created = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T17:00:00.000Z",
        reservationWindowEnd: "2026-04-29T18:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Reeval Rider", phone: "0912000001" },
        costCenter: "CC-OPS",
      },
      tenantId,
    );

    const originalRequest = tenantPartnerService.listApprovalRequests(
      tenantId,
      {
        bookingId: created.bookingId,
      },
    )[0];
    expect(originalRequest).toBeDefined();

    const notesOnly = await ownedMobilityService.updateTenantBooking(
      tenantId,
      created.bookingId,
      {
        notes: "No governance change",
      },
      undefined,
      "req-reeval-notes-001",
    );
    expect(notesOnly.approvalRequestIds).toEqual([
      originalRequest!.approvalRequestId,
    ]);

    const reevaluated = await ownedMobilityService.updateTenantBooking(
      tenantId,
      created.bookingId,
      {
        costCenter: "CC-FIN",
      },
      undefined,
      "req-reeval-cost-center-001",
    );
    const requests = tenantPartnerService.listApprovalRequests(tenantId, {
      bookingId: created.bookingId,
    });
    const cancelled = requests.find(
      (request) =>
        request.approvalRequestId === originalRequest!.approvalRequestId,
    );
    const replacement = requests.find(
      (request) =>
        request.approvalRequestId !== originalRequest!.approvalRequestId,
    );

    expect(reevaluated.approvalState).toBe("pending");
    expect(reevaluated.approvalRequestIds).toEqual([
      replacement!.approvalRequestId,
    ]);
    expect(cancelled?.status).toBe("cancelled_by_re_evaluation");
    expect(replacement?.status).toBe("pending");
  });

  it("emits the full tenant-governance audit taxonomy with packet-aligned resource bindings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));

    const tenantId = "tenant-governance-e2e-003";
    const {
      auditNotificationService,
      tenantPartnerService,
      ownedMobilityService,
    } = await createHarness(tenantId);

    const ops = tenantPartnerService.upsertCostCenter(tenantId, {
      code: "CC-OPS",
      name: "Operations",
      ownerUserId: `${tenantId}-ops`,
    });
    tenantPartnerService.upsertCostCenter(tenantId, {
      code: "CC-OPS",
      name: "Operations HQ",
      ownerUserId: `${tenantId}-ops`,
    });
    const fin = tenantPartnerService.upsertCostCenter(tenantId, {
      code: "CC-FIN",
      name: "Finance",
      ownerUserId: `${tenantId}-finance`,
    });
    const exec = tenantPartnerService.upsertCostCenter(tenantId, {
      code: "CC-EXEC",
      name: "Executive",
      ownerUserId: null,
    });
    const old = tenantPartnerService.upsertCostCenter(tenantId, {
      code: "CC-OLD",
      name: "Legacy",
      ownerUserId: `${tenantId}-ops`,
    });
    tenantPartnerService.disableCostCenter(tenantId, {
      code: old.code,
      reason: "legacy sunset",
    });

    tenantPartnerService.upsertTenantQuotaPolicy(tenantId, {
      period: "monthly",
      limit: {
        bookingCountLimit: 10,
        amountMinorLimit: 2_000_000,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });

    const highValueRule = tenantPartnerService.upsertApprovalRule(tenantId, {
      ruleName: "High-value approval",
      priority: 10,
      conditions: [
        {
          field: "booking.amount_minor",
          op: "gte",
          value: 100_000,
        },
      ],
      action: "require_approval",
      approvalMode: "any_of",
      approvers: [{ kind: "tenant_admin" }],
    });
    const fallbackRule = tenantPartnerService.upsertApprovalRule(tenantId, {
      ruleName: "Exec owner approval",
      priority: 20,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: exec.code,
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "cost_center_owner" }],
    });
    const financeRule = tenantPartnerService.upsertApprovalRule(tenantId, {
      ruleName: "Finance approval",
      priority: 30,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: fin.code,
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_finance_admin" }],
    });
    tenantPartnerService.upsertApprovalRule(tenantId, {
      ruleId: highValueRule.ruleId,
      ruleName: "High-value approval",
      priority: 10,
      description: "Updated for taxonomy coverage",
      conditions: [
        {
          field: "booking.amount_minor",
          op: "gte",
          value: 100_000,
        },
      ],
      action: "require_approval",
      approvalMode: "any_of",
      approvers: [{ kind: "tenant_admin" }],
    });
    tenantPartnerService.reorderApprovalRules(tenantId, {
      orderedRuleIds: [
        fallbackRule.ruleId,
        financeRule.ruleId,
        highValueRule.ruleId,
      ],
    });

    const approvedBooking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T14:00:00.000Z",
        reservationWindowEnd: "2026-04-29T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Approved Rider", phone: "0912000100" },
        costCenter: ops.code,
      },
      tenantId,
    );
    const approvedRequest = tenantPartnerService.listApprovalRequests(
      tenantId,
      {
        bookingId: approvedBooking.bookingId,
      },
    )[0];
    await ownedMobilityService.approveTenantBookingApprovalRequest(
      tenantId,
      approvedRequest!.approvalRequestId,
      `${tenantId}-admin`,
      null,
      {},
      "req-taxonomy-approve-001",
    );
    const dispatchJob = ownedMobilityService.dispatchOrder(
      approvedBooking.orderId,
      {
        mode: "auto",
      },
    );
    const assignment = ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });
    ownedMobilityService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    ownedMobilityService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    ownedMobilityService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    ownedMobilityService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });
    await ownedMobilityService.completeDriverTask(assignment.taskId, {
      completedAt: "2026-04-29T12:45:00.000Z",
      actualDistanceKm: 14.2,
      actualDurationSec: 1200,
      proof: {
        photos: [SAMPLE_PROOF_PHOTO],
      },
    });

    const rejectedBooking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T16:00:00.000Z",
        reservationWindowEnd: "2026-04-29T17:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rejected Rider", phone: "0912000101" },
        costCenter: fin.code,
      },
      tenantId,
    );
    const rejectedRequest = tenantPartnerService.listApprovalRequests(
      tenantId,
      {
        bookingId: rejectedBooking.bookingId,
      },
    )[0];
    await ownedMobilityService.rejectTenantBookingApprovalRequest(
      tenantId,
      rejectedRequest!.approvalRequestId,
      `${tenantId}-finance`,
      null,
      {
        reasonCode: "finance_reject",
      },
      "req-taxonomy-reject-001",
    );

    const escalatedBooking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T18:00:00.000Z",
        reservationWindowEnd: "2026-04-29T19:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Escalate Rider", phone: "0912000102" },
        costCenter: fin.code,
      },
      tenantId,
    );
    const escalatedRequest = tenantPartnerService.listApprovalRequests(
      tenantId,
      {
        bookingId: escalatedBooking.bookingId,
      },
    )[0];
    await ownedMobilityService.escalateTenantBookingApprovalRequest(
      tenantId,
      escalatedRequest!.approvalRequestId,
      `${tenantId}-admin`,
      null,
      {},
      "req-taxonomy-escalate-001",
    );

    await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T20:00:00.000Z",
        reservationWindowEnd: "2026-04-29T21:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Fallback Rider", phone: "0912000103" },
        costCenter: exec.code,
      },
      tenantId,
    );

    const reevalBooking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T22:00:00.000Z",
        reservationWindowEnd: "2026-04-29T23:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Reeval Rider", phone: "0912000104" },
        costCenter: ops.code,
      },
      tenantId,
    );
    await ownedMobilityService.updateTenantBooking(
      tenantId,
      reevalBooking.bookingId,
      {
        costCenter: fin.code,
      },
      undefined,
      "req-taxonomy-reeval-001",
    );

    tenantPartnerService.summarizeCostCenterCoverage(
      tenantId,
      "req-taxonomy-coverage-001",
    );
    tenantPartnerService.disableApprovalRule(
      tenantId,
      highValueRule.ruleId,
      "req-taxonomy-rule-disable-001",
    );

    const governanceLogs = listGovernanceAuditLogs(auditNotificationService);
    const observedActions = new Set(
      governanceLogs.map((log) => log.actionName),
    );
    expect(observedActions).toEqual(new Set(EXPECTED_AUDIT_ACTIONS));

    for (const log of governanceLogs) {
      switch (log.actionName) {
        case "tenant.cost_center.created":
        case "tenant.cost_center.updated":
        case "tenant.cost_center.disabled":
        case "tenant.cost_center.coverage_listed":
          expect(log.resourceType).toBe("tenant_cost_center");
          break;
        case "tenant.approval_rule.created":
        case "tenant.approval_rule.updated":
        case "tenant.approval_rule.disabled":
        case "tenant.approval_rule.reordered":
          expect(log.resourceType).toBe("tenant_approval_rule");
          break;
        case "tenant.quota_policy.updated":
        case "tenant.quota_ledger.entry_added":
        case "tenant.quota_snapshot.refreshed":
          expect(log.resourceType).toBe("tenant_quota_policy");
          expect([tenantId, ops.code, fin.code, exec.code]).toContain(
            log.resourceId,
          );
          break;
        default:
          expectBookingAudit(log);
          break;
      }
    }

    expect(
      governanceLogs.filter(
        (log) =>
          log.actionName === "tenant.cost_center.created" &&
          log.resourceId === ops.code,
      ),
    ).toHaveLength(1);
    expect(
      governanceLogs.find(
        (log) =>
          log.actionName === "tenant.approval_rule.reordered" &&
          log.resourceId === tenantId,
      ),
    ).toBeDefined();
    expect(
      governanceLogs.find(
        (log) =>
          log.actionName === "approver_fallback_used" &&
          log.resourceId?.startsWith("booking-"),
      ),
    ).toBeDefined();
  });
});
