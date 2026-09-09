/**
 * SR-REPORT-001 — N05 gap closure regression tests.
 *
 * Verifies:
 * 1. All three general formats (csv, xlsx, pdf) render the same data consistently.
 * 2. CJK / Chinese characters ("王小明", "陳美玲", etc.) are correctly preserved
 *    in CSV (UTF-8), XLSX (ExcelJS), and PDF (Unicode CJK font with ToUnicode CMap).
 * 3. Long text with sentinels ("BEGIN ... 100x ... END_SENTINEL") is completely
 *    preserved across wrapped cells and pages in both PDF and XLSX without truncation.
 * 4. Actual parsed PDF and XLSX values match the source dataset row-for-row.
 * 5. Unimplemented format (zip) is explicitly rejected (501 NOT_IMPLEMENTED) at job creation.
 * 6. Unknown formats (e.g. tar, xml) are rejected (400 BAD_REQUEST).
 * 7. Filing package scope (filing PDF/ZIP) is not reachable via general report endpoints.
 * 8. Filtered report jobs render matching filtered rows consistently across formats.
 * 9. Downloaded artifacts have correct MIME types and file extensions.
 */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import { describe, it, expect, vi } from "vitest";
import ExcelJS from "exceljs";
import {
  REPORT_OUTPUT_FORMATS,
  IMPLEMENTED_REPORT_OUTPUT_FORMATS,
} from "@drts/contracts";
import {
  recordsToXlsx,
  recordsToPdf,
} from "../../../../apps/api/src/modules/reporting-filing/report-renderers";
import { recordsToCsv } from "../../../../apps/api/src/common/csv";
import { ReportingFilingService } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";

// ---------------------------------------------------------------------------
// Test Data: Includes CJK names, long sentinel strings, numbers, dates
// ---------------------------------------------------------------------------

const LONG_SENTINEL_TEXT =
  "BEGIN " + "abcdefghij ".repeat(100) + "END_SENTINEL";

const CJK_SAMPLE_ROWS = [
  {
    id: "REP-001",
    name: "王小明",
    department: "營運一部",
    amount: "1234.50",
    note: "一般營運紀錄",
  },
  {
    id: "REP-002",
    name: "陳美玲",
    department: "車隊管理部",
    amount: "5678.00",
    note: LONG_SENTINEL_TEXT,
  },
  {
    id: "REP-003",
    name: "張志豪",
    department: "客服稽查組",
    amount: "0.00",
    note: "客戶滿意度調查及後續跟進",
  },
] as const;

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/** Parse a CSV string into header + data rows for comparison. */
function parseCsv(csv: string): { headers: string[]; rows: string[][] } {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  const unquote = (cell: string) => {
    const trimmed = cell.startsWith('"')
      ? cell.slice(1, -1).replaceAll('""', '"')
      : cell;
    return trimmed.startsWith("'") ? trimmed.slice(1) : trimmed;
  };
  const splitRow = (line: string) =>
    line.split(",").map((c) => unquote(c.trim()));
  const [headerLine, ...dataLines] = lines;
  return {
    headers: splitRow(headerLine ?? ""),
    rows: dataLines.map(splitRow),
  };
}

/** Parse an XLSX buffer with ExcelJS and extract sheet data. */
async function parseXlsx(
  buffer: Buffer,
): Promise<{ sheetName: string; headers: string[]; rows: string[][] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("No worksheet found in XLSX");
  }

  const headers: string[] = [];
  const headerRow = sheet.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(cell.value ?? ""));
  });

  const rows: string[][] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const rowValues: string[] = [];
    for (let c = 1; c <= headers.length; c++) {
      rowValues.push(String(row.getCell(c).value ?? ""));
    }
    rows.push(rowValues);
  }

  return { sheetName: sheet.name, headers, rows };
}

/** Extract actual displayed text using an independent standards-based parser. */
async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  const task = getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: false,
    disableFontFace: true,
  });
  try {
    const pdf = await task.promise;
    const text: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      text.push(
        content.items.map((item) => ("str" in item ? item.str : "")).join(""),
      );
    }
    return text.join("");
  } finally {
    await task.destroy();
  }
}

// ---------------------------------------------------------------------------
// Tests: Output formats contract
// ---------------------------------------------------------------------------

