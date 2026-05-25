import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { MaintenanceController } from "../../src/modules/maintenance/maintenance.controller";
import { MaintenanceService } from "../../src/modules/maintenance/maintenance.service";

describe("MaintenanceController", () => {
  it("returns an ActionReceipt envelope for write actions and requests audit capture", () => {
    const auditNotificationService = new AuditNotificationService();
    const maintenanceService = new MaintenanceService(auditNotificationService);
    const createSpy = vi.spyOn(maintenanceService, "createMaintenanceLog");
    const controller = new MaintenanceController(maintenanceService);

    const command = {
      vehicleId: "veh-001",
      type: "scheduled_service" as const,
      description: "Quarterly service window",
    };

    const response = controller.createMaintenanceLog(command, "req-maint-001");

    expect(createSpy).toHaveBeenCalledWith(command, "req-maint-001", {
      captureAudit: true,
    });
    expect(response).toEqual({
      data: {
        actionId: "req-maint-001",
        auditId: expect.any(String),
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
});
