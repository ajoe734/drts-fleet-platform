import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { SupplyDocumentService } from "../../../../apps/api/src/modules/fleet-partner/supply-document.service";
import { SupplySubmissionRepository } from "../../../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import { SupplySubmissionService } from "../../../../apps/api/src/modules/fleet-partner/supply-submission.service";

// SR-QA-SUPPLY-001 — capabilities C064 (新增司機／車輛與主要操作入口) and C065
// (文件上傳→檢查→送件→退補／重送), verified against the current, real
// SupplySubmissionService / SupplyDocumentService implementations already
// shipped on `dev` (apps/api/src/modules/fleet-partner/supply-submission*.ts,
// supply-document.service.ts). No Postgres is configured in this sandbox, so
// SupplySubmissionRepository (constructed with no DatabaseService) runs its
// authoritative in-memory branch — the same validation/business logic as the
// DB-backed branch; see the evidence doc's NOT COVERED note for the DB-backed
// transaction path.

function setupSupplyStack() {
  const mockOpsDispatchEventsService = {
    publishSupplyLifecycleUpdated: () => {},
    publishDriverLocationUpdated: () => {},
  };
  const mockDriverProfileService = { findProfileForDriver: () => null };
  const mockAuditNotificationService = { recordAuditLog: () => {} };
  const regService = new RegulatoryRegistryService(
    mockOpsDispatchEventsService as never,
    mockAuditNotificationService as never,
    mockDriverProfileService as never,
  );
  const repository = new SupplySubmissionRepository();
  const submissionService = new SupplySubmissionService(
    repository,
    regService,
    undefined,
  );
  const documentService = new SupplyDocumentService(
    submissionService,
    repository,
  );
  return { regService, submissionService, documentService };
}

function realPdfChecksum(contents: string) {
  return createHash("sha256").update(contents).digest("hex");
}

const FLEET_PARTNER_ID = "fleet-qa-doc-001";

describe("SR-QA-SUPPLY-001 — C064 新增司機／車輛與主要操作入口", () => {
  it("creating a vehicle draft and reading it back through getSupplySubmissionDetail returns exactly what was written (各入口導向同一有效表單和回讀)", async () => {
    const { submissionService } = setupSupplyStack();
    const created = await submissionService.createVehicleDraft(
      FLEET_PARTNER_ID,
      "fleet-user-qa",
      {
        plateNo: "qa-entry-001",
        licenseType: "taxi",
        brand: "Toyota",
        model: "Corolla",
        modelYear: 2024,
        seatCount: 5,
        luggageCapacity: 2,
        businessArea: "taipei",
        supportedServiceProductCodes: ["realtime"],
        airportTransferEligible: false,
        fixedFareAllowed: true,
        currentDriverSubmissionId: null,
        doorCount: 4,
        color: "black",
      },
    );
    expect(created.submission.status).toBe("draft");
    // Plate is normalized (trim + uppercase) by the real service, not echoed
    // verbatim — proves this went through actual validation, not a fixture.
    expect(created.vehicleDraft?.plateNo).toBe("QA-ENTRY-001");

    const readBack = await submissionService.getSupplySubmissionDetail(
      FLEET_PARTNER_ID,
      created.submission.submissionId,
    );
    expect(readBack.submission.submissionId).toBe(
      created.submission.submissionId,
    );
    expect(readBack.vehicleDraft?.plateNo).toBe("QA-ENTRY-001");
    expect(readBack.vehicleDraft?.brand).toBe("Toyota");
    expect(readBack.vehicleDraft?.doorCount).toBe(4);
  });

  it("creating a driver draft and reading it back matches the submitted identity fields (各入口導向同一有效表單和回讀)", async () => {
    const { submissionService } = setupSupplyStack();
    const created = await submissionService.createDriverDraft(
      FLEET_PARTNER_ID,
      "fleet-user-qa",
      {
        name: "測試司機",
        mobile: "0900111222",
        professionalDriverLicenseNo: "PDL-QA-0001",
        professionalDriverLicenseExpiry: "2029-01-01",
        taxiDriverRegistrationNo: "TAXI-QA-0001",
        taxiDriverRegistrationArea: "taipei",
        taxiDriverRegistrationExpiry: "2029-01-01",
        supportedServiceProductCodes: ["realtime"],
        preferredVehicleSubmissionId: null,
      },
    );
    expect(created.submission.submissionType).toBe("driver_onboarding");
    const readBack = await submissionService.getSupplySubmissionDetail(
      FLEET_PARTNER_ID,
      created.submission.submissionId,
    );
    expect(readBack.driverDraft?.professionalDriverLicenseNo).toBe(
      "PDL-QA-0001",
    );
  });

  it("rejects a vehicle draft whose plate already exists on another draft or the canonical registry, rather than silently creating a duplicate (負向: 重複車牌)", async () => {
    const { submissionService } = setupSupplyStack();
    await submissionService.createVehicleDraft(
      FLEET_PARTNER_ID,
      "fleet-user-qa",
      {
        plateNo: "QA-DUP-01",
        licenseType: "taxi",
        brand: "Toyota",
        model: "Altis",
        modelYear: 2023,
        seatCount: 5,
        luggageCapacity: 2,
        businessArea: "taipei",
        supportedServiceProductCodes: ["realtime"],
        airportTransferEligible: false,
        fixedFareAllowed: true,
        currentDriverSubmissionId: null,
        doorCount: 4,
        color: "white",
      },
    );

    await expect(
      submissionService.createVehicleDraft(FLEET_PARTNER_ID, "fleet-user-qa", {
        plateNo: "qa-dup-01", // same plate, different case
        licenseType: "taxi",
        brand: "Nissan",
        model: "Sentra",
        modelYear: 2022,
        seatCount: 5,
        luggageCapacity: 2,
        businessArea: "taipei",
        supportedServiceProductCodes: ["realtime"],
        airportTransferEligible: false,
        fixedFareAllowed: true,
        currentDriverSubmissionId: null,
        doorCount: 4,
        color: "blue",
      }),
    ).rejects.toMatchObject({ code: "PLATE_ALREADY_EXISTS" });
  });
});

