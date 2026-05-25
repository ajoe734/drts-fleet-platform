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

  it("maps approval lifecycle notifications into the Q-X06 inbox taxonomy", async () => {
    const { auditNotificationService } = createHarness();
    const templateKeys = [
      "new_request",
      "approaching_timeout",
      "escalated",
      "approved",
      "rejected",
    ] as const;

    for (const [index, templateKey] of templateKeys.entries()) {
      await auditNotificationService.dispatchApprovalNotification({
        templateKey,
        tenantId: TENANT_ID,
        approvalRequestId: `approval-taxonomy-${index}`,
        bookingId: `booking-taxonomy-${index}`,
        orderId: `order-taxonomy-${index}`,
        timeoutAt: "2026-05-30T00:00:00.000Z",
        recipients: [
          {
            userId: "tenant-user-demo-001",
            email: "tenant.admin@example.com",
            displayName: "Tenant Admin",
            approvalNotificationOptOut: false,
          },
        ],
      });
    }

    expect(
      auditNotificationService
        .listUserNotifications({
          actorType: "tenant_admin",
          actorId: "tenant-user-demo-001",
          realm: "tenant",
          scopes: ["notifications:read"],
          tenantId: TENANT_ID,
        })
        .slice(0, 5)
        .map((notification) => notification.eventType),
    ).toEqual([
      "booking.approval_rejected",
      "booking.approval_approved",
      "approval_request.escalated",
      "approval_request.timeout_warning",
      "approval_request.created",
    ]);
  });
});
