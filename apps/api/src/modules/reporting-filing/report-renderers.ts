/**
 * General-purpose report renderers: XLSX and PDF.
 *
 * CSV rendering lives in `../../common/csv` and is used directly inside the
 * service. These two formats require third-party libraries (exceljs, pdfkit)
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

import fs from "node:fs";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Returns columns in first-seen order across all rows (matches recordsToCsv). */
export function deriveColumns(rows: readonly Record<string, unknown>[]): string[] {
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

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// Font resolution for PDF (CJK support)
// ---------------------------------------------------------------------------

interface FontCandidate {
  path: string;
  family?: string;
}

const CJK_REGULAR_CANDIDATES: readonly FontCandidate[] = [
  {
    path: "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    family: "NotoSansCJKtc-Regular",
  },
  {
    path: "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
    family: "NotoSansCJKtc-Regular",
  },
  {
    path: "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    family: "NotoSansCJKtc-Regular",
  },
  {
    path: "/usr/share/fonts/opentype/noto/NotoSansTC-Regular.otf",
  },
  {
    path: "/usr/share/fonts/truetype/noto/NotoSansTC-Regular.ttf",
  },
];

const CJK_BOLD_CANDIDATES: readonly FontCandidate[] = [
  {
    path: "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    family: "NotoSansCJKtc-Bold",
  },
  {
    path: "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc",
    family: "NotoSansCJKtc-Bold",
  },
  {
    path: "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    family: "NotoSansCJKtc-Bold",
  },
  {
    path: "/usr/share/fonts/opentype/noto/NotoSansTC-Bold.otf",
  },
  {
    path: "/usr/share/fonts/truetype/noto/NotoSansTC-Bold.ttf",
  },
];

function findFirstExistingFont(candidates: readonly FontCandidate[]): FontCandidate | null {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate.path)) {
      return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// XLSX renderer
// ---------------------------------------------------------------------------

/**
 * Renders rows as an XLSX workbook buffer.
 *
 * - One worksheet named `sheetName` (default: "Report").
 * - Row 1 is a bold header derived from column names.
 * - All cells are plain strings to avoid formula-injection risk (same guard
 *   as the CSV renderer's leading-character neutralisation).
 * - Enables text-wrap and top-vertical alignment on cells.
 * - Auto-fits column widths based on content samples.
 * - Returns a `Buffer` from `workbook.xlsx.writeBuffer()`.
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

  // Auto-fit columns and enable wrapping.
  if (columns.length > 0) {
    sheet.columns.forEach((col, idx) => {
      const header = columns[idx] ?? "";
      let max = header.length;
      for (const row of rows) {
        const text = cellText(row[header]);
        if (text.length > max) max = text.length;
      }
      col.width = Math.min(Math.max(max + 2, 10), 80);
      col.alignment = { wrapText: true, vertical: "top" };
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// PDF renderer
// ---------------------------------------------------------------------------

/**
 * Splits text so the first slice fits within `maxHeight` at `width`.
 * Returns `[slice, remainingText]`.
 */
function splitTextToFit(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  maxHeight: number,
): [string, string] {
  if (!text) return ["", ""];
  if (doc.heightOfString(text, { width }) <= maxHeight) {
    return [text, ""];
  }

  let low = 1;
  let high = text.length;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const lastNewline = text.lastIndexOf("\n", mid);
    let cut = -1;
    if (lastNewline > 0 && lastNewline >= Math.floor(low * 0.7)) {
      cut = lastNewline;
    } else {
      const lastSpace = text.lastIndexOf(" ", mid);
      if (lastSpace > 0 && lastSpace >= Math.floor(low * 0.7)) {
        cut = lastSpace;
      } else {
        cut = mid;
      }
    }

    const sub = text.slice(0, cut);
    if (doc.heightOfString(sub, { width }) <= maxHeight) {
      best = cut;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (best === 0) best = 1;
  const slice = text.slice(0, best);
  let rest = text.slice(best);
  if (rest.startsWith("\r\n")) {
    rest = rest.slice(2);
  } else if (rest.startsWith("\n") || rest.startsWith(" ")) {
    rest = rest.slice(1);
  }
  return [slice, rest];
}

/**
 * Renders rows as a PDF table buffer.
 *
 * - Uses Unicode CJK fonts (NotoSansCJK) when available so Chinese report values
 *   (e.g. driver names, case details) are properly encoded with standard ToUnicode
 *   CMaps rather than corrupted under built-in 8-bit WinAnsi fonts.
 * - Draws a structured table with header row and zebra-striped data rows.
 * - Fully wraps long cell text and paginates multi-line rows across pages so
 *   trailing sentinels (e.g. END_SENTINEL) and extensive descriptions are never
 *   silently truncated with ellipsis.
 * - Automatically repeats headers on subsequent pages.
 * - Returns a `Promise<Buffer>`.
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

    // Font registration: resolve CJK fonts or fall back to standard Helvetica.
    const cjkReg = findFirstExistingFont(CJK_REGULAR_CANDIDATES);
    const cjkBold = findFirstExistingFont(CJK_BOLD_CANDIDATES);

    let fontRegular = "Helvetica";
    let fontBold = "Helvetica-Bold";

    if (cjkReg) {
      if (cjkReg.family) {
        doc.registerFont("NotoSansCJKtc", cjkReg.path, cjkReg.family);
      } else {
        doc.registerFont("NotoSansCJKtc", cjkReg.path);
      }
      fontRegular = "NotoSansCJKtc";
    }

    if (cjkBold) {
      if (cjkBold.family) {
        doc.registerFont("NotoSansCJKtc-Bold", cjkBold.path, cjkBold.family);
      } else {
        doc.registerFont("NotoSansCJKtc-Bold", cjkBold.path);
      }
      fontBold = "NotoSansCJKtc-Bold";
    } else if (cjkReg) {
      fontBold = fontRegular;
    }

    // Title.
    const reportTitle = title ?? "Report";
    doc.fontSize(14).font(fontBold).text(reportTitle, { align: "left" });
    doc.moveDown(0.5);

    if (columns.length === 0 || rows.length === 0) {
      doc.fontSize(10).font(fontRegular).text("No data.", { align: "left" });
      doc.end();
      return;
    }

    const printW =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colW = Math.floor(printW / columns.length);
    const startX = doc.page.margins.left;
    const headerH = 22;
    const cellPad = 4;
    const cellTextW = colW - cellPad * 2;
    const pageBottom = doc.page.height - doc.page.margins.bottom;

    let y = doc.y;

    const drawHeader = () => {
      doc.fontSize(9).font(fontBold);
      for (let ci = 0; ci < columns.length; ci++) {
        const x = startX + ci * colW;
        doc.rect(x, y, colW, headerH).fillAndStroke("#E2E8F0", "#94A3B8");
        doc.fillColor("black").text(columns[ci] ?? "", x + cellPad, y + cellPad + 2, {
          width: cellTextW,
          lineBreak: false,
        });
      }
      y += headerH;
    };

    drawHeader();

    doc.fontSize(8).font(fontRegular);

    for (let ri = 0; ri < rows.length; ri++) {
      let rowTexts = columns.map((col) => cellText(rows[ri]?.[col]));
      const fill = ri % 2 === 0 ? "#FFFFFF" : "#F8FAFC";

      while (rowTexts.some((t) => t.length > 0)) {
        let availH = pageBottom - y;
        if (availH < 25) {
          doc.addPage();
          y = doc.page.margins.top;
          drawHeader();
          doc.fontSize(8).font(fontRegular);
          availH = pageBottom - y;
        }

        const currentSlices: string[] = [];
        const nextTexts: string[] = [];

        for (let ci = 0; ci < columns.length; ci++) {
          const text = rowTexts[ci] ?? "";
          const [slice, rest] = splitTextToFit(
            doc,
            text,
            cellTextW,
            availH - cellPad * 2,
          );
          currentSlices.push(slice);
          nextTexts.push(rest);
        }

        const sliceH = Math.max(
          18,
          Math.max(
            ...currentSlices.map((s) =>
              s ? doc.heightOfString(s, { width: cellTextW }) : 0,
            ),
          ) +
            cellPad * 2,
        );

        for (let ci = 0; ci < columns.length; ci++) {
          const x = startX + ci * colW;
          doc.rect(x, y, colW, sliceH).fillAndStroke(fill, "#CBD5E1");
          const text = currentSlices[ci];
          if (text) {
            doc
              .fillColor("black")
              .text(text, x + cellPad, y + cellPad, {
                width: cellTextW,
                lineBreak: true,
              });
          }
        }

        y += sliceH;
        rowTexts = nextTexts;
      }
    }

    doc.end();
  });
}
