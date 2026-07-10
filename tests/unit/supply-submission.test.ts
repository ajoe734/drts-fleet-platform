import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { SupplySubmissionRepository } from "../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import { SupplySubmissionService } from "../../apps/api/src/modules/fleet-partner/supply-submission.service";
import type { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

function createService() {
  const repository = new SupplySubmissionRepository();
  const regulatoryRegistryService = {} as RegulatoryRegistryService;
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
});
