import { describe, expect, it, vi } from "vitest";

import { SafetyOperatorController } from "../../src/modules/safety-operator/safety-operator.controller";

describe("SafetyOperatorController", () => {
  it("wraps assignment reads and takeover submissions in the standard API envelope", async () => {
    const assignment = {
      assignmentId: "assign-safe-001",
      safetyOperatorId: "safe-op-001",
      vehicleId: "veh-safe-001",
      orderId: "ord-safe-001",
      status: "assigned",
      assignedAt: "2026-06-26T02:00:00.000Z",
      releasedAt: null,
      sandboxProgramId: "sandbox-demo-001",
    } as const;
    const service = {
      listAssignments: vi.fn(() => [assignment]),
      submitTakeoverReport: vi.fn(async () => ({
        report: {
          reportId: "report-safe-001",
          clientGeneratedReportId: "client-report-001",
          safetyOperatorId: "safe-op-001",
          vehicleId: "veh-safe-001",
          orderId: "ord-safe-001",
          sandboxProgramId: "sandbox-demo-001",
          shiftId: "shift-safe-001",
          assignmentId: assignment.assignmentId,
          correlationId: "corr-safe-001",
          trigger: "vehicle_alert",
          reasonCode: "sensor_fault",
          disposition: "continued_manual",
          fsdResumed: false,
          bookmarkId: "bookmark-safe-001",
          incidentId: null,
          evidenceArtifactIds: ["artifact-safe-001"],
          notes: "Takeover recorded.",
          occurredAt: "2026-06-26T02:00:00.000Z",
          serverReceivedAt: "2026-06-26T02:00:05.000Z",
        },
        receipt: {
          reportId: "report-safe-001",
          clientGeneratedReportId: "client-report-001",
          correlationId: "corr-safe-001",
          duplicate: false,
          serverReceivedAt: "2026-06-26T02:00:05.000Z",
        },
      })),
    };
    const controller = new SafetyOperatorController(service as never);

    const listResponse = controller.listAssignments(
      undefined,
      "veh-safe-001",
      undefined,
      null,
      "req-safe-list-001",
    );
    const submitResponse = await controller.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-001",
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: "ord-safe-001",
        sandboxProgramId: "sandbox-demo-001",
        shiftId: "shift-safe-001",
        assignmentId: assignment.assignmentId,
        correlationId: "corr-safe-001",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "continued_manual",
        fsdResumed: false,
        bookmarkId: "bookmark-safe-001",
        incidentId: null,
        evidenceArtifactIds: ["artifact-safe-001"],
        notes: "Takeover recorded.",
        occurredAt: "2026-06-26T02:00:00.000Z",
      },
      null,
      "req-safe-submit-001",
    );

    expect(service.listAssignments).toHaveBeenCalledWith(
      { vehicleId: "veh-safe-001" },
      null,
    );
    expect(listResponse).toEqual({
      data: {
        items: [assignment],
        pageInfo: {
          page: 1,
          pageSize: 1,
          totalItems: 1,
          totalPages: 1,
        },
      },
      meta: {
        requestId: "req-safe-list-001",
        timestamp: expect.any(String),
      },
    });
    expect(service.submitTakeoverReport).toHaveBeenCalledWith(
      expect.objectContaining({
        clientGeneratedReportId: "client-report-001",
        safetyOperatorId: "safe-op-001",
      }),
      null,
      "req-safe-submit-001",
    );
    expect(submitResponse).toEqual({
      data: {
        report: expect.objectContaining({
          reportId: "report-safe-001",
          correlationId: "corr-safe-001",
        }),
        receipt: expect.objectContaining({
          duplicate: false,
          reportId: "report-safe-001",
        }),
      },
      meta: {
        requestId: "req-safe-submit-001",
        timestamp: expect.any(String),
      },
    });
  });
});
