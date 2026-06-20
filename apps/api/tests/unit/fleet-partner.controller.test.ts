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

const VALID_CHECKSUM_A =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const VALID_CHECKSUM_B =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

function createDurableSupplyDatabase() {
  const submissions = new Map<string, Record<string, unknown>>();
  const driverDrafts = new Map<string, Record<string, unknown>>();
  const documents = new Map<string, Record<string, unknown>>();
  const uploadIntents = new Map<string, Record<string, unknown>>();

  return {
    isEnabled: () => true,
    async query(sql: string, values: readonly unknown[] = []) {
      const text = String(sql);

      if (text.includes("INSERT INTO fleet.supply_submissions")) {
        submissions.set(String(values[0]), {
          submission_id: values[0],
          fleet_partner_id: values[1],
          submission_type: values[2],
          status: values[3],
          revision_no: values[4],
          subject_driver_id: values[5],
          subject_vehicle_id: values[6],
          submitted_by: values[7],
          submitted_at: values[8],
          review_started_by: values[9],
          review_started_at: values[10],
          reviewed_by: values[11],
          reviewed_at: values[12],
          review_reason_code: values[13],
          review_comment: values[14],
          canonical_driver_id: values[15],
          canonical_vehicle_id: values[16],
          canonical_contract_id: values[17],
          canonical_policy_id: values[18],
          created_at: values[19],
          updated_at: values[20],
        });
        return { rows: [] };
      }

      if (text.includes("INSERT INTO fleet.driver_supply_drafts")) {
        driverDrafts.set(String(values[0]), {
          submission_id: values[0],
          name: values[1],
          mobile: values[2],
          professional_driver_license_no: values[3],
          professional_driver_license_expiry: values[4],
          taxi_driver_registration_no: values[5],
          taxi_driver_registration_area: values[6],
          taxi_driver_registration_expiry: values[7],
          supported_service_product_codes: JSON.parse(String(values[8])),
          preferred_vehicle_submission_id: values[9],
        });
        return { rows: [] };
      }

      if (text.includes("INSERT INTO fleet.supply_documents")) {
        documents.set(String(values[0]), {
          document_id: values[0],
          fleet_partner_id: values[1],
          submission_id: values[2],
          document_type: values[3],
          file_object_key: values[4],
          original_file_name: values[5],
          content_type: values[6],
          file_size: values[7],
          checksum_sha256: values[8],
          effective_from: values[9],
          effective_until: values[10],
          review_status: values[11],
          review_comment: values[12],
          uploaded_by: values[13],
          uploaded_at: values[14],
        });
        return { rows: [] };
      }

      if (text.includes("INSERT INTO fleet.supply_document_upload_intents")) {
        uploadIntents.set(String(values[0]), {
          object_key: values[0],
          submission_id: values[1],
          fleet_partner_id: values[2],
          document_type: values[3],
          original_file_name: values[4],
          content_type: values[5],
          created_at: values[6],
          expires_at: values[7],
        });
        return { rows: [] };
      }

      if (text.includes("DELETE FROM fleet.supply_document_upload_intents")) {
        uploadIntents.delete(String(values[0]));
        return { rows: [] };
      }

      if (
        text.includes("SELECT *") &&
        text.includes("FROM fleet.supply_submissions")
      ) {
        return { rows: Array.from(submissions.values()) };
      }

      if (
        text.includes("SELECT *") &&
        text.includes("FROM fleet.driver_supply_drafts")
      ) {
        return { rows: Array.from(driverDrafts.values()) };
      }

      if (
        text.includes("SELECT *") &&
        text.includes("FROM fleet.vehicle_supply_drafts")
      ) {
        return { rows: [] };
      }

      if (
        text.includes("SELECT *") &&
        text.includes("FROM fleet.supply_documents")
      ) {
        return { rows: Array.from(documents.values()) };
      }

      if (
        text.includes("SELECT *") &&
        text.includes("FROM fleet.supply_document_upload_intents") &&
        text.includes("WHERE object_key = $1")
      ) {
        const row = uploadIntents.get(String(values[0]));
        return { rows: row ? [row] : [] };
      }

      if (
        text.includes("SELECT *") &&
        text.includes("FROM fleet.supply_document_upload_intents")
      ) {
        return { rows: Array.from(uploadIntents.values()) };
      }

      if (
        text.includes("SELECT *") &&
        text.includes("FROM fleet.supply_review_events")
      ) {
        return { rows: [] };
      }

      if (
        text.includes("SELECT *") &&
        text.includes("FROM fleet.vehicle_fleet_affiliations")
      ) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };
}

function createFixture() {
  return createFixtureFromRepository(new SupplySubmissionRepository());
}

async function createFixtureWithDatabase(databaseService: {
  isEnabled(): boolean;
  query(sql: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
}) {
  const fixture = createFixtureFromRepository(
    new SupplySubmissionRepository(databaseService as never),
  );
  await fixture.supplySubmissionService.onModuleInit();
  return fixture;
}

function createFixtureFromRepository(
  supplySubmissionRepository: SupplySubmissionRepository,
) {
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
    fleetPartnerService,
    regulatoryRegistryService,
  );

  return {
    controller: new FleetPartnerController(
      fleetPartnerService,
      supplySubmissionService,
      supplyDocumentService,
      supplyReadinessService,
    ),
    service: fleetPartnerService,
    supplyDocumentService,
    supplySubmissionRepository,
    supplySubmissionService,
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

  it("supports draft, document, submit, and canonical readiness APIs", async () => {
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
        checksumSha256: VALID_CHECKSUM_A,
        effectiveFrom: "2026-01-01",
        effectiveUntil: "2027-12-31",
      },
      "req-supply-confirm-1",
    );
    expect(firstDocument.data.documentType).toBe("professional_driver_license");

    const secondUploadUrl = await controller.createSupplyDocumentUploadUrl(
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
        checksumSha256: VALID_CHECKSUM_B,
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

    expect(() =>
      controller.getDriverSupplyReadiness(
        "fleet-demo-001",
        submissionId,
        "req-supply-readiness-submission",
      ),
    ).toThrow(ApiRequestError);

    const readinessList = controller.listSupplyReadiness(
      "fleet-demo-001",
      "req-supply-readiness-list",
    );
    expect(readinessList.data.items.map((item) => item.subjectId)).toEqual(
      expect.arrayContaining([
        "drv-demo-001",
        "drv-demo-002",
        "veh-demo-001",
        "veh-demo-002",
      ]),
    );
    expect(
      readinessList.data.items.map((item) => item.subjectId),
    ).not.toContain(submissionId);

    const readiness = controller.getDriverSupplyReadiness(
      "fleet-demo-001",
      "drv-demo-001",
      "req-supply-readiness-driver",
    );
    expect(readiness.data).toMatchObject({
      subjectType: "driver",
      subjectId: "drv-demo-001",
      state: "ready",
    });

    const vehicleReadiness = controller.getVehicleSupplyReadiness(
      "fleet-demo-001",
      "veh-demo-002",
      "req-supply-readiness-vehicle",
    );
    expect(vehicleReadiness.data).toMatchObject({
      subjectType: "vehicle",
      subjectId: "veh-demo-002",
      state: "not_ready",
    });
    expect(vehicleReadiness.data.reasonCodes).toEqual(
      expect.arrayContaining(["CONTRACT_MISSING", "VEHICLE_DOCUMENT_MISSING"]),
    );
  });

  it("rejects confirming a pre-signed upload after the intent expires", async () => {
    const { controller, supplySubmissionRepository } = createFixture();

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

    const intent = await supplySubmissionRepository.findDocumentUploadIntent(
      uploadUrl.data.objectKey,
    );
    expect(intent).toBeDefined();
    await supplySubmissionRepository.saveDocumentUploadIntent({
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
    try {
      throw expiredError;
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "UPLOAD_URL_INVALID",
          message: "The pre-signed upload intent has expired.",
          details: {
            submissionId,
            objectKey: uploadUrl.data.objectKey,
          },
        },
      });
    }
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
    try {
      throw mismatchError;
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "UPLOAD_URL_INVALID",
          message:
            "The upload confirmation metadata does not match the issued pre-signed upload intent.",
          details: {
            submissionId,
            objectKey: uploadUrl.data.objectKey,
            mismatchedFields: [
              "documentType",
              "originalFileName",
              "contentType",
            ],
          },
        },
      });
    }
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

  it("confirms a pre-signed upload after service restart when intents are durably persisted", async () => {
    const durableDatabase = createDurableSupplyDatabase();
    const firstProcess = await createFixtureWithDatabase(durableDatabase);

    const created = await firstProcess.controller.createDriverSupplySubmission(
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
      "req-supply-create-driver-restart",
    );
    const submissionId = created.data.submission.submissionId;

    const uploadUrl =
      await firstProcess.controller.createSupplyDocumentUploadUrl(
        "fleet-demo-001",
        "fleet-user-1",
        submissionId,
        {
          expectedRevisionNo: 1,
          documentType: "professional_driver_license",
          originalFileName: "license.pdf",
          contentType: "application/pdf",
        },
        "req-supply-upload-restart",
      );

    const restartedProcess = await createFixtureWithDatabase(durableDatabase);
    const confirmed =
      await restartedProcess.controller.confirmSupplyDocumentUpload(
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
        "req-supply-confirm-restart",
      );

    expect(confirmed.data.fileObjectKey).toBe(uploadUrl.data.objectKey);
    await expect(
      restartedProcess.supplySubmissionRepository.findDocumentUploadIntent(
        uploadUrl.data.objectKey,
      ),
    ).resolves.toBeNull();
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
    try {
      throw invalidChecksumError;
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "checksumSha256 must be a 64-character hexadecimal SHA-256 digest.",
          details: {
            fieldName: "checksumSha256",
          },
        },
      });
    }

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
          checksumSha256:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          effectiveFrom: "2027-12-31",
          effectiveUntil: "2026-01-01",
        },
        "req-supply-confirm-invalid-range",
      )
      .catch((error: unknown) => error);
    expect(invalidRangeError).toBeInstanceOf(ApiRequestError);
    try {
      throw invalidRangeError;
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "effectiveUntil must be on or after effectiveFrom.",
          details: {
            effectiveFrom: "2027-12-31",
            effectiveUntil: "2026-01-01",
          },
        },
      });
    }
  });
});
