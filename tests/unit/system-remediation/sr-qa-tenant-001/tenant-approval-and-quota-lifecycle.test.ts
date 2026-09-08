import { afterEach, describe, expect, it, vi } from "vitest";

// SR-QA-TENANT-001 — 租戶日常工作、配額與整合設定驗收
//
// Scope for this file: the tenant booking-approval decision workflow
// (C025 送審→核准／駁回／人工升級) and cost-center quota consumption
// (C027/C028 額度). Both are implemented in
// `TenantPartnerService`/`OwnedMobilityService` and already have baseline
// regression coverage in tests/integ/tenant-governance-negative.test.ts for
// the *rejection*, *escalation*, and *quota-insufficient* negative paths.
// What is missing — and what this file adds — is the *approve* happy path
// (`approveApprovalRequest` / `approveTenantBookingApprovalRequest`) and the
// *successful* quota-consumption read-back, neither of which is exercised
// anywhere else in the repository (verified via
// `grep -rn "\.approveApprovalRequest(\|\.rejectApprovalRequest(\|\.escalateApprovalRequest(" tests/`
// on 2026-09-08, which only matched service/controller definitions).
//
// This is verification-only: no apps/api/src files are modified. Every
// assertion exercises the existing, already-implemented service methods,
// writes through them, and reads the result back through a separate,
// independent read path (service getter, ledger, or a subsequent mutation
// that would fail if the prior write had not taken effect).

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { PlatformTenantGovernanceService } from "../../../../apps/api/src/modules/platform-admin/tenant-governance.service";
import { TenantsService } from "../../../../apps/api/src/modules/platform-admin/tenants.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const TENANT_ID = "tenant-demo-001";

// Harness mirrors tests/integ/tenant-governance-negative.test.ts::createHarness
// exactly (same actor wiring, same eligible driver/vehicle candidate stub) so
// the approve-path tests below run through the identical booking → approval
// → dispatch pipeline that the existing reject/escalate negative tests use.
function createHarness() {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(auditNotificationService);
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
    tenantsService,
    platformTenantGovernanceService,
  };
}

function createBookingCommand(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const now = new Date();
  const startMs = now.getTime() + 6 * 60 * 60 * 1000;
  const endMs = startMs + 60 * 60 * 1000;
  return {
    businessDispatchSubtype: "enterprise_dispatch",
    reservationWindowStart: new Date(startMs).toISOString(),
    reservationWindowEnd: new Date(endMs).toISOString(),
    pickup: { address: "Pickup" },
    dropoff: { address: "Dropoff" },
    passenger: { name: "QA Rider", phone: "0912000111" },
    costCenter: "CC-FIN-04",
    ...overrides,
  };
}

async function expectApiErrorCode(
  run: () => Promise<unknown> | unknown,
  code: string,
) {
  await expect(Promise.resolve().then(run)).rejects.toMatchObject({
    response: { error: { code } },
  });
}

