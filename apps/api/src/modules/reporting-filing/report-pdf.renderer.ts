import PDFDocument from "pdfkit";
import {
  extractReportColumns,
  extractReportRecords,
  sanitizeCellValue,
} from "./report-xlsx.renderer";

function toAsciiSafeText(value: unknown): string {
  const sanitized = sanitizeCellValue(value);
  const text = String(sanitized);
  // Standard Helvetica in PDF-1.4/pdfkit uses WinAnsi/Latin-1 encoding.
  // Replace characters outside printable Latin-1 range to prevent font encoding faults.
  return text.replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

export function renderReportPdf(job: {
  jobId: string;
  jobType: string;
  status: string;
  tenantId?: string | null;
  filters?: Record<string, unknown>;
  rows?: unknown[];
  partnerRevenueRows?: unknown[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const records = extractReportRecords(job);
    const columns = extractReportColumns(records);

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 30,
      info: {
        Title: `DRTS Report - ${job.jobType}`,
        Author: "DRTS Fleet Platform",
        Subject: `Report Job ${job.jobId}`,
        CreationDate: new Date(),
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Document Title & Summary Banner
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text(`DRTS Platform Report: ${job.jobType}`, { underline: true });
    doc.moveDown(0.4);

    doc.fontSize(8).font("Helvetica");
    const tenantScope = job.tenantId ? job.tenantId : "platform-wide";
    doc.text(
      `Job ID: ${job.jobId}  |  Status: ${job.status}  |  Scope: ${tenantScope}`,
    );

    const filterEntries = Object.entries(job.filters ?? {});
    const filterSummary =
      filterEntries.length > 0
        ? filterEntries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")
        : "none";
    doc.text(
      `Filters: ${toAsciiSafeText(filterSummary)}  |  Generated At: ${new Date().toISOString()}`,
    );
    doc.text(`Total Records: ${records.length}`);
    doc.moveDown(0.8);

    if (records.length === 0 || columns.length === 0) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .text("No records in this report.");
      doc.end();
      return;
    }

    const printableWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = Math.max(30, printableWidth / columns.length);
    const leftMargin = doc.page.margins.left;

    const drawHeader = (y: number): number => {
      doc.rect(leftMargin, y - 2, printableWidth, 14).fill("#ebebeb");
      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(7.5);
      columns.forEach((col, i) => {
        doc.text(toAsciiSafeText(col), leftMargin + i * colWidth + 2, y, {
          width: colWidth - 4,
          height: 12,
          ellipsis: true,
        });
      });
      return y + 16;
    };

    let currentY = drawHeader(doc.y);

    doc.font("Helvetica").fontSize(7);
    for (let rIdx = 0; rIdx < records.length; rIdx += 1) {
      const record = records[rIdx];
      if (!record) {
        continue;
      }
      if (currentY > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        currentY = drawHeader(doc.page.margins.top);
        doc.font("Helvetica").fontSize(7);
      }

      if (rIdx % 2 === 1) {
        doc.rect(leftMargin, currentY - 1, printableWidth, 12).fill("#f8f8f8");
      }

      doc.fillColor("#000000");
      columns.forEach((col, i) => {
        const text = toAsciiSafeText(record[col]);
        doc.text(text, leftMargin + i * colWidth + 2, currentY, {
          width: colWidth - 4,
          height: 10,
          ellipsis: true,
        });
      });
      currentY += 12;
    }

    doc.end();
  });
}
