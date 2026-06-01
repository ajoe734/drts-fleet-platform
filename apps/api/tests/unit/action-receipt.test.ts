import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { toActionReceiptEnvelope } from "../../src/common/action-receipt";

describe("toActionReceiptEnvelope", () => {
  it("wraps audited writes in the shared ActionReceipt success envelope", () => {
    const response = toActionReceiptEnvelope(
      {
        auditLog: {
          auditId: "audit-maint-001",
          requestId: "req-audit-001",
          resourceType: "maintenance_log",
          resourceId: "MNT-000001",
        },
        message: "Maintenance log created.",
      },
      "req-header-001",
    );

    expect(response).toEqual({
      data: {
        actionId: "req-audit-001",
        auditId: "audit-maint-001",
        resourceType: "maintenance_log",
        resourceId: "MNT-000001",
        status: "completed",
        message: "Maintenance log created.",
      },
      meta: {
        requestId: "req-header-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("accepts explicit receipt metadata overrides when the audit log is incomplete", () => {
    const response = toActionReceiptEnvelope({
      auditLog: {
        auditId: "audit-maint-002",
        requestId: "req-audit-002",
        resourceType: "",
        resourceId: null,
      },
      actionId: "action-maint-002",
      resourceType: "maintenance_batch",
      resourceId: "batch-001",
      status: "accepted",
      message: "Maintenance batch queued.",
    });

    expect(response).toEqual({
      data: {
        actionId: "action-maint-002",
        auditId: "audit-maint-002",
        resourceType: "maintenance_batch",
        resourceId: "batch-001",
        status: "accepted",
        message: "Maintenance batch queued.",
      },
      meta: {
        requestId: "req-audit-002",
        timestamp: expect.any(String),
      },
    });
  });

  it("fails when neither the audit log nor the caller provides resource metadata", () => {
    expect.assertions(4);

    try {
      toActionReceiptEnvelope({
        auditLog: {
          auditId: "audit-maint-003",
          requestId: "req-audit-003",
          resourceType: " ",
          resourceId: null,
        },
        message: "Maintenance log failed.",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getStatus()).toBe(500);
      expect((error as ApiRequestError).getResponse()).toEqual({
        error: {
          code: "ACTION_RECEIPT_RESOURCE_REQUIRED",
          message:
            "ActionReceipt requires a non-empty resourceType and resourceId.",
          details: {
            auditId: "audit-maint-003",
            resourceType: " ",
            resourceId: null,
          },
          retryable: false,
          traceId: expect.any(String),
        },
      });
      expect((error as ApiRequestError).cause).toBeUndefined();
    }
  });
});
