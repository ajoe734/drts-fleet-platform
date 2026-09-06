/**
 * General-purpose report renderers: XLSX and PDF.
 *
 * CSV rendering lives in `../../common/csv` and is used directly inside the
 * service.  These two formats require third-party libraries (exceljs, pdfkit)
 * and are kept here to keep the service file focused on orchestration.
 *
 * Both helpers accept the same shape the CSV renderer already uses:
 *   - an array of rows (plain `Record<string, unknown>` objects)
 *
 * Column order comes from the union of every row's keys in first-seen order,
 * matching `recordsToCsv` so all three formats are consistent for the same job.
 *
 * SR-REPORT-001 — N05 gap closure.
 */

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { ApiRequestError } from "../../common/api-envelope";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Returns columns in first-seen order across all rows (matches recordsToCsv). */
function deriveColumns(rows: readonly Record<string, unknown>[]): string[] {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) {
        columns.push(key);
      }
    }
  }
  return columns;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// XLSX renderer
// ---------------------------------------------------------------------------

/**
 * Renders rows as an XLSX workbook buffer.
 *
 * - One worksheet named "Report".
 * - Row 1 is a bold header derived from column names.
 * - All cells are plain strings to avoid formula-injection risk (same guard
 *   as the CSV renderer's leading-character neutralisation).
 * - Resolves the workbook bytes after `xlsx.writeBuffer()` completes.
 */
export async function recordsToXlsx(
  rows: readonly Record<string, unknown>[],
  sheetName = "Report",
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DRTS reporting-filing";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);

  const columns = deriveColumns(rows);

  // Header row – bold.
  const headerRow = sheet.addRow(columns);
  headerRow.font = { bold: true };

  // Data rows – all values as plain strings.
  for (const row of rows) {
    sheet.addRow(columns.map((col) => cellText(row[col])));
  }

  // Auto-fit columns (approximate: max of header width and a sample of values).
  if (columns.length > 0) {
    sheet.columns.forEach((col, idx) => {
      const header = columns[idx] ?? "";
      let max = header.length;
      for (const row of rows) {
        const text = cellText(row[header]);
        if (text.length > max) max = text.length;
      }
      col.width = Math.min(Math.max(max + 2, 10), 80);
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * A record-oriented PDF keeps every field readable, including wide schemas
 * and multiline values. PDFKit wraps text and paginates without truncation.
 * A deployment font is required for Unicode; Helvetica must never silently
 * turn tenant names and complaint text into unrelated glyphs.
 */
export function recordsToPdf(
  rows: readonly Record<string, unknown>[],
  title = "Report",
): Promise<Buffer> {
  const columns = deriveColumns(rows);
  const fontPath = process.env.REPORT_PDF_FONT_PATH?.trim();
  const fontFamily = process.env.REPORT_PDF_FONT_FAMILY?.trim();
  const texts = [
    title,
    ...columns,
    ...rows.flatMap((row) => columns.map((key) => cellText(row[key]))),
  ];
  if (
    !fontPath &&
    texts.some((text) =>
      Array.from(text).some(
        (char) =>
          !"\t\n\r".includes(char) &&
          (char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126),
      ),
    )
  ) {
    throw new ApiRequestError(
      503,
      "REPORT_PDF_FONT_REQUIRED",
      "A Unicode report font must be configured before this PDF can be rendered.",
    );
  }

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      if (fontPath) {
        if (fontFamily) doc.font(fontPath, fontFamily);
        else doc.font(fontPath);
      } else {
        doc.font("Helvetica");
      }
      doc.fontSize(14).text(title);
      doc.moveDown();
      doc.fontSize(9);
      if (rows.length === 0) doc.text("No data.");
      for (const [index, row] of rows.entries()) {
        doc.text(`Record ${index + 1}`);
        for (const column of columns) {
          doc.text(`${column}: ${cellText(row[column])}`);
        }
        doc.moveDown();
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
