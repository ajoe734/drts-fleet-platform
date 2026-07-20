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
import { SupplyDocumentService } from "../../src/modules/fleet-partner/supply-document.service";
import { SupplyReadinessService } from "../../src/modules/fleet-partner/supply-readiness.service";
import { SupplyReviewService } from "../../src/modules/fleet-partner/supply-review.service";
import { SupplySubmissionRepository } from "../../src/modules/fleet-partner/supply-submission.repository";
import { SupplySubmissionService } from "../../src/modules/fleet-partner/supply-submission.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";

const VALID_CHECKSUM_A =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const VALID_CHECKSUM_B =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const VALID_CHECKSUM_C =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const VALID_CHECKSUM_D =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const VALID_CHECKSUM_E =
  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

type FixtureOptions = {
  useSeededReviewService?: boolean;
};

function buildSharedServices() {
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
  const vehicleEligibilityService = new VehicleEligibilityService(
    regulatoryRegistryService,
  );
  const supplyReadinessService = new SupplyReadinessService(
    fleetPartnerService,
    regulatoryRegistryService,
    vehicleEligibilityService,
    supplySubmissionRepository,
  );

  return {
    auditNotificationService,
    fleetPartnerService,
    regulatoryRegistryService,
    supplySubmissionRepository,
    supplySubmissionService,
    supplyDocumentService,
    supplyReadinessService,
  };
}

function createFixture(options: FixtureOptions = {}) {
  const services = buildSharedServices();
  const supplyReviewService = options.useSeededReviewService
    ? new SupplyReviewService()
    : new SupplyReviewService(
        services.regulatoryRegistryService,
        services.supplySubmissionRepository,
      );

  return {
    ...services,
    controller: new FleetPartnerController(
      services.fleetPartnerService,
      services.supplySubmissionService,
      services.supplyDocumentService,
      supplyReviewService,
      services.supplyReadinessService,
    ),
    supplyReviewService,
  };
}

