import { describe, expect, it } from "vitest";
import type {
  AuditLogRecord,
  OpsPendingApprovalRequestRecord,
} from "@drts/contracts";
import {
  buildOpsApprovalQueueQuery,
  filterAndSortOpsApprovalRequests,
  filterRelevantTenantAuditRecords,
  resolveSelectedApprovalRequestId,
} from "../../app/approval-requests/approval-queue-model";

function buildApprovalRequest(
  overrides: Partial<OpsPendingApprovalRequestRecord> = {},
): OpsPendingApprovalRequestRecord {
  return {
    approvalRequestId: "approval-request-001",
    tenantId: "tenant-alpha",
    bookingId: "booking-001",
    orderId: "order-001",
    evaluationId: "evaluation-001",
    ruleIds: ["rule-001"],
    status: "pending",
    approvalMode: "any_of",
    approvers: [
      {
        kind: "tenant_admin",
        displayName: "Tenant Admin",
      },
    ],
    resolvedApproverUserIds: ["tenant-admin-001"],
    previousApprovers: [],
    decisions: [],
    evaluationSnapshot: {
      evaluationId: "evaluation-001",
      tenantId: "tenant-alpha",
      evaluatedAt: "2026-05-14T00:00:00.000Z",
      matchedRules: [],
      quotaImpacts: [],
      outcome: {
        decision: "require_approval",
        approvalRequired: true,
        blocked: false,
        warnings: [],
        reasonCodes: ["approval_required"],
      },
      approvalPlan: {
        approvalMode: "any_of",
        approvers: [
          {
            kind: "tenant_admin",
            displayName: "Tenant Admin",
          },
        ],
        timeoutHours: 24,
        fallbackPolicy: "escalate_to_tenant_admin",
        escalationTarget: {
          kind: "tenant_admin",
          displayName: "Tenant Admin",
        },
      },
    },
    timeoutAt: "2026-05-14T06:00:00.000Z",
    escalatedAt: null,
    fallbackPolicy: "escalate_to_tenant_admin",
    escalationTarget: {
      kind: "tenant_admin",
      displayName: "Tenant Admin",
    },
    createdAt: "2026-05-14T00:00:00.000Z",
    resolvedAt: null,
    slaBreached: false,
    lastNudgedAt: null,
    lastNudgedByActorId: null,
    lastNudgedByActorType: null,
    opsSlaAcknowledgedAt: null,
    opsSlaAcknowledgedByActorId: null,
    opsSlaAcknowledgedByActorType: null,
    ...overrides,
  };
}

function buildAuditRecord(
  overrides: Partial<AuditLogRecord> = {},
): AuditLogRecord {
  return {
    auditId: "audit-001",
    actorId: "ops-user-001",
    actorType: "ops_user",
    tenantId: "tenant-alpha",
    moduleName: "tenant-partner",
    actionName: "booking.approval_request.created",
    resourceType: "booking",
    resourceId: "booking-001",
    requestId: "request-001",
    createdAt: "2026-05-14T01:00:00.000Z",
    ...overrides,
  };
}

describe("approval queue model", () => {
  it("builds the upstream query from trimmed filters", () => {
    const query = buildOpsApprovalQueueQuery(
      {
        tenantId: " tenant-alpha ",
        status: "pending",
        expiresWithinHours: 4,
      },
      new Date("2026-05-14T00:00:00.000Z"),
    );

    expect(query).toEqual({
      tenantId: "tenant-alpha",
      status: "pending",
      expiresBefore: "2026-05-14T04:00:00.000Z",
    });
  });

  it("filters and sorts breached unacknowledged requests first", () => {
    const now = new Date("2026-05-14T00:00:00.000Z");
    const requests = filterAndSortOpsApprovalRequests(
      [
        buildApprovalRequest({
          approvalRequestId: "request-healthy",
          timeoutAt: "2026-05-14T06:00:00.000Z",
        }),
        buildApprovalRequest({
          approvalRequestId: "request-breached-acknowledged",
          timeoutAt: "2026-05-14T02:30:00.000Z",
          slaBreached: true,
          opsSlaAcknowledgedAt: "2026-05-14T00:30:00.000Z",
        }),
        buildApprovalRequest({
          approvalRequestId: "request-breached-open",
          timeoutAt: "2026-05-14T02:00:00.000Z",
          slaBreached: true,
        }),
      ],
      {
        tenantId: "",
        status: "pending",
        expiresWithinHours: 4,
      },
      now,
    );

    expect(requests.map((request) => request.approvalRequestId)).toEqual([
      "request-breached-open",
      "request-breached-acknowledged",
    ]);
  });

  it("keeps the preferred selection only when it is still visible", () => {
    const requests = [
      buildApprovalRequest({ approvalRequestId: "request-001" }),
      buildApprovalRequest({ approvalRequestId: "request-002" }),
    ];

    expect(resolveSelectedApprovalRequestId(requests, "request-002")).toBe(
      "request-002",
    );
    expect(resolveSelectedApprovalRequestId(requests, "missing")).toBe(
      "request-001",
    );
    expect(resolveSelectedApprovalRequestId([], "request-002")).toBeNull();
  });

  it("collects relevant tenant audit rows from resource ids and summaries", () => {
    const request = buildApprovalRequest({
      approvalRequestId: "request-001",
      bookingId: "booking-001",
      orderId: "order-001",
      evaluationId: "evaluation-001",
    });

    const records = filterRelevantTenantAuditRecords(
      [
        buildAuditRecord({
          auditId: "audit-resource",
          createdAt: "2026-05-14T03:00:00.000Z",
          resourceId: "booking-001",
        }),
        buildAuditRecord({
          auditId: "audit-summary",
          createdAt: "2026-05-14T04:00:00.000Z",
          resourceId: "unrelated",
          newValuesSummary: {
            approvalRequestId: "request-001",
          },
        }),
        buildAuditRecord({
          auditId: "audit-duplicate",
          createdAt: "2026-05-14T02:00:00.000Z",
          resourceId: "booking-001",
          newValuesSummary: {
            orderId: "order-001",
          },
        }),
        buildAuditRecord({
          auditId: "audit-unrelated",
          createdAt: "2026-05-14T05:00:00.000Z",
          resourceId: "other-booking",
        }),
      ],
      request,
    );

    expect(records.map((record) => record.auditId)).toEqual([
      "audit-summary",
      "audit-resource",
      "audit-duplicate",
    ]);
  });
});
