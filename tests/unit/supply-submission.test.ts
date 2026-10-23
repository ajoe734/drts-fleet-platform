import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";

import type { SupplyDocumentRecord } from "@drts/contracts";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { SupplySubmissionRepository } from "../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import { SupplySubmissionService } from "../../apps/api/src/modules/fleet-partner/supply-submission.service";
import type { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { materializeValue } from "../e2e/operational-document-upload";

function createService() {
  const repository = new SupplySubmissionRepository();
  const regulatoryRegistryService = {
    listVehicles: () => [],
    listDrivers: () => [],
  } as unknown as RegulatoryRegistryService;
  const auditNotificationService = new AuditNotificationService();
  const service = new SupplySubmissionService(
    repository,
    regulatoryRegistryService,
    auditNotificationService,
  );

  return { service, repository };
}

describe("SupplySubmissionService", () => {
  it("creates a new driver supply submission draft successfully", async () => {
    const { service } = createService();

    const created = await service.createDriverDraft(
      "fleet-demo-001",
      "actor-demo-001",
      {
        name: "Test Driver",
        mobile: "+886900111222",
        professionalDriverLicenseNo: "PDL-TEST-001",
        professionalDriverLicenseExpiry: "2027-12-31",
        taxiDriverRegistrationNo: "TAXI-TEST-001",
        taxiDriverRegistrationArea: "TPE",
        taxiDriverRegistrationExpiry: "2027-12-31",
        supportedServiceProductCodes: ["taxi_realtime"],
        preferredVehicleSubmissionId: null,
      },
      "req-create-driver-1",
    );

    expect(created.submission.submissionId).toBeDefined();
    expect(created.submission.status).toBe("draft");
    expect(created.submission.revisionNo).toBe(1);
    expect(created.driverDraft?.name).toBe("Test Driver");
    expect(created.driverDraft?.mobile).toBe("+886900111222");
  });

  it("prevents creating a driver draft with duplicate driver identity", async () => {
    const { service } = createService();

    const payload = {
      name: "Test Driver Unique",
      mobile: "+886900111222",
      professionalDriverLicenseNo: "PDL-DUPLICATE-1",
      professionalDriverLicenseExpiry: "2027-12-31",
      taxiDriverRegistrationNo: "TAXI-DUPLICATE-1",
      taxiDriverRegistrationArea: "TPE",
      taxiDriverRegistrationExpiry: "2027-12-31",
      supportedServiceProductCodes: ["taxi_realtime"],
      preferredVehicleSubmissionId: null,
    };

    await service.createDriverDraft("fleet-demo-001", "actor-demo-001", payload);

    // Creating again with same identity should throw
    await expect(
      service.createDriverDraft("fleet-demo-001", "actor-demo-001", payload),
    ).rejects.toThrowError(ApiRequestError);
  });

  it("updates an existing driver draft and bumps revision number", async () => {
    const { service } = createService();

    const created = await service.createDriverDraft(
      "fleet-demo-001",
      "actor-demo-001",
      {
        name: "Test Driver",
        mobile: "+886900111222",
        professionalDriverLicenseNo: "PDL-TEST-002",
        professionalDriverLicenseExpiry: "2027-12-31",
        taxiDriverRegistrationNo: "TAXI-TEST-002",
        taxiDriverRegistrationArea: "TPE",
        taxiDriverRegistrationExpiry: "2027-12-31",
        supportedServiceProductCodes: ["taxi_realtime"],
        preferredVehicleSubmissionId: null,
      },
    );

    const submissionId = created.submission.submissionId;

    const updated = await service.updateDriverDraft(
      "fleet-demo-001",
      submissionId,
      "actor-demo-001",
      {
        expectedRevisionNo: 1,
        name: "Test Driver Updated",
        mobile: "+886900111223",
        professionalDriverLicenseNo: "PDL-TEST-002",
        professionalDriverLicenseExpiry: "2027-12-31",
        taxiDriverRegistrationNo: "TAXI-TEST-002",
        taxiDriverRegistrationArea: "TPE",
        taxiDriverRegistrationExpiry: "2027-12-31",
        supportedServiceProductCodes: ["taxi_realtime"],
        preferredVehicleSubmissionId: null,
      },
    );

    expect(updated.submission.revisionNo).toBe(2);
    expect(updated.driverDraft?.name).toBe("Test Driver Updated");
    expect(updated.driverDraft?.mobile).toBe("+886900111223");
  });

  it("enforces doorCount and color on submission completeness check", async () => {
    const { service } = createService();

    // Create a vehicle submission draft without doorCount / color
    const created = await service.createVehicleDraft(
      "fleet-demo-001",
      "actor-demo-001",
      {
        plateNo: "ABC-9999",
        licenseType: "taxi",
        brand: "Toyota",
        model: "Camry",
        modelYear: 2024,
        seatCount: 4,
        luggageCapacity: 2,
        businessArea: "TPE",
        supportedServiceProductCodes: ["taxi_realtime"],
        currentDriverSubmissionId: null,
        doorCount: null, // missing
        color: null, // missing
        fixedFareAllowed: false,
        airportTransferEligible: false,
      },
    );

    const submissionId = created.submission.submissionId;

    // Submitting it should throw a conflict because doorCount/color are missing
    await expect(
      service.submitSupplySubmission("fleet-demo-001", submissionId, "actor-demo-001", {
        expectedRevisionNo: 1,
      }),
    ).rejects.toThrowError(ApiRequestError);

    // Update draft to have doorCount and color
    await service.updateVehicleDraft(
      "fleet-demo-001",
      submissionId,
      "actor-demo-001",
      {
        expectedRevisionNo: 1,
        plateNo: "ABC-9999",
        licenseType: "taxi",
        brand: "Toyota",
        model: "Camry",
        modelYear: 2024,
        seatCount: 4,
        luggageCapacity: 2,
        businessArea: "TPE",
        supportedServiceProductCodes: ["taxi_realtime"],
        currentDriverSubmissionId: null,
        doorCount: 4,
        color: "yellow",
        fixedFareAllowed: false,
        airportTransferEligible: false,
      },
    );

    // Now it should proceed past draft validation (though it might fail on missing documents, which is a different error code)
    await expect(
      service.submitSupplySubmission("fleet-demo-001", submissionId, "actor-demo-001", {
        expectedRevisionNo: 2,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "DOCUMENT_REQUIRED", // It failed on documents, meaning doorCount/color checks passed!
          }),
        }),
      }),
    );
  });

  it("C125-VEHICLE-SUBMISSION-FIXTURE-CONTRACT-20261023: reproduces the manifest vehicle-create 400 on the pre-fix shape and completes create+submit on the corrected manifest payload", async () => {
    const { service, repository } = createService();

    const manifestPath = path.join(
      process.cwd(),
      "tests/e2e/fixtures/operational-browser-journeys.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const acceptanceSetup = manifest.documentAcceptance.setup as Array<
      Record<string, unknown>
    >;
    const driverSetup = acceptanceSetup.find(
      (item) =>
        item.path ===
        "/control-plane-proxy/fleet-partner/supply-submissions/drivers",
    );
    const vehicleSetup = acceptanceSetup.find(
      (item) =>
        item.path ===
        "/control-plane-proxy/fleet-partner/supply-submissions/vehicles",
    );
    expect(driverSetup).toBeDefined();
    expect(vehicleSetup).toBeDefined();

    const variables: Record<string, unknown> = {
      runId: "unit-c125-vehicle-fixture",
    };
    const driverBody = materializeValue(
      (driverSetup as Record<string, unknown>).body,
      variables,
    ) as Record<string, unknown>;
    const createdDriver = await service.createDriverDraft(
      "fleet-demo-001",
      "actor-demo-001",
      driverBody as never,
    );
    variables.c125DriverSubmissionId = createdDriver.submission.submissionId;

    // The real manifest body, with {{runId}}/{{c125DriverSubmissionId}}
    // resolved to concrete values the same way the live browser journey
    // resolves them.
    const correctedVehicleBody = materializeValue(
      (vehicleSetup as Record<string, unknown>).body,
      variables,
    ) as Record<string, unknown>;

    // Pre-fix manifest shape diagnosed by the 15b hosted run: missing
    // licenseType/luggageCapacity/businessArea and manufactureYear instead
    // of modelYear, which made the real service reject vehicle creation
    // with 400 right after a successful driver submission. Built by keeping
    // only the fields the pre-fix manifest body had (sourced from the
    // corrected body, not a hand-copied duplicate), so it tracks whatever
    // the manifest actually contains.
    const brokenVehicleBody = {
      plateNo: correctedVehicleBody.plateNo,
      brand: correctedVehicleBody.brand,
      model: correctedVehicleBody.model,
      manufactureYear: correctedVehicleBody.modelYear,
      seatCount: correctedVehicleBody.seatCount,
      supportedServiceProductCodes:
        correctedVehicleBody.supportedServiceProductCodes,
    };

    await expect(
      service.createVehicleDraft(
        "fleet-demo-001",
        "actor-demo-001",
        brokenVehicleBody as never,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const createdVehicle = await service.createVehicleDraft(
      "fleet-demo-001",
      "actor-demo-001",
      correctedVehicleBody as never,
    );
    expect(createdVehicle.submission.status).toBe("draft");
    expect(createdVehicle.vehicleDraft).toMatchObject({
      licenseType: "taxi",
      luggageCapacity: 2,
      businessArea: "TPE",
      modelYear: 2024,
      doorCount: 4,
      color: "yellow",
      airportTransferEligible: false,
      fixedFareAllowed: false,
      currentDriverSubmissionId: createdDriver.submission.submissionId,
    });
    const vehicleSubmissionId = createdVehicle.submission.submissionId;

    // Document upload/scan is handled by the separate storage-backed
    // SupplyDocumentService, which this socket-free unit suite does not
    // invoke. Seed the confirmed document records through the same
    // repository persistence contract the service reads from (the external
    // storage/scan boundary is mocked here; the completeness logic under
    // test — assertSubmissionComplete reading real repository state — is
    // not).
    const uploadedAt = new Date().toISOString();
    const seededDocuments: SupplyDocumentRecord[] = [
      "vehicle_registration",
      "insurance_policy",
      "fleet_participation_contract",
    ].map((documentType) => ({
      documentId: randomUUID(),
      fleetPartnerId: "fleet-demo-001",
      submissionId: vehicleSubmissionId,
      documentType: documentType as SupplyDocumentRecord["documentType"],
      fileObjectKey: `unit-test/${vehicleSubmissionId}/${documentType}`,
      originalFileName: `${documentType}.pdf`,
      contentType: "application/pdf",
      fileSize: 1,
      checksumSha256: "a".repeat(64),
      effectiveFrom: null,
      effectiveUntil: null,
      reviewStatus: "pending",
      reviewComment: null,
      uploadedBy: "actor-demo-001",
      uploadedAt,
    }));
    await repository.persistChanges({ documents: seededDocuments });

    const submitted = await service.submitSupplySubmission(
      "fleet-demo-001",
      vehicleSubmissionId,
      "actor-demo-001",
      { expectedRevisionNo: 1 },
    );
    expect(submitted.submission.status).toBe("submitted");
  });

  it("performs idempotent in-memory backfill of incomplete vehicle submissions to needs_revision", async () => {
    const { service, repository } = createService();

    // Mock repository isEnabled to return false (in-memory mode)
    vi.spyOn(repository, "isEnabled").mockReturnValue(false);

    // Seed repository state directly with a submitted submission that lacks doorCount/color
    const submissionId = "sub-seeded-123";
    const seedSubmission = {
      submissionId,
      fleetPartnerId: "fleet-demo-001",
      submissionType: "vehicle_onboarding" as const,
      status: "submitted" as const,
      revisionNo: 1,
      subjectDriverId: null,
      subjectVehicleId: "veh-123",
      submittedBy: "actor-1",
      submittedAt: "2026-07-20T08:00:00Z",
      reviewStartedBy: null,
      reviewStartedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReasonCode: null,
      reviewComment: null,
      canonicalDriverId: null,
      canonicalVehicleId: null,
      canonicalContractId: null,
      canonicalPolicyId: null,
      createdAt: "2026-07-20T08:00:00Z",
      updatedAt: "2026-07-20T08:00:00Z",
    };
    const seedDraft = {
      submissionId,
      plateNo: "ABC-1234",
      licenseType: "taxi",
      brand: "Toyota",
      model: "Camry",
      modelYear: 2024,
      seatCount: 4,
      luggageCapacity: 2,
      businessArea: "TPE",
      supportedServiceProductCodes: ["taxi_realtime"],
      airportTransferEligible: false,
      fixedFareAllowed: true,
      currentDriverSubmissionId: null,
      doorCount: null, // missing!
      color: null, // missing!
    };

    await repository.persistChanges({
      submissions: [seedSubmission],
      vehicleDrafts: [seedDraft],
    });

    // Run onModuleInit, which triggers backfill
    await service.onModuleInit();

    // Verify submission status was backfilled to needs_revision
    const detail = await service.getSupplySubmissionDetail("fleet-demo-001", submissionId);
    expect(detail.submission.status).toBe("needs_revision");
  });
});
