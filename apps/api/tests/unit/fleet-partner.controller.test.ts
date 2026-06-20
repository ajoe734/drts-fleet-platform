import { EventEmitter2 } from "@nestjs/event-emitter";
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { SupplyDocumentService } from "../../src/modules/fleet-partner/supply-document.service";
import { SupplyReadinessService } from "../../src/modules/fleet-partner/supply-readiness.service";
import { FleetPartnerController } from "../../src/modules/fleet-partner/fleet-partner.controller";
import { FleetPartnerService } from "../../src/modules/fleet-partner/fleet-partner.service";
import { SupplySubmissionRepository } from "../../src/modules/fleet-partner/supply-submission.repository";
import { SupplySubmissionService } from "../../src/modules/fleet-partner/supply-submission.service";
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
  const supplySubmissionRepository = new SupplySubmissionRepository();
  const supplySubmissionService = new SupplySubmissionService(
    supplySubmissionRepository,
    regulatoryRegistryService,
    auditNotificationService,
  );
  const supplyDocumentService = new SupplyDocumentService(
    supplySubmissionService,
    supplySubmissionRepository,
  );
  const supplyReadinessService = new SupplyReadinessService(
    supplySubmissionService,
    fleetPartnerService,
  );

  return {
    controller: new FleetPartnerController(
      fleetPartnerService,
      supplySubmissionService,
      supplyDocumentService,
      supplyReadinessService,
    ),
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

  it("supports draft, document, submit, and readiness APIs", async () => {
    const { controller } = createFixture();

    const created = await controller.createDriverSupplySubmission(
      "fleet-demo-001",
      "fleet-user-1",
      {
        name: "Driver Supply Demo",
        mobile: "+886900999888",
        professionalDriverLicenseNo: "PDL-9988",
        professionalDriverLicenseExpiry: "2027-12-31",
        taxiDriverRegistrationNo: "TX-9988",
        taxiDriverRegistrationArea: "TPE",
        taxiDriverRegistrationExpiry: "2027-12-31",
        supportedServiceProductCodes: ["taxi_realtime"],
        preferredVehicleSubmissionId: null,
      },
      "req-supply-create-driver",
    );
    const submissionId = created.data.submission.submissionId;

    const uploadUrl = controller.createSupplyDocumentUploadUrl(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      {
        expectedRevisionNo: 1,
        documentType: "professional_driver_license",
        originalFileName: "license.pdf",
        contentType: "application/pdf",
      },
      "req-supply-upload-1",
    );
    expect(uploadUrl.data.objectKey).toContain(submissionId);

    const firstDocument = await controller.confirmSupplyDocumentUpload(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      {
        expectedRevisionNo: 1,
        documentType: "professional_driver_license",
        objectKey: uploadUrl.data.objectKey,
        originalFileName: "license.pdf",
        contentType: "application/pdf",
        fileSize: 1024,
        checksumSha256: "abc123",
        effectiveFrom: "2026-01-01",
        effectiveUntil: "2027-12-31",
      },
      "req-supply-confirm-1",
    );
    expect(firstDocument.data.documentType).toBe("professional_driver_license");

    const secondUploadUrl = controller.createSupplyDocumentUploadUrl(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      {
        expectedRevisionNo: 2,
        documentType: "taxi_driver_registration",
        originalFileName: "registration.pdf",
        contentType: "application/pdf",
      },
      "req-supply-upload-2",
    );
    await controller.confirmSupplyDocumentUpload(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      {
        expectedRevisionNo: 2,
        documentType: "taxi_driver_registration",
        objectKey: secondUploadUrl.data.objectKey,
        originalFileName: "registration.pdf",
        contentType: "application/pdf",
        fileSize: 2048,
        checksumSha256: "def456",
        effectiveFrom: "2026-01-01",
        effectiveUntil: "2027-12-31",
      },
      "req-supply-confirm-2",
    );

    const submitted = await controller.submitSupplySubmission(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      {
        expectedRevisionNo: 3,
      },
      "req-supply-submit",
    );
    expect(submitted.data.submission.status).toBe("submitted");

    const readiness = controller.getDriverSupplyReadiness(
      "fleet-demo-001",
      submissionId,
      "req-supply-readiness",
    );
    expect(readiness.data).toMatchObject({
      subjectType: "driver",
      subjectId: submissionId,
      state: "ready",
    });
  });
});
