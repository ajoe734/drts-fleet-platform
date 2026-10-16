import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { createControlledDownloadMetadata } from "../../../apps/api/src/common/controlled-download";
import { InMemoryDocumentArtifactStore } from "../../../apps/api/src/common/document-artifacts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ControlledDownloadController } from "../../../apps/api/src/modules/controlled-download/controlled-download.controller";
import { PlatformAdminController } from "../../../apps/api/src/modules/platform-admin/platform-admin.controller";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";

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

function resolveDownload(
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

async function extractPdfPagesWithPdfJs(pdfBuffer: Buffer): Promise<string[]> {
  const task = getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: false,
    disableFontFace: true,
  });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageLines: string[] = [];
      let currentLine = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        currentLine += item.str;
        if (item.hasEOL) {
          pageLines.push(currentLine);
          currentLine = "";
        }
      }
      if (currentLine.length > 0) {
        pageLines.push(currentLine);
      }
      pages.push(pageLines.join("\n"));
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/**
 * Independently parses PDF xref offsets, trailer, ToUnicode CMap mappings,
 * and content stream Tj operators (`(...) Tj` and `<...> Tj`) from raw bytes.
 */
function inspectPdfStructureAndContent(bytes: Buffer) {
  const raw = bytes.toString("latin1");
  const header = bytes.subarray(0, 8).toString("latin1");
  const endsWithEof = raw.trimEnd().endsWith("%%EOF");

  const startxrefMatch = /startxref\n(\d+)\n%%EOF\s*$/.exec(raw);
  const startxrefOffset = startxrefMatch ? Number(startxrefMatch[1]) : -1;
  const xrefStartsAtOffset =
    startxrefOffset >= 0 &&
    bytes.subarray(startxrefOffset, startxrefOffset + 5).toString("latin1") ===
      "xref\n";

  const xrefSection = startxrefOffset >= 0 ? raw.slice(startxrefOffset) : "";
  const xrefEntries: Array<{ id: number; offset: number }> = [];
  const entryRegex = /^(\d{10}) 00000 n $/gm;
  let entryMatch: RegExpExecArray | null;
  let objId = 1;
  while ((entryMatch = entryRegex.exec(xrefSection)) !== null) {
    xrefEntries.push({ id: objId, offset: Number(entryMatch[1]) });
    objId += 1;
  }

  const allOffsetsValid =
    xrefEntries.length > 0 &&
    xrefEntries.every(({ id, offset }) => {
      const expectedPrefix = `${id} 0 obj\n`;
      return (
        bytes
          .subarray(offset, offset + expectedPrefix.length)
          .toString("latin1") === expectedPrefix
      );
    });

  // Parse ToUnicode CMap bfchar mappings if present
  const toUnicodeMap = new Map<number, string>();
  const bfcharBlockRegex = /beginbfchar\s+([\s\S]*?)endbfchar/g;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = bfcharBlockRegex.exec(raw)) !== null) {
    const block = blockMatch[1] ?? "";
    const pairRegex = /<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g;
    let pairMatch: RegExpExecArray | null;
    while ((pairMatch = pairRegex.exec(block)) !== null) {
      const code = Number.parseInt(pairMatch[1]!, 16);
      const hexTarget = pairMatch[2]!;
      const codeUnits: number[] = [];
      for (let i = 0; i < hexTarget.length; i += 4) {
        codeUnits.push(Number.parseInt(hexTarget.slice(i, i + 4), 16));
      }
      toUnicodeMap.set(code, String.fromCharCode(...codeUnits));
    }
  }

  // Decode Tj operators across content streams in order
  const lines: string[] = [];
  const tjTokenRegex = /(?:\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f]+)>)\s*Tj/g;
  let tjMatch: RegExpExecArray | null;
  while ((tjMatch = tjTokenRegex.exec(raw)) !== null) {
    if (tjMatch[1] !== undefined) {
      lines.push(
        tjMatch[1]
          .replace(/\\\(/g, "(")
          .replace(/\\\)/g, ")")
          .replace(/\\\\/g, "\\"),
      );
    } else if (tjMatch[2] !== undefined) {
      const hex = tjMatch[2];
      let decoded = "";
      for (let i = 0; i < hex.length; i += 4) {
        const code = Number.parseInt(hex.slice(i, i + 4), 16);
        decoded += toUnicodeMap.get(code) ?? String.fromCharCode(code);
      }
      lines.push(decoded);
    }
  }

  return {
    header,
    endsWithEof,
    startxrefOffset,
    xrefStartsAtOffset,
    xrefEntryCount: xrefEntries.length,
    allOffsetsValid,
    toUnicodeMap,
    lines,
  };
}

