import { describe, expect, it } from "vitest";

import { normalizeApprovalQueueStatusFilter } from "../../app/approval-requests/filter-contract";

describe("approval request queue filter contract", () => {
  it("keeps the queue on outstanding states by default", () => {
    expect(normalizeApprovalQueueStatusFilter(undefined)).toBe("outstanding");
    expect(normalizeApprovalQueueStatusFilter("approved")).toBe("outstanding");
    expect(normalizeApprovalQueueStatusFilter("rejected")).toBe("outstanding");
  });

  it("preserves the supported pending-state filters", () => {
    expect(normalizeApprovalQueueStatusFilter("outstanding")).toBe(
      "outstanding",
    );
    expect(normalizeApprovalQueueStatusFilter("pending")).toBe("pending");
    expect(normalizeApprovalQueueStatusFilter("timeout_escalated")).toBe(
      "timeout_escalated",
    );
  });
});