describe("SR-QA-TENANT-001 — approval-requests: approve happy path (write→read across booking/approval-request/order)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("approving the resolved approver's request moves the booking to approved and unblocks dispatch", async () => {
    const { tenantPartnerService, ownedMobilityService, auditNotificationService } =
      createHarness();

    const rule = tenantPartnerService.upsertApprovalRule(TENANT_ID, {
      ruleName: "Finance approval",
      priority: 10,
      conditions: [
        { field: "cost_center.code", op: "eq", value: "CC-FIN-04" },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_finance_admin" }],
    } as never);
    expect(rule.activeFlag).toBe(true);

    const created = await ownedMobilityService.createTenantBooking(
      createBookingCommand() as never,
      TENANT_ID,
      undefined,
      "req-qa-approve-create",
    );

    // Sanity: booking starts pending, dispatch is blocked (same assertion
    // shape as the existing reject-path negative test).
    const pendingBooking = ownedMobilityService.getTenantBooking(
      TENANT_ID,
      created.bookingId,
    );
    expect(pendingBooking.approvalState).toBe("pending");
    expect(pendingBooking.approvalRequestIds).toHaveLength(1);
    await expectApiErrorCode(
      () => ownedMobilityService.dispatchOrder(created.orderId, { mode: "auto" }),
      "BOOKING_APPROVAL_PENDING",
    );

    const request = tenantPartnerService.listApprovalRequests(TENANT_ID, {
      bookingId: created.bookingId,
    })[0];
    expect(request).toBeDefined();
    expect(request!.status).toBe("pending");
    expect(request!.resolvedApproverUserIds).toContain("tenant-user-demo-003");

    // WRITE: approve as the resolved tenant_finance_admin approver.
    const decided = await ownedMobilityService.approveTenantBookingApprovalRequest(
      TENANT_ID,
      request!.approvalRequestId,
      "tenant-user-demo-003",
      "tenant_finance_admin",
      { reasonNote: "Within Q3 travel budget" },
      "req-qa-approve-decision",
    );
    expect(decided.status).toBe("approved");

    // READ BACK #1: the approval-request record itself, via an independent
    // getter (not the value returned by the write call).
    const reread = tenantPartnerService.getApprovalRequest(
      TENANT_ID,
      request!.approvalRequestId,
    );
    expect(reread.status).toBe("approved");
    expect(reread.resolvedAt).not.toBeNull();
    expect(
      reread.decisions.some(
        (d) =>
          d.actorUserId === "tenant-user-demo-003" && d.decision === "approve",
      ),
    ).toBe(true);

    // READ BACK #2: the booking record, a *different* resource linked to the
    // approval request via bookingId — proves the decision actually
    // propagated across the resource relationship, not just onto the
    // approval-request row itself.
    const approvedBooking = ownedMobilityService.getTenantBooking(
      TENANT_ID,
      created.bookingId,
    );
    expect(approvedBooking.approvalState).toBe("approved");

    // READ BACK #3: dispatch, a third resource gated by the approval state,
    // now succeeds instead of throwing BOOKING_APPROVAL_PENDING. The single
    // stubbed candidate is eligible enough to be reserved immediately, so
    // either in-progress dispatch status is an acceptable non-blocked result.
    const dispatchJob = ownedMobilityService.dispatchOrder(created.orderId, {
      mode: "auto",
    });
    expect(["matching", "reserved"]).toContain(dispatchJob.status);

    const approvalAudit = auditNotificationService
      .getAuditLogsSnapshot()
      .find((log) => log.actionName === "booking.approval_request.approved");
    expect(approvalAudit).toBeDefined();
    expect(approvalAudit?.newValuesSummary).toMatchObject({
      bookingId: created.bookingId,
      approvalRequestId: request!.approvalRequestId,
    });
  });

  it("rejects a second decision from the same approver while the request is still pending on other approvers (all_of_parallel)", async () => {
    const { tenantPartnerService, ownedMobilityService } = createHarness();

    // Two-approver, all_of_parallel rule: a single decision must not resolve
    // the request, so the request is still "pending" when the same approver
    // tries to decide a second time — this is what makes the assertion below
    // actually exercise APPROVAL_DECISION_ALREADY_RECORDED rather than the
    // request-no-longer-pending short-circuit (see the resolved-in-one-shot
    // approve test above, where a single any_of approver resolves the
    // request immediately).
    tenantPartnerService.upsertApprovalRule(TENANT_ID, {
      ruleName: "Finance + admin dual approval",
      priority: 10,
      conditions: [
        { field: "cost_center.code", op: "eq", value: "CC-FIN-04" },
      ],
      action: "require_approval",
      approvalMode: "all_of_parallel",
      approvers: [{ kind: "tenant_finance_admin" }, { kind: "tenant_admin" }],
    } as never);

    const created = await ownedMobilityService.createTenantBooking(
      createBookingCommand() as never,
      TENANT_ID,
      undefined,
      "req-qa-double-approve-create",
    );
    const request = tenantPartnerService.listApprovalRequests(TENANT_ID, {
      bookingId: created.bookingId,
    })[0]!;
    expect(request.resolvedApproverUserIds).toEqual(
      expect.arrayContaining(["tenant-user-demo-003", "tenant-user-demo-001"]),
    );

    const afterFirst = await ownedMobilityService.approveTenantBookingApprovalRequest(
      TENANT_ID,
      request.approvalRequestId,
      "tenant-user-demo-003",
      "tenant_finance_admin",
      {},
      "req-qa-double-approve-first",
    );
    // Still pending: only one of two required approvers has decided.
    expect(afterFirst.status).toBe("pending");

    await expectApiErrorCode(
      () =>
        ownedMobilityService.approveTenantBookingApprovalRequest(
          TENANT_ID,
          request.approvalRequestId,
          "tenant-user-demo-003",
          "tenant_finance_admin",
          {},
          "req-qa-double-approve-second",
        ),
      "APPROVAL_DECISION_ALREADY_RECORDED",
    );

    // The pending state must not have regressed or duplicated the decision.
    const reread = tenantPartnerService.getApprovalRequest(
      TENANT_ID,
      request.approvalRequestId,
    );
    expect(reread.status).toBe("pending");
    expect(
      reread.decisions.filter((d) => d.actorUserId === "tenant-user-demo-003"),
    ).toHaveLength(1);
  });

  it("rejects a decision from an actor who is not a resolved approver on the request", async () => {
    const { tenantPartnerService, ownedMobilityService } = createHarness();

    tenantPartnerService.upsertApprovalRule(TENANT_ID, {
      ruleName: "Finance approval",
      priority: 10,
      conditions: [
        { field: "cost_center.code", op: "eq", value: "CC-FIN-04" },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_finance_admin" }],
    } as never);

    const created = await ownedMobilityService.createTenantBooking(
      createBookingCommand() as never,
      TENANT_ID,
      undefined,
      "req-qa-unauthorized-approve-create",
    );
    const request = tenantPartnerService.listApprovalRequests(TENANT_ID, {
      bookingId: created.bookingId,
    })[0]!;

    await expectApiErrorCode(
      () =>
        ownedMobilityService.approveTenantBookingApprovalRequest(
          TENANT_ID,
          request.approvalRequestId,
          "tenant-user-not-an-approver",
          "tenant_viewer",
          {},
          "req-qa-unauthorized-approve",
        ),
      "APPROVAL_NOT_AUTHORIZED",
    );

    // The booking must still be pending — an unauthorized attempt must not
    // silently advance the workflow.
    expect(
      ownedMobilityService.getTenantBooking(TENANT_ID, created.bookingId)
        .approvalState,
    ).toBe("pending");
  });
});

