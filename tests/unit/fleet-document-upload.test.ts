import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
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
const pngBytes = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478da6338639c060003340166067b33000000000049454e44ae426082",
  "hex",
);
const jpegBytes = Buffer.from(
  "ffd8ffe000104a46494600010101006000600000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbfdffd9",
  "hex",
);
const photoFixtures = [
  {
    label: "PNG",
    fileName: "case-photo.png",
    contentType: "image/png" as const,
    alternateMime: "image/jpeg" as const,
    bytes: pngBytes,
    byteLength: 69,
    sha256: "2128be2646bad332aa1e97b2676d9f960a43ff1a9d80bc6baf42c2d131034b83",
  },
  {
    label: "JPEG",
    fileName: "case-photo.jpg",
    contentType: "image/jpeg" as const,
    alternateMime: "image/png" as const,
    bytes: jpegBytes,
    byteLength: 332,
    sha256: "2873aca24970d8ab5f392f0d694229e3b14cf65c9425cadd92a8295399576288",
  },
] as const;

function assertValidPhotoFixture(photo: (typeof photoFixtures)[number]) {
  expect(photo.bytes.length).toBe(photo.byteLength);
  expect(createHash("sha256").update(photo.bytes).digest("hex")).toBe(
    photo.sha256,
  );
  expect(photo.bytes.some((b) => b > 0x7f)).toBe(true);
  expect(
    Buffer.from(photo.bytes.toString("utf8"), "utf8").equals(photo.bytes),
  ).toBe(false);
  if (photo.contentType === "image/png") {
    expect(photo.bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(photo.bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(photo.bytes.readUInt32BE(16)).toBe(1);
    expect(photo.bytes.readUInt32BE(20)).toBe(1);
    expect(photo.bytes.subarray(37, 41).toString("ascii")).toBe("IDAT");
    const idatLen = photo.bytes.readUInt32BE(33);
    expect(inflateSync(photo.bytes.subarray(41, 41 + idatLen))).toEqual(
      Buffer.from([0x00, 0xcc, 0x33, 0x66]),
    );
    expect(photo.bytes.subarray(photo.bytes.length - 12)).toEqual(
      Buffer.from("0000000049454e44ae426082", "hex"),
    );
  } else {
    expect(photo.bytes.subarray(0, 4)).toEqual(
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    );
    expect(photo.bytes.subarray(6, 11).toString("ascii")).toBe("JFIF\0");
    expect(photo.bytes.includes(Buffer.from([0xff, 0xdb]))).toBe(true);
    expect(photo.bytes.includes(Buffer.from([0xff, 0xc0]))).toBe(true);
    expect(photo.bytes.includes(Buffer.from([0xff, 0xc4]))).toBe(true);
    expect(photo.bytes.includes(Buffer.from([0xff, 0xda]))).toBe(true);
    expect(photo.bytes.subarray(photo.bytes.length - 2)).toEqual(
      Buffer.from([0xff, 0xd9]),
    );
  }
}
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
  it.each(photoFixtures)(
    "completes Case $contentType binary lifecycle with scanner branches, owner/reviewer readback and UTF8/MIME integrity checks",
    async (photo) => {
      assertValidPhotoFixture(photo);
      const photoCommand = {
        fileName: photo.fileName,
        fileSize: photo.bytes.length,
        contentType: photo.contentType,
      };
      for (const mode of ["infected", "offline", "mismatch"] as const) {
        const blocked = caseFixture(mode);
        const blockedIntent = await blocked.service.createAttachmentUploadUrl(
          partner,
          caseId,
          "owner",
          photoCommand,
        );
        await expect(
          blocked.service.uploadAttachmentContent(
            partner,
            caseId,
            blockedIntent.objectKey,
            byteStream(photo.bytes),
            "application/octet-stream",
          ),
        ).rejects.toMatchObject({
          code:
            mode === "infected"
              ? "DOCUMENT_SCAN_REJECTED"
              : "DOCUMENT_SCANNER_UNAVAILABLE",
        });
        await expect(
          blocked.service.confirmAttachmentUpload(partner, caseId, "owner", {
            ...photoCommand,
            ...blockedIntent,
          }),
        ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });
        await expect(
          blocked.storage.read(blockedIntent.objectKey),
        ).rejects.toMatchObject({
          code: "DOCUMENT_NOT_SCANNED",
        });
      }

      const { service, storage, store } = caseFixture("clean");
      const intent = await service.createAttachmentUploadUrl(
        partner,
        caseId,
        "owner",
        photoCommand,
      );
      await expect(
        service.confirmAttachmentUpload(partner, caseId, "owner", {
          ...photoCommand,
          ...intent,
          checksumSha256: photo.sha256,
        }),
      ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });

      const uploaded = await service.uploadAttachmentContent(
        partner,
        caseId,
        intent.objectKey,
        byteStream(photo.bytes),
        "application/octet-stream",
      );
      expect(uploaded).toEqual({
        checksumSha256: photo.sha256,
        fileSize: photo.bytes.length,
        scanState: "clean",
      });

      const utf8Corrupted = Buffer.from(photo.bytes.toString("utf8"), "utf8");
      const utf8CorruptedSha = createHash("sha256")
        .update(utf8Corrupted)
        .digest("hex");
      expect(utf8CorruptedSha).not.toBe(photo.sha256);

      await expect(
        service.confirmAttachmentUpload(partner, caseId, "owner", {
          ...photoCommand,
          ...intent,
          checksumSha256: utf8CorruptedSha,
        }),
      ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });
      for (const badMime of ["application/pdf", photo.alternateMime]) {
        await expect(
          service.confirmAttachmentUpload(partner, caseId, "owner", {
            ...photoCommand,
            ...intent,
            contentType: badMime,
            checksumSha256: photo.sha256,
          }),
        ).rejects.toMatchObject({ code: "UPLOAD_URL_INVALID" });
      }

      const record = await service.confirmAttachmentUpload(
        partner,
        caseId,
        "owner",
        {
          ...photoCommand,
          ...intent,
          checksumSha256: photo.sha256,
        },
      );
      expect(record.contentType).toBe(photo.contentType);
      expect(record.fileSize).toBe(photo.bytes.length);
      expect(record.name).toBe(photo.fileName);

      const sibling = new FleetPartnerCaseService(
        undefined,
        undefined,
        undefined,
        storage,
      );
      const siblingController = controllerFor(sibling);
      expect(
        (await sibling.getCaseDetail(partner, caseId)).attachments,
      ).toContainEqual(record);
      expect(
        await resolveDocumentArtifact(store, {
          kind: "fleet-upload-content",
          subjectId: intent.objectKey,
          manifestHash: photo.sha256,
        }),
      ).toEqual({ status: "not_found" });

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
      expect(downloaded.fileContent.equals(photo.bytes)).toBe(true);
      expect(downloaded.fileContent.length).toBe(photo.byteLength);
      expect(
        createHash("sha256").update(downloaded.fileContent).digest("hex"),
      ).toBe(photo.sha256);
      expect(downloaded.attachment.contentType).toBe(photo.contentType);

      const ownerRes = response();
      await siblingController.downloadPortalCaseAttachment(
        partner,
        caseId,
        record.attachmentId,
        params.get("expiresAt")!,
        params.get("sig")!,
        ownerRes,
        identity,
      );
      expect(ownerRes.send).toHaveBeenCalledWith(photo.bytes);
      expect(ownerRes.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        photo.contentType,
      );
      expect(ownerRes.setHeader).toHaveBeenCalledWith(
        "Content-Length",
        photo.byteLength,
      );

      const reviewRes = response();
      await siblingController.downloadCaseAttachmentForReview(
        caseId,
        record.attachmentId,
        { ...identity, realm: "platform", actorType: "platform_admin" },
        reviewRes,
      );
      expect(reviewRes.send).toHaveBeenCalledWith(photo.bytes);
      expect(reviewRes.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        photo.contentType,
      );
      expect(reviewRes.setHeader).toHaveBeenCalledWith(
        "Content-Length",
        photo.byteLength,
      );
      expect(reviewRes.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "private, no-store",
      );

      await expect(
        sibling.getAttachmentReadUrl("OTHER", caseId, record.attachmentId),
      ).rejects.toMatchObject({ code: "CASE_NOT_FLEET_SCOPED" });
      await expect(
        siblingController.getPortalCaseAttachmentReadUrl(
          partner,
          caseId,
          record.attachmentId,
          undefined,
          { ...identity, realm: "tenant" },
        ),
      ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
      await expect(
        siblingController.downloadCaseAttachmentForReview(
          caseId,
          record.attachmentId,
          identity,
          response(),
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_REVIEW_DENIED" });

      await store.put({
        kind: "fleet-upload-content",
        subjectId: intent.objectKey,
        mimeType: photo.contentType,
        bytes: utf8Corrupted,
      });
      await expect(
        sibling.verifyAndGetAttachmentForDownload(
          partner,
          caseId,
          record.attachmentId,
          Number(params.get("expiresAt")),
          params.get("sig")!,
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });

      await store.put({
        kind: "fleet-upload-content",
        subjectId: intent.objectKey,
        mimeType: "application/pdf",
        bytes: photo.bytes,
      });
      await expect(
        sibling.verifyAndGetAttachmentForDownload(
          partner,
          caseId,
          record.attachmentId,
          Number(params.get("expiresAt")),
          params.get("sig")!,
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });
    },
  );
});

