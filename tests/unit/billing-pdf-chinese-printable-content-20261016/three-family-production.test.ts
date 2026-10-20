import { afterEach, describe, expect, it, vi } from "vitest";
import { createControlledDownloadMetadata } from "../../../apps/api/src/common/controlled-download";
import { parsePdf } from "./pdf-parser";
import {
  ADDRESS,
  DRIVER,
  REASON,
  TENANT,
  TITLE,
  createRuntime,
  download,
  hash,
  identity,
  issueDocuments,
  money,
} from "./production-fixture";

const compact = (text: string) => text.replace(/\s/g, "");

function assertXrefOffsets(bytes: Buffer) {
  const source = bytes.toString("latin1");
  const start = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(source);
  expect(start).not.toBeNull();
  const xref = source.slice(Number(start![1]));
  expect(xref.startsWith("xref\n0 ")).toBe(true);
  const entries = xref.split("\n");
  const count = Number(entries[1]!.split(" ")[1]);
  expect(count).toBeGreaterThan(1);
  for (let id = 1; id < count; id++) {
    const offset = Number(entries[id + 2]!.slice(0, 10));
    expect(source.slice(offset).startsWith(`${id} 0 obj`)).toBe(true);
  }
}

function documents(r: Awaited<ReturnType<typeof issueDocuments>>) {
  return [
    {
      kind: "tenant-invoice" as const,
      id: r.invoice.invoiceId,
      url: r.invoice.artifactUrl!,
      sha: r.invoice.artifactDownloadMetadata.manifestHash,
    },
    {
      kind: "report" as const,
      id: r.statement.statementId,
      url: r.statement.artifactUrl!,
      sha: r.statement.artifactDownloadMetadata!.manifestHash,
    },
    {
      kind: "report" as const,
      id: r.batch.batchId,
      url: r.receipt.download.downloadUrl,
      sha: r.receipt.manifestHash,
    },
  ];
}