async function expectApiError(fn: () => unknown, status: number, code: string) {
  try {
    await fn();
    expect.unreachable(
      `Expected function to throw ApiRequestError with code ${code}`,
    );
  } catch (err) {
    expect(err).toBeInstanceOf(ApiRequestError);
    const apiErr = err as ApiRequestError;
    expect(apiErr.getStatus()).toBe(status);
    expect(apiErr.code).toBe(code);
  }
}

describe("PLACARD-PRINTABLE-CHINESE-CONTENT-20261015: printable placard PDF preserves readable Chinese public-info content", () => {
  it("preserves readable Chinese title, call rate, fare rule, and payment methods in the canonical seed placard PDF via ControlledDownloadController", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { platformAdminService } = createService(store);
    await platformAdminService.onModuleInit();

    const controller = new ControlledDownloadController(store);
    const placards = await platformAdminService.listPlacardVersions();
    const demoPlacard = placards.find(
      (p) => p.placardVersionId === "placard-demo-001",
    );
    expect(demoPlacard).toBeDefined();
    expect(demoPlacard?.artifactDownloadUrl).toBeTruthy();

    const file = (await resolveDownload(
      controller,
      "placard",
      demoPlacard!.placardVersionId,
      paramsOf(demoPlacard!.artifactDownloadUrl!),
    )) as StreamableFileLike;

    expect(file.getHeaders().type).toBe("application/pdf");
    const bytes = await drain(file.getStream());
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      demoPlacard!.artifactManifestHash,
    );

    const inspected = inspectPdfStructureAndContent(bytes);
    expect(inspected.header).toBe("%PDF-1.4");
    expect(inspected.endsWithEof).toBe(true);
    expect(inspected.xrefStartsAtOffset).toBe(true);
    expect(inspected.allOffsetsValid).toBe(true);

    const pages = await extractPdfPagesWithPdfJs(bytes);
    expect(pages).toHaveLength(1);
    const fullText = pages.join("\n");

    expect(fullText).toContain("Vehicle Service Placard");
    expect(fullText).toContain("Version Code: placard-2026-q2");
    expect(fullText).toContain("Placard ID: placard-demo-001");
    expect(fullText).toContain("Template: seatback-default");
    expect(fullText).toContain(
      "Public Info Source: 2026 Q2 公開資訊版 (public-info-demo-001)",
    );
    expect(fullText).toContain("Source Status: published");
    expect(fullText).toContain("Booking / Dispatch Phone: 0800-000-123");
    expect(fullText).toContain("Customer Complaint Hotline: 0800-000-456");
    expect(fullText).toContain("Call Rate: 依表計費");
    expect(fullText).toContain("Fare Rule: 夜間與偏遠加成依公告");
    expect(fullText).toContain("Payment Methods: 現金、信用卡、企業簽單");
    expect(fullText).toContain(
      "Effective Period: 2026-04-01T00:00:00.000Z to indefinite",
    );
    expect(fullText).toContain("Published At: 2026-04-01T00:00:00.000Z");
    expect(fullText).toContain("Generated At: 2026-03-25T00:00:00.000Z");
    expect(fullText).not.toContain("????");

    expect(inspected.lines).toContain(
      "Public Info Source: 2026 Q2 公開資訊版 (public-info-demo-001)",
    );
    expect(inspected.lines).toContain("Call Rate: 依表計費");
    expect(inspected.lines).toContain("Fare Rule: 夜間與偏遠加成依公告");
    expect(inspected.lines).toContain(
      "Payment Methods: 現金、信用卡、企業簽單",
    );
  });

  it("renders and downloads Chinese public-info disclosures with Chinese punctuation, mixed ASCII/digits, phones, and effective dates", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { platformAdminService } = createService(store);
    const controller = new ControlledDownloadController(store);

    const publicInfo = platformAdminService.createPublicInfoVersion({
      title: "花蓮縣 DRTS 智慧公共運輸服務（2026下半年度公告）",
      callPhone: "0800-888-999",
      complaintPhone: "0800-111-222",
      callRateText: "依表計費：起跳 1.25 公里 NT$85，續跳每 200 公尺 NT$5",
      fareText:
        "夜間加成（23:00-06:00）加收 20%；偏遠山區與敬老愛心卡「博愛票」享 50% 補貼",
      paymentMethodText:
        "現金、信用卡（Visa/MasterCard/JCB）、悠遊卡、一卡通、企業簽單",
      effectiveFrom: "2026-07-01T00:00:00.000Z",
      effectiveTo: "2026-12-31T23:59:59.000Z",
    });

    const publishedInfo = platformAdminService.publishPublicInfoVersion(
      publicInfo.versionId,
      {},
      "req-publish-cjk-info",
      "platform-admin-cjk",
    );

    const placard = await platformAdminService.generatePlacardVersion({
      versionCode: "placard-2026-hualien-cjk",
      publicInfoVersionId: publishedInfo.versionId,
      templateName: "seatback-hualien-cjk",
    });

    const file = (await resolveDownload(
      controller,
      "placard",
      placard.placardVersionId,
      paramsOf(placard.artifactDownloadUrl!),
    )) as StreamableFileLike;

    expect(file.getHeaders().type).toBe("application/pdf");
    const bytes = await drain(file.getStream());

    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(placard.artifactManifestHash).toBe(sha);
    expect(placard.downloadMetadata?.manifestHash).toBe(sha);

    const inspected = inspectPdfStructureAndContent(bytes);
    expect(inspected.allOffsetsValid).toBe(true);
    expect(inspected.xrefStartsAtOffset).toBe(true);
    expect(inspected.endsWithEof).toBe(true);

    // Every Chinese character in the disclosure must have an explicit ToUnicode mapping
    for (const ch of "花蓮縣智慧公共運輸服務依表計費起跳公里續跳公尺夜間加成偏遠山區敬老愛心卡博愛票補貼現金信用卡悠遊卡一卡通企業簽單，、：；（Jw）「」") {
      if (ch.charCodeAt(0) > 0x7e) {
        expect(inspected.toUnicodeMap.get(ch.charCodeAt(0))).toBe(ch);
      }
    }

    const pages = await extractPdfPagesWithPdfJs(bytes);
    const extractedText = pages.join("\n");

    expect(extractedText).toContain(`Version Code: ${placard.versionCode}`);
    expect(extractedText).toContain(`Placard ID: ${placard.placardVersionId}`);
    expect(extractedText).toContain(
      `Public Info Source: 花蓮縣 DRTS 智慧公共運輸服務（2026下半年度公告） (${publishedInfo.versionId})`,
    );
    expect(extractedText).toContain("Booking / Dispatch Phone: 0800-888-999");
    expect(extractedText).toContain("Customer Complaint Hotline: 0800-111-222");
    expect(extractedText).toContain(
      "Call Rate: 依表計費：起跳 1.25 公里 NT$85，續跳每 200 公尺 NT$5",
    );
    expect(extractedText).toContain(
      "Fare Rule: 夜間加成（23:00-06:00）加收 20%；偏遠山區與敬老愛心卡「博愛票」享 50% 補貼",
    );
    expect(extractedText).toContain(
      "Payment Methods: 現金、信用卡（Visa/MasterCard/JCB）、悠遊卡、一卡通、企業簽單",
    );
    expect(extractedText).toContain(
      "Effective Period: 2026-07-01T00:00:00.000Z to 2026-12-31T23:59:59.000Z",
    );
    expect(extractedText).not.toContain("????");
  });

  it("preserves escaped parentheses/backslashes and paginates multi-page Chinese content across valid PDF pages", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { platformAdminService } = createService(store);
    const controller = new ControlledDownloadController(store);

    const multiPageFareLines = Array.from(
      { length: 45 },
      (_, idx) =>
        `第 ${idx + 1} 區段費率 (Zone\\${idx + 1})：核定起跳 NT$${85 + idx}，偏遠補貼 50%`,
    ).join("\n");

    const publicInfo = platformAdminService.createPublicInfoVersion({
      title: "跨頁費率與括號斜線測試 (A\\B)",
      callPhone: "0800-555-666 (轉\\9)",
      complaintPhone: "0800-777-888 (申訴\\專線)",
      callRateText: "計費公式 (Base\\Rate): 起跳 NT$85 + (續程\\200m) * NT$5",
      fareText: multiPageFareLines,
      paymentMethodText: "現金 (Cash\\TWD)、電子票證 (IC\\Card)",
      effectiveFrom: "2026-08-01T00:00:00.000Z",
    });

    const placard = await platformAdminService.generatePlacardVersion({
      versionCode: "placard-multipage-escape-01",
      publicInfoVersionId: publicInfo.versionId,
      templateName: "seatback-(v1\\2)-standard",
    });

    const file = (await resolveDownload(
      controller,
      "placard",
      placard.placardVersionId,
      paramsOf(placard.artifactDownloadUrl!),
    )) as StreamableFileLike;

    const bytes = await drain(file.getStream());
    const inspected = inspectPdfStructureAndContent(bytes);
    expect(inspected.allOffsetsValid).toBe(true);
    expect(inspected.xrefStartsAtOffset).toBe(true);
    expect(inspected.endsWithEof).toBe(true);

    // Pure-ASCII line with parentheses and backslash must be literally escaped in PDF stream
    expect(bytes.toString("latin1")).toContain(
      "(Template: seatback-\\(v1\\\\2\\)-standard) Tj",
    );

    const pages = await extractPdfPagesWithPdfJs(bytes);
    expect(pages.length).toBeGreaterThanOrEqual(2);

    const allPagesText = pages.join("\n");
    expect(allPagesText).toContain("Template: seatback-(v1\\2)-standard");
    expect(allPagesText).toContain(
      `Public Info Source: 跨頁費率與括號斜線測試 (A\\B) (${publicInfo.versionId})`,
    );
    expect(allPagesText).toContain(
      "Call Rate: 計費公式 (Base\\Rate): 起跳 NT$85 + (續程\\200m) * NT$5",
    );
    expect(allPagesText).toContain(
      "第 1 區段費率 (Zone\\1)：核定起跳 NT$85，偏遠補貼 50%",
    );
    expect(allPagesText).toContain(
      "第 45 區段費率 (Zone\\45)：核定起跳 NT$129，偏遠補貼 50%",
    );
    expect(pages[1]).toContain(
      "第 45 區段費率 (Zone\\45)：核定起跳 NT$129，偏遠補貼 50%",
    );
  });

  it("retains deterministic byte hashes across link expiry renewal, publish re-render, and honest negative denials", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { platformAdminService } = createService(store);
    const controller = new ControlledDownloadController(store);
    const adminController = new PlatformAdminController(platformAdminService);

    const draftInfo = platformAdminService.createPublicInfoVersion({
      title: "臺東縣預約彈性公車（DRTS）費率公告",
      callPhone: "0800-321-654",
      complaintPhone: "0800-654-321",
      callRateText: "依核定里程計費：基本里程 8 公里內 NT$100",
      fareText: "持敬老卡、愛心卡全額免費；學生卡享 75 折優惠",
      paymentMethodText: "現金、悠遊卡、一卡通、TWQR 行動支付",
      effectiveFrom: "2026-09-01T00:00:00.000Z",
    });

    const draftPlacard = await platformAdminService.generatePlacardVersion({
      versionCode: "placard-taitung-lifecycle-01",
      publicInfoVersionId: draftInfo.versionId,
      templateName: "seatback-taitung",
    });
    expect(draftPlacard.publishedAt).toBeNull();

    const initialUrl = draftPlacard.artifactDownloadUrl!;
    const initialParams = paramsOf(initialUrl);
    const initialHash = draftPlacard.artifactManifestHash!;

    const initialBytes = await drain(
      (
        (await resolveDownload(
          controller,
          "placard",
          draftPlacard.placardVersionId,
          initialParams,
        )) as StreamableFileLike
      ).getStream(),
    );
    const initialText = (await extractPdfPagesWithPdfJs(initialBytes)).join(
      "\n",
    );
    expect(initialText).toContain("Published At: Draft");
    expect(initialText).toContain(
      "Call Rate: 依核定里程計費：基本里程 8 公里內 NT$100",
    );

    // Advance clock past 15-minute link expiry
    const futureTime = Date.parse(initialParams.expiresAt!) + 5 * 60 * 1000;
    vi.setSystemTime(futureTime);
    try {
      await expectApiError(
        () =>
          resolveDownload(
            controller,
            "placard",
            draftPlacard.placardVersionId,
            initialParams,
          ),
        410,
        "CONTROLLED_DOWNLOAD_EXPIRED",
      );

      // Re-reading refreshes signed URL over the exact same immutable hash and bytes
      const refreshedPlacard = await platformAdminService.getPlacardVersion(
        draftPlacard.placardVersionId,
      );
      expect(refreshedPlacard.artifactManifestHash).toBe(initialHash);
      expect(refreshedPlacard.artifactDownloadUrl).not.toBe(initialUrl);

      const refreshedBytes = await drain(
        (
          (await resolveDownload(
            controller,
            "placard",
            refreshedPlacard.placardVersionId,
            paramsOf(refreshedPlacard.artifactDownloadUrl!),
          )) as StreamableFileLike
        ).getStream(),
      );
      expect(refreshedBytes.equals(initialBytes)).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    // Publish updates Published At and manifest hash while preserving Chinese text
    const publishedPlacard = await platformAdminService.publishPlacardVersion(
      draftPlacard.placardVersionId,
      {},
      "req-pub-taitung",
      "admin-taitung",
    );
    expect(publishedPlacard.publishedAt).toBeTruthy();
    expect(publishedPlacard.artifactManifestHash).not.toBe(initialHash);

    const publishedBytes = await drain(
      (
        (await resolveDownload(
          controller,
          "placard",
          publishedPlacard.placardVersionId,
          paramsOf(publishedPlacard.artifactDownloadUrl!),
        )) as StreamableFileLike
      ).getStream(),
    );
    const publishedText = (await extractPdfPagesWithPdfJs(publishedBytes)).join(
      "\n",
    );
    expect(publishedText).toContain(
      `Published At: ${publishedPlacard.publishedAt}`,
    );
    expect(publishedText).toContain(
      "Fare Rule: 持敬老卡、愛心卡全額免費；學生卡享 75 折優惠",
    );
    expect(publishedText).toContain(
      "Payment Methods: 現金、悠遊卡、一卡通、TWQR 行動支付",
    );

    // Negative denials: duplicate publish, duplicate version code, retired source, tampered sig, content mismatch, unauthorized publish
    await expectApiError(
      () =>
        platformAdminService.publishPlacardVersion(
          draftPlacard.placardVersionId,
          {},
          "req-dup-pub",
          "admin-taitung",
        ),
      409,
      "PLACARD_VERSION_ALREADY_PUBLISHED",
    );

    await expectApiError(
      () =>
        platformAdminService.generatePlacardVersion({
          versionCode: "PLACARD-TAITUNG-LIFECYCLE-01",
          publicInfoVersionId: draftInfo.versionId,
          templateName: "seatback-taitung",
        }),
      409,
      "PLACARD_VERSION_CODE_CONFLICT",
    );

    platformAdminService.publishPublicInfoVersion(
      draftInfo.versionId,
      {},
      "req-pub-info-1",
      "admin-taitung",
    );
    const successorInfo = platformAdminService.createPublicInfoVersion({
      title: "新版公開資訊",
    });
    platformAdminService.publishPublicInfoVersion(
      successorInfo.versionId,
      {},
      "req-pub-info-2",
      "admin-taitung",
    );
    await expectApiError(
      () =>
        platformAdminService.generatePlacardVersion({
          versionCode: "placard-from-retired-source",
          publicInfoVersionId: draftInfo.versionId,
          templateName: "seatback-taitung",
        }),
      400,
      "PUBLIC_INFO_VERSION_RETIRED",
    );

    const validPubParams = paramsOf(publishedPlacard.artifactDownloadUrl!);
    await expectApiError(
      () =>
        resolveDownload(
          controller,
          "placard",
          publishedPlacard.placardVersionId,
          { ...validPubParams, sig: "0".repeat(64) },
        ),
      403,
      "CONTROLLED_DOWNLOAD_SIGNATURE_INVALID",
    );

    const mismatchedLink = createControlledDownloadMetadata({
      kind: "placard",
      subjectId: publishedPlacard.placardVersionId,
      manifestHash: "f".repeat(64),
    });
    await expectApiError(
      () =>
        resolveDownload(
          controller,
          "placard",
          publishedPlacard.placardVersionId,
          paramsOf(mismatchedLink.downloadUrl),
        ),
      409,
      "CONTROLLED_DOWNLOAD_CONTENT_MISMATCH",
    );

    await expectApiError(
      () => adminController.publishPlacardVersion("placard-any", {}, null),
      401,
      "PLATFORM_ADMIN_IDENTITY_REQUIRED",
    );
  });
});
