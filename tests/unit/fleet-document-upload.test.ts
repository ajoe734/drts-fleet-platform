import { describe, expect, it } from "vitest";
import { FleetPartnerCaseService } from "../../apps/api/src/modules/fleet-partner/fleet-partner-case.service";

describe("C125 real fleet uploads", () => {
  it("fails closed when durable storage is not provisioned", async () => {
    const service = new FleetPartnerCaseService();
    await expect(
      service.createAttachmentUploadUrl("METRO_FLEET", "cmp_0908", "owner", {
        fileName: "evidence.pdf",
        fileSize: 12,
        contentType: "application/pdf",
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_STORAGE_UNAVAILABLE" });
  });

  it("never fabricates bytes for a historical metadata-only attachment", async () => {
    const service = new FleetPartnerCaseService();
    const { attachments } = await service.getCaseDetail(
      "METRO_FLEET",
      "cmp_0908",
    );
    const attachment = attachments.find((item) => item.state === "done")!;
    const grant = await service.getAttachmentReadUrl(
      "METRO_FLEET",
      "cmp_0908",
      attachment.attachmentId,
    );
    const url = new URL(grant.downloadUrl, "https://local.invalid");
    await expect(
      service.verifyAndGetAttachmentForDownload(
        "METRO_FLEET",
        "cmp_0908",
        attachment.attachmentId,
        Number(url.searchParams.get("expiresAt")),
        url.searchParams.get("sig")!,
      ),
    ).rejects.toBeDefined();
  });
});
