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
 * - Returns a `Buffer` synchronously via `xlsx.writeBuffer()`.
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
  sheet.columns.forEach((col, idx) => {
    const header = columns[idx] ?? "";
    let max = header.length;
    for (const row of rows) {
      const text = cellText(row[header]);
      if (text.length > max) max = text.length;
    }
    col.width = Math.min(Math.max(max + 2, 10), 80);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// PDF renderer
// ---------------------------------------------------------------------------

/**
 * Renders rows as a PDF table buffer.
 *
 * - Uses PDFKit with no external fonts; falls back to built-in Helvetica which
 *   is always available regardless of the deployment environment.
 * - Draws a simple grid: header row (bold) + data rows, line-wrapped when a
 *   column is wider than its allotted cell.
 * - Returns a `Buffer` from the concatenated chunks.
 *
 * Layout heuristic:
 *   - Each column is assigned equal width across the printable area.
 *   - If there are no rows the PDF says "No data." in the printable area.
 *   - Page size is A4 landscape when there are more than 4 columns.
 */
export function recordsToPdf(
  rows: readonly Record<string, unknown>[],
  title?: string,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const columns = deriveColumns(rows);

    const landscape = columns.length > 4;
    const doc = new PDFDocument({
      size: "A4",
      layout: landscape ? "landscape" : "portrait",
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Title.
    const reportTitle = title ?? "Report";
    doc.fontSize(14).font("Helvetica-Bold").text(reportTitle, { align: "left" });
    doc.moveDown(0.5);

    if (columns.length === 0 || rows.length === 0) {
      doc.fontSize(10).font("Helvetica").text("No data.", { align: "left" });
      doc.end();
      return;
    }

    // Compute column widths.
    const printW =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colW = Math.floor(printW / columns.length);
    const rowH = 18;
    const headerH = 20;

    // Header row.
    const startX = doc.page.margins.left;
    let y = doc.y;

    doc.fontSize(9).font("Helvetica-Bold");
    for (let ci = 0; ci < columns.length; ci++) {
      const x = startX + ci * colW;
      doc
        .rect(x, y, colW, headerH)
        .fillAndStroke("#E2E8F0", "#94A3B8");
      doc
        .fillColor("black")
        .text(columns[ci] ?? "", x + 2, y + 4, {
          width: colW - 4,
          height: headerH - 4,
          ellipsis: true,
          lineBreak: false,
        });
    }
    y += headerH;

    // Data rows.
    doc.fontSize(8).font("Helvetica");
    for (let ri = 0; ri < rows.length; ri++) {
      // Page break if needed (keep ~60px bottom margin).
      if (
        y + rowH >
        doc.page.height - doc.page.margins.bottom - 60
      ) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      const fill = ri % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
      for (let ci = 0; ci < columns.length; ci++) {
        const x = startX + ci * colW;
        doc.rect(x, y, colW, rowH).fillAndStroke(fill, "#CBD5E1");
        doc
          .fillColor("black")
          .text(cellText(rows[ri]?.[columns[ci] ?? ""] ), x + 2, y + 4, {
            width: colW - 4,
            height: rowH - 4,
            ellipsis: true,
            lineBreak: false,
          });
      }
      y += rowH;
    }

    doc.end();
  });
}