async function uploadDocument(
  controller: FleetPartnerController,
  submissionId: string,
  expectedRevisionNo: number,
  documentType:
    | "professional_driver_license"
    | "taxi_driver_registration"
    | "vehicle_registration"
    | "insurance_policy"
    | "fleet_participation_contract"
    | "other",
  originalFileName: string,
  checksumSha256: string,
) {
  const uploadUrl = await controller.createSupplyDocumentUploadUrl(
    "fleet-demo-001",
    "fleet-user-1",
    submissionId,
    {
      expectedRevisionNo,
      documentType,
      originalFileName,
      contentType: "application/pdf",
    },
    `req-upload-${documentType}`,
  );

  return controller.confirmSupplyDocumentUpload(
    "fleet-demo-001",
    "fleet-user-1",
    submissionId,
    {
      expectedRevisionNo,
      documentType,
      objectKey: uploadUrl.data.objectKey,
      originalFileName,
      contentType: "application/pdf",
      fileSize: 1024,
      checksumSha256,
      effectiveFrom: "2026-01-01",
      effectiveUntil: "2027-12-31",
    },
    `req-confirm-${documentType}`,
  );
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
    expect(vehicles.data.items.map((item) => item.vehicleId)).toEqual([
      "veh-demo-001",
      "veh-demo-002",
    ]);
    expect(
      trips.data.items.every((item) =>
        ["drv-demo-001", "drv-demo-002"].includes(item.driverId),
      ),
    ).toBe(true);
    expect(statements.data.items[0]).toMatchObject({
      periodMonth: "2026-03",
      sponsorFundedTripCount: 1,
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
    const { controller } = createFixture({ useSeededReviewService: true });
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
    const { controller } = createFixture({ useSeededReviewService: true });

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

  it("supports the fleet-partner write flow through approval and readiness", async () => {
    const { controller } = createFixture();

    const driverCreated = await controller.createDriverSupplySubmission(
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
    const driverSubmissionId = driverCreated.data.submission.submissionId;

    const driverUpdated = await controller.updateDriverSupplySubmission(
      "fleet-demo-001",
      "fleet-user-1",
      driverSubmissionId,
      {
        expectedRevisionNo: 1,
        name: "Driver Supply Demo Updated",
        mobile: "+886900999889",
        professionalDriverLicenseNo: "PDL-9988",
        professionalDriverLicenseExpiry: "2027-12-31",
        taxiDriverRegistrationNo: "TX-9988",
        taxiDriverRegistrationArea: "TPE",
        taxiDriverRegistrationExpiry: "2027-12-31",
        supportedServiceProductCodes: ["taxi_realtime"],
        preferredVehicleSubmissionId: null,
      },
      "req-supply-update-driver",
    );
    expect(driverUpdated.data.submission.revisionNo).toBe(2);

    await uploadDocument(
      controller,
      driverSubmissionId,
      2,
      "professional_driver_license",
      "driver-license.pdf",
      VALID_CHECKSUM_A,
    );
    await uploadDocument(
      controller,
      driverSubmissionId,
      3,
      "taxi_driver_registration",
      "taxi-registration.pdf",
      VALID_CHECKSUM_B,
    );

    const submittedDriver = await controller.submitSupplySubmission(
      "fleet-demo-001",
      "fleet-user-1",
      driverSubmissionId,
      { expectedRevisionNo: 4 },
      "req-supply-submit-driver",
    );
    expect(submittedDriver.data.submission.status).toBe("submitted");

    const driverReviewIdentity = {
      actorType: "platform_admin",
      actorId: "platform-reviewer-010",
      realm: "platform",
      authMode: "bootstrap_headers",
      roleFamilies: ["platform"],
      roles: [],
      scopes: [],
      tenantId: null,
      requestId: "req-driver-reviewer",
    } as const;

    const startedDriverReview = await controller.startSupplyReview(
      driverSubmissionId,
      {
        expectedRevisionNo: 5,
        reasonCode: "manual_screening",
        comment: "Driver documents look complete.",
      },
      driverReviewIdentity,
      "req-start-driver-review",
    );
    expect(startedDriverReview.data.status).toBe("in_review");

    const revisionRequested = await controller.requestSupplyRevision(
      driverSubmissionId,
      {
        expectedRevisionNo: 6,
        reasonCode: "mobile_needs_confirmation",
        comment: "Please confirm the revised mobile number.",
      },
      driverReviewIdentity,
      "req-driver-revision-request",
    );
    expect(revisionRequested.data.status).toBe("needs_revision");

    const driverNeedsRevision = await controller.getSupplySubmissionDetail(
      "fleet-demo-001",
      driverSubmissionId,
      "req-driver-needs-revision-detail",
    );
    expect(driverNeedsRevision.data.submission).toMatchObject({
      status: "needs_revision",
      revisionNo: 7,
    });

    const revisionUploadUrl = await controller.createSupplyDocumentUploadUrl(
      "fleet-demo-001",
      "fleet-user-1",
      driverSubmissionId,
      {
        expectedRevisionNo: 7,
        documentType: "other",
        originalFileName: "driver-revision-note.pdf",
        contentType: "application/pdf",
      },
      "req-driver-revision-upload-url",
    );
    expect(revisionUploadUrl.data.objectKey).toContain(driverSubmissionId);

    const revisedDriver = await controller.updateDriverSupplySubmission(
      "fleet-demo-001",
      "fleet-user-1",
      driverSubmissionId,
      {
        expectedRevisionNo: 7,
        name: "Driver Supply Demo Final",
        mobile: "+886900999890",
        professionalDriverLicenseNo: "PDL-9988",
        professionalDriverLicenseExpiry: "2027-12-31",
        taxiDriverRegistrationNo: "TX-9988",
        taxiDriverRegistrationArea: "TPE",
        taxiDriverRegistrationExpiry: "2027-12-31",
        supportedServiceProductCodes: ["taxi_realtime"],
        preferredVehicleSubmissionId: null,
      },
      "req-supply-update-driver-after-revision",
    );
    expect(revisedDriver.data.submission).toMatchObject({
      status: "needs_revision",
      revisionNo: 8,
    });

    const resubmittedDriver = await controller.submitSupplySubmission(
      "fleet-demo-001",
      "fleet-user-1",
      driverSubmissionId,
      { expectedRevisionNo: 8 },
      "req-supply-resubmit-driver",
    );
    expect(resubmittedDriver.data.submission.status).toBe("submitted");

    const restartedDriverReview = await controller.startSupplyReview(
      driverSubmissionId,
      {
        expectedRevisionNo: 9,
        reasonCode: "manual_screening",
        comment: "Driver revision reviewed.",
      },
      driverReviewIdentity,
      "req-restart-driver-review",
    );
    expect(restartedDriverReview.data.status).toBe("in_review");

    const approvedDriver = await controller.approveSupplySubmission(
      driverSubmissionId,
      {
        expectedRevisionNo: 10,
        reasonCode: "all_documents_valid",
        comment: "Driver approved.",
      },
      driverReviewIdentity,
      "req-approve-driver",
    );
    expect(approvedDriver.data.status).toBe("approved");
    expect(approvedDriver.data.canonicalDriverId).toBeTruthy();

    const canonicalDriverId = approvedDriver.data.canonicalDriverId!;
    const driverAffiliation = controller.createDriverFleetAffiliation(
      canonicalDriverId,
      {
        fleetPartnerId: "fleet-demo-001",
        affiliationType: "contracted_under",
        effectiveFrom: "2026-06-21T00:00:00.000Z",
        effectiveUntil: null,
        driverGroupId: null,
      },
      "req-driver-affiliation",
    );
    expect(driverAffiliation.data.driverId).toBe(canonicalDriverId);

    const vehicleCreated = await controller.createVehicleSupplySubmission(
      "fleet-demo-001",
      "fleet-user-1",
      {
        plateNo: "SUP-7788",
        licenseType: "taxi",
        brand: "Toyota",
        model: "Sienta",
        modelYear: 2024,
        seatCount: 5,
        luggageCapacity: 3,
        businessArea: "TPE",
        supportedServiceProductCodes: ["taxi_realtime"],
        airportTransferEligible: false,
        fixedFareAllowed: false,
        currentDriverSubmissionId: driverSubmissionId,
        doorCount: 4,
        color: "yellow",
      },
      "req-supply-create-vehicle",
    );
    const vehicleSubmissionId = vehicleCreated.data.submission.submissionId;

    const vehicleUpdated = await controller.updateVehicleSupplySubmission(
      "fleet-demo-001",
      "fleet-user-1",
      vehicleSubmissionId,
      {
        expectedRevisionNo: 1,
        plateNo: "SUP-7788",
        licenseType: "taxi",
        brand: "Toyota",
        model: "Sienta Hybrid",
        modelYear: 2024,
        seatCount: 5,
        luggageCapacity: 4,
        businessArea: "TPE",
        supportedServiceProductCodes: ["taxi_realtime"],
        airportTransferEligible: false,
        fixedFareAllowed: false,
        currentDriverSubmissionId: driverSubmissionId,
        doorCount: 4,
        color: "yellow",
      },
      "req-supply-update-vehicle",
    );
    expect(vehicleUpdated.data.submission.revisionNo).toBe(2);

    await uploadDocument(
      controller,
      vehicleSubmissionId,
      2,
      "vehicle_registration",
      "vehicle-registration.pdf",
      VALID_CHECKSUM_C,
    );
    await uploadDocument(
      controller,
      vehicleSubmissionId,
      3,
      "insurance_policy",
      "insurance-policy.pdf",
      VALID_CHECKSUM_D,
    );
    await uploadDocument(
      controller,
      vehicleSubmissionId,
      4,
      "fleet_participation_contract",
      "fleet-contract.pdf",
      VALID_CHECKSUM_E,
    );

    const submissions = await controller.listSupplySubmissions(
      "fleet-demo-001",
      {},
      "req-list-submissions",
    );
    expect(
      submissions.data.items.map((item) => item.submission.submissionId),
    ).toEqual(
      expect.arrayContaining([driverSubmissionId, vehicleSubmissionId]),
    );

    const submittedVehicle = await controller.submitSupplySubmission(
      "fleet-demo-001",
      "fleet-user-1",
      vehicleSubmissionId,
      { expectedRevisionNo: 5 },
      "req-supply-submit-vehicle",
    );
    expect(submittedVehicle.data.submission.status).toBe("submitted");

    const vehicleReviewIdentity = {
      actorType: "platform_admin",
      actorId: "platform-reviewer-011",
      realm: "platform",
      authMode: "bootstrap_headers",
      roleFamilies: ["platform"],
      roles: [],
      scopes: [],
      tenantId: null,
      requestId: "req-vehicle-reviewer",
    } as const;

    const startedVehicleReview = await controller.startSupplyReview(
      vehicleSubmissionId,
      {
        expectedRevisionNo: 6,
        reasonCode: "manual_screening",
        comment: "Vehicle documents ready for approval.",
      },
      vehicleReviewIdentity,
      "req-start-vehicle-review",
    );
    expect(startedVehicleReview.data.status).toBe("in_review");

    const approvedVehicle = await controller.approveSupplySubmission(
      vehicleSubmissionId,
      {
        expectedRevisionNo: 7,
        reasonCode: "all_documents_valid",
        comment: "Vehicle approved.",
      },
      vehicleReviewIdentity,
      "req-approve-vehicle",
    );

    expect(approvedVehicle.data).toMatchObject({
      status: "approved",
      canonicalVehicleId: expect.any(String),
      canonicalContractId: expect.any(String),
      canonicalPolicyId: expect.any(String),
    });

    const canonicalVehicleId = approvedVehicle.data.canonicalVehicleId!;
    const driverReadiness = await controller.getPortalDriverReadiness(
      "fleet-demo-001",
      canonicalDriverId,
      "req-driver-readiness",
    );
    expect(driverReadiness.data).toMatchObject({
      subjectType: "driver",
      subjectId: canonicalDriverId,
      state: "ready",
      reasonCodes: [],
    });

    const vehicleReadiness = await controller.getPortalVehicleReadiness(
      "fleet-demo-001",
      canonicalVehicleId,
      "req-vehicle-readiness",
    );
    expect(vehicleReadiness.data).toMatchObject({
      subjectType: "vehicle",
      subjectId: canonicalVehicleId,
      state: "ready",
      reasonCodes: [],
    });

    const readinessList = await controller.listPortalReadiness(
      "fleet-demo-001",
      "req-readiness-list",
    );
    expect(readinessList.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectType: "driver",
          subjectId: canonicalDriverId,
          state: "ready",
        }),
        expect.objectContaining({
          subjectType: "vehicle",
          subjectId: canonicalVehicleId,
          state: "ready",
        }),
      ]),
    );
  });

  it("supports document delete and submission withdraw endpoints", async () => {
    const { controller } = createFixture();

    const created = await controller.createDriverSupplySubmission(
      "fleet-demo-001",
      "fleet-user-1",
      {
        name: "Withdraw Demo",
        mobile: "+886900999777",
        professionalDriverLicenseNo: "PDL-7777",
        professionalDriverLicenseExpiry: "2027-12-31",
        taxiDriverRegistrationNo: "TX-7777",
        taxiDriverRegistrationArea: "TPE",
        taxiDriverRegistrationExpiry: "2027-12-31",
        supportedServiceProductCodes: ["taxi_realtime"],
        preferredVehicleSubmissionId: null,
      },
      "req-supply-create-withdraw",
    );
    const submissionId = created.data.submission.submissionId;

    await uploadDocument(
      controller,
      submissionId,
      1,
      "professional_driver_license",
      "driver-license.pdf",
      VALID_CHECKSUM_A,
    );
    await uploadDocument(
      controller,
      submissionId,
      2,
      "taxi_driver_registration",
      "taxi-registration.pdf",
      VALID_CHECKSUM_B,
    );

    const extraUploadUrl = await controller.createSupplyDocumentUploadUrl(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      {
        expectedRevisionNo: 3,
        documentType: "other",
        originalFileName: "extra-note.pdf",
        contentType: "application/pdf",
      },
      "req-upload-extra-document",
    );
    const extraDocument = await controller.confirmSupplyDocumentUpload(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      {
        expectedRevisionNo: 3,
        documentType: "other",
        objectKey: extraUploadUrl.data.objectKey,
        originalFileName: "extra-note.pdf",
        contentType: "application/pdf",
        fileSize: 256,
        checksumSha256: VALID_CHECKSUM_C,
        effectiveFrom: "2026-01-01",
        effectiveUntil: "2027-12-31",
      },
      "req-confirm-extra-document",
    );

    const deleted = await controller.deleteSupplyDocument(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      extraDocument.data.documentId,
      { expectedRevisionNo: 4 },
      "req-delete-extra-document",
    );
    expect(deleted.data).toEqual({ deleted: true });

    const submitted = await controller.submitSupplySubmission(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      { expectedRevisionNo: 5 },
      "req-submit-withdraw",
    );
    expect(submitted.data.submission.status).toBe("submitted");

    const withdrawn = await controller.withdrawSupplySubmission(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      { expectedRevisionNo: 6 },
      "req-withdraw-submission",
    );
    expect(withdrawn.data.submission.status).toBe("withdrawn");

    const detail = await controller.getSupplySubmissionDetail(
      "fleet-demo-001",
      submissionId,
      "req-withdraw-detail",
    );
    expect(detail.data.reviewEvents.map((event) => event.eventType)).toContain(
      "withdrawn",
    );
    expect(detail.data.documents).toHaveLength(2);
  });

  it("rejects confirming a pre-signed upload after the intent expires", async () => {
    const { controller, supplyDocumentService } = createFixture();

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
      "req-supply-create-driver-expired",
    );
    const submissionId = created.data.submission.submissionId;

    const uploadUrl = await controller.createSupplyDocumentUploadUrl(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      {
        expectedRevisionNo: 1,
        documentType: "professional_driver_license",
        originalFileName: "license.pdf",
        contentType: "application/pdf",
      },
      "req-supply-upload-expired",
    );

    const pendingUploadIntents = (
      supplyDocumentService as unknown as {
        pendingUploadIntents: Map<string, Record<string, string>>;
      }
    ).pendingUploadIntents;
    const intent = pendingUploadIntents.get(uploadUrl.data.objectKey);
    expect(intent).toBeDefined();
    pendingUploadIntents.set(uploadUrl.data.objectKey, {
      ...intent!,
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    const expiredError = await controller
      .confirmSupplyDocumentUpload(
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
          checksumSha256: VALID_CHECKSUM_A,
          effectiveFrom: "2026-01-01",
          effectiveUntil: "2027-12-31",
        },
        "req-supply-confirm-expired",
      )
      .catch((error: unknown) => error);

    expect(expiredError).toBeInstanceOf(ApiRequestError);
    expect((expiredError as ApiRequestError).getResponse()).toMatchObject({
      error: {
        code: "UPLOAD_URL_INVALID",
        message: "The pre-signed upload intent has expired.",
        details: {
          submissionId,
          objectKey: uploadUrl.data.objectKey,
        },
      },
    });
  });

  it("rejects confirming a pre-signed upload with mismatched metadata", async () => {
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
      "req-supply-create-driver-mismatch",
    );
    const submissionId = created.data.submission.submissionId;

    const uploadUrl = await controller.createSupplyDocumentUploadUrl(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      {
        expectedRevisionNo: 1,
        documentType: "professional_driver_license",
        originalFileName: "license.pdf",
        contentType: "application/pdf",
      },
      "req-supply-upload-mismatch",
    );

    const mismatchError = await controller
      .confirmSupplyDocumentUpload(
        "fleet-demo-001",
        "fleet-user-1",
        submissionId,
        {
          expectedRevisionNo: 1,
          documentType: "taxi_driver_registration",
          objectKey: uploadUrl.data.objectKey,
          originalFileName: "license-v2.pdf",
          contentType: "image/png",
          fileSize: 1024,
          checksumSha256: VALID_CHECKSUM_A,
          effectiveFrom: "2026-01-01",
          effectiveUntil: "2027-12-31",
        },
        "req-supply-confirm-mismatch",
      )
      .catch((error: unknown) => error);

    expect(mismatchError).toBeInstanceOf(ApiRequestError);
    expect((mismatchError as ApiRequestError).getResponse()).toMatchObject({
      error: {
        code: "UPLOAD_URL_INVALID",
        details: {
          submissionId,
          objectKey: uploadUrl.data.objectKey,
          mismatchedFields: ["documentType", "originalFileName", "contentType"],
        },
      },
    });
  });

  it("accepts confirming a pre-signed upload when objectKey has surrounding whitespace", async () => {
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
      "req-supply-create-driver-trimmed-key",
    );
    const submissionId = created.data.submission.submissionId;

    const uploadUrl = await controller.createSupplyDocumentUploadUrl(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      {
        expectedRevisionNo: 1,
        documentType: "professional_driver_license",
        originalFileName: "license.pdf",
        contentType: "application/pdf",
      },
      "req-supply-upload-trimmed-key",
    );

    const confirmed = await controller.confirmSupplyDocumentUpload(
      "fleet-demo-001",
      "fleet-user-1",
      submissionId,
      {
        expectedRevisionNo: 1,
        documentType: "professional_driver_license",
        objectKey: `  ${uploadUrl.data.objectKey}  `,
        originalFileName: "license.pdf",
        contentType: "application/pdf",
        fileSize: 1024,
        checksumSha256: VALID_CHECKSUM_A,
        effectiveFrom: "2026-01-01",
        effectiveUntil: "2027-12-31",
      },
      "req-supply-confirm-trimmed-key",
    );

    expect(confirmed.data.fileObjectKey).toBe(uploadUrl.data.objectKey);
  });

  it("rejects confirming a pre-signed upload with invalid checksum or effective range", async () => {
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
      "req-supply-create-driver-invalid-metadata",
    );
    const submissionId = created.data.submission.submissionId;

    const invalidChecksumUploadUrl =
      await controller.createSupplyDocumentUploadUrl(
        "fleet-demo-001",
        "fleet-user-1",
        submissionId,
        {
          expectedRevisionNo: 1,
          documentType: "professional_driver_license",
          originalFileName: "license.pdf",
          contentType: "application/pdf",
        },
        "req-supply-upload-invalid-checksum",
      );

    const invalidChecksumError = await controller
      .confirmSupplyDocumentUpload(
        "fleet-demo-001",
        "fleet-user-1",
        submissionId,
        {
          expectedRevisionNo: 1,
          documentType: "professional_driver_license",
          objectKey: invalidChecksumUploadUrl.data.objectKey,
          originalFileName: "license.pdf",
          contentType: "application/pdf",
          fileSize: 1024,
          checksumSha256: "abc123",
          effectiveFrom: "2026-01-01",
          effectiveUntil: "2027-12-31",
        },
        "req-supply-confirm-invalid-checksum",
      )
      .catch((error: unknown) => error);
    expect(invalidChecksumError).toBeInstanceOf(ApiRequestError);
    expect(
      (invalidChecksumError as ApiRequestError).getResponse(),
    ).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: {
          fieldName: "checksumSha256",
        },
      },
    });

    const invalidRangeUploadUrl =
      await controller.createSupplyDocumentUploadUrl(
        "fleet-demo-001",
        "fleet-user-1",
        submissionId,
        {
          expectedRevisionNo: 1,
          documentType: "professional_driver_license",
          originalFileName: "license.pdf",
          contentType: "application/pdf",
        },
        "req-supply-upload-invalid-range",
      );

    const invalidRangeError = await controller
      .confirmSupplyDocumentUpload(
        "fleet-demo-001",
        "fleet-user-1",
        submissionId,
        {
          expectedRevisionNo: 1,
          documentType: "professional_driver_license",
          objectKey: invalidRangeUploadUrl.data.objectKey,
          originalFileName: "license.pdf",
          contentType: "application/pdf",
          fileSize: 1024,
          checksumSha256: VALID_CHECKSUM_A,
          effectiveFrom: "2027-12-31",
          effectiveUntil: "2026-01-01",
        },
        "req-supply-confirm-invalid-range",
      )
      .catch((error: unknown) => error);
    expect(invalidRangeError).toBeInstanceOf(ApiRequestError);
    expect((invalidRangeError as ApiRequestError).getResponse()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "effectiveUntil must be on or after effectiveFrom.",
        details: {
          effectiveFrom: "2027-12-31",
          effectiveUntil: "2026-01-01",
        },
      },
    });
  });
});
