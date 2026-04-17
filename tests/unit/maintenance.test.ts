import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { MaintenanceRepository } from "../../apps/api/src/modules/maintenance/maintenance.repository";
import { MaintenanceService } from "../../apps/api/src/modules/maintenance/maintenance.service";

function createService() {
  const auditService = new AuditNotificationService();
  const repository = new MaintenanceRepository();
  const service = new MaintenanceService(auditService, repository);

  return { auditService, repository, service };
}

describe("maintenance service", () => {
  it("creates a maintenance log for a vehicle", () => {
    const { auditService, service } = createService();

    const record = service.createMaintenanceLog({
      vehicleId: "VEH-001",
      type: "oil_change",
      description: "Regular oil change",
      cost: 75.5,
    });

    expect(record.maintenanceId).toMatch(/^MNT-\d{6}$/);
    expect(record.vehicleId).toBe("VEH-001");
    expect(record.type).toBe("oil_change");
    expect(record.status).toBe("in_progress");
    expect(record.cost).toBe(75.5);

    expect(service.listMaintenanceLogs()).toHaveLength(1);
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "create_maintenance_log",
    );
  });

  it("lists logs filtered by vehicle", () => {
    const { service } = createService();

    service.createMaintenanceLog({
      vehicleId: "VEH-001",
      type: "repair",
      description: "Brake repair",
    });
    service.createMaintenanceLog({
      vehicleId: "VEH-002",
      type: "inspection",
      description: "Annual inspection",
    });

    expect(service.listMaintenanceLogs("VEH-001")).toHaveLength(1);
    expect(service.listMaintenanceLogs()).toHaveLength(2);
  });

  it("updates maintenance log status", () => {
    const { service } = createService();

    const record = service.createMaintenanceLog({
      vehicleId: "VEH-003",
      type: "tire_replacement",
      description: "Replace all 4 tires",
    });

    const updated = service.updateMaintenanceLog(record.maintenanceId, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    expect(updated.status).toBe("completed");
    expect(updated.completedAt).toBeDefined();
  });

  it("creates scheduled log with scheduled status", () => {
    const { service } = createService();

    const record = service.createMaintenanceLog({
      vehicleId: "VEH-004",
      type: "scheduled_service",
      description: "50k mile service",
      scheduledAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });

    expect(record.status).toBe("scheduled");
    expect(record.scheduledAt).toBeDefined();
  });

  it("rejects invalid maintenance type", () => {
    const { service } = createService();

    expect(() =>
      service.createMaintenanceLog({
        vehicleId: "VEH-001",
        type: "invalid_type" as any,
        description: "Test",
      }),
    ).toThrow("Api Request Error");
  });

  it("rejects blank vehicleId", () => {
    const { service } = createService();

    expect(() =>
      service.createMaintenanceLog({
        vehicleId: "",
        type: "repair",
        description: "Test",
      }),
    ).toThrow("Api Request Error");
  });

  it("returns 404 for nonexistent record", () => {
    const { service } = createService();

    expect(() => service.getMaintenanceLog("MNT-999999")).toThrow(
      "Api Request Error",
    );
  });
});
