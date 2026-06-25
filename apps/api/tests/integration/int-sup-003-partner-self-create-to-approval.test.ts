import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { SupplyReviewService } from "../../src/modules/fleet-partner/supply-review.service";

function buildService() {
  const registry = new RegulatoryRegistryService(
    {
      publishDriverLocationUpdated: () => undefined,
      publishSupplyLifecycleUpdated: () => undefined,
    } as never,
    new AuditNotificationService(),
    new DriverProfileService(new AuditNotificationService()),
    undefined,
  );
  return { service: new SupplyReviewService(registry), registry };
}

const FLEET = "fleet-demo-001";

async function seedSubmittableSubmission(service: SupplyReviewService) {
  const submission = await service.createSubmission(FLEET, {
    submissionType: "vehicle_onboarding",
  });

  await service.upsertDriverDraft(FLEET, submission.submissionId, {
    name: "Self-Serve Driver",
    mobile: "0912345678",
    professionalDriverLicenseNo: "PDL-SELF-001",
    professionalDriverLicenseExpiry: "2028-01-01",
    taxiDriverRegistrationNo: "TAXI-SELF-001",
    taxiDriverRegistrationArea: "taipei",
    taxiDriverRegistrationExpiry: "2028-01-01",
    supportedServiceProductCodes: ["standard_taxi"],
    preferredVehicleSubmissionId: null,
  });

  await service.upsertVehicleDraft(FLEET, submission.submissionId, {
    plateNo: "SELF-0001",
    licenseType: "taxi",
    brand: "Toyota",
    model: "Sienta",
    modelYear: 2025,
    seatCount: 4,
    luggageCapacity: 2,
    businessArea: "taipei",
    supportedServiceProductCodes: ["standard_taxi"],
    airportTransferEligible: false,
    fixedFareAllowed: true,
    currentDriverSubmissionId: null,
  });

  for (const documentType of [
    "insurance_policy",
    "fleet_participation_contract",
  ] as const) {
    await service.addDocument(FLEET, submission.submissionId, "fleet-user-9", {
      documentType,
      fileObjectKey: `files/${documentType}.pdf`,
      originalFileName: `${documentType}.pdf`,
      contentType: "application/pdf",
      fileSize: 2048,
      checksumSha256: `${documentType}-checksum`,
      effectiveFrom: "2026-06-25",
      effectiveUntil: "2027-06-24",
    });
  }

  return submission;
}

