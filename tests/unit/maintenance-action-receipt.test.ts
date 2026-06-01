import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { MaintenanceController } from "../../apps/api/src/modules/maintenance/maintenance.controller";

describe("MaintenanceController ActionReceipt pilot", () => {
  it("emits ActionReceipt envelopes for maintenance creates", () => {
    const maintenanceService = {
      createMaintenanceLog: vi.fn(() => ({
        data: {
          maintenanceId: "MNT-000001",
        },
        auditLog: {
          auditId: "11111111-1111-4111-8111-111111111111",
          requestId: "req-maint-ctl-001",
          resourceType: "maintenance_log",
          resourceId: "MNT-000001",
        },
      })),
    };
    const controller = new MaintenanceController(maintenanceService as never);

    const response = controller.createMaintenanceLog(
      {
        vehicleId: "VEH-001",
        type: "repair",
        description: "Controller receipt",
      },
      "req-maint-ctl-001",
    );

    expect(maintenanceService.createMaintenanceLog).toHaveBeenCalledWith(
      {
        vehicleId: "VEH-001",
        type: "repair",
        description: "Controller receipt",
      },
      "req-maint-ctl-001",
      { captureAudit: true },
    );
    expect(response).toEqual({
      data: {
        actionId: "req-maint-ctl-001",
        auditId: "11111111-1111-4111-8111-111111111111",
        resourceType: "maintenance_log",
        resourceId: "MNT-000001",
        status: "completed",
        message: "Maintenance log created.",
      },
      meta: {
        requestId: "req-maint-ctl-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("preserves validation failures instead of fabricating a receipt", () => {
    const maintenanceService = {
      createMaintenanceLog: vi.fn(() => {
        throw new ApiRequestError(
          400,
          "VALIDATION_ERROR",
          "vehicleId is required.",
          { field: "vehicleId" },
        );
      }),
    };
    const controller = new MaintenanceController(maintenanceService as never);

    expect(() =>
      controller.createMaintenanceLog(
        {
          vehicleId: "",
          type: "repair",
          description: "Invalid request",
        },
        "req-maint-ctl-002",
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "VALIDATION_ERROR",
          }),
        }),
      }),
    );
  });
});
