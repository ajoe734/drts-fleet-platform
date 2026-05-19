import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuditLogRecord } from "@drts/contracts";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { PlatformTenantGovernanceService } from "../../apps/api/src/modules/platform-admin/tenant-governance.service";
import { TenantsService } from "../../apps/api/src/modules/platform-admin/tenants.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const TENANT_ID = "tenant-demo-001";
const OTHER_TENANT_ID = "tenant-demo-002";

function createHarness() {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService,
  );
  const tenantsService = new TenantsService(auditNotificationService);
  const ownedMobilityService = new OwnedMobilityService(
    {
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
    } as never,
    auditNotificationService as never,
    {
      registerRecordingAttachmentListener: vi.fn(),
      registerRecordingStateChangeListener: vi.fn(),
      linkOrderToCallSession: vi.fn(),
    } as never,
    {
      publishTaskAssigned: vi.fn(),
      publishTaskUpdated: vi.fn(),
      publishTaskCancelled: vi.fn(),
    } as never,
    {
      publishOrderCreated: vi.fn(),
      publishOrderUpdated: vi.fn(),
      publishDispatchJobUpdated: vi.fn(),
      publishDriverLocationUpdated: vi.fn(),
      publishSupplyLifecycleUpdated: vi.fn(),
    } as never,
    undefined,
    tenantPartnerService,
  );
  const platformTenantGovernanceService = new PlatformTenantGovernanceService(
    tenantsService,
    tenantPartnerService,
  );

  tenantPartnerService.registerOrderFeedProvider(() =>
    ownedMobilityService.listOrders(),
  );

  return {
    auditNotificationService,
    tenantPartnerService,
    ownedMobilityService,
    platformTenantGovernanceService,
  };
}

function createBookingCommand(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    businessDispatchSubtype: "enterprise_dispatch",
    reservationWindowStart: "2026-05-19T10:00:00.000Z",
    reservationWindowEnd: "2026-05-19T11:00:00.000Z",
    pickup: { address: "Pickup" },
    dropoff: { address: "Dropoff" },
    passenger: { name: "Negative Rider", phone: "0912000000" },
    costCenter: "CC-FIN-04",
    ...overrides,
  };
}

function latestAuditLog(
  auditNotificationService: AuditNotificationService,
  actionName: string,
) {
  const matches = auditNotificationService
    .getAuditLogsSnapshot()
    .filter((log) => log.actionName === actionName);
  expect(matches.length).toBeGreaterThan(0);
  return matches[0] as AuditLogRecord;
}

function auditLogsByAction(
  auditNotificationService: AuditNotificationService,
  actionName: string,
) {
  return auditNotificationService
    .getAuditLogsSnapshot()
    .filter((log) => log.actionName === actionName);
}

async function expectApiErrorCode(
  run: () => Promise<unknown> | unknown,
  code: string,
) {
  await expect(Promise.resolve().then(run)).rejects.toMatchObject({
    response: {
      error: {
        code,
      },
    },
  });
}