describe("INT-SUP-003 fleet-partner self-create to approval", () => {
  it("creates a draft + drafts without touching the canonical registry", async () => {
    const { service, registry } = buildService();
    const driversBefore = registry.listDrivers().length;
    const vehiclesBefore = registry.listVehicles().length;

    const submission = await seedSubmittableSubmission(service);

    expect(submission).toMatchObject({
      fleetPartnerId: FLEET,
      submissionType: "vehicle_onboarding",
      status: "draft",
      revisionNo: 0,
      canonicalDriverId: null,
      canonicalVehicleId: null,
    });
    // Separation guarantee: building a submission (create + driver/vehicle drafts
    // + documents) adds nothing to canonical dispatch data before approval.
    expect(registry.listDrivers().length).toBe(driversBefore);
    expect(registry.listVehicles().length).toBe(vehiclesBefore);
  });

  it("runs the full self-create -> submit -> review -> approve loop into canonical records", async () => {
    const { service, registry } = buildService();

    const submission = await seedSubmittableSubmission(service);

    const submitted = await service.submitSubmission(
      FLEET,
      submission.submissionId,
      "fleet-user-9",
      { expectedRevisionNo: 0 },
    );
    expect(submitted).toMatchObject({
      status: "submitted",
      revisionNo: 1,
      submittedBy: "fleet-user-9",
    });
    expect(submitted.submittedAt).toBeTruthy();

    const inReview = await service.startSubmissionReview(
      submission.submissionId,
      { expectedRevisionNo: 1, reasonCode: "manual_screening" },
      "platform-reviewer-001",
    );
    expect(inReview).toMatchObject({ status: "in_review", revisionNo: 2 });

    const approved = await service.approveSubmission(
      submission.submissionId,
      { expectedRevisionNo: 2, reasonCode: "all_documents_valid" },
      "platform-reviewer-001",
    );
    expect(approved.status).toBe("approved");
    expect(approved.canonicalDriverId).toBeTruthy();
    expect(approved.canonicalVehicleId).toBeTruthy();

    // The just-approved submission's own subject is now in the canonical registry.
    expect(
      registry
        .listDrivers()
        .some((driver) => driver.driverId === approved.canonicalDriverId),
    ).toBe(true);
    expect(
      registry
        .listVehicles()
        .some((vehicle) => vehicle.vehicleId === approved.canonicalVehicleId),
    ).toBe(true);

    const affiliations = await service.listVehicleAffiliations();
    expect(
      affiliations.some(
        (affiliation) =>
          affiliation.vehicleId === approved.canonicalVehicleId &&
          affiliation.fleetPartnerId === FLEET &&
          affiliation.sourceSubmissionId === submission.submissionId,
      ),
    ).toBe(true);
  });

  it("refuses to submit a submission with no driver or vehicle draft", async () => {
    const { service } = buildService();
    const submission = await service.createSubmission(FLEET, {
      submissionType: "driver_onboarding",
    });

    await expect(
      service.submitSubmission(FLEET, submission.submissionId, "fleet-user-9", {
        expectedRevisionNo: 0,
      }),
    ).rejects.toMatchObject({
      response: { error: { code: "SUBMISSION_INCOMPLETE" } },
    });
  });

  it("refuses to edit a draft once it is submitted", async () => {
    const { service } = buildService();
    const submission = await seedSubmittableSubmission(service);
    await service.submitSubmission(FLEET, submission.submissionId, "fleet-user-9", {
      expectedRevisionNo: 0,
    });

    await expect(
      service.upsertDriverDraft(FLEET, submission.submissionId, {
        name: "Mutated After Submit",
        mobile: "0900000000",
        professionalDriverLicenseNo: "PDL-X",
        professionalDriverLicenseExpiry: "2028-01-01",
        taxiDriverRegistrationNo: "TAXI-X",
        taxiDriverRegistrationArea: "taipei",
        taxiDriverRegistrationExpiry: "2028-01-01",
        supportedServiceProductCodes: [],
        preferredVehicleSubmissionId: null,
      }),
    ).rejects.toMatchObject({
      response: { error: { code: "SUBMISSION_NOT_EDITABLE" } },
    });
  });

  it("hides submissions owned by another fleet partner", async () => {
    const { service } = buildService();
    const submission = await service.createSubmission(FLEET, {
      submissionType: "driver_onboarding",
    });

    await expect(
      service.getFleetSubmission("fleet-other-999", submission.submissionId),
    ).rejects.toMatchObject({
      response: { error: { code: "NOT_FOUND" } },
    });
  });

  it("validates required draft fields with a 400-style guard", async () => {
    const { service } = buildService();
    const submission = await service.createSubmission(FLEET, {
      submissionType: "driver_onboarding",
    });

    await expect(
      service.upsertDriverDraft(FLEET, submission.submissionId, {
        name: "",
        mobile: "0912345678",
        professionalDriverLicenseNo: "PDL",
        professionalDriverLicenseExpiry: "2028-01-01",
        taxiDriverRegistrationNo: "TAXI",
        taxiDriverRegistrationArea: "taipei",
        taxiDriverRegistrationExpiry: "2028-01-01",
        supportedServiceProductCodes: [],
        preferredVehicleSubmissionId: null,
      }),
    ).rejects.toMatchObject({
      response: { error: { code: "FIELD_REQUIRED" } },
    });
  });
});
