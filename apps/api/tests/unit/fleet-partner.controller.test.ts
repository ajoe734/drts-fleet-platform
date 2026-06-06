import { EventEmitter2 } from "@nestjs/event-emitter";
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { FleetPartnerController } from "../../src/modules/fleet-partner/fleet-partner.controller";
import { FleetPartnerService } from "../../src/modules/fleet-partner/fleet-partner.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

function createFixture() {
  const auditNotificationService = new AuditNotificationService();
  const driverProfileService = new DriverProfileService(
    auditNotificationService,
  );
  const opsDispatchEventsService = new OpsDispatchEventsService(
    new EventEmitter2(),
  );
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditNotificationService,
    driverProfileService,
  );
  const billingSettlementService = new BillingSettlementService(
    auditNotificationService,
  );
  billingSettlementService.publishDriverFeePlan({
    planName: "Demo Driver Fee Plan",
    version: "2026.04",
    serviceFeeBps: 1200,
    reimbursementMode: "platform_funded",
  });
  const callcenterService = new CallcenterService(auditNotificationService);
  const ownedMobilityTaskEventsService = new OwnedMobilityTaskEventsService(
    new EventEmitter2(),
  );
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditNotificationService,
    callcenterService,
    ownedMobilityTaskEventsService,
    opsDispatchEventsService,
  );
  const fleetPartnerService = new FleetPartnerService(
    billingSettlementService,
    ownedMobilityService,
    regulatoryRegistryService,
  );

  return {
    controller: new FleetPartnerController(fleetPartnerService),
    service: fleetPartnerService,
  };
}

describe("FleetPartnerController portal routes", () => {
  it("returns partner-scoped dashboard, drivers, vehicles, trips, and quality metrics", async () => {
    const { controller } = createFixture();

    const dashboard = await controller.getPortalDashboard(
      "fleet-demo-001",
      "2026-03",
      "req-fleet-dashboard",
    );
    const drivers = controller.listPortalDrivers(
      "fleet-demo-001",
      "req-fleet-drivers",
    );
    const vehicles = controller.listPortalVehicles(
      "fleet-demo-001",
      "req-fleet-vehicles",
    );
    const trips = await controller.listPortalTrips(
      "fleet-demo-001",
      "2026-03",
      "req-fleet-trips",
    );
    const qualityMetrics = await controller.getPortalQualityMetrics(
      "fleet-demo-001",
      "2026-03",
      "req-fleet-quality",
    );

    expect(dashboard.data).toMatchObject({
      fleetPartnerId: "fleet-demo-001",
      periodMonth: "2026-03",
      activeDriverCount: 2,
      totalVehicleCount: 2,
      dispatchableVehicleCount: 1,
      completedTripCount: 3,
      inFlightTripCount: 0,
    });
    expect(drivers.data.items.map((item) => item.driverId)).toEqual([
      "drv-demo-001",
      "drv-demo-002",
    ]);
    expect(
      drivers.data.items.every(
        (item) =>
          item.fleetPartnerId === "fleet-demo-001" &&
          ["drv-demo-001", "drv-demo-002"].includes(item.driverId),
      ),
    ).toBe(true);
    expect(vehicles.data.items.map((item) => item.vehicleId)).toEqual([
      "veh-demo-001",
      "veh-demo-002",
    ]);
    expect(
      vehicles.data.items.every((item) =>
        item.activeDriverIds.every((driverId) =>
          ["drv-demo-001", "drv-demo-002"].includes(driverId),
        ),
      ),
    ).toBe(true);
    expect(
      trips.data.items.every((item) =>
        ["drv-demo-001", "drv-demo-002"].includes(item.driverId),
      ),
    ).toBe(true);
    expect(qualityMetrics.data).toMatchObject({
      fleetPartnerId: "fleet-demo-001",
      periodMonth: "2026-03",
      totalCompletedTrips: 3,
      activeDriverCount: 2,
      nonDispatchableVehicleCount: 1,
    });
  });

  it("requires x-fleet-partner-id for portal routes", async () => {
    const { controller } = createFixture();

    await expect(
      controller.getPortalDashboard(undefined, "2026-03"),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });
});