describe("tenant governance negative-path integration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects unknown cost centers and preserves validation audit evidence", async () => {
    const { auditNotificationService, ownedMobilityService } = createHarness();

    await expectApiErrorCode(
      () =>
        ownedMobilityService.createTenantBooking(
          createBookingCommand({ costCenter: "CC-MISSING-99" }) as never,
          TENANT_ID,
          undefined,
          "req-neg-unknown-cost-center",
        ),
      "BOOKING_COST_CENTER_UNKNOWN",
    );

    expect(
      ownedMobilityService.listTenantBookings(TENANT_ID).items,
    ).toHaveLength(0);
    expect(
      latestAuditLog(
        auditNotificationService,
        "booking.cost_center.validation_rejected",
      ).newValuesSummary,
    ).toMatchObject({
      errorCode: "BOOKING_COST_CENTER_UNKNOWN",
      normalized: "CC-MISSING-99",
    });
  });

  it("rejects disabled cost centers and retains disabled-directory audit evidence", async () => {
    const {
      auditNotificationService,
      tenantPartnerService,
      ownedMobilityService,
    } = createHarness();

    tenantPartnerService.disableCostCenter(TENANT_ID, {
      code: "CC-OPS-02",
      reason: "sunset",
    });

    await expectApiErrorCode(
      () =>
        ownedMobilityService.createTenantBooking(
          createBookingCommand({ costCenter: "CC-OPS-02" }) as never,
          TENANT_ID,
          undefined,
          "req-neg-disabled-cost-center",
        ),
      "BOOKING_COST_CENTER_DISABLED",
    );

    expect(
      ownedMobilityService.listTenantBookings(TENANT_ID).items,
    ).toHaveLength(0);
    expect(
      latestAuditLog(
        auditNotificationService,
        "booking.cost_center.validation_rejected",
      ).newValuesSummary,
    ).toMatchObject({
      errorCode: "BOOKING_COST_CENTER_DISABLED",
      costCenter: "CC-OPS-02",
    });
  });

  it("isolates cross-tenant cost centers and audits the lookup as unknown for the caller tenant", async () => {
    const {
      auditNotificationService,
      tenantPartnerService,
      ownedMobilityService,
    } = createHarness();

    tenantPartnerService.upsertCostCenter(OTHER_TENANT_ID, {
      code: "CC-XTEN-01",
      name: "Other Tenant Shared Code",
    });

    await expectApiErrorCode(
      () =>
        ownedMobilityService.createTenantBooking(
          createBookingCommand({ costCenter: "CC-XTEN-01" }) as never,
          TENANT_ID,
          undefined,
          "req-neg-cross-tenant-cost-center",
        ),
      "BOOKING_COST_CENTER_UNKNOWN",
    );

    expect(
      tenantPartnerService.validateBookingCostCenter(
        OTHER_TENANT_ID,
        "CC-XTEN-01",
      ),
    ).toEqual({
      value: "CC-XTEN-01",
      matchedDirectory: true,
    });
    expect(
      ownedMobilityService.listTenantBookings(TENANT_ID).items,
    ).toHaveLength(0);
    expect(
      latestAuditLog(
        auditNotificationService,
        "booking.cost_center.validation_rejected",
      ).newValuesSummary,
    ).toMatchObject({
      errorCode: "BOOKING_COST_CENTER_UNKNOWN",
      normalized: "CC-XTEN-01",
    });
  });

  it("fails closed on quota_insufficient without leaving behind a booking or quota residue", async () => {
    const {
      auditNotificationService,
      tenantPartnerService,
      ownedMobilityService,
    } = createHarness();

    tenantPartnerService.upsertTenantQuotaPolicy(TENANT_ID, {
      period: "monthly",
      limit: {
        bookingCountLimit: 0,
        amountMinorLimit: 0,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });

    await expectApiErrorCode(
      () =>
        ownedMobilityService.createTenantBooking(
          createBookingCommand() as never,
          TENANT_ID,
          undefined,
          "req-neg-quota-insufficient",
        ),
      "QUOTA_INSUFFICIENT_AT_COMMIT",
    );

    expect(
      ownedMobilityService.listTenantBookings(TENANT_ID).items,
    ).toHaveLength(0);
    expect(tenantPartnerService.listTenantQuotaLedger(TENANT_ID)).toHaveLength(
      0,
    );
    expect(
      latestAuditLog(
        auditNotificationService,
        "tenant.quota_reservation.blocked",
      ).newValuesSummary,
    ).toMatchObject({
      errorCode: "QUOTA_INSUFFICIENT_AT_COMMIT",
    });
  });

  it("persists rule-blocked bookings with blocked approval state and dispatch denial audit trail", async () => {
    const {
      auditNotificationService,
      tenantPartnerService,
      ownedMobilityService,
    } = createHarness();

    const blockRule = tenantPartnerService.upsertApprovalRule(TENANT_ID, {
      ruleName: "Executive block",
      priority: 10,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: "CC-EXEC-01",
        },
      ],
      action: "block",
      approvers: [],
    });

    const created = await ownedMobilityService.createTenantBooking(
      createBookingCommand({ costCenter: "CC-EXEC-01" }) as never,
      TENANT_ID,
      undefined,
      "req-neg-rule-block",
    );
    const booking = ownedMobilityService.getTenantBooking(
      TENANT_ID,
      created.bookingId,
    );

    expect(booking.approvalState).toBe("blocked");
    expect(booking.approvalRequestIds).toEqual([]);
    expect(() =>
      ownedMobilityService.dispatchOrder(created.orderId, { mode: "auto" }),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "BOOKING_APPROVAL_PENDING",
          }),
        }),
      }),
    );
    expect(
      latestAuditLog(
        auditNotificationService,
        "booking.approval_rules.evaluated",
      ).newValuesSummary,
    ).toMatchObject({
      decision: "block",
      matchedRuleIds: [blockRule.ruleId],
    });
    expect(
      latestAuditLog(auditNotificationService, "booking.approval_state.changed")
        .newValuesSummary,
    ).toMatchObject({
      previousState: "not_required",
      approvalState: "blocked",
    });
  });

  it("rolls back unresolved-approver failures without leaving quota or approval artifacts behind", async () => {
    const {
      auditNotificationService,
      tenantPartnerService,
      ownedMobilityService,
    } = createHarness();

    tenantPartnerService.upsertApprovalRule(TENANT_ID, {
      ruleName: "Missing approver rule",
      priority: 10,
      conditions: [
        {
          field: "booking.amount_minor",
          op: "gte",
          value: 100_000,
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_role", roleCode: "tenant_missing_role" }],
    });

    await expectApiErrorCode(
      () =>
        ownedMobilityService.createTenantBooking(
          createBookingCommand({ costCenter: null }) as never,
          TENANT_ID,
          undefined,
          "req-neg-no-approver-rollback",
        ),
      "APPROVAL_NO_RESOLVABLE_APPROVERS",
    );

    expect(
      ownedMobilityService.listTenantBookings(TENANT_ID).items,
    ).toHaveLength(0);
    expect(tenantPartnerService.listApprovalRequests(TENANT_ID)).toHaveLength(
      0,
    );
    expect(tenantPartnerService.listTenantQuotaLedger(TENANT_ID)).toHaveLength(
      0,
    );
    expect(
      latestAuditLog(
        auditNotificationService,
        "booking.approval_rules.evaluated",
      ).newValuesSummary,
    ).toMatchObject({
      decision: "require_approval",
      approvalRequired: true,
    });
  });

  it("re-evaluates when governance-sensitive fields change and preserves cancellation audit evidence", async () => {
    const {
      auditNotificationService,
      tenantPartnerService,
      ownedMobilityService,
    } = createHarness();

    tenantPartnerService.upsertApprovalRule(TENANT_ID, {
      ruleName: "Ops approval",
      priority: 10,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: "CC-OPS-02",
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_admin" }],
    });
    tenantPartnerService.upsertApprovalRule(TENANT_ID, {
      ruleName: "Finance approval",
      priority: 20,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: "CC-FIN-04",
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_finance_admin" }],
    });

    const created = await ownedMobilityService.createTenantBooking(
      createBookingCommand({ costCenter: "CC-OPS-02" }) as never,
      TENANT_ID,
      undefined,
      "req-neg-reeval-create",
    );
    const originalRequest = tenantPartnerService.listApprovalRequests(
      TENANT_ID,
      {
        bookingId: created.bookingId,
      },
    )[0];

    expect(originalRequest).toBeDefined();

    const updated = await ownedMobilityService.updateTenantBooking(
      TENANT_ID,
      created.bookingId,
      {
        costCenter: "CC-FIN-04",
      } as never,
      undefined,
      "req-neg-reeval-update",
    );
    const requests = tenantPartnerService.listApprovalRequests(TENANT_ID, {
      bookingId: created.bookingId,
    });
    const cancelled = requests.find(
      (request) =>
        request.approvalRequestId === originalRequest?.approvalRequestId,
    );
    const replacement = requests.find(
      (request) =>
        request.approvalRequestId !== originalRequest?.approvalRequestId,
    );

    expect(updated.approvalState).toBe("pending");
    expect(updated.approvalRequestIds).toEqual([
      replacement?.approvalRequestId,
    ]);
    expect(cancelled?.status).toBe("cancelled_by_re_evaluation");
    expect(replacement?.status).toBe("pending");
    expect(
      latestAuditLog(
        auditNotificationService,
        "booking.approval_request.cancelled_by_re_evaluation",
      ).newValuesSummary,
    ).toMatchObject({
      bookingId: created.bookingId,
    });
  });

  it("does not re-evaluate when only notes change and keeps the original approval request alive", async () => {
    const {
      auditNotificationService,
      tenantPartnerService,
      ownedMobilityService,
    } = createHarness();

    tenantPartnerService.upsertApprovalRule(TENANT_ID, {
      ruleName: "Finance approval",
      priority: 10,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: "CC-FIN-04",
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_finance_admin" }],
    });

    const created = await ownedMobilityService.createTenantBooking(
      createBookingCommand() as never,
      TENANT_ID,
      undefined,
      "req-neg-notes-only-create",
    );
    const originalRequest = tenantPartnerService.listApprovalRequests(
      TENANT_ID,
      {
        bookingId: created.bookingId,
      },
    )[0];
    const evaluationsBefore = auditLogsByAction(
      auditNotificationService,
      "booking.approval_rules.evaluated",
    ).length;

    const updated = await ownedMobilityService.updateTenantBooking(
      TENANT_ID,
      created.bookingId,
      {
        notes: "Driver prefers gate B",
      } as never,
      undefined,
      "req-neg-notes-only-update",
    );

    expect(updated.approvalRequestIds).toEqual([
      originalRequest?.approvalRequestId,
    ]);
    expect(tenantPartnerService.listApprovalRequests(TENANT_ID)).toHaveLength(
      1,
    );
    expect(
      auditLogsByAction(
        auditNotificationService,
        "booking.approval_request.cancelled_by_re_evaluation",
      ),
    ).toHaveLength(0);
    expect(
      auditLogsByAction(
        auditNotificationService,
        "booking.approval_rules.evaluated",
      ).length,
    ).toBe(evaluationsBefore);
  });

  it("keeps rejected bookings undispatched and records the rejection audit", async () => {
    const {
      auditNotificationService,
      tenantPartnerService,
      ownedMobilityService,
    } = createHarness();

    tenantPartnerService.upsertApprovalRule(TENANT_ID, {
      ruleName: "Finance approval",
      priority: 10,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: "CC-FIN-04",
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_finance_admin" }],
    });

    const created = await ownedMobilityService.createTenantBooking(
      createBookingCommand() as never,
      TENANT_ID,
      undefined,
      "req-neg-reject-create",
    );
    const request = tenantPartnerService.listApprovalRequests(TENANT_ID, {
      bookingId: created.bookingId,
    })[0];

    expect(request).toBeDefined();

    await ownedMobilityService.rejectTenantBookingApprovalRequest(
      TENANT_ID,
      request!.approvalRequestId,
      "tenant-user-demo-003",
      "tenant_finance_admin",
      {
        reasonCode: "finance_reject",
      },
      "req-neg-reject-decision",
    );

    const booking = ownedMobilityService.getTenantBooking(
      TENANT_ID,
      created.bookingId,
    );
    expect(booking.approvalState).toBe("rejected");
    expect(booking.status).toBe("cancelled");
    expect(() =>
      ownedMobilityService.dispatchOrder(created.orderId, { mode: "auto" }),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "BOOKING_APPROVAL_PENDING",
          }),
        }),
      }),
    );
    expect(ownedMobilityService.listDriverTasks()).toHaveLength(0);
    expect(
      latestAuditLog(
        auditNotificationService,
        "booking.approval_request.rejected",
      ).newValuesSummary,
    ).toMatchObject({
      bookingId: created.bookingId,
      reasonCode: "finance_reject",
    });
  });

  it("surfaces pending-approval SLA risk in governance summary and records manual timeout escalation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T08:00:00.000Z"));

    const {
      auditNotificationService,
      tenantPartnerService,
      ownedMobilityService,
      platformTenantGovernanceService,
    } = createHarness();

    tenantPartnerService.upsertApprovalRule(TENANT_ID, {
      ruleName: "Finance approval",
      priority: 10,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: "CC-FIN-04",
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_finance_admin" }],
    });

    const created = await ownedMobilityService.createTenantBooking(
      createBookingCommand() as never,
      TENANT_ID,
      undefined,
      "req-neg-sla-create",
    );
    const request = tenantPartnerService.listApprovalRequests(TENANT_ID, {
      bookingId: created.bookingId,
    })[0];

    expect(request).toBeDefined();

    vi.setSystemTime(new Date("2026-05-21T09:00:00.000Z"));

    const summaryRow = platformTenantGovernanceService
      .listSummary()
      .items.find((row) => row.tenantId === TENANT_ID);

    expect(summaryRow).toBeDefined();
    expect(summaryRow?.pendingApprovalCount).toBe(1);
    expect(summaryRow?.oldestPendingApprovalAgeHours).toBeGreaterThan(48);
    expect(summaryRow?.alertFlags).toContain("pending_approval_over_48h");

    const escalated =
      await ownedMobilityService.escalateTenantBookingApprovalRequest(
        TENANT_ID,
        request!.approvalRequestId,
        "tenant-user-demo-001",
        "tenant_admin",
        {
          reasonNote: "Approval SLA breached",
        },
        "req-neg-sla-escalate",
      );

    expect(escalated.escalatedAt).not.toBeNull();
    expect(escalated.resolvedApproverUserIds).toContain("tenant-user-demo-001");
    expect(
      latestAuditLog(
        auditNotificationService,
        "booking.approval_request.timeout_escalated",
      ).newValuesSummary,
    ).toMatchObject({
      bookingId: created.bookingId,
    });
  });
});
