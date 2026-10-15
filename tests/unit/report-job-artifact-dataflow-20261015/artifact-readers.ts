import { expect } from "vitest";
import ExcelJS from "exceljs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ReportArtifactResult } from "../../../apps/api/src/modules/reporting-filing/reporting-filing.service";

// Same independent readers as the accepted C091 suite, at completed-job scope.
export async function assertArtifactRecords(
  artifact: ReportArtifactResult,
  format: "csv" | "xlsx" | "pdf",
  records: readonly object[],
) {
  const columns = Object.keys(records[0] ?? {});
  const values = records.map((row) =>
    Object.values(row).map((value) =>
      value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value),
    ),
  );
  if (format === "csv") {
    expect(artifact.contentType).toBe("text/csv; charset=utf-8");
    // CSV writer always quotes cells. Split quoted fields, preserving JSON commas.
    const rows = artifact.buffer.toString("utf8").split("\r\n").map((line) =>
      [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map((match) => match[1]!.replaceAll('""', '"')),
    );
    expect(rows).toEqual([columns, ...values]);
  } else if (format === "xlsx") {
    expect(artifact.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(artifact.buffer as never);
    const sheet = workbook.worksheets[0]!;
    const rows: string[][] = [];
    for (let row = 1; row <= sheet.rowCount; row++) {
      rows.push(columns.map((_, col) => String(sheet.getRow(row).getCell(col + 1).value ?? "")));
    }
    expect(rows).toEqual(columns.length ? [columns, ...values] : []);
  } else {
    expect(artifact.contentType).toBe("application/pdf");
    const task = getDocument({ data: new Uint8Array(artifact.buffer), useSystemFonts: false, disableFontFace: true });
    try {
      const pdf = await task.promise;
      let text = "";
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        text += content.items.map((item) => "str" in item ? item.str : "").join("");
      }
      const compact = text.replace(/\s/g, "");
      if (records.length) {
        for (const value of [...columns, ...values.flat()].filter(Boolean)) {
          expect(compact).toContain(value.replace(/\s/g, ""));
        }
        expect(text).not.toContain("No data");
      } else {
        expect(text).toContain("No data");
      }
    } finally {
      await task.destroy();
    }
  }
}
