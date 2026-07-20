import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { DriverSosService } from "../../src/modules/driver-sos/driver-sos.service";
import { IncidentService } from "../../src/modules/incident/incident.service";

function buildDriverIdentity(driverId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: driverId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver_user"],
    scopes: ["driver:read", "driver:write", "incident:write"],
    requestId: `req-${driverId}`,
  };
}

describe("DriverSosService", () => {
  it("ignores the client-claimed driverId and dedupes offline replay in memory", async () => {
    const auditNotificationService = {
      recordAuditLog: vi.fn(),
    };
    const incidentService = new IncidentService(
      auditNotificationService as never,
    );
    const service = new DriverSosService(
      auditNotificationService as never,
      incidentService,
    );
    const identity = buildDriverIdentity("drv-sos-001");

    const first = await service.submitSosEvent(
      {
        clientEventId: "11111111-1111-4111-8111-111111111111",
        driverId: "SPOOFED-DRIVER",
        vehicleId: "veh-sos-001",
        plateNo: "ABC-1234",
        orderId: "ord-sos-001",
        taskId: "task-sos-001",
        eventType: "security_incident",
        severity: "major",
        description: "Driver pressed SOS.",
        location: {
          lat: 25.0478,
          lng: 121.5319,
          accuracyM: 6,
          recordedAt: "2026-07-20T08:30:00.000Z",
          reverseGeocodedAddress: "Taipei Main Station",
          geocodeProvider: "manual",
        },
        originalTriggeredAt: "2026-07-20T08:29:59.000Z",
        offlineAtTrigger: true,
      },
      identity,
      "req-driver-sos-001",
    );

    const replay = await service.submitSosEvent(
      {
        clientEventId: "11111111-1111-4111-8111-111111111111",
        driverId: "DIFFERENT-DRIVER",
        vehicleId: "veh-sos-001",
        plateNo: "ABC-1234",
        orderId: "ord-sos-001",
        taskId: "task-sos-001",
        eventType: "other",
        severity: "normal",
        description: "Replay should not overwrite the original payload.",
        originalTriggeredAt: "2026-07-20T08:30:05.000Z",
        offlineAtTrigger: false,
      },
      identity,
      "req-driver-sos-002",
    );

    expect(first.receipt.duplicate).toBe(false);
    expect(first.event.driverId).toBe("drv-sos-001");
    expect(first.event.eventNo).toMatch(/^SOS-/);
    expect(first.event.description).toBe("Driver pressed SOS.");

    expect(replay.receipt.duplicate).toBe(true);
    expect(replay.event.sosEventId).toBe(first.event.sosEventId);
    expect(replay.receipt.incidentId).toBe(first.receipt.incidentId);
    expect(replay.event.driverId).toBe("drv-sos-001");
    expect(replay.event.description).toBe("Driver pressed SOS.");

    const incidents = incidentService.listIncidents();
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toEqual(
      expect.objectContaining({
        incidentId: first.receipt.incidentId,
        relatedDriverId: "drv-sos-001",
        reportedBy: "drv-sos-001",
      }),
    );
    expect(incidents[0]?.matchingSuppression?.active).toBe(true);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledTimes(2);
  });

  it("rejects submissions outside the driver realm", async () => {
    const service = new DriverSosService(
      {
        recordAuditLog: vi.fn(),
      } as never,
      new IncidentService({ recordAuditLog: vi.fn() } as never),
    );

    try {
      await service.submitSosEvent(
        {
          clientEventId: "22222222-2222-4222-8222-222222222222",
          originalTriggeredAt: "2026-07-20T08:31:00.000Z",
          offlineAtTrigger: false,
        },
        {
          authMode: "bootstrap_headers",
          actorType: "ops_user",
          actorId: "ops-001",
          realm: "ops",
          tenantId: null,
          roleFamilies: ["ops"],
          roles: ["ops_manager"],
          scopes: ["incident:write"],
          requestId: "req-ops-001",
        } as BootstrapRequestIdentity,
      );
      throw new Error("expected submitSosEvent to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getStatus()).toBe(403);
    }
  });
});
