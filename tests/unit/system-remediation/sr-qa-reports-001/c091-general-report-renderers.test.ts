import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
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
import type { EvidenceAccessIdentity } from "../../../../apps/api/src/common/evidence-governance";

const LONG_SENTINEL =
  "BEGIN_SENTINEL " + "桃園高鐵站與大台北都會區跨區營運專案監理報表紀錄 ".repeat(15) + "END_SENTINEL";

const SAMPLE_CJK_REPORT_DATA = [
  {
    recordId: "REC-2026-001",
    driverName: "王小明",
    fleetPartner: "大都會計程車隊股份有限公司",
    serviceBucket: "商務多元專車",
    fareAmount: "1,250.00",
    pickupLocation: "台北車站東三門",
    dropoffLocation: "桃園國際機場第二航廈",
    notes: "一般營運無客訴，乘客給予五星好評",
  },
  {
    recordId: "REC-2026-002",
    driverName: "陳美玲",
    fleetPartner: "台灣大車隊特約聯盟",
    serviceBucket: "無障礙福祉專車",
    fareAmount: "850.50",
    pickupLocation: "台大醫院兒醫大樓",
    dropoffLocation: "新北市板橋區縣民大道二段",
    notes: LONG_SENTINEL,
  },
  {
    recordId: "REC-2026-003",
    driverName: "張志豪",
    fleetPartner: "大都會北區特約車隊",
    serviceBucket: "通用即時預約",
    fareAmount: "420.00",
    pickupLocation: "南港軟體園區二期",
    dropoffLocation: "內湖科技園區瑞光路",
    notes: "尖峰時段運量正常",
  },
] as const;

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

async function waitForJobCompletion(
  service: ReportingFilingService,
  jobId: string,
  maxWaitMs = 2000,
) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    const job = service.getReportJob(jobId, undefined, PLATFORM_ADMIN_IDENTITY);
    if (job.status === "completed") {
      return job;
    }
    if (job.status === "failed") {
      throw new Error(`Job ${jobId} failed: ${JSON.stringify(job)}`);
    }
  }
  throw new Error(`Job ${jobId} did not complete within ${maxWaitMs}ms`);
}

const PLATFORM_ADMIN_IDENTITY: EvidenceAccessIdentity = {
  actorId: "usr-platform-admin-01",
  actorType: "platform_admin",
  realm: "platform",
  scopes: ["reports:read", "reports:export"],
  tenantId: null,
};