describe("SR-QA-SUPPLY-001 — C065 文件上傳→檢查→送件→退補／重送", () => {
  async function createVehicleSubmission(
    submissionService: SupplySubmissionService,
    plateNo: string,
  ) {
    return submissionService.createVehicleDraft(
      FLEET_PARTNER_ID,
      "fleet-user-qa",
      {
        plateNo,
        licenseType: "taxi",
        brand: "Toyota",
        model: "Camry",
        modelYear: 2024,
        seatCount: 4,
        luggageCapacity: 2,
        businessArea: "taipei",
        supportedServiceProductCodes: ["realtime"],
        airportTransferEligible: false,
        fixedFareAllowed: true,
        currentDriverSubmissionId: null,
        doorCount: 4,
        color: "grey",
      },
    );
  }

  it("uploads a document with a real SHA-256 checksum of actual file bytes, persists it pending review, and bumps the submission revision (真檔案 bytes)", async () => {
    const { submissionService, documentService } = setupSupplyStack();
    const created = await createVehicleSubmission(
      submissionService,
      "QA-DOC-001",
    );
    const submissionId = created.submission.submissionId;

    const fileContents = `%PDF-1.4 vehicle-registration-${submissionId}`;
    const checksum = realPdfChecksum(fileContents);

    const uploadUrl = await documentService.createUploadUrl(
      FLEET_PARTNER_ID,
      submissionId,
      "fleet-user-qa",
      {
        expectedRevisionNo: 1,
        documentType: "vehicle_registration",
        originalFileName: "registration.pdf",
        contentType: "application/pdf",
      },
    );
    expect(uploadUrl.objectKey).toContain(submissionId);

    const document = await documentService.confirmUpload(
      FLEET_PARTNER_ID,
      submissionId,
      "fleet-user-qa",
      {
        expectedRevisionNo: 1,
        documentType: "vehicle_registration",
        objectKey: uploadUrl.objectKey,
        originalFileName: "registration.pdf",
        contentType: "application/pdf",
        fileSize: Buffer.byteLength(fileContents),
        checksumSha256: checksum,
        effectiveFrom: "2026-01-01",
        effectiveUntil: "2029-01-01",
      },
    );
    expect(document.checksumSha256).toBe(checksum);
    expect(document.reviewStatus).toBe("pending");

    const detail = await submissionService.getSupplySubmissionDetail(
      FLEET_PARTNER_ID,
      submissionId,
    );
    expect(detail.submission.revisionNo).toBe(2); // bumped by confirmUpload
    expect(detail.documents.some((d) => d.checksumSha256 === checksum)).toBe(
      true,
    );
  });

  it("rejects a checksum that is not a well-formed 64-hex-char SHA-256 digest (負向: 假／格式錯誤簽章)", async () => {
    const { submissionService, documentService } = setupSupplyStack();
    const created = await createVehicleSubmission(
      submissionService,
      "QA-DOC-002",
    );
    const submissionId = created.submission.submissionId;
    const uploadUrl = await documentService.createUploadUrl(
      FLEET_PARTNER_ID,
      submissionId,
      "fleet-user-qa",
      {
        expectedRevisionNo: 1,
        documentType: "vehicle_registration",
        originalFileName: "registration.pdf",
        contentType: "application/pdf",
      },
    );

    await expect(
      documentService.confirmUpload(
        FLEET_PARTNER_ID,
        submissionId,
        "fleet-user-qa",
        {
          expectedRevisionNo: 1,
          documentType: "vehicle_registration",
          objectKey: uploadUrl.objectKey,
          originalFileName: "registration.pdf",
          contentType: "application/pdf",
          fileSize: 100,
          checksumSha256: "not-a-real-checksum",
        },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a confirmUpload whose metadata does not match the issued pre-signed intent, e.g. a different objectKey (負向: 假送達／偽造上傳意圖)", async () => {
    const { submissionService, documentService } = setupSupplyStack();
    const created = await createVehicleSubmission(
      submissionService,
      "QA-DOC-003",
    );
    const submissionId = created.submission.submissionId;
    await documentService.createUploadUrl(
      FLEET_PARTNER_ID,
      submissionId,
      "fleet-user-qa",
      {
        expectedRevisionNo: 1,
        documentType: "vehicle_registration",
        originalFileName: "registration.pdf",
        contentType: "application/pdf",
      },
    );

    await expect(
      documentService.confirmUpload(
        FLEET_PARTNER_ID,
        submissionId,
        "fleet-user-qa",
        {
          expectedRevisionNo: 1,
          documentType: "vehicle_registration",
          objectKey: "fleet-partner/forged/object-key.pdf",
          originalFileName: "registration.pdf",
          contentType: "application/pdf",
          fileSize: 100,
          checksumSha256: realPdfChecksum("forged"),
        },
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_URL_INVALID" });
  });

  it("a pre-signed upload intent that has expired (past its 15-minute window) is refused at confirm time (負向: 過期上傳憑證)", async () => {
    vi.useFakeTimers();
    try {
      const { submissionService, documentService } = setupSupplyStack();
      const created = await createVehicleSubmission(
        submissionService,
        "QA-DOC-004",
      );
      const submissionId = created.submission.submissionId;
      const uploadUrl = await documentService.createUploadUrl(
        FLEET_PARTNER_ID,
        submissionId,
        "fleet-user-qa",
        {
          expectedRevisionNo: 1,
          documentType: "vehicle_registration",
          originalFileName: "registration.pdf",
          contentType: "application/pdf",
        },
      );

      vi.advanceTimersByTime(16 * 60 * 1000); // past the 15 minute intent TTL

      await expect(
        documentService.confirmUpload(
          FLEET_PARTNER_ID,
          submissionId,
          "fleet-user-qa",
          {
            expectedRevisionNo: 1,
            documentType: "vehicle_registration",
            objectKey: uploadUrl.objectKey,
            originalFileName: "registration.pdf",
            contentType: "application/pdf",
            fileSize: 100,
            checksumSha256: realPdfChecksum("expired-intent"),
          },
        ),
      ).rejects.toMatchObject({ code: "UPLOAD_URL_INVALID" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("submitting a vehicle_onboarding submission with required documents missing is refused with DOCUMENT_REQUIRED, and succeeds once every required document (registration + insurance + a contract type) is uploaded (退補: 缺件擋送件)", async () => {
    const { submissionService, documentService } = setupSupplyStack();
    const created = await createVehicleSubmission(
      submissionService,
      "QA-DOC-005",
    );
    const submissionId = created.submission.submissionId;

    await expect(
      submissionService.submitSupplySubmission(
        FLEET_PARTNER_ID,
        submissionId,
        "fleet-user-qa",
        { expectedRevisionNo: 1 },
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_REQUIRED" });

    async function upload(
      documentType:
        | "vehicle_registration"
        | "insurance_policy"
        | "fleet_participation_contract",
      revisionAtCall: number,
    ) {
      const uploadUrl = await documentService.createUploadUrl(
        FLEET_PARTNER_ID,
        submissionId,
        "fleet-user-qa",
        {
          expectedRevisionNo: revisionAtCall,
          documentType,
          originalFileName: `${documentType}.pdf`,
          contentType: "application/pdf",
        },
      );
      const contents = `${documentType}-${submissionId}`;
      await documentService.confirmUpload(
        FLEET_PARTNER_ID,
        submissionId,
        "fleet-user-qa",
        {
          expectedRevisionNo: revisionAtCall,
          documentType,
          objectKey: uploadUrl.objectKey,
          originalFileName: `${documentType}.pdf`,
          contentType: "application/pdf",
          fileSize: Buffer.byteLength(contents),
          checksumSha256: realPdfChecksum(contents),
          effectiveFrom: "2026-01-01",
          effectiveUntil: "2029-01-01",
        },
      );
    }

    await upload("vehicle_registration", 1);
    await upload("insurance_policy", 2);
    await upload("fleet_participation_contract", 3);

    const detail = await submissionService.getSupplySubmissionDetail(
      FLEET_PARTNER_ID,
      submissionId,
    );
    expect(detail.submission.revisionNo).toBe(4);
    expect(detail.documents).toHaveLength(3);

    const submitted = await submissionService.submitSupplySubmission(
      FLEET_PARTNER_ID,
      submissionId,
      "fleet-user-qa",
      { expectedRevisionNo: 4 },
    );
    expect(submitted.submission.status).toBe("submitted");
    expect(submitted.submission.submittedBy).toBe("fleet-user-qa");
  });

  it("submitting is refused when an attached required document has already expired (effectiveUntil in the past), forcing a resubmission with a fresh document (退補: 過期文件擋送件)", async () => {
    const { submissionService, documentService } = setupSupplyStack();
    const created = await createVehicleSubmission(
      submissionService,
      "QA-DOC-006",
    );
    const submissionId = created.submission.submissionId;

    const uploadUrl = await documentService.createUploadUrl(
      FLEET_PARTNER_ID,
      submissionId,
      "fleet-user-qa",
      {
        expectedRevisionNo: 1,
        documentType: "vehicle_registration",
        originalFileName: "registration.pdf",
        contentType: "application/pdf",
      },
    );
    await documentService.confirmUpload(
      FLEET_PARTNER_ID,
      submissionId,
      "fleet-user-qa",
      {
        expectedRevisionNo: 1,
        documentType: "vehicle_registration",
        objectKey: uploadUrl.objectKey,
        originalFileName: "registration.pdf",
        contentType: "application/pdf",
        fileSize: 10,
        checksumSha256: realPdfChecksum("expired-doc"),
        effectiveFrom: "2020-01-01",
        effectiveUntil: "2020-06-01", // already expired relative to "today"
      },
    );

    await expect(
      submissionService.submitSupplySubmission(
        FLEET_PARTNER_ID,
        submissionId,
        "fleet-user-qa",
        { expectedRevisionNo: 2 },
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXPIRED" });
  });

  it("uploading against a stale expectedRevisionNo is rejected as a conflict rather than silently overwriting a concurrent edit (文件層級 revision 競態)", async () => {
    const { submissionService, documentService } = setupSupplyStack();
    const created = await createVehicleSubmission(
      submissionService,
      "QA-DOC-007",
    );
    const submissionId = created.submission.submissionId;

    // A first upload advances the submission revision from 1 to 2.
    const firstUploadUrl = await documentService.createUploadUrl(
      FLEET_PARTNER_ID,
      submissionId,
      "fleet-user-qa",
      {
        expectedRevisionNo: 1,
        documentType: "vehicle_registration",
        originalFileName: "registration.pdf",
        contentType: "application/pdf",
      },
    );
    await documentService.confirmUpload(
      FLEET_PARTNER_ID,
      submissionId,
      "fleet-user-qa",
      {
        expectedRevisionNo: 1,
        documentType: "vehicle_registration",
        objectKey: firstUploadUrl.objectKey,
        originalFileName: "registration.pdf",
        contentType: "application/pdf",
        fileSize: 10,
        checksumSha256: realPdfChecksum("first-upload"),
      },
    );

    // A second browser tab still believes the revision is 1 and tries to
    // start a second upload flow.
    await expect(
      documentService.createUploadUrl(
        FLEET_PARTNER_ID,
        submissionId,
        "fleet-user-qa",
        {
          expectedRevisionNo: 1,
          documentType: "insurance_policy",
          originalFileName: "insurance.pdf",
          contentType: "application/pdf",
        },
      ),
    ).rejects.toMatchObject({ code: "SUBMISSION_REVISION_CONFLICT" });
  });

  it("deleting a document from another fleet partner's scope is refused with FLEET_SCOPE_DENIED (負向: 跨租戶刪除文件)", async () => {
    const { submissionService, documentService } = setupSupplyStack();
    const created = await createVehicleSubmission(
      submissionService,
      "QA-DOC-008",
    );
    const submissionId = created.submission.submissionId;
    const uploadUrl = await documentService.createUploadUrl(
      FLEET_PARTNER_ID,
      submissionId,
      "fleet-user-qa",
      {
        expectedRevisionNo: 1,
        documentType: "vehicle_registration",
        originalFileName: "registration.pdf",
        contentType: "application/pdf",
      },
    );
    const document = await documentService.confirmUpload(
      FLEET_PARTNER_ID,
      submissionId,
      "fleet-user-qa",
      {
        expectedRevisionNo: 1,
        documentType: "vehicle_registration",
        objectKey: uploadUrl.objectKey,
        originalFileName: "registration.pdf",
        contentType: "application/pdf",
        fileSize: 10,
        checksumSha256: realPdfChecksum("scoped-doc"),
      },
    );

    await expect(
      documentService.deleteDocument(
        "some-other-fleet-partner",
        submissionId,
        document.documentId,
        "attacker-user",
        { expectedRevisionNo: 2 },
      ),
    ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
  });
});
