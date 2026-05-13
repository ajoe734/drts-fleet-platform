import { describe, expect, it } from "vitest";

import type {
  TenantApprovalEvaluationInputSnapshot,
  TenantBookingApprovalDecisionRecord,
} from "@drts/contracts";

import {
  computeApprovalRequestStatus,
  resolveApprovalApproverUserIds,
  resolveApprovalModeForExecution,
  shouldReevaluateTenantBookingApproval,
} from "../../src/modules/tenant-partner/tenant-approval-workflow";

function createSnapshot(
  overrides: Partial<TenantApprovalEvaluationInputSnapshot> = {},
): TenantApprovalEvaluationInputSnapshot {
  return {
    costCenterCode: "CC-FIN-04",
    businessDispatchSubtype: "enterprise_dispatch",
    reservationWindowStart: "2026-05-13T10:00:00.000Z",
    reservationWindowEnd: "2026-05-13T11:00:00.000Z",
    passengerId: "passenger-demo-001",
    passengerRole: "employee",
    amountMinor: 150_000,
    currency: "TWD",
    vehiclePreference: "wagon",
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    signoffRequired: false,
    expenseProofRequired: false,
    ...overrides,
  };
}

function createDecision(
  actorUserId: string,
  decision: "approve" | "reject",
): TenantBookingApprovalDecisionRecord {
  return {
    decisionId: `decision-${actorUserId}-${decision}`,
    approvalRequestId: "approval-request-001",
    actorUserId,
    actorRoleCode: "tenant_admin",
    decision,
    reasonCode: decision === "reject" ? "policy_reject" : null,
    reasonNote: null,
    decidedAt: "2026-05-13T12:00:00.000Z",
  };
}

describe("tenant approval workflow helpers", () => {
  it("resolves any_of requests on the first approval", () => {
    const result = computeApprovalRequestStatus({
      approvalMode: "any_of",
      resolvedApproverUserIds: ["tenant-user-001", "tenant-user-002"],
      decisions: [createDecision("tenant-user-001", "approve")],
    });

    expect(result).toEqual({
      status: "approved",
      resolved: true,
    });
  });

  it("requires all approvers for all_of_parallel and ordered_chain execution", () => {
    expect(resolveApprovalModeForExecution("ordered_chain")).toBe(
      "all_of_parallel",
    );

    const pending = computeApprovalRequestStatus({
      approvalMode: "all_of_parallel",
      resolvedApproverUserIds: ["tenant-user-001", "tenant-user-002"],
      decisions: [createDecision("tenant-user-001", "approve")],
    });
    const approved = computeApprovalRequestStatus({
      approvalMode: "ordered_chain",
      resolvedApproverUserIds: ["tenant-user-001", "tenant-user-002"],
      decisions: [
        createDecision("tenant-user-001", "approve"),
        createDecision("tenant-user-002", "approve"),
      ],
    });

    expect(pending).toEqual({
      status: "pending",
      resolved: false,
    });
    expect(approved).toEqual({
      status: "approved",
      resolved: true,
    });
  });

  it("rejects any approval mode on the first rejection", () => {
    const result = computeApprovalRequestStatus({
      approvalMode: "all_of_parallel",
      resolvedApproverUserIds: ["tenant-user-001", "tenant-user-002"],
      decisions: [
        createDecision("tenant-user-001", "approve"),
        createDecision("tenant-user-002", "reject"),
      ],
    });

    expect(result).toEqual({
      status: "rejected",
      resolved: true,
    });
  });

  it("falls back from cost_center_owner to tenant_admin when the owner is missing", () => {
    const resolution = resolveApprovalApproverUserIds(
      {
        approvers: [
          { kind: "cost_center_owner", costCenterCode: "CC-EXEC-01" },
        ],
        escalationTarget: { kind: "tenant_admin" },
        bookingCostCenterCode: "CC-EXEC-01",
      },
      {
        hasUser: (userId) => userId === "tenant-user-admin-001",
        listUserIdsByRole: (roleCode) =>
          roleCode === "tenant_admin" ? ["tenant-user-admin-001"] : [],
        getCostCenterOwnerUserId: () => null,
      },
    );

    expect(resolution.resolvedApproverUserIds).toEqual([
      "tenant-user-admin-001",
    ]);
    expect(resolution.fallbackRecords).toEqual([
      {
        descriptor: {
          kind: "cost_center_owner",
          costCenterCode: "CC-EXEC-01",
        },
        fallbackDescriptor: {
          kind: "tenant_admin",
        },
        reasonCode: "COST_CENTER_OWNER_MISSING",
      },
    ]);
  });

  it("re-evaluates only when governance-sensitive snapshot fields change", () => {
    const previous = createSnapshot();

    expect(
      shouldReevaluateTenantBookingApproval(
        previous,
        createSnapshot({ amountMinor: 175_000 }),
      ),
    ).toBe(true);
    expect(
      shouldReevaluateTenantBookingApproval(
        previous,
        createSnapshot({ amountMinor: previous.amountMinor }),
      ),
    ).toBe(false);
  });
});
