import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import { parsePdf } from "../../billing-pdf-chinese-printable-content-20261016/pdf-parser";

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { InMemoryDocumentArtifactStore } from "../../../../apps/api/src/common/document-artifacts";
import { ControlledDownloadController } from "../../../../apps/api/src/modules/controlled-download/controlled-download.controller";

type StreamableFileLike = {
  getStream(): NodeJS.ReadableStream;
  getHeaders(): { type?: string };
};

function createService(store: InMemoryDocumentArtifactStore) {
  const auditService = new AuditNotificationService();
  // Positional constructor -- no Nest DI container in this test. Passing
  // `undefined` for the optional repository/forwarder/payment-recovery-port
  // slots so the real `store` lands in the `documentArtifactStore` slot,
  // matching what `BillingSettlementModule` wires via `ControlledDownloadModule`.
  const billingSettlementService = new BillingSettlementService(
    auditService,
    undefined,
    undefined,
    undefined,
    store,
  );
  return { auditService, billingSettlementService };
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

function minorToDecimal(amountMinor: number): string {
  const whole = Math.floor(Math.abs(amountMinor) / 100);
  const cents = String(Math.abs(amountMinor) % 100).padStart(2, "0");
  return `${amountMinor < 0 ? "-" : ""}${whole}.${cents}`;
}

describe("SR-INVOICE-001: tenant invoice renders a real, parseable PDF", () => {
  it("stores real PDF bytes whose extracted text matches the invoice's own statement/trip snapshot line-for-line", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { auditService, billingSettlementService } = createService(store);

    await billingSettlementService.updateTenantBillingProfile(
      "tenant-demo-001",
      {
        invoiceTitle: "Demo Tenant Co., Ltd.",
        taxId: "24567891",
        address: "Taichung Harbor",
        contactName: "Billing Owner",
        email: "ap@demo-tenant.example.com",
      },
    );

    const invoice = await billingSettlementService.generateTenantInvoice(
      "tenant-demo-001",
      {
        tenantId: "tenant-demo-001",
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
    );

    expect(invoice.lines.length).toBeGreaterThan(0);

    // Full round trip through the real download route, not a shortcut into
    // the store: this is what "有效連結可下載" actually exercises.
    const controller = new ControlledDownloadController(store);
    const file = (await resolve(
      controller,
      "tenant-invoice",
      invoice.invoiceId,
      paramsOf(invoice.artifactUrl!),
    )) as StreamableFileLike;
    const bytes = await drain(file.getStream());

    expect(file.getHeaders().type).toBe("application/pdf");
    expect(bytes.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(bytes.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
    expect(bytes.toString("latin1")).toContain("stream\n");
    expect(bytes.toString("latin1")).toContain("endstream");
    expect(bytes.toString("latin1")).toContain("trailer");

    // The signed link's manifest hash must be the hash of these exact bytes
    // -- not a separate metadata digest -- or `resolveDocumentArtifact` would
    // reject every real download as a content mismatch.
    expect(invoice.artifactDownloadMetadata.manifestHash).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );

    const { lines: pdfLines } = await parsePdf(bytes);
    expect(pdfLines[0]).toBe(`Tenant Invoice ${invoice.invoiceId}`);
    expect(pdfLines.join("\n")).toContain(
      `Bill To: Demo Tenant Co., Ltd. (tenant-demo-001)`,
    );
    expect(pdfLines.join("\n")).toContain("Tax ID: 24567891");
    expect(pdfLines.join("\n")).toContain(
      "Billing Period: 2026-03-01T00:00:00Z to 2026-03-31T23:59:59Z",
    );

    for (const line of invoice.lines) {
      const rowStart = pdfLines.findIndex((candidate) =>
        candidate.startsWith(`${line.orderId} | `),
      );
      expect(
        rowStart,
        `expected a PDF row for order ${line.orderId}`,
      ).toBeGreaterThanOrEqual(0);
      const nextRow = pdfLines.findIndex(
        (candidate, index) =>
          index > rowStart &&
          (invoice.lines.some((other) =>
            candidate.startsWith(`${other.orderId} | `),
          ) ||
            candidate.startsWith("---")),
      );
      const row = pdfLines
        .slice(rowStart, nextRow < 0 ? undefined : nextRow)
        .join(" ");
      expect(row).toContain(minorToDecimal(line.amount.amountMinor));
      expect(row).toContain(line.description);
      expect(row).toContain(line.channelKey ?? "-");
    }

    expect(
      pdfLines.some((line) =>
        line.startsWith(`Total (${invoice.lines.length} line`),
      ),
    ).toBe(true);
    expect(
      pdfLines.some((line) =>
        line.endsWith(minorToDecimal(invoice.amount.amountMinor)),
      ),
    ).toBe(true);

    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "generate_tenant_invoice",
    );
  });

  it("preserves readable Traditional Chinese through the actual issued controlled download and embedded glyphs", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { billingSettlementService } = createService(store);

    await billingSettlementService.updateTenantBillingProfile(
      "tenant-demo-001",
      {
        invoiceTitle: "示範租戶股份有限公司（台中）(A)\\B",
        taxId: "24567891",
        address: "台中港區，中山路１２號 — Finance 2026",
        contactName: "帳務窗口",
        email: "ap@demo-tenant.example.com",
      },
    );

    const invoice = await billingSettlementService.generateTenantInvoice(
      "tenant-demo-001",
      {
        tenantId: "tenant-demo-001",
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
    );

    const stored = await store.get("tenant-invoice", invoice.invoiceId);
    expect(stored).not.toBeNull();
    const controller = new ControlledDownloadController(store);
    const file = (await resolve(
      controller,
      "tenant-invoice",
      invoice.invoiceId,
      paramsOf(invoice.artifactUrl!),
    )) as StreamableFileLike;
    const bytes = await drain(file.getStream());
    expect(file.getHeaders().type).toBe("application/pdf");
    expect(bytes).toEqual(stored!.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      invoice.artifactDownloadMetadata.manifestHash,
    );
    const parsed = await parsePdf(bytes);
    expect(parsed.text).toContain(
      "Bill To: 示範租戶股份有限公司（台中）(A)\\B (tenant-demo-001)",
    );
    expect(parsed.text).toContain(
      "Address: 台中港區，中山路１２號 — Finance 2026",
    );
    expect(parsed.text).toContain(invoice.invoiceId);
    expect(parsed.text).toContain(invoice.createdAt);
    expect(
      parsed.glyphs.some((glyph) => glyph.unicode === "示" && glyph.isInFont),
    ).toBe(true);
    expect(bytes.toString("latin1")).toContain("/FontFile3");
    expect(parsed.text).not.toContain("??????????");
  });
});
