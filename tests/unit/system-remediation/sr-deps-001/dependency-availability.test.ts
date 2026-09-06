/**
 * SR-DEPS-001: shared PDF/XLSX dependencies must resolve from the root
 * workspace (same as `apps/api`) and must produce real, parseable bytes.
 *
 * This is a dependency-addition task, not a renderer task (that is
 * SR-REPORT-001). The regression here proves the newly added `pdfkit` and
 * `exceljs` packages are real, installed, and functional -- not a package.json
 * line that fails the moment something imports it.
 */
import { describe, expect, it } from "vitest";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

describe("SR-DEPS-001 shared PDF dependency (pdfkit)", () => {
  it("renders a real PDF byte stream, not a fixture", async () => {
    const doc = new PDFDocument({ margin: 40 });
    const pending = collectPdfBuffer(doc);
    doc.fontSize(14).text("SR-DEPS-001 dependency smoke test", 40, 40);
    doc.text("row 1: alpha");
    doc.text("row 2: beta");
    doc.end();

    const buffer = await pending;

    expect(buffer.byteLength).toBeGreaterThan(200);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.subarray(-6).toString("latin1")).toBe("%%EOF\n");
  });
});

describe("SR-DEPS-001 shared XLSX dependency (exceljs)", () => {
  it("writes a real workbook and reads the same values back", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("SR-DEPS-001");
    sheet.addRow(["label", "value"]);
    sheet.addRow(["alpha", 1]);
    sheet.addRow(["beta", 2]);

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // XLSX is a zip container: PK\x03\x04 is the local file header magic.
    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4)).toEqual(
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    );

    const roundTrip = new ExcelJS.Workbook();
    // exceljs resolves a duplicated, structurally incompatible copy of the
    // generic Node Buffer<T> type through its own dependency tree; the
    // runtime value is a plain Buffer, only the structural type disagrees.
    await roundTrip.xlsx.load(buffer as any);
    const roundTripSheet = roundTrip.getWorksheet("SR-DEPS-001");

    expect(roundTripSheet).toBeDefined();
    expect(roundTripSheet!.getCell("A2").value).toBe("alpha");
    expect(roundTripSheet!.getCell("B2").value).toBe(1);
    expect(roundTripSheet!.getCell("A3").value).toBe("beta");
    expect(roundTripSheet!.getCell("B3").value).toBe(2);
  });
});
