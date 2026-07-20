import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { SupplySubmissionRepository } from "../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import { SupplySubmissionService } from "../../apps/api/src/modules/fleet-partner/supply-submission.service";
import type { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

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
      canonicalDriverId: "canonical-drv-123",
      canonicalVehicleId: "canonical-veh-123",
      canonicalContractId: "canonical-contract-123",
      canonicalPolicyId: "canonical-policy-123",
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

    // Verify submission status was backfilled to needs_revision with reason and comment
    const detail = await service.getSupplySubmissionDetail("fleet-demo-001", submissionId);
    expect(detail.submission.status).toBe("needs_revision");
    expect(detail.submission.reviewReasonCode).toBe("MISSING_MANDATORY_FIELDS");
    expect(detail.submission.reviewComment).toBe("Backfill: missing door count or color.");
    expect(detail.submission.canonicalDriverId).toBeNull();
    expect(detail.submission.canonicalVehicleId).toBeNull();
    expect(detail.submission.canonicalContractId).toBeNull();
    expect(detail.submission.canonicalPolicyId).toBeNull();
  });
});
