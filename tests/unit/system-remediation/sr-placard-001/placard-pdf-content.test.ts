import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminService } from "../../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { InMemoryDocumentArtifactStore } from "../../../../apps/api/src/common/document-artifacts";
import { ControlledDownloadController } from "../../../../apps/api/src/modules/controlled-download/controlled-download.controller";

type StreamableFileLike = {
  getStream(): NodeJS.ReadableStream;
  getHeaders(): { type?: string };
};

function createService(store: InMemoryDocumentArtifactStore) {
  const auditService = new AuditNotificationService();
  const platformAdminService = new PlatformAdminService(
    auditService,
    undefined,
    undefined,
    store,
  );
  return { auditService, platformAdminService };
}

function paramsOf(downloadUrl: string) {
  const query = new URLSearchParams(downloadUrl.split("?")[1]);
  return {
    signedAt: query.get("signed_at") ?? undefined,
    expiresAt: query.get("expires_at") ?? undefined,
    keyId: query.get("key_id") ?? undefined,
    manifestHash: query.get("manifest_hash") ?? undefined,
    sig: query.get("sig") ?? undefined,
    sigV: query.get("sig_v") ?? undefined,
  };
}

function resolve(
  controller: ControlledDownloadController,
  kind: string,
  subjectId: string,
  p: ReturnType<typeof paramsOf>,
) {
  return controller.resolve(
    kind,
    subjectId,
    p.signedAt,
    p.expiresAt,
    p.keyId,
    p.manifestHash,
    p.sig,
    p.sigV,
  );
}

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function extractPdfTextLines(bytes: Buffer): string[] {
  const content = bytes.toString("latin1");
  const lines: string[] = [];
  const tjPattern = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tjPattern.exec(content)) !== null) {
    const raw = match[1] ?? "";
    lines.push(
      raw
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\"),
    );
  }
  return lines;
}

