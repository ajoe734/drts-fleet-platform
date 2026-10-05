import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FleetPartnerCaseService } from "../../apps/api/src/modules/fleet-partner/fleet-partner-case.service";
import { FleetPartnerController } from "../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { SupplyDocumentService } from "../../apps/api/src/modules/fleet-partner/supply-document.service";
import { SupplySubmissionService } from "../../apps/api/src/modules/fleet-partner/supply-submission.service";
import { SupplySubmissionRepository } from "../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { resolveDocumentArtifact } from "../../apps/api/src/common/document-artifacts";
import {
  byteStream,
  fleetIdentity,
  fleetStorageFixture,
} from "./helpers/fleet-document-fixture";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth/auth.types";

const bytes = Buffer.from("%PDF-1.4 actual evidence bytes");
const command = {
  fileName: "evidence.pdf",
  fileSize: bytes.length,
  contentType: "application/pdf",
};
const partner = "METRO_FLEET";
const caseId = "cmp_0908";
const identity = { ...fleetIdentity, partnerId: partner };
function caseFixture(
  mode: Parameters<typeof fleetStorageFixture>[0] = "clean",
) {
  const { storage, store } = fleetStorageFixture(mode);
  const service = new FleetPartnerCaseService(
    undefined,
    undefined,
    undefined,
    storage,
  );
  return { service, storage, store };
}
async function uploadCase(fixture = caseFixture()) {
  const intent = await fixture.service.createAttachmentUploadUrl(
    partner,
    caseId,
    "owner",
    command,
  );
  const uploaded = await fixture.service.uploadAttachmentContent(
    partner,
    caseId,
    intent.objectKey,
    byteStream(bytes),
    "application/octet-stream",
  );
  const record = await fixture.service.confirmAttachmentUpload(
    partner,
    caseId,
    "owner",
    { ...command, ...intent, checksumSha256: uploaded.checksumSha256 },
  );
  return { ...fixture, intent, record };
}
function controllerFor(
  service: FleetPartnerCaseService,
  documents?: SupplyDocumentService,
) {
  return new FleetPartnerController(
    undefined as never,
    undefined as never,
    documents as never,
    undefined as never,
    undefined as never,
    service,
  );
}
const response = () => ({ setHeader: vi.fn(), send: vi.fn() });

