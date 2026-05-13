import { describe, expect, it } from "vitest";

import type { TenantApprovalEvaluationInputSnapshot } from "@drts/contracts";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

const TENANT_ID = "tenant-demo-001";

function createInputSnapshot(
  overrides: Partial<TenantApprovalEvaluationInputSnapshot> = {},
): TenantApprovalEvaluationInputSnapshot {
  return {
    costCenterCode: "CC-FIN-04",
    businessDispatchSubtype: "enterprise_dispatch",
    reservationWindowStart: "2026-05-13T10:00:00.000Z",
    passengerId: "passenger-demo-001",
    passengerRole: "employee",
    amountMinor: 200_000,
    currency: "TWD",
    vehiclePreference: "standard_taxi",
    direction: "pickup",
    flightNoPresent: false,
    flightNo: null,
    ...overrides,
  };
}

function createHarness() {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService,
  );

  return {
    auditNotificationService,
    tenantPartnerService,
  };
}

async function createApprovalRequest(
  tenantPartnerService: TenantPartnerService,
  options?: {
    bookingId?: string;
    orderId?: string;
    approvers?: Array<
      | { kind: "tenant_admin" }
      | { kind: "tenant_finance_admin" }
      | { kind: "tenant_role"; roleCode: string }
    >;
    approvalMode?: "any_of" | "all_of_parallel";
    timeoutHoursOverride?: number;
  },
) {
  const bookingId = options?.bookingId ?? "booking-approval-notify-001";
  const orderId = options?.orderId ?? "order-approval-notify-001";
  tenantPartnerService.upsertApprovalRule(TENANT_ID, {
    ruleName: `Approval rule for ${bookingId}`,
    priority: 10,
    conditions: [{ field: "booking.amount_minor", op: "gte", value: 1 }],
    action: "require_approval",
    approvalMode: options?.approvalMode ?? "any_of",
    approvers: options?.approvers ?? [{ kind: "tenant_admin" }],
    timeoutHoursOverride: options?.timeoutHoursOverride ?? 13,
  });

  const evaluation = tenantPartnerService.evaluateApprovalRules(TENANT_ID, {
    subject: {
      subjectType: "booking",
      bookingId,
      draftId: null,
      operation: "create",
    },
    inputSnapshot: createInputSnapshot(),
  });

  return await tenantPartnerService.createBookingApprovalRequest({
    tenantId: TENANT_ID,
    bookingId,
    orderId,
    evaluationSnapshot: evaluation,
  });
}