describe("SR-QA-TENANT-001 — cost-center quota: consumption ledger and summary read-back (C027/C028 額度)", () => {
  it("a successful booking against a cost center with sufficient quota is reflected in the ledger and the cost-center quota summary", async () => {
    const { tenantPartnerService, ownedMobilityService } = createHarness();

    const costCenter = tenantPartnerService.upsertCostCenter(TENANT_ID, {
      code: "CC-QA-QUOTA-01",
      name: "QA Quota Cost Center",
    } as never);
    expect(costCenter.activeFlag).toBe(true);

    tenantPartnerService.upsertTenantQuotaPolicy(TENANT_ID, {
      costCenterCode: "CC-QA-QUOTA-01",
      period: "monthly",
      limit: {
        bookingCountLimit: 10,
        amountMinorLimit: 5_000_000,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    } as never);

    const before = tenantPartnerService.getCostCenterQuotaSummary(
      TENANT_ID,
      "CC-QA-QUOTA-01",
    );
    expect(before.usage.confirmedBookingCount + before.usage.pendingReservedBookingCount).toBe(0);

    const created = await ownedMobilityService.createTenantBooking(
      createBookingCommand({ costCenter: "CC-QA-QUOTA-01" }) as never,
      TENANT_ID,
      undefined,
      "req-qa-quota-positive-create",
    );

    // READ BACK #1: the tenant quota ledger records an entry tied to this
    // specific booking (the resource relationship the acceptance criteria
    // requires, not just an incrementing counter).
    const ledger = tenantPartnerService.listTenantQuotaLedger(TENANT_ID);
    const bookingEntries = ledger.filter(
      (entry) => entry.bookingId === created.bookingId,
    );
    expect(bookingEntries.length).toBeGreaterThan(0);
    expect(
      bookingEntries.some((entry) => entry.costCenterCode === "CC-QA-QUOTA-01"),
    ).toBe(true);

    // READ BACK #2: the cost-center quota summary usage increased by exactly
    // one booking, through a completely independent read path.
    const after = tenantPartnerService.getCostCenterQuotaSummary(
      TENANT_ID,
      "CC-QA-QUOTA-01",
    );
    expect(
      after.usage.confirmedBookingCount + after.usage.pendingReservedBookingCount,
    ).toBe(
      before.usage.confirmedBookingCount + before.usage.pendingReservedBookingCount + 1,
    );
    if (after.usage.bookingCountRemaining !== null) {
      expect(after.usage.bookingCountRemaining).toBeLessThan(
        before.usage.bookingCountRemaining ?? Number.POSITIVE_INFINITY,
      );
    }
  });

  it("negative: a cost center with a zero booking-count limit blocks new bookings and leaves the ledger untouched (regression, R-existing)", async () => {
    const { tenantPartnerService, ownedMobilityService } = createHarness();

    tenantPartnerService.upsertCostCenter(TENANT_ID, {
      code: "CC-QA-QUOTA-ZERO",
      name: "QA Zero Quota Cost Center",
    } as never);
    tenantPartnerService.upsertTenantQuotaPolicy(TENANT_ID, {
      costCenterCode: "CC-QA-QUOTA-ZERO",
      period: "monthly",
      limit: {
        bookingCountLimit: 0,
        amountMinorLimit: 0,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    } as never);

    await expectApiErrorCode(
      () =>
        ownedMobilityService.createTenantBooking(
          createBookingCommand({ costCenter: "CC-QA-QUOTA-ZERO" }) as never,
          TENANT_ID,
          undefined,
          "req-qa-quota-negative-create",
        ),
      "QUOTA_INSUFFICIENT_AT_COMMIT",
    );

    expect(
      tenantPartnerService
        .listTenantQuotaLedger(TENANT_ID)
        .filter((entry) => entry.costCenterCode === "CC-QA-QUOTA-ZERO"),
    ).toHaveLength(0);
  });
});