describe("Report Output Formats declaration", () => {
  it("contract REPORT_OUTPUT_FORMATS contains general formats and zip", () => {
    expect(REPORT_OUTPUT_FORMATS).toContain("csv");
    expect(REPORT_OUTPUT_FORMATS).toContain("xlsx");
    expect(REPORT_OUTPUT_FORMATS).toContain("pdf");
    expect(REPORT_OUTPUT_FORMATS).toContain("zip");
  });

  it("contract IMPLEMENTED_REPORT_OUTPUT_FORMATS contains csv, xlsx, and pdf, but excludes zip", () => {
    expect(IMPLEMENTED_REPORT_OUTPUT_FORMATS).toEqual(["csv", "xlsx", "pdf"]);
    expect(IMPLEMENTED_REPORT_OUTPUT_FORMATS).not.toContain("zip");
  });
});

// ---------------------------------------------------------------------------
// Tests: CSV Renderer — Parsed values & CJK preservation
// ---------------------------------------------------------------------------

describe("recordsToCsv — parsed values and CJK preservation", () => {
  it("produces valid CSV with matching headers and values", () => {
    const csv = recordsToCsv(
      CJK_SAMPLE_ROWS as unknown as Record<string, unknown>[],
    );
    const { headers, rows } = parseCsv(csv);

    expect(headers).toEqual(["id", "name", "department", "amount", "note"]);
    expect(rows).toHaveLength(3);

    // Row 0: CJK characters
    expect(rows[0]?.[0]).toBe("REP-001");
    expect(rows[0]?.[1]).toBe("王小明");
    expect(rows[0]?.[2]).toBe("營運一部");
    expect(rows[0]?.[3]).toBe("1234.50");
    expect(rows[0]?.[4]).toBe("一般營運紀錄");

    // Row 1: Long sentinel text
    expect(rows[1]?.[1]).toBe("陳美玲");
    expect(rows[1]?.[4]).toBe(LONG_SENTINEL_TEXT);
    expect(rows[1]?.[4]).toContain("BEGIN");
    expect(rows[1]?.[4]).toContain("END_SENTINEL");
  });

  it("neutralises formula-injection prefix in raw CSV bytes", () => {
    const dangerousRows = [{ x: "=cmd|' /C calc'!A0" }];
    const csv = recordsToCsv(dangerousRows);
    expect(csv).toContain("\"'=cmd|' /C calc'!A0\"");
    expect(csv).not.toMatch(/^=cmd/m);
  });
});

// ---------------------------------------------------------------------------
// Tests: XLSX Renderer — Parsed values & CJK preservation
// ---------------------------------------------------------------------------