describe("BillingPDF actual three-family production/store/controlled-download composition", () => {
  afterEach(() => vi.useRealTimers());

  it.each(["invoice", "statement", "batch"] as const)(
    "extracts readable configured Chinese from the actual %s download independently",
    async (family) => {
      const r = await issueDocuments(1);
      const index = family === "invoice" ? 0 : family === "statement" ? 1 : 2;
      const doc = documents(r)[index]!;
      const { bytes } = await download(r, doc.kind, doc.id, doc.url);
      const parsed = await parsePdf(bytes);
      expect(parsed.text).toContain(
        family === "invoice"
          ? TITLE
          : family === "statement"
            ? "費率v1-2026"
            : REASON,
      );
      expect(
        parsed.glyphs.some(
          (glyph) => /[\u3400-\u9fff]/.test(glyph.unicode) && glyph.isInFont,
        ),
      ).toBe(true);
      expect(hash(bytes)).toBe(doc.sha);
    },
  );

  it("preserves actual Unicode glyphs, punctuation, canonical IDs, money, source/version snapshots and row order in all three families", async () => {
    const r = await issueDocuments();
    const parsed = [];
    for (const doc of documents(r)) {
      const { bytes, headers } = await download(r, doc.kind, doc.id, doc.url);
      expect(headers.type).toBe("application/pdf");
      expect(hash(bytes)).toBe(doc.sha);
      assertXrefOffsets(bytes);
      expect(bytes.toString("latin1")).toContain("/FontFile3");
      expect(bytes.toString("latin1")).toContain("/ToUnicode");
      const pdf = await parsePdf(bytes);
      expect(pdf.text).toContain(doc.id);
      expect(
        pdf.glyphs.filter((glyph) => /[\u3400-\u9fff]/.test(glyph.unicode))
          .length,
      ).toBeGreaterThan(0);
      expect(
        pdf.glyphs
          .filter((glyph) => /[\u3400-\u9fff]/.test(glyph.unicode))
          .every((glyph) => glyph.isInFont),
      ).toBe(true);
      parsed.push(pdf);
    }
    const invoice = parsed[0]!;
    const statement = parsed[1]!;
    const batch = parsed[2]!;
    expect(invoice.text).toContain(TITLE);
    expect(invoice.text).toContain(ADDRESS);
    expect(invoice.text).toContain(r.invoice.createdAt);
    expect(invoice.text).toContain(
      "2026-05-01T00:00:00Z to 2026-05-31T23:59:59Z",
    );
    let position = -1;
    for (const line of r.invoice.lines) {
      const row = `${line.orderId} | ${line.description} | ${line.channelKey ?? "-"} | ${money(line.amount)}`;
      const next = compact(invoice.text).indexOf(compact(row));
      expect(next).toBeGreaterThan(position);
      position = next;
    }
    expect(invoice.text).toContain(
      `Total (${r.invoice.lines.length} lines): ${money(r.invoice.amount)}`,
    );
    expect(statement.text).toContain(`Driver ID: ${DRIVER}`);
    expect(statement.text).toContain(
      `Fee Plan Version: ${r.statement.feePlanVersion}`,
    );
    for (const [label, value] of [
      ["Gross Earning", r.statement.grossEarning],
      ["Service Fee", r.statement.serviceFee],
      ["Subsidy", r.statement.subsidy],
      ["Net Amount", r.statement.netAmount],
    ] as const) {
      expect(statement.text).toContain(`${label}: ${money(value)}`);
    }
    for (const line of r.statement.lines) {
      expect(compact(statement.text)).toContain(
        compact(
          `${line.orderId} | ${line.channelKey ?? "-"} | ${money(line.netAmount)} | ${line.reimbursementRequired ? "yes" : "no"}`,
        ),
      );
    }
    expect(statement.text).toContain(
      `Total Lines: ${r.statement.lines.length}`,
    );
    expect(batch.text).toContain(`Statement ID: ${r.statement.statementId}`);
    expect(batch.text).toContain(
      `Fee Plan Version: ${r.statement.feePlanVersion}`,
    );
    expect(batch.text).toContain(r.batch.approvedAt!);
    expect(batch.text).toContain(r.receipt.exportedAt);
    for (const item of r.batch.items) {
      expect(compact(batch.text)).toContain(
        compact(
          `${item.orderId} | ${item.channelKey ?? "-"} | ${money(item.amount)} | ${item.reason}`,
        ),
      );
    }
    expect(batch.text).toContain(REASON);
    expect(batch.text).toContain(
      `Total (${r.batch.items.length} lines): ${money(r.batch.totalAmount)}`,
    );
    expect(r.batch.workflowState).toBe("exported");
    expect(
      r.controller.getDriverStatement(
        r.statement.statementId,
        identity("driver", DRIVER),
      ).data.statementId,
    ).toBe(r.statement.statementId);
    expect(() =>
      r.controller.getDriverStatement(
        r.statement.statementId,
        identity("driver", "drv-intruder"),
      ),
    ).toThrow();
  });

  it("reads an existing canonical historical Chinese line description through repository rehydration and registered rebuild/download", async () => {
    const r = await issueDocuments();
    const historical = structuredClone(r.invoice);
    historical.lines[0]!.description =
      "原始中文行程描述（核准）(A)\\B，快照維持 — TWD";
    // Establish a historical canonical fixture at the external DB boundary.
    // There is no editable-description API or non-normalized entry slug. The
    // actual registered producer renders its bytes; the fixture's signed hash
    // names those exact bytes, rather than forging an old legacy hash.
    await r.database.repository.persistChanges({
      tenantInvoices: [historical],
    });
    const preparation = createRuntime(r.database);
    await preparation.service.onModuleInit();
    const rendered = await preparation.registry.rebuild(
      "tenant-invoice",
      historical.invoiceId,
    );
    expect(rendered).not.toBeNull();
    historical.artifactDownloadMetadata = createControlledDownloadMetadata({
      kind: "tenant-invoice",
      subjectId: historical.invoiceId,
      manifestHash: rendered!.sha256,
      createdAt: historical.createdAt,
    });
    historical.artifactUrl = historical.artifactDownloadMetadata.downloadUrl;
    await r.database.repository.persistChanges({
      tenantInvoices: [historical],
    });
    const cold = createRuntime(r.database);
    await cold.service.onModuleInit();
    const record = cold.service.getTenantInvoice(TENANT, historical.invoiceId);
    expect(record.lines).toEqual(historical.lines);
    expect(record.amount).toEqual(r.invoice.amount);
    expect(record.createdAt).toBe(r.invoice.createdAt);
    const { bytes } = await download(
      cold,
      "tenant-invoice",
      record.invoiceId,
      record.artifactUrl!,
    );
    expect(hash(bytes)).toBe(rendered!.sha256);
    expect(compact((await parsePdf(bytes)).text)).toContain(
      compact(historical.lines[0]!.description),
    );
  });

  it("wraps a single page-tall legitimate Chinese address and complete long multi-page canonical rows without clipping or changing order/amounts", async () => {
    const r = await issueDocuments(70, true);
    for (const [index, doc] of documents(r).entries()) {
      const { bytes } = await download(r, doc.kind, doc.id, doc.url);
      const parsed = await parsePdf(bytes);
      expect(parsed.pages.length).toBeGreaterThan(1);
      const text = compact(parsed.text);
      const lines =
        index === 0
          ? r.invoice.lines
          : index === 1
            ? r.statement.lines
            : r.batch.items;
      let position = -1;
      for (const line of lines) {
        const next = text.indexOf(line.orderId);
        expect(next).toBeGreaterThan(position);
        position = next;
      }
      if (index === 0) {
        expect(text).toContain(
          compact(
            r.invoice.lines.find((line) => line.orderId === "order-pdf-0000")!
              .description,
          ),
        );
        expect(text).toContain("長地址結束END");
        expect(text).toContain(
          compact(`Total (70 lines): ${money(r.invoice.amount)}`),
        );
      } else if (index === 1) {
        expect(text).toContain("TotalLines:70");
      } else {
        expect(text).toContain(
          compact(`Total (70 lines): ${money(r.batch.totalAmount)}`),
        );
        expect(text).toContain(compact(`${REASON} [69]`));
      }
    }
  });

  it("rebuilds all three genuine missing objects from reloaded canonical records with exact original bytes/hash and registered consumers", async () => {
    const r = await issueDocuments();
    const cold = createRuntime(r.database);
    await cold.service.onModuleInit();
    const put = vi.spyOn(cold.store, "put");
    const conditionalPut = vi.spyOn(cold.store, "putIfAbsent");
    for (const doc of documents(r)) {
      expect(await cold.store.get(doc.kind, doc.id)).toBeNull();
      const original = await download(r, doc.kind, doc.id, doc.url);
      const rebuilt = await download(cold, doc.kind, doc.id, doc.url);
      expect(rebuilt.bytes).toEqual(original.bytes);
      expect(hash(rebuilt.bytes)).toBe(doc.sha);
      expect((await parsePdf(rebuilt.bytes)).text).toContain(doc.id);
    }
    expect(put).not.toHaveBeenCalled();
    expect(conditionalPut).toHaveBeenCalledTimes(3);
  });

  it("keeps issued bytes/hash/snapshots through profile changes, cold reads and expiry re-signing for all three families", async () => {
    const r = await issueDocuments();
    const docs = documents(r);
    const bytes = await Promise.all(
      docs.map((doc) => download(r, doc.kind, doc.id, doc.url)),
    );
    await r.service.updateTenantBillingProfile(TENANT, {
      invoiceTitle: "更新後名稱不可覆蓋舊檔",
      email: "new@example.invalid",
    });
    const cold = createRuntime(r.database, r.store);
    await cold.service.onModuleInit();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 30 * 60 * 1000));
    const invoice = cold.service.getTenantInvoice(TENANT, r.invoice.invoiceId);
    const statement = cold.service.getDriverStatement(
      r.statement.statementId,
      DRIVER,
    );
    const receipt = await cold.service.exportReimbursementBatch(
      r.batch.batchId,
      identity(),
    );
    expect(invoice.createdAt).toBe(r.invoice.createdAt);
    expect(invoice.lines).toEqual(r.invoice.lines);
    expect(invoice.amount).toEqual(r.invoice.amount);
    expect(statement.lines).toEqual(r.statement.lines);
    expect(receipt.receiptId).toBe(r.receipt.receiptId);
    expect(receipt.exportedAt).toBe(r.receipt.exportedAt);
    expect(
      cold.service.getReimbursementBatch(r.batch.batchId).workflowState,
    ).toBe("exported");
    const urls = [
      invoice.artifactUrl!,
      statement.artifactUrl!,
      receipt.download.downloadUrl,
    ];
    for (const [index, doc] of docs.entries()) {
      await expect(
        download(cold, doc.kind, doc.id, doc.url),
      ).rejects.toMatchObject({ code: "CONTROLLED_DOWNLOAD_EXPIRED" });
      expect(urls[index]!).not.toBe(doc.url);
      expect(
        (await download(cold, doc.kind, doc.id, urls[index]!)).bytes,
      ).toEqual(bytes[index]!.bytes);
      expect((await cold.store.get(doc.kind, doc.id))!.record.sha256).toBe(
        doc.sha,
      );
    }
  });

  it("reports content mismatch when a missing invoice cannot reproduce its immutable hash from a changed current profile", async () => {
    const r = await issueDocuments();
    await r.service.updateTenantBillingProfile(TENANT, {
      invoiceTitle: "新名稱",
      email: "new@example.invalid",
    });
    const cold = createRuntime(r.database);
    await cold.service.onModuleInit();
    await expect(
      download(
        cold,
        "tenant-invoice",
        r.invoice.invoiceId,
        r.invoice.artifactUrl!,
      ),
    ).rejects.toMatchObject({ code: "CONTROLLED_DOWNLOAD_CONTENT_MISMATCH" });
    expect(
      (await cold.store.get("tenant-invoice", r.invoice.invoiceId))!.record
        .sha256,
    ).not.toBe(r.invoice.artifactDownloadMetadata.manifestHash);
  });

  it("retains atomic conditional-create winners, registered not-found and signature denials", async () => {
    const r = await issueDocuments();
    const cold = createRuntime(r.database);
    await cold.service.onModuleInit();
    const conditionalPut = cold.store.putIfAbsent.bind(cold.store);
    const original = await Promise.all(
      documents(r).map((doc) => download(r, doc.kind, doc.id, doc.url)),
    );
    vi.spyOn(cold.store, "putIfAbsent").mockImplementation(async (command) => {
      const index = documents(r).findIndex(
        (doc) => doc.id === command.subjectId,
      );
      await cold.store.put({ ...command, bytes: original[index]!.bytes });
      return conditionalPut(command);
    });
    for (const [index, doc] of documents(r).entries()) {
      expect((await download(cold, doc.kind, doc.id, doc.url)).bytes).toEqual(
        original[index]!.bytes,
      );
      const badUrl = new URL(doc.url, "https://download.example.invalid");
      badUrl.searchParams.set("sig", "invalid");
      await expect(
        download(cold, doc.kind, doc.id, badUrl.toString()),
      ).rejects.toMatchObject({
        code: "CONTROLLED_DOWNLOAD_SIGNATURE_INVALID",
      });
    }
    expect(
      await cold.registry.rebuild("report", "absent-report", "0".repeat(64)),
    ).toBeNull();
    expect(
      await cold.registry.rebuild(
        "tenant-invoice",
        "absent-invoice",
        "0".repeat(64),
      ),
    ).toBeNull();
  });
});
