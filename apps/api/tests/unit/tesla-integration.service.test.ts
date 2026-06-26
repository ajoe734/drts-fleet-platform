import { describe, expect, it, vi } from "vitest";

import { buildTeslaPublicTelemetrySampleFixture } from "../../../../packages/shared-test-fixtures/src";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { TeslaIntegrationService } from "../../src/modules/tesla-integration/tesla-integration.service";

function createService() {
  const auditNotificationService = new AuditNotificationService();
  const regulatoryRegistryService = new RegulatoryRegistryService();
  const repository = {
    loadCommandReceipts: vi.fn(async () => []),
    insertCommandReceipt: vi.fn(async () => undefined),
    reportPersistenceFailure: vi.fn(),
  };

  return {
    auditNotificationService,
    repository,
    service: new TeslaIntegrationService(
      auditNotificationService,
      regulatoryRegistryService,
      repository as never,
    ),
  };
}

describe("TeslaIntegrationService", () => {
  it("binds a discovered VIN, configures mock telemetry, and projects a valid vehicle snapshot", () => {
    const { service } = createService();
    const publicSampleFixture = buildTeslaPublicTelemetrySampleFixture({
      batteryLevelPct: 82,
      location: {
        lat: 25.0478,
        lng: 121.5319,
      },
    });
    const connection = service.beginOAuth({
      businessAccountId: "biz-seed-001",
      region: "north_america",
      authorizationCode: "auth-code-001",
    });

    expect(connection.status).toBe("active");
    expect(service.discoverVehicles()).toHaveLength(2);

    const binding = service.bindVehicle({
      vehicleId: "veh-demo-001",
      vin: "5YJ3E1EA7JF000001",
    });

    const telemetry = service.configureTelemetry({
      vehicleId: "veh-demo-001",
      mode: "public_mock",
      sampleIntervalSec: 30,
      mockBatteryLevelPct: publicSampleFixture.batteryLevelPct ?? 82,
      mockOnline: publicSampleFixture.online ?? true,
      mockLocation: publicSampleFixture.location,
    });

    const sample = service.getPublicTelemetrySample("veh-demo-001");
    const projection = service.getTelemetryProjection("veh-demo-001");

    expect(binding.externalVehicleRef).toBe("tesla-public-veh-demo-001");
    expect(telemetry.lastPublicSampleId).toBe(sample.sampleId);
    expect(projection).toMatchObject({
      vehicleId: "veh-demo-001",
      externalVehicleRef: "tesla-public-veh-demo-001",
      batteryLevelPct: 82,
      batteryRangeKm: 352.6,
      online: true,
      shiftState: "P",
    });
    expect(projection.location).toEqual({
      lat: 25.0478,
      lng: 121.5319,
    });
  });

  it("persists and audits allowlisted commands while rejecting non-allowlisted driving commands", async () => {
    const { service, repository, auditNotificationService } = createService();

    service.beginOAuth({
      businessAccountId: "biz-seed-001",
      region: "north_america",
      authorizationCode: "auth-code-002",
    });
    service.bindVehicle({
      vehicleId: "veh-demo-001",
      vin: "5YJ3E1EA7JF000001",
    });

    const receipt = await service.issueCommand({
      vehicleId: "veh-demo-001",
      commandType: "wake_up",
      issuedBy: "ops-user-001",
      idempotencyKey: "tesla-wake-001",
    });

    expect(repository.insertCommandReceipt).toHaveBeenCalledWith(receipt);
    expect(receipt.status).toBe("acknowledged");

    const auditLogs = auditNotificationService.listAuditLogs({
      actorId: "ops-user-001",
      actorType: "ops_user",
      realm: "ops",
      scopes: ["audit:read"],
      tenantId: null,
    });
    expect(
      auditLogs.some(
        (log) =>
          log.moduleName === "tesla-integration" &&
          log.actionName === "command_issued" &&
          log.resourceId === receipt.commandId,
      ),
    ).toBe(true);

    await expect(() =>
      service.issueCommand({
        vehicleId: "veh-demo-001",
        commandType: "minimal_risk_stop",
        issuedBy: "ops-user-001",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: "TESLA_COMMAND_NOT_ALLOWLISTED",
        }),
      }),
    });
  });
});