describe("SR-PLACARD-001: vehicle placard renders a real, parseable PDF", () => {
  it("generates and downloads real placard PDF bytes matching public info disclosures line-for-line", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { auditService, platformAdminService } = createService(store);

    // Create a public info disclosure version
    const publicInfo = platformAdminService.createPublicInfoVersion({
      title: "Hualien County DRTS Public Service",
      callPhone: "0800-888-999",
      complaintPhone: "0800-111-222",
      callRateText: "By meter: base NT$85, NT$5 per 250m",
      fareText: "Elderly & disability discount: 50% subsidized",
      paymentMethodText: "Cash, EasyCard, iPASS, Credit Card",
      effectiveFrom: "2026-06-01T00:00:00.000Z",
      effectiveTo: "2026-12-31T23:59:59.000Z",
    });

    // Publish the public info version
    platformAdminService.publishPublicInfoVersion(
      publicInfo.versionId,
      {},
      "req-publish-public-info",
      "platform-admin-test",
    );

    // Generate a placard linked to this disclosure
    const placard = platformAdminService.generatePlacardVersion({
      versionCode: "placard-2026-hualien-q3",
      publicInfoVersionId: publicInfo.versionId,
      templateName: "seatback-hualien-standard",
    });

    expect(placard.artifactDownloadUrl).toBeTruthy();
    expect(placard.artifactManifestHash).toBeTruthy();

    // Verify round-trip download via ControlledDownloadController
    const controller = new ControlledDownloadController(store);
    const file = resolve(
      controller,
      "placard",
      placard.placardVersionId,
      paramsOf(placard.artifactDownloadUrl!),
    ) as StreamableFileLike;

    expect(file.getHeaders().type).toBe("application/pdf");
    const bytes = await drain(file.getStream());

    // Valid PDF-1.4 structure
    expect(bytes.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(bytes.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
    expect(bytes.toString("latin1")).toContain("stream\n");
    expect(bytes.toString("latin1")).toContain("endstream");
    expect(bytes.toString("latin1")).toContain("trailer");

    // Manifest hash matches actual byte content SHA-256
    const expectedSha256 = createHash("sha256").update(bytes).digest("hex");
    expect(placard.artifactManifestHash).toBe(expectedSha256);
    expect(placard.downloadMetadata?.manifestHash).toBe(expectedSha256);

    // Extract text from PDF content stream and assert disclosure lines
    const pdfLines = extractPdfTextLines(bytes);
    expect(pdfLines[0]).toBe("Vehicle Service Placard");
    expect(pdfLines.join("\n")).toContain(
      `Version Code: ${placard.versionCode}`,
    );
    expect(pdfLines.join("\n")).toContain(
      `Placard ID: ${placard.placardVersionId}`,
    );
    expect(pdfLines.join("\n")).toContain(
      `Template: ${placard.templateName}`,
    );
    expect(pdfLines.join("\n")).toContain(
      `Public Info Source: Hualien County DRTS Public Service (${publicInfo.versionId})`,
    );
    expect(pdfLines.join("\n")).toContain(
      `Booking / Dispatch Phone: 0800-888-999`,
    );
    expect(pdfLines.join("\n")).toContain(
      `Customer Complaint Hotline: 0800-111-222`,
    );
    expect(pdfLines.join("\n")).toContain(
      `Call Rate: By meter: base NT$85, NT$5 per 250m`,
    );
    expect(pdfLines.join("\n")).toContain(
      `Fare Rule: Elderly & disability discount: 50% subsidized`,
    );
    expect(pdfLines.join("\n")).toContain(
      `Payment Methods: Cash, EasyCard, iPASS, Credit Card`,
    );
    expect(pdfLines.join("\n")).toContain(
      `Effective Period: 2026-06-01T00:00:00.000Z to 2026-12-31T23:59:59.000Z`,
    );

    // Audit trail recorded
    const auditLogs = auditService.listAuditLogs();
    expect(
      auditLogs.some((log) => log.actionName === "generate_placard_version"),
    ).toBe(true);
  });

  it("safely encodes non-ASCII characters without corrupting PDF syntax or byte stream", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { platformAdminService } = createService(store);

    const publicInfo = platformAdminService.createPublicInfoVersion({
      title: "花蓮偏遠地區彈性運輸服務",
      callPhone: "0800-888-999",
      complaintPhone: "0800-111-222",
      callRateText: "全票依公告里程計費，博愛票半價",
      fareText: "夜間偏遠加成 20%",
      paymentMethodText: "現金與電子票證",
      effectiveFrom: "2026-07-01T00:00:00.000Z",
    });

    platformAdminService.publishPublicInfoVersion(
      publicInfo.versionId,
      {},
      "req-publish-cjk",
      "platform-admin-test",
    );

    const placard = platformAdminService.generatePlacardVersion({
      versionCode: "placard-2026-cjk-001",
      publicInfoVersionId: publicInfo.versionId,
      templateName: "seatback-cjk-default",
    });

    const stored = store.get("placard", placard.placardVersionId);
    expect(stored).not.toBeNull();

    // Ensure all bytes are single-byte Latin-1 code points [0x20, 0x7e] or newline
    for (const byte of stored!.bytes) {
      if (byte < 0x20 && byte !== 0x0a) continue;
      expect(byte).toBeLessThanOrEqual(0x7e);
    }

    const pdfLines = extractPdfTextLines(stored!.bytes);
    // Non-ASCII characters are replaced with '?' rather than corrupting PDF literal strings
    expect(pdfLines.join("\n")).toContain(`Version Code: ${placard.versionCode}`);
    expect(pdfLines.join("\n")).toContain("Booking / Dispatch Phone: 0800-888-999");
    expect(pdfLines.join("\n")).toContain("Customer Complaint Hotline: 0800-111-222");
    expect(pdfLines.join("\n")).toContain(
      `Effective Period: 2026-07-01T00:00:00.000Z to indefinite`,
    );
  });

  it("preserves seed placard bytes in store so demo placard is immediately downloadable", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { platformAdminService } = createService(store);

    const placards = platformAdminService.listPlacardVersions();
    const demoPlacard = placards.find(
      (p) => p.placardVersionId === "placard-demo-001",
    );
    expect(demoPlacard).toBeDefined();
    expect(demoPlacard?.artifactDownloadUrl).toBeTruthy();

    const controller = new ControlledDownloadController(store);
    const file = resolve(
      controller,
      "placard",
      demoPlacard!.placardVersionId,
      paramsOf(demoPlacard!.artifactDownloadUrl!),
    ) as StreamableFileLike;

    expect(file.getHeaders().type).toBe("application/pdf");
    const bytes = await drain(file.getStream());
    expect(bytes.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      demoPlacard!.artifactManifestHash,
    );
  });
});