async function supplyFixture(
  mode: Parameters<typeof fleetStorageFixture>[0] = "clean",
) {
  const { storage, store } = fleetStorageFixture(mode);
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
  it.each(photoFixtures)(
    "uploads, scans, confirms and reads Supply other $contentType binary with scanner branches, owner/reviewer readback and UTF8/MIME integrity checks",
    async (photo) => {
      assertValidPhotoFixture(photo);
      const metadata = {
        documentType: "other" as const,
        originalFileName: photo.fileName,
        contentType: photo.contentType,
        expectedRevisionNo: 1,
      };
      for (const mode of ["infected", "offline", "mismatch"] as const) {
        const blocked = await supplyFixture(mode);
        const blockedIntent = await blocked.service.createUploadUrl(
          partner,
          blocked.submissionId,
          "owner",
          metadata,
        );
        await expect(
          blocked.service.uploadContent(
            partner,
            blocked.submissionId,
            blockedIntent.objectKey,
            byteStream(photo.bytes),
            "application/octet-stream",
          ),
        ).rejects.toMatchObject({
          code:
            mode === "infected"
              ? "DOCUMENT_SCAN_REJECTED"
              : "DOCUMENT_SCANNER_UNAVAILABLE",
        });
        await expect(
          blocked.service.confirmUpload(
            partner,
            blocked.submissionId,
            "owner",
            {
              ...metadata,
              objectKey: blockedIntent.objectKey,
              fileSize: photo.bytes.length,
              checksumSha256: photo.sha256,
            },
          ),
        ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });
      }

      const { service, submissions, repository, storage, store, submissionId } =
        await supplyFixture("clean");
      const intent = await service.createUploadUrl(
        partner,
        submissionId,
        "owner",
        metadata,
      );
      const confirmCommand = {
        ...metadata,
        objectKey: intent.objectKey,
        fileSize: photo.bytes.length,
        checksumSha256: photo.sha256,
      };
      await expect(
        service.confirmUpload(partner, submissionId, "owner", confirmCommand),
      ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });

      const uploaded = await service.uploadContent(
        partner,
        submissionId,
        intent.objectKey,
        byteStream(photo.bytes),
        "application/octet-stream",
      );
      expect(uploaded).toEqual({
        checksumSha256: photo.sha256,
        fileSize: photo.bytes.length,
        scanState: "clean",
      });

      const utf8Corrupted = Buffer.from(photo.bytes.toString("utf8"), "utf8");
      const utf8CorruptedSha = createHash("sha256")
        .update(utf8Corrupted)
        .digest("hex");
      await expect(
        service.confirmUpload(partner, submissionId, "owner", {
          ...confirmCommand,
          checksumSha256: utf8CorruptedSha,
        }),
      ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });
      for (const badMime of ["application/pdf", photo.alternateMime]) {
        await expect(
          service.confirmUpload(partner, submissionId, "owner", {
            ...confirmCommand,
            contentType: badMime,
          }),
        ).rejects.toMatchObject({ code: "UPLOAD_URL_INVALID" });
      }

      const doc = await service.confirmUpload(
        partner,
        submissionId,
        "owner",
        confirmCommand,
      );
      expect(doc.documentType).toBe("other");
      expect(doc.contentType).toBe(photo.contentType);
      expect(doc.fileSize).toBe(photo.bytes.length);
      expect(doc.checksumSha256).toBe(photo.sha256);

      await expect(
        service.confirmUpload(partner, submissionId, "owner", {
          ...confirmCommand,
          expectedRevisionNo: 2,
        }),
      ).rejects.toMatchObject({ code: "UPLOAD_URL_INVALID" });

      const siblingService = new SupplyDocumentService(
        submissions,
        repository,
        storage,
      );
      const readback = await siblingService.downloadDocument(
        partner,
        submissionId,
        doc.documentId,
      );
      expect(readback.bytes.equals(photo.bytes)).toBe(true);
      expect(readback.contentType).toBe(photo.contentType);
      expect(readback.fileSize).toBe(photo.byteLength);
      expect(readback.checksumSha256).toBe(photo.sha256);

      const controller = controllerFor(caseFixture().service, siblingService);
      const ownerRes = response();
      await controller.downloadSupplyDocument(
        partner,
        submissionId,
        doc.documentId,
        identity,
        ownerRes,
      );
      expect(ownerRes.send).toHaveBeenCalledWith(photo.bytes);
      expect(ownerRes.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        photo.contentType,
      );
      expect(ownerRes.setHeader).toHaveBeenCalledWith(
        "Content-Length",
        photo.byteLength,
      );

      const reviewRes = response();
      await controller.downloadSupplyDocumentForReview(
        submissionId,
        doc.documentId,
        { ...identity, realm: "platform", actorType: "platform_admin" },
        reviewRes,
      );
      expect(reviewRes.send).toHaveBeenCalledWith(photo.bytes);
      expect(reviewRes.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        photo.contentType,
      );
      expect(reviewRes.setHeader).toHaveBeenCalledWith(
        "Content-Length",
        photo.byteLength,
      );

      await expect(
        siblingService.downloadDocument("OTHER", submissionId, doc.documentId),
      ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
      await expect(
        controller.downloadSupplyDocument(
          partner,
          submissionId,
          doc.documentId,
          { ...identity, realm: "tenant" },
          response(),
        ),
      ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
      await expect(
        controller.downloadSupplyDocumentForReview(
          submissionId,
          doc.documentId,
          identity,
          response(),
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_REVIEW_DENIED" });

      await store.put({
        kind: "fleet-upload-content",
        subjectId: intent.objectKey,
        mimeType: photo.contentType,
        bytes: utf8Corrupted,
      });
      await expect(
        siblingService.downloadDocument(partner, submissionId, doc.documentId),
      ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });

      await store.put({
        kind: "fleet-upload-content",
        subjectId: intent.objectKey,
        mimeType: "application/pdf",
        bytes: photo.bytes,
      });
      await expect(
        siblingService.downloadDocument(partner, submissionId, doc.documentId),
      ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });
    },
  );
});
