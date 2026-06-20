import { EventEmitter2 } from "@nestjs/event-emitter";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { FleetPartnerController } from "../../src/modules/fleet-partner/fleet-partner.controller";
import { FleetPartnerService } from "../../src/modules/fleet-partner/fleet-partner.service";
import { SupplyReadinessService } from "../../src/modules/fleet-partner/supply-readiness.service";
import { SupplyReviewService } from "../../src/modules/fleet-partner/supply-review.service";
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
  const supplyReviewService = new SupplyReviewService();
  const readinessService = {
    listFleetPartnerReadiness: vi.fn().mockResolvedValue([
      {
        subjectType: "driver",
        subjectId: "drv-demo-001",
        state: "ready",
        reasonCodes: [],
        evaluatedAt: "2026-06-20T00:00:00.000Z",
        policyVersion: "phase1-delta-supply-readiness-2026-06-19",
      },
    ]),
    getDriverReadiness: vi.fn().mockResolvedValue({
      subjectType: "driver",
      subjectId: "drv-demo-001",
      state: "ready",
      reasonCodes: [],
      evaluatedAt: "2026-06-20T00:00:00.000Z",
      policyVersion: "phase1-delta-supply-readiness-2026-06-19",
    }),
    getVehicleReadiness: vi.fn().mockResolvedValue({
      subjectType: "vehicle",
      subjectId: "veh-demo-001",
      state: "not_ready",
      reasonCodes: ["VEHICLE_AFFILIATION_MISSING"],
      evaluatedAt: "2026-06-20T00:00:00.000Z",
      policyVersion: "phase1-delta-supply-readiness-2026-06-19",
    }),
  };

  return {
    controller: new FleetPartnerController(
      fleetPartnerService,
      supplyReviewService,
      readinessService as unknown as SupplyReadinessService,
    ),
    service: fleetPartnerService,
    readinessService,
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
    const statements = await controller.listPortalFleetPartnerStatements(
      "fleet-demo-001",
      "2026-03",
      "req-fleet-statements",
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
    const sponsorTrip = trips.data.items.find(
      (item) => item.orderId === "order-demo-032",
    );
    expect(sponsorTrip).toMatchObject({
      settlementChannelKey: "partner_airport",
      sponsorFunded: true,
      benefitReference: "benefit-bank-demo-032",
      reimbursementAmount: {
        currency: "NTD",
        amountMinor: 20000,
      },
    });
    expect(sponsorTrip?.fleetShareAmount?.amountMinor).toBeGreaterThan(0);
    expect(statements.data.items[0]).toMatchObject({
      periodMonth: "2026-03",
      sponsorFundedTripCount: 1,
      reimbursementAmount: {
        currency: "NTD",
        amountMinor: 20000,
      },
      sponsorFundedShareAmount: {
        currency: "NTD",
      },
    });
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

  it("supports supply review action routes and admin listing", async () => {
    const { controller } = createFixture();
    const identity = {
      actorType: "platform_admin",
      actorId: "platform-reviewer-001",
      realm: "platform",
      authMode: "bootstrap_headers",
      roleFamilies: ["platform"],
      roles: [],
      scopes: [],
      tenantId: null,
      requestId: "req-bootstrap-review-001",
    } as const;

    const listEnvelope = await controller.listSupplyReviewSubmissions(
      "req-supply-review-list",
    );
    expect(listEnvelope.data.items.map((item) => item.submissionId)).toContain(
      "sup-sub-demo-001",
    );

    const startEnvelope = await controller.startSupplyReview(
      "sup-sub-demo-001",
      {
        expectedRevisionNo: 1,
        reasonCode: "manual_screening",
        comment: "Begin document review.",
      },
      identity,
      "req-supply-review-start",
    );

    expect(startEnvelope.data).toMatchObject({
      submissionId: "sup-sub-demo-001",
      status: "in_review",
      reviewStartedBy: "platform-reviewer-001",
    });
  });

  it("requires x-actor-id for supply review action routes", async () => {
    const { controller } = createFixture();

    await expect(
      controller.approveSupplySubmission(
        "sup-sub-demo-002",
        {
          expectedRevisionNo: 2,
          reasonCode: "all_documents_valid",
          comment: "Ready to approve.",
        },
        null,
      ),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("returns fleet-partner readiness list and detail routes", async () => {
    const { controller, readinessService } = createFixture();

    const readinessList = await controller.listPortalReadiness(
      "fleet-demo-001",
      "req-readiness-list",
    );
    const driverReadiness = await controller.getPortalDriverReadiness(
      "fleet-demo-001",
      "drv-demo-001",
      "req-readiness-driver",
    );
    const vehicleReadiness = await controller.getPortalVehicleReadiness(
      "fleet-demo-001",
      "veh-demo-001",
      "req-readiness-vehicle",
    );

    expect(readinessService.listFleetPartnerReadiness).toHaveBeenCalledWith(
      "fleet-demo-001",
    );
    expect(readinessService.getDriverReadiness).toHaveBeenCalledWith(
      "fleet-demo-001",
      "drv-demo-001",
    );
    expect(readinessService.getVehicleReadiness).toHaveBeenCalledWith(
      "fleet-demo-001",
      "veh-demo-001",
    );

    expect(readinessList.data.items[0]).toMatchObject({
      subjectType: "driver",
      subjectId: "drv-demo-001",
      state: "ready",
    });
    expect(driverReadiness.data).toMatchObject({
      subjectType: "driver",
      subjectId: "drv-demo-001",
      state: "ready",
    });
    expect(vehicleReadiness.data).toMatchObject({
      subjectType: "vehicle",
      subjectId: "veh-demo-001",
      state: "not_ready",
      reasonCodes: ["VEHICLE_AFFILIATION_MISSING"],
    });
  });
});