describe("recordsToXlsx — parsed workbook values and CJK preservation", () => {
  it("produces valid XLSX loadable by ExcelJS with exact cell values", async () => {
    const buf = await recordsToXlsx(
      CJK_SAMPLE_ROWS as unknown as Record<string, unknown>[],
      "TestRoster",
    );
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(0);

    const { sheetName, headers, rows } = await parseXlsx(buf);
    expect(sheetName).toBe("TestRoster");
    expect(headers).toEqual(["id", "name", "department", "amount", "note"]);
    expect(rows).toHaveLength(3);

    // Row 0
    expect(rows[0]?.[0]).toBe("REP-001");
    expect(rows[0]?.[1]).toBe("王小明");
    expect(rows[0]?.[2]).toBe("營運一部");
    expect(rows[0]?.[3]).toBe("1234.50");
    expect(rows[0]?.[4]).toBe("一般營運紀錄");

    // Row 1: Long sentinel text
    expect(rows[1]?.[1]).toBe("陳美玲");
    expect(rows[1]?.[4]).toBe(LONG_SENTINEL_TEXT);
    expect(rows[1]?.[4]).toContain("BEGIN");
    expect(rows[1]?.[4]).toContain("END_SENTINEL");

    // Row 2: CJK description
    expect(rows[2]?.[1]).toBe("張志豪");
    expect(rows[2]?.[4]).toBe("客戶滿意度調查及後續跟進");
  });

  it("handles empty rows gracefully", async () => {
    const buf = await recordsToXlsx([], "EmptyReport");
    const { sheetName, headers, rows } = await parseXlsx(buf);
    expect(sheetName).toBe("EmptyReport");
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: PDF Renderer — Parsed PDF values, CJK font, and sentinel preservation
// ---------------------------------------------------------------------------

describe("recordsToPdf — parsed text, CJK font, and text wrapping / pagination", () => {
  it("uses packaged fonts when host font discovery is unavailable", async () => {
    const hostDiscovery = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    try {
      const pdf = await recordsToPdf([{ name: "王小明" }], "中文報表");
      expect(await extractPdfText(pdf)).toContain("中文報表name王小明");
      expect(hostDiscovery).not.toHaveBeenCalled();
    } finally {
      hostDiscovery.mockRestore();
    }
  });

  it("rejects missing packaged font instead of returning corrupted bytes", async () => {
    const originalRead = fs.readFileSync;
    const read = vi.spyOn(fs, "readFileSync").mockImplementation((...args) => {
      if (String(args[0]).endsWith("NotoSansCJKtc-Regular.otf")) {
        throw new Error("ENOENT: packaged report font missing");
      }
      return originalRead(...args);
    });
    try {
      await expect(
        recordsToPdf([{ name: "王小明" }]).then(() => "rendered"),
      ).rejects.toThrow("packaged report font missing");
    } finally {
      read.mockRestore();
    }
  });

  it("independent parser does not mistake Helvetica CJK corruption for Chinese", async () => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    const result = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    doc.font("Helvetica").text("王小明");
    doc.end();
    expect(await extractPdfText(await result)).not.toContain("王小明");
  });

  it("preserves every Chinese value and long-cell segment through multiple pages", async () => {
    const segments = Array.from(
      { length: 600 },
      (_, index) =>
        `第${String(index).padStart(3, "0")}筆王小明龜山區臺灣繁體中文`,
    );
    const source = segments.join("") + "長尾END_SENTINEL";
    const pdf = await recordsToPdf([{ note: source }], "跨頁報表");
    const parsed = await extractPdfText(pdf);
    // Repeated table headers are layout, everything else must be exact.
    expect(parsed.replace("跨頁報表", "").replaceAll("note", "")).toBe(source);
    expect(parsed.match(/note/g)!.length).toBeGreaterThan(1);
    const xlsx = await parseXlsx(await recordsToXlsx([{ note: source }]));
    expect(xlsx.rows).toEqual([[source]]);
    expect(parseCsv(recordsToCsv([{ note: source }])).rows).toEqual([[source]]);
  });

  it("produces valid PDF with CJK Unicode font preserving Chinese and sentinels", async () => {
    const buf = await recordsToPdf(
      CJK_SAMPLE_ROWS as unknown as Record<string, unknown>[],
      "車隊營運日報表",
    );
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");

    const parsedText = await extractPdfText(buf);

    // 1. Chinese characters in title & cells are intact (CJK Unicode font loaded)
    expect(parsedText).toContain("車隊營運日報表");
    expect(parsedText).toContain("王小明");
    expect(parsedText).toContain("營運一部");
    expect(parsedText).toContain("陳美玲");
    expect(parsedText).toContain("車隊管理部");
    expect(parsedText).toContain("張志豪");
    expect(parsedText).toContain("客服稽查組");
    expect(parsedText).toContain("一般營運紀錄");
    expect(parsedText).toContain("客戶滿意度調查及後續跟進");

    // 2. Long text with sentinel is fully preserved across cell wrapping and pagination
    expect(parsedText).toContain("BEGIN");
    expect(parsedText).toContain("END_SENTINEL");

    // 3. IDs and numeric values
    expect(parsedText).toContain("REP-001");
    expect(parsedText).toContain("REP-002");
    expect(parsedText).toContain("REP-003");
    expect(parsedText).toContain("1234.50");
    expect(parsedText).toContain("5678.00");
  });

  it("handles empty rows without throwing and renders No data", async () => {
    const buf = await recordsToPdf([], "EmptyTest");
    const parsedText = await extractPdfText(buf);
    expect(parsedText).toContain("EmptyTest");
    expect(parsedText).toContain("No data.");
  });
});

// ---------------------------------------------------------------------------
// Tests: Cross-format consistency
// ---------------------------------------------------------------------------

describe("Cross-format data consistency (CSV, XLSX, PDF)", () => {
  it("all three formats preserve identical data values for the same input", async () => {
    const rows = [
      { id: "T-01", driver: "王小明", vehicle: "AAA-1234", revenue: "3500" },
      { id: "T-02", driver: "李大華", vehicle: "BBB-5678", revenue: "4200" },
    ];

    const csvStr = recordsToCsv(rows);
    const { rows: csvParsedRows } = parseCsv(csvStr);

    const xlsxBuf = await recordsToXlsx(rows);
    const { rows: xlsxParsedRows } = await parseXlsx(xlsxBuf);

    const pdfBuf = await recordsToPdf(rows, "CrossFormatConsistency");
    const pdfText = await extractPdfText(pdfBuf);

    for (let i = 0; i < rows.length; i++) {
      const src = rows[i]!;
      // CSV check
      expect(csvParsedRows[i]?.[0]).toBe(src.id);
      expect(csvParsedRows[i]?.[1]).toBe(src.driver);
      expect(csvParsedRows[i]?.[2]).toBe(src.vehicle);
      expect(csvParsedRows[i]?.[3]).toBe(src.revenue);

      // XLSX check
      expect(xlsxParsedRows[i]?.[0]).toBe(src.id);
      expect(xlsxParsedRows[i]?.[1]).toBe(src.driver);
      expect(xlsxParsedRows[i]?.[2]).toBe(src.vehicle);
      expect(xlsxParsedRows[i]?.[3]).toBe(src.revenue);

      // PDF check
      expect(pdfText).toContain(src.id);
      expect(pdfText).toContain(src.driver);
      expect(pdfText).toContain(src.vehicle);
      expect(pdfText).toContain(src.revenue);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: ReportingFilingService integration — MIME, rejection & filing scope
// ---------------------------------------------------------------------------

async function flushBackgroundWork() {
  await new Promise((resolve) => setTimeout(resolve, 10));
  await new Promise((resolve) => setImmediate(resolve));
}

describe("ReportingFilingService — formats, MIME types, rejection & scope", () => {
  const audit = new AuditNotificationService();

  function createConfiguredService() {
    const service = new ReportingFilingService(audit);
    service.registerDriverRegistryFeedProvider(() => [
      {
        driverId: "DRV-001",
        name: "王小明",
        supportedServiceBuckets: ["standard"],
        workState: "idle",
        lifecycleStatus: "active",
        licensesValid: true,
        dispatchEligible: true,
        eligibilityBlockedReasons: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        activatedAt: "2026-01-01T00:00:00.000Z",
        suspendedAt: null,
        retiredAt: null,
      } as never,
    ]);
    service.registerDailyDispatchRecordProvider(async (filters: any) => {
      const allRows = [
        {
          date: "2026-01-15",
          source: "ops_console",
          orderId: "ORD-001",
          passengerName: "王小明",
          pickupAddress: "台北市信義區信義路五段7號",
          dropoffAddress: "台北市中正區重慶南路一段122號",
          finalStatus: "completed",
          fareAmount: 350,
          vehiclePlate: "ABC-1234",
          driverName: "陳司機",
        },
        {
          date: "2026-01-16",
          source: "phone",
          orderId: "ORD-002",
          passengerName: "李大華",
          pickupAddress: "新北市板橋區縣民大道二段7號",
          dropoffAddress: "新北市新店區北新路一段1號",
          finalStatus: "cancelled",
          fareAmount: 0,
          vehiclePlate: "XYZ-9876",
          driverName: "林司機",
        },
      ];
      if (filters.finalStatus) {
        return allRows.filter(
          (r) => r.finalStatus === filters.finalStatus,
        ) as never[];
      }
      return allRows as never[];
    });
    return service;
  }

  it("serves CSV artifact with correct MIME text/csv and .csv filename", async () => {
    const service = createConfiguredService();
    const accepted = service.createReportJob(
      { jobType: "driver_roster", format: "csv" },
      "req-csv-001",
    );
    await flushBackgroundWork();

    const artifact = await service.renderReportArtifact(accepted.jobId);
    expect(artifact.contentType).toBe("text/csv; charset=utf-8");
    expect(artifact.fileName).toBe(`driver_roster-${accepted.jobId}.csv`);
    expect(artifact.buffer.byteLength).toBeGreaterThan(0);
    expect(artifact.buffer.toString("utf8")).toContain("王小明");
  });

  it("serves XLSX artifact with spreadsheetml MIME and .xlsx filename", async () => {
    const service = createConfiguredService();
    const accepted = service.createReportJob(
      { jobType: "driver_roster", format: "xlsx" },
      "req-xlsx-001",
    );
    await flushBackgroundWork();

    const artifact = await service.renderReportArtifact(accepted.jobId);
    expect(artifact.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(artifact.fileName).toBe(`driver_roster-${accepted.jobId}.xlsx`);
    expect(artifact.buffer.byteLength).toBeGreaterThan(0);

    const parsed = await parseXlsx(artifact.buffer);
    expect(parsed.headers.length).toBeGreaterThan(0);
    expect(parsed.rows[0]?.[1]).toBe("王小明");
  });

  it("serves PDF artifact with application/pdf MIME and .pdf filename", async () => {
    const service = createConfiguredService();
    const accepted = service.createReportJob(
      { jobType: "driver_roster", format: "pdf" },
      "req-pdf-001",
    );
    await flushBackgroundWork();

    const artifact = await service.renderReportArtifact(accepted.jobId);
    expect(artifact.contentType).toBe("application/pdf");
    expect(artifact.fileName).toBe(`driver_roster-${accepted.jobId}.pdf`);
    expect(artifact.buffer.byteLength).toBeGreaterThan(0);
    expect(artifact.buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("explicitly rejects unrendered format 'zip' with 501 REPORT_FORMAT_NOT_IMPLEMENTED", () => {
    const service = new ReportingFilingService(audit);
    try {
      service.createReportJob(
        { jobType: "driver_roster", format: "zip" },
        "req-zip-001",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(501);
      expect(err.response?.error?.code).toBe("REPORT_FORMAT_NOT_IMPLEMENTED");
    }
  });

  it("explicitly rejects unknown formats (e.g. 'tar') with 400 REPORT_FORMAT_UNKNOWN", () => {
    const service = new ReportingFilingService(audit);
    try {
      service.createReportJob(
        { jobType: "driver_roster", format: "tar" as never },
        "req-tar-001",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(400);
      expect(err.response?.error?.code).toBe("REPORT_FORMAT_UNKNOWN");
    }
  });

  it("filing packages are excluded from general report job creation", () => {
    const service = new ReportingFilingService(audit);
    try {
      service.createReportJob(
        { jobType: "filing_package" as never, format: "csv" },
        "req-filing-001",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(400);
      expect(err.response?.error?.code).toBe("REPORT_TYPE_UNKNOWN");
    }
  });

  it("filtered report jobs render only the filtered rows consistently", async () => {
    const service = createConfiguredService();
    // Create a daily_dispatch_record job with finalStatus: "completed" filter
    const accepted = service.createReportJob(
      {
        jobType: "daily_dispatch_record",
        format: "csv",
        filters: { finalStatus: "completed" },
      },
      "req-filtered-001",
    );
    await flushBackgroundWork();

    const artifactCsv = await service.renderReportArtifact(accepted.jobId);
    const { rows: csvRows } = parseCsv(artifactCsv.buffer.toString("utf8"));

    // Create the same job as XLSX
    const acceptedXlsx = service.createReportJob(
      {
        jobType: "daily_dispatch_record",
        format: "xlsx",
        filters: { finalStatus: "completed" },
      },
      "req-filtered-002",
    );
    await flushBackgroundWork();

    const artifactXlsx = await service.renderReportArtifact(acceptedXlsx.jobId);
    const { rows: xlsxRows } = await parseXlsx(artifactXlsx.buffer);

    // Create the same job as PDF
    const acceptedPdf = service.createReportJob(
      {
        jobType: "daily_dispatch_record",
        format: "pdf",
        filters: { finalStatus: "completed" },
      },
      "req-filtered-003",
    );
    await flushBackgroundWork();

    const artifactPdf = await service.renderReportArtifact(acceptedPdf.jobId);
    const pdfText = await extractPdfText(artifactPdf.buffer);
    console.info("SR-REPORT-001 unit resources", JSON.stringify(
      [accepted, acceptedXlsx, acceptedPdf].map(({ jobId }) => ({
        jobId,
        artifactId: service.getReportJob(jobId).artifact?.artifactId,
      })),
    ));

    // Number of filtered rows matches between CSV and XLSX
    expect(csvRows).toEqual(xlsxRows);
    expect(csvRows.length).toBe(1); // ORD-001 is completed, ORD-002 is cancelled
    expect(artifactCsv.buffer.toString("utf8")).toContain("ORD-001");
    expect(artifactCsv.buffer.toString("utf8")).toContain("王小明");
    expect(artifactCsv.buffer.toString("utf8")).not.toContain("ORD-002");
    expect(artifactCsv.buffer.toString("utf8")).not.toContain("李大華");

    expect(xlsxRows[0]).toBeDefined();
    expect(JSON.stringify(xlsxRows[0])).toContain("ORD-001");
    expect(JSON.stringify(xlsxRows[0])).toContain("王小明");
    expect(JSON.stringify(xlsxRows)).not.toContain("ORD-002");

    expect(pdfText).toContain("ORD-001");
    expect(pdfText).toContain("王小明");
    expect(pdfText).not.toContain("ORD-002");
    expect(pdfText).not.toContain("李大華");
  });
});