describe("tenant approval notification fan-out", () => {
  it("fans out new-request and rejected notifications to each resolved approver", async () => {
    const { auditNotificationService, tenantPartnerService } = createHarness();

    const request = await createApprovalRequest(tenantPartnerService, {
      bookingId: "booking-fanout-001",
      orderId: "order-fanout-001",
      approvalMode: "all_of_parallel",
      approvers: [{ kind: "tenant_admin" }, { kind: "tenant_finance_admin" }],
    });

    const newRequestEmails = auditNotificationService
      .listEmailDeliveries()
      .filter((delivery) => delivery.templateKey === "new_request");
    const newRequestNotifications = auditNotificationService
      .listNotifications()
      .filter((notification) => notification.channel === "tenant_approval");

    expect(newRequestEmails).toHaveLength(2);
    expect(
      new Set(newRequestEmails.map((delivery) => delivery.recipientUserId)),
    ).toEqual(new Set(["tenant-user-demo-001", "tenant-user-demo-003"]));
    expect(newRequestNotifications).toHaveLength(2);

    await tenantPartnerService.rejectApprovalRequest({
      tenantId: TENANT_ID,
      approvalRequestId: request.approvalRequestId,
      actorUserId: "tenant-user-demo-001",
      actorRoleCode: "tenant_admin",
      command: {
        reasonCode: "policy_reject",
      },
    });

    const rejectedEmails = auditNotificationService
      .listEmailDeliveries()
      .filter((delivery) => delivery.templateKey === "rejected");

    expect(rejectedEmails).toHaveLength(2);
    expect(
      new Set(rejectedEmails.map((delivery) => delivery.recipientUserId)),
    ).toEqual(new Set(["tenant-user-demo-001", "tenant-user-demo-003"]));
  });

  it("respects per-user approval notification opt-out", async () => {
    const { auditNotificationService, tenantPartnerService } = createHarness();

    tenantPartnerService.updateTenantUserRole(
      TENANT_ID,
      "tenant-user-demo-003",
      {
        roleCode: "tenant_finance_admin",
        approvalNotificationOptOut: true,
      },
    );

    await createApprovalRequest(tenantPartnerService, {
      bookingId: "booking-optout-001",
      orderId: "order-optout-001",
      approvalMode: "all_of_parallel",
      approvers: [{ kind: "tenant_admin" }, { kind: "tenant_finance_admin" }],
    });

    const newRequestEmails = auditNotificationService
      .listEmailDeliveries()
      .filter((delivery) => delivery.templateKey === "new_request");

    expect(newRequestEmails).toHaveLength(1);
    expect(newRequestEmails[0]?.recipientUserId).toBe("tenant-user-demo-001");
  });

  it("fires the approaching-timeout reminder once and escalates to the escalation target", async () => {
    const { auditNotificationService, tenantPartnerService } = createHarness();

    const request = await createApprovalRequest(tenantPartnerService, {
      bookingId: "booking-timeout-001",
      orderId: "order-timeout-001",
      approvers: [{ kind: "tenant_finance_admin" }],
      timeoutHoursOverride: 13,
    });
    const reminderAt = new Date(
      Date.parse(request.timeoutAt) - 12 * 60 * 60 * 1000,
    ).toISOString();

    const firstRun = await tenantPartnerService.processApprovalTimeouts({
      now: reminderAt,
    });
    const secondRun = await tenantPartnerService.processApprovalTimeouts({
      now: new Date(Date.parse(reminderAt) + 30 * 60 * 1000).toISOString(),
    });

    expect(firstRun.approachingTimeoutNotified).toBe(1);
    expect(secondRun.approachingTimeoutNotified).toBe(0);
    expect(
      auditNotificationService
        .listEmailDeliveries()
        .filter((delivery) => delivery.templateKey === "approaching_timeout"),
    ).toHaveLength(1);

    const timeoutRun = await tenantPartnerService.processApprovalTimeouts({
      now: request.timeoutAt,
    });
    const escalatedEmails = auditNotificationService
      .listEmailDeliveries()
      .filter((delivery) => delivery.templateKey === "escalated");

    expect(timeoutRun.escalated).toBe(1);
    expect(escalatedEmails).toHaveLength(1);
    expect(escalatedEmails[0]?.recipientUserId).toBe("tenant-user-demo-001");
    expect(
      tenantPartnerService.getApprovalRequest(
        TENANT_ID,
        request.approvalRequestId,
      ).status,
    ).toBe("timeout_escalated");
  });

  it("does not send timeout reminders after re-evaluation cancels the request", async () => {
    const { auditNotificationService, tenantPartnerService } = createHarness();

    const request = await createApprovalRequest(tenantPartnerService, {
      bookingId: "booking-cancel-001",
      orderId: "order-cancel-001",
      approvers: [{ kind: "tenant_admin" }],
      timeoutHoursOverride: 13,
    });
    const reminderAt = new Date(
      Date.parse(request.timeoutAt) - 12 * 60 * 60 * 1000,
    ).toISOString();

    await Promise.resolve(
      tenantPartnerService.cancelApprovalRequestsForReevaluation({
        tenantId: TENANT_ID,
        bookingId: request.bookingId,
      }),
    );
    const timeoutRun = await tenantPartnerService.processApprovalTimeouts({
      now: reminderAt,
    });

    expect(timeoutRun.approachingTimeoutNotified).toBe(0);
    expect(
      auditNotificationService
        .listEmailDeliveries()
        .filter((delivery) => delivery.templateKey === "approaching_timeout"),
    ).toHaveLength(0);
  });
});