describe("C125 real fleet uploads", () => {
  it("fails closed when durable storage is not provisioned", async () => {
    await expect(
      new FleetPartnerCaseService().createAttachmentUploadUrl(
        partner,
        caseId,
        "owner",
        command,
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_STORAGE_UNAVAILABLE" });
  });
  it("never fabricates bytes for a historical metadata-only attachment", async () => {
    const { service } = caseFixture();
    const grant = await service.getAttachmentReadUrl(
      partner,
      caseId,
      "att-001",
    );
    const url = new URL(grant.downloadUrl, "https://local.invalid");
    await expect(
      service.verifyAndGetAttachmentForDownload(
        partner,
        caseId,
        "att-001",
        Number(url.searchParams.get("expiresAt")),
        url.searchParams.get("sig")!,
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });
  });
  it("persists real bytes and scan receipt, confirms and reads across service instances", async () => {
    const { storage, service, intent, record } = await uploadCase();
    expect(intent.uploadUrl).toMatch(/^\/api\/fleet-partner\//);
    const sibling = new FleetPartnerCaseService(
      undefined,
      undefined,
      undefined,
      storage,
    );
    expect(
      (await sibling.getCaseDetail(partner, caseId)).attachments,
    ).toContainEqual(record);
    const grant = await sibling.getAttachmentReadUrl(
      partner,
      caseId,
      record.attachmentId,
    );
    const params = new URL(grant.downloadUrl, "https://local.invalid")
      .searchParams;
    const downloaded = await sibling.verifyAndGetAttachmentForDownload(
      partner,
      caseId,
      record.attachmentId,
      Number(params.get("expiresAt")),
      params.get("sig")!,
    );
    expect(downloaded.fileContent).toEqual(bytes);
    expect(
      await service.confirmAttachmentUpload(partner, caseId, "owner", {
        ...intent,
        ...command,
      }),
    ).toEqual(record);
    const res = response();
    await controllerFor(sibling).downloadCaseAttachmentForReview(
      caseId,
      record.attachmentId,
      { ...identity, realm: "platform", actorType: "platform_admin" },
      res,
    );
    expect(res.send).toHaveBeenCalledWith(bytes);
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
  });
  it("rejects confirmation before any bytes or scan receipt exist", async () => {
    const { service } = caseFixture();
    const intent = await service.createAttachmentUploadUrl(
      partner,
      caseId,
      "owner",
      command,
    );
    await expect(
      service.confirmAttachmentUpload(partner, caseId, "owner", {
        ...command,
        ...intent,
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });
  });
  it.each(["infected", "offline", "mismatch"] as const)(
    "blocks %s scanner results and prevents confirmation/readback",
    async (mode) => {
      const { service, storage } = caseFixture(mode);
      const intent = await service.createAttachmentUploadUrl(
        partner,
        caseId,
        "owner",
        command,
      );
      await expect(
        service.uploadAttachmentContent(
          partner,
          caseId,
          intent.objectKey,
          byteStream(bytes),
          "application/octet-stream",
        ),
      ).rejects.toMatchObject({
        code:
          mode === "infected"
            ? "DOCUMENT_SCAN_REJECTED"
            : "DOCUMENT_SCANNER_UNAVAILABLE",
      });
      await expect(
        service.confirmAttachmentUpload(partner, caseId, "owner", {
          ...command,
          ...intent,
        }),
      ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });
      await expect(storage.read(intent.objectKey)).rejects.toMatchObject({
        code: "DOCUMENT_NOT_SCANNED",
      });
    },
  );
  it("binds size, name, type, parent and expiry to the intent", async () => {
    const { service, store } = caseFixture();
    const intent = await service.createAttachmentUploadUrl(
      partner,
      caseId,
      "owner",
      command,
    );
    await expect(
      service.confirmAttachmentUpload(partner, "cmp_0912", "owner", {
        ...command,
        ...intent,
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_URL_INVALID" });
    for (const changed of [
      { fileName: "other.pdf" },
      { fileSize: bytes.length + 1 },
      { contentType: "image/png" },
      { attachmentId: "other" },
    ]) {
      await expect(
        service.confirmAttachmentUpload(partner, caseId, "owner", {
          ...command,
          ...intent,
          ...changed,
        }),
      ).rejects.toMatchObject({ code: "UPLOAD_URL_INVALID" });
    }
    const stored = (await store.get("fleet-upload-intent", intent.objectKey))!;
    await store.put({
      kind: "fleet-upload-intent",
      subjectId: intent.objectKey,
      mimeType: "application/json",
      bytes: Buffer.from(
        JSON.stringify({
          ...JSON.parse(stored.bytes.toString()),
          expiresAt: new Date(0).toISOString(),
        }),
      ),
    });
    await expect(
      service.uploadAttachmentContent(
        partner,
        caseId,
        intent.objectKey,
        byteStream(bytes),
        "application/octet-stream",
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_URL_INVALID" });
  });
  it("enforces transport type, nonempty bytes and the scanner size limit", async () => {
    const { service } = caseFixture();
    for (const fileSize of [0, -1, NaN, 1.5, 10 * 1024 * 1024 + 1]) {
      await expect(
        service.createAttachmentUploadUrl(partner, caseId, "owner", {
          ...command,
          fileSize,
        }),
      ).rejects.toBeDefined();
    }
    const intent = await service.createAttachmentUploadUrl(
      partner,
      caseId,
      "owner",
      command,
    );
    await expect(
      service.uploadAttachmentContent(
        partner,
        caseId,
        intent.objectKey,
        byteStream(bytes),
        "application/pdf",
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_CONTENT_TYPE_INVALID" });
    await expect(
      service.uploadAttachmentContent(
        partner,
        caseId,
        intent.objectKey,
        byteStream(Buffer.alloc(0)),
        "application/octet-stream",
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });
    await expect(
      service.uploadAttachmentContent(
        partner,
        caseId,
        intent.objectKey,
        byteStream(Buffer.alloc(10 * 1024 * 1024 + 1)),
        "application/octet-stream",
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_TOO_LARGE" });
  });
  it("prevents overwrite after a clean scan and rejects tampered stored content", async () => {
    const { service, intent, store, storage } = await uploadCase();
    await expect(
      service.uploadAttachmentContent(
        partner,
        caseId,
        intent.objectKey,
        byteStream(Buffer.alloc(bytes.length, 42)),
        "application/octet-stream",
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });
    await store.put({
      kind: "fleet-upload-content",
      subjectId: intent.objectKey,
      mimeType: command.contentType,
      bytes: Buffer.from("tampered"),
    });
    await expect(storage.read(intent.objectKey)).rejects.toMatchObject({
      code: "DOCUMENT_CONTENT_MISMATCH",
    });
  });
  it("denies cross-partner uploads, confirmation, read URLs and cross-case reply attachments", async () => {
    const { service, intent, record } = await uploadCase();
    await expect(
      service.uploadAttachmentContent(
        "OTHER",
        caseId,
        intent.objectKey,
        byteStream(bytes),
        "application/octet-stream",
      ),
    ).rejects.toMatchObject({ code: "CASE_NOT_FLEET_SCOPED" });
    await expect(
      service.confirmAttachmentUpload("OTHER", caseId, "owner", {
        ...command,
        ...intent,
      }),
    ).rejects.toMatchObject({ code: "CASE_NOT_FLEET_SCOPED" });
    await expect(
      service.getAttachmentReadUrl("OTHER", caseId, record.attachmentId),
    ).rejects.toMatchObject({ code: "CASE_NOT_FLEET_SCOPED" });
    await expect(
      service.submitReply(partner, "cmp_0912", "owner", {
        content: "reply",
        attachmentIds: [record.attachmentId],
      }),
    ).rejects.toBeDefined();
  });
  it.each([
    null,
    { ...identity, partnerId: "OTHER" },
    ...["tenant", "driver", "ops", "system", "platform"].map((realm) => ({
      ...identity,
      realm,
    })),
  ])(
    "denies invalid identity %j on both content read and write routes",
    async (candidate) => {
      const { service, intent, record } = await uploadCase();
      const controller = controllerFor(service);
      await expect(
        controller.createPortalCaseAttachmentUploadUrl(
          partner,
          "owner",
          caseId,
          command,
          undefined,
          candidate as BootstrapRequestIdentity,
        ),
      ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
      await expect(
        controller.getPortalCaseAttachmentReadUrl(
          partner,
          caseId,
          record.attachmentId,
          undefined,
          candidate as BootstrapRequestIdentity,
        ),
      ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
      await expect(
        controller.confirmPortalCaseAttachmentUpload(
          partner,
          "owner",
          caseId,
          { ...command, ...intent },
          undefined,
          candidate as BootstrapRequestIdentity,
        ),
      ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
      await expect(
        controller.downloadCaseAttachmentForReview(
          caseId,
          record.attachmentId,
          candidate as BootstrapRequestIdentity,
          response(),
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_REVIEW_DENIED" });
    },
  );
  it.each(["fleet-demo-001", "fp-test-001", "metro_fleet"])(
    "does not treat %s as an alias for another partner",
    async (other) => {
      const { service } = caseFixture();
      await expect(
        service.createAttachmentUploadUrl(other, caseId, "owner", command),
      ).rejects.toMatchObject({ code: "CASE_NOT_FLEET_SCOPED" });
    },
  );
  it("does not expose fleet bytes through the public signed-download reader", async () => {
    const { store, intent } = await uploadCase();
    expect(
      await resolveDocumentArtifact(store, {
        kind: "fleet-upload-content",
        subjectId: intent.objectKey,
        manifestHash: createHash("sha256").update(bytes).digest("hex"),
      }),
    ).toEqual({ status: "not_found" });
  });
});

async function supplyFixture() {
  const { storage, store } = fleetStorageFixture();
  const repository = new SupplySubmissionRepository();
  const submissions = new SupplySubmissionService(
    repository,
    new RegulatoryRegistryService(
      undefined as never,
      undefined as never,
      undefined as never,
    ),
  );
  const service = new SupplyDocumentService(submissions, repository, storage);
  const draft = await submissions.createDriverDraft(partner, "owner", {
    name: "Upload test",
    mobile: "+886900111222",
    professionalDriverLicenseNo: "TEST-LICENSE",
    professionalDriverLicenseExpiry: "2027-12-31",
    taxiDriverRegistrationNo: "TEST-REG",
    taxiDriverRegistrationArea: "TPE",
    taxiDriverRegistrationExpiry: "2027-12-31",
    supportedServiceProductCodes: ["taxi_realtime"],
    preferredVehicleSubmissionId: null,
  });
  return {
    storage,
    store,
    repository,
    submissions,
    service,
    submissionId: draft.submission.submissionId,
  };
}

describe("C125 supply documents", () => {
  it.each([
    "professional_driver_license",
    "vehicle_registration",
    "insurance_policy",
    "other",
  ] as const)(
    "uploads, scans, confirms and reads %s with role isolation",
    async (documentType) => {
      const { service, submissionId } = await supplyFixture();
      const metadata = {
        documentType,
        originalFileName: "document.pdf",
        contentType: "application/pdf",
        expectedRevisionNo: 1,
      };
      const intent = await service.createUploadUrl(
        partner,
        submissionId,
        "owner",
        metadata,
      );
      const command = {
        ...metadata,
        objectKey: intent.objectKey,
        fileSize: bytes.length,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      };
      await expect(
        service.confirmUpload(partner, submissionId, "owner", command),
      ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });
      await service.uploadContent(
        partner,
        submissionId,
        intent.objectKey,
        byteStream(bytes),
        "application/octet-stream",
      );
      await expect(
        service.confirmUpload(partner, submissionId, "owner", {
          ...command,
          checksumSha256: "0".repeat(64),
        }),
      ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });
      const doc = await service.confirmUpload(
        partner,
        submissionId,
        "owner",
        command,
      );
      await expect(
        service.confirmUpload(partner, submissionId, "owner", {
          ...command,
          expectedRevisionNo: 2,
        }),
      ).rejects.toMatchObject({ code: "UPLOAD_URL_INVALID" });
      expect(
        (await service.downloadDocument(partner, submissionId, doc.documentId))
          .bytes,
      ).toEqual(bytes);
      await expect(
        service.downloadDocument("OTHER", submissionId, doc.documentId),
      ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
      const controller = controllerFor(caseFixture().service, service);
      const res = response();
      await controller.downloadSupplyDocumentForReview(
        submissionId,
        doc.documentId,
        { ...identity, realm: "platform", actorType: "platform_admin" },
        res,
      );
      expect(res.send).toHaveBeenCalledWith(bytes);
      await expect(
        controller.downloadSupplyDocument(
          partner,
          submissionId,
          doc.documentId,
          { ...identity, realm: "tenant" },
          response(),
        ),
      ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
    },
  );
});
