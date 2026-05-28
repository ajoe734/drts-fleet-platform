import { describe, expect, it } from "vitest";

import {
  toActionReceipt,
  toActionReceiptEnvelope,
} from "../../apps/api/src/common/action-receipt";

describe("ActionReceipt helpers", () => {
  it("wraps audit-backed writes in the standard ActionReceipt envelope", () => {
    const envelope = toActionReceiptEnvelope({
      auditLog: {
        auditId: "11111111-1111-4111-8111-111111111111",
        requestId: "req-maint-001",
        resourceType: "maintenance_log",
        resourceId: "MNT-000001",
      },
      message: "Maintenance log created.",
    });

    expect(envelope).toEqual({
      data: {
        actionId: "req-maint-001",
        auditId: "11111111-1111-4111-8111-111111111111",
        resourceType: "maintenance_log",
        resourceId: "MNT-000001",
        status: "completed",
        message: "Maintenance log created.",
      },
      meta: {
        requestId: "req-maint-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("supports explicit failed receipts when the caller records a failed action", () => {
    const receipt = toActionReceipt({
      auditLog: {
        auditId: "22222222-2222-4222-8222-222222222222",
        requestId: "req-maint-002",
        resourceType: "maintenance_log",
        resourceId: "MNT-000002",
      },
      actionId: "maintenance-failed-001",
      status: "failed",
      message: "Maintenance log update failed.",
    });

    expect(receipt).toEqual({
      actionId: "maintenance-failed-001",
      auditId: "22222222-2222-4222-8222-222222222222",
      resourceType: "maintenance_log",
      resourceId: "MNT-000002",
      status: "failed",
      message: "Maintenance log update failed.",
    });
  });

  it("rejects receipts without a concrete resource id", () => {
    expect(() =>
      toActionReceiptEnvelope({
        auditLog: {
          auditId: "33333333-3333-4333-8333-333333333333",
          requestId: "req-maint-003",
          resourceType: "maintenance_log",
          resourceId: null,
        },
        message: "Missing resource.",
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "ACTION_RECEIPT_RESOURCE_REQUIRED",
          }),
        }),
      }),
    );
  });
});
