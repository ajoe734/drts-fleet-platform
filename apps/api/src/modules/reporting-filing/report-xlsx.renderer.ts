import ExcelJS from "exceljs";

export function extractReportRecords(job: {
  rows?: unknown[];
  partnerRevenueRows?: unknown[];
}): Record<string, unknown>[] {
  if (Array.isArray(job.rows) && job.rows.length > 0) {
    return job.rows as Record<string, unknown>[];
  }
  if (
    Array.isArray(job.partnerRevenueRows) &&
    job.partnerRevenueRows.length > 0
  ) {
    return job.partnerRevenueRows as Record<string, unknown>[];
  }
  return (job.rows as Record<string, unknown>[]) ?? [];
}

export function extractReportColumns(
  records: readonly Record<string, unknown>[],
): string[] {
  const columns: string[] = [];
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!columns.includes(key)) {
        columns.push(key);
      }
    }
  }
  return columns;
}

export function sanitizeCellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  // Neutralise leading =, +, -, @ to prevent spreadsheet formula injection
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export async function renderReportXlsx(job: {
  jobId: string;
  jobType: string;
  rows?: unknown[];
  partnerRevenueRows?: unknown[];
}): Promise<Buffer> {
  const records = extractReportRecords(job);
  const columns = extractReportColumns(records);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DRTS Fleet Platform";
  workbook.lastModifiedBy = "DRTS Reporting Engine";
  workbook.created = new Date();
  workbook.modified = new Date();

  // Excel sheet name max length is 31, no characters: \ / ? * : [ ]
  const safeSheetName = (job.jobType || "Report")
    .replace(/[\\/?*:[\]]/g, "_")
    .slice(0, 31);
  const sheet = workbook.addWorksheet(safeSheetName);

  if (columns.length > 0) {
    sheet.columns = columns.map((col) => ({
      header: col,
      key: col,
      width: Math.max(12, Math.min(col.length + 4, 35)),
    }));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    for (const record of records) {
      const rowValues: Record<string, unknown> = {};
      for (const col of columns) {
        rowValues[col] = sanitizeCellValue(record[col]);
      }
      sheet.addRow(rowValues);
    }
  } else {
    // Empty report with no records
    sheet.addRow(["No data"]);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
