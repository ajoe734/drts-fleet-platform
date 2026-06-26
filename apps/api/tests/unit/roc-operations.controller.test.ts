import { describe, expect, it, vi } from "vitest";

import { RocOperationsController } from "../../src/modules/roc-operations/roc-operations.controller";
import type { RocOperationsService } from "../../src/modules/roc-operations/roc-operations.service";

describe("RocOperationsController", () => {
  it("awaits fallback-to-human before wrapping the API envelope", async () => {
    const service = {
      fallbackTripToHuman: vi.fn().mockResolvedValue({
        tripId: "order-av-001",
        orderId: "order-av-001",
        bookingId: "booking-av-001",
        dispatchJobId: "job-av-001",
        status: "assigned",
        etaSnapshot: {
          etaMinutes: 18,
          calculatedAt: "2026-06-26T10:00:00.000Z",
        },
        assignmentId: "assignment-human-001",
        taskId: "task-human-001",
        intervention: {
          interventionId: "intv-001",
        },
        report: {
          reportId: "report-001",
        },
        receipt: {
          actionId: "req-roc-001",
          auditId: "audit-001",
          resourceType: "sandbox_exception_report",
          resourceId: "report-001",
          status: "completed",
          message: "ROC fallback to human completed and report generated.",
        },
      }),
    } as unknown as RocOperationsService;
    const controller = new RocOperationsController(service);

    const response = await controller.fallbackToHuman(
      "order-av-001",
      {
        humanVehicleId: "veh-human-001",
        humanDriverId: "drv-human-001",
        revisedEtaMinutes: 18,
        reason: "AV gate blocked",
      },
      null,
      "req-roc-001",
    );

    expect(response.data).toMatchObject({
      tripId: "order-av-001",
      bookingId: "booking-av-001",
      assignmentId: "assignment-human-001",
      report: {
        reportId: "report-001",
      },
    });
    expect(service.fallbackTripToHuman).toHaveBeenCalledWith(
      "order-av-001",
      expect.objectContaining({
        humanVehicleId: "veh-human-001",
        humanDriverId: "drv-human-001",
        revisedEtaMinutes: 18,
      }),
      null,
      "req-roc-001",
    );
  });
});