describe("C091: 營運／租戶財務 - 一般報表 PDF／Excel／CSV 輸出與格式契約驗收", () => {
  const audit = new AuditNotificationService();

  it("契約驗證：REPORT_OUTPUT_FORMATS 包含三種一般格式與 zip，且 IMPLEMENTED 僅啟用 csv, xlsx, pdf", () => {
    expect(REPORT_OUTPUT_FORMATS).toContain("csv");
    expect(REPORT_OUTPUT_FORMATS).toContain("xlsx");
    expect(REPORT_OUTPUT_FORMATS).toContain("pdf");
    expect(REPORT_OUTPUT_FORMATS).toContain("zip");

    expect(IMPLEMENTED_REPORT_OUTPUT_FORMATS).toEqual(["csv", "xlsx", "pdf"]);
    expect(IMPLEMENTED_REPORT_OUTPUT_FORMATS).not.toContain("zip");
  });

  it("資料一致性：同一筆資料在 CSV、XLSX、PDF 三種格式產生之資料行數與關鍵欄位嚴格相符", async () => {
    // 1. CSV 渲染與解析
    const csvString = recordsToCsv(SAMPLE_CJK_REPORT_DATA as unknown as Record<string, unknown>[]);
    const parsedCsv = parseCsv(csvString);
    expect(parsedCsv.rows.length).toBe(3);
    expect(parsedCsv.rows[0]).toContain("REC-2026-001");
    expect(parsedCsv.rows[0]).toContain("王小明");

    // 2. XLSX 渲染與解析
    const xlsxBuffer = await recordsToXlsx(
      SAMPLE_CJK_REPORT_DATA as unknown as Record<string, unknown>[],
      "營運分析報表",
    );
    expect(xlsxBuffer).toBeInstanceOf(Buffer);
    expect(xlsxBuffer.byteLength).toBeGreaterThan(0);
    const parsedXlsx = await parseXlsx(xlsxBuffer);
    expect(parsedXlsx.rows.length).toBe(3);
    expect(parsedXlsx.rows[0]).toContain("REC-2026-001");
    expect(parsedXlsx.rows[0]).toContain("王小明");

    // 3. PDF 渲染與獨立解析器檢驗
    const pdfBuffer = await recordsToPdf(
      SAMPLE_CJK_REPORT_DATA as unknown as Record<string, unknown>[],
      "營運分析報表",
    );
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    const parsedPdfText = await extractPdfText(pdfBuffer);
    expect(parsedPdfText).toContain("REC-2026-001");
    expect(parsedPdfText).toContain("王小明");
    expect(parsedPdfText).toContain("REC-2026-002");
    expect(parsedPdfText).toContain("陳美玲");
  });

  it("繁體中文 (CJK) 全保真與長字串換行不截斷驗收", async () => {
    const pdfBuffer = await recordsToPdf(
      SAMPLE_CJK_REPORT_DATA as unknown as Record<string, unknown>[],
      "繁體中文高階報表",
    );
    const pdfText = await extractPdfText(pdfBuffer);

    // 驗證標題與所有 CJK 欄位完全保留無亂碼
    expect(pdfText).toContain("繁體中文高階報表");
    expect(pdfText).toContain("王小明");
    expect(pdfText).toContain("大都會計程車隊股份有限公司");
    expect(pdfText).toContain("商務多元專車");
    expect(pdfText).toContain("台北車站東三門");
    expect(pdfText).toContain("桃園國際機場第二航廈");

    // 驗證長文字 sentinel 完整保存且跨行未被截斷
    expect(pdfText).toContain("BEGIN_SENTINEL");
    expect(pdfText).toContain("END_SENTINEL");
  });

  it("服務層整合：建立三種啟用格式之報表任務，均能成功完成並回傳正確 MIME 與副檔名", async () => {
    const service = new ReportingFilingService(audit);
    service.registerDriverRegistryFeedProvider(() => [
      {
        driverId: "DRV-101",
        name: "李國華",
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

    const formats = ["csv", "xlsx", "pdf"] as const;
    const expectedMimes = {
      csv: "text/csv; charset=utf-8",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pdf: "application/pdf",
    };

    for (const format of formats) {
      const accepted = service.createReportJob(
        {
          jobType: "driver_roster",
          format,
        },
        `req-c091-${format}`,
      );

      await waitForJobCompletion(service, accepted.jobId);

      const artifact = await service.renderReportArtifact(
        accepted.jobId,
        `req-c091-download-${format}`,
        PLATFORM_ADMIN_IDENTITY,
      );

      expect(artifact.contentType).toBe(expectedMimes[format]);
      expect(artifact.fileName).toBe(`driver_roster-${accepted.jobId}.${format}`);
      expect(artifact.buffer.byteLength).toBeGreaterThan(0);
    }
  });

  it("關鍵負向：未實作格式 (如 zip) 建立報表時明確拋出 501 (REPORT_FORMAT_NOT_IMPLEMENTED)", () => {
    const service = new ReportingFilingService(audit);

    expect(() => {
      service.createReportJob(
        {
          jobType: "driver_roster",
          format: "zip",
        },
        "req-c091-zip-test",
      );
    }).toThrowError(ApiRequestError);

    try {
      service.createReportJob(
        {
          jobType: "driver_roster",
          format: "zip",
        },
        "req-c091-zip-test",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(501);
      expect(err.response?.error?.code).toBe("REPORT_FORMAT_NOT_IMPLEMENTED");
    }
  });

  it("關鍵負向：未知格式 (如 tar / docx) 建立報表時明確拋出 400 (REPORT_FORMAT_UNKNOWN)", () => {
    const service = new ReportingFilingService(audit);

    for (const unknownFormat of ["tar", "docx", "xml"]) {
      try {
        service.createReportJob(
          {
            jobType: "driver_roster",
            format: unknownFormat as never,
          },
          `req-c091-${unknownFormat}`,
        );
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiRequestError);
        expect(err.status).toBe(400);
        expect(err.response?.error?.code).toBe("REPORT_FORMAT_UNKNOWN");
      }
    }
  });
});
