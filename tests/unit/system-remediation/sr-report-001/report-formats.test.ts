import { afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OrderRecord, ReportOutputFormat } from "@drts/contracts";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ReportingFilingService } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import {
  recordsToPdf,
  recordsToXlsx,
} from "../../../../apps/api/src/modules/reporting-filing/report-renderers";
import { recordsToCsv } from "../../../../apps/api/src/common/csv";

const textValue = (value: unknown) =>
  value == null
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
async function workbookValues(buffer: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    buffer as unknown as Parameters<typeof book.xlsx.load>[0],
  );
  const rows: unknown[][] = [];
  book.worksheets[0]!.eachRow((row) =>
    rows.push((row.values as unknown[]).slice(1)),
  );
  return rows;
}
function save(name: string, bytes: Buffer | string) {
  const output = process.env.SR_REPORT_EVIDENCE_DIR;
  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, name), bytes);
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("SR-REPORT-001 renderers", () => {
  it("round-trips heterogeneous fields, Unicode, JSON, nulls and literal formulas in XLSX", async () => {
    const rows = [
      {
        id: "台北車隊",
        note: '=HYPERLINK("https://example.test")',
        value: { n: 123 },
        empty: null,
      },
      { id: "two", extra: 'comma, quote"\nnext line' },
    ];
    const values = await workbookValues(await recordsToXlsx(rows));
    expect(values[0]).toEqual(["id", "note", "value", "empty", "extra"]);
    expect(values[1]).toEqual(["台北車隊", rows[0]!.note, '{"n":123}', "", ""]);
    expect(values[2]).toEqual(["two", "", "", "", rows[1]!.extra]);
    expect(recordsToCsv([{ note: "=1+1" }])).toContain('"\'=1+1"');
  });

  it("writes an empty workbook and PDF", async () => {
    expect(await workbookValues(await recordsToXlsx([]))).toEqual([]);
    const bytes = await recordsToPdf([]);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    save("empty.pdf", bytes);
  });

  it("keeps long values and wide schemas in a multipage PDF for independent parsing", async () => {
    vi.stubEnv("REPORT_PDF_FONT_PATH", "");
    const rows = Array.from({ length: 55 }, (_, i) =>
      Object.fromEntries(
        Array.from({ length: 22 }, (_, col) => [
          `field${col}`,
          `row${i}-column${col}-` + "long-value ".repeat(12) + "END",
        ]),
      ),
    );
    const pdf = await recordsToPdf(rows, "Wide report");
    expect(pdf.subarray(-6).toString()).toBe("%%EOF\n");
    save("wide.pdf", pdf);
    save("wide.json", JSON.stringify(rows));
  });

  it("explicitly rejects unsupported Unicode without a deployment font", () => {
    vi.stubEnv("REPORT_PDF_FONT_PATH", "");
    try {
      recordsToPdf([{ name: "台北車隊" }]);
      expect.fail("Unicode must not be corrupted");
    } catch (error) {
      expect(error).toMatchObject({ code: "REPORT_PDF_FONT_REQUIRED" });
    }
  });
});

describe("SR-REPORT-001 service integration (in-memory, no live DB)", () => {
  it("uses the same filtered row builder and MIME/extension for all three formats", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-06T18:00:00Z"));
    vi.stubEnv("REPORT_PDF_FONT_PATH", "");
    const service = new ReportingFilingService(new AuditNotificationService());
    // Only fields consumed by the existing builder; these are test inputs,
    // never replacement rows or a production feed.
    service.registerOrderFeedProvider(
      () =>
        [
          {
            orderId: "SR-REPORT-INCLUDED",
            createdAt: "2026-09-02T00:00:00Z",
            serviceProductCode: "general",
            status: "completed",
          },
          {
            orderId: "SR-REPORT-EXCLUDED",
            createdAt: "2026-08-02T00:00:00Z",
            serviceProductCode: "excluded",
            status: "cancelled",
          },
        ] as OrderRecord[],
    );
    const filters = { from: "2026-09-01", to: "2026-09-30" };
    const manifests: unknown[] = [];
    let expectedRows: unknown;
    for (const format of ["csv", "xlsx", "pdf"] as const) {
      vi.setSystemTime(new Date("2026-09-06T18:00:00Z"));
      const job = service.createReportJob({
        jobType: "trip_summary",
        format,
        filters,
      });
      await vi.waitFor(() =>
        expect(service.getReportJob(job.jobId).status).toBe("completed"),
      );
      const result = service.getReportJob(job.jobId);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        serviceProduct: "general",
        totalOrders: 1,
        completedTrips: 1,
      });
      expectedRows ??= result.rows;
      expect(result.rows).toEqual(expectedRows);
      const artifact = await service.renderReportArtifact(job.jobId);
      expect(artifact.fileName).toBe(`trip_summary-${job.jobId}.${format}`);
      expect(artifact.contentType).toBe(
        {
          csv: "text/csv; charset=utf-8",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          pdf: "application/pdf",
        }[format],
      );
      if (format === "xlsx") {
        expect(await workbookValues(artifact.buffer)).toEqual([
          Object.keys(result.rows[0]!),
          ...result.rows.map((row) => Object.values(row).map(textValue)),
        ]);
      }
      save(`filtered.${format}`, artifact.buffer);
      manifests.push({
        jobId: job.jobId,
        artifactId: result.artifact?.artifactId,
        format,
        filters,
        rows: result.rows,
      });
    }
    save("filtered.json", JSON.stringify(manifests));
  });

  it.each(["zip", "html"])("rejects %s before creating a job", (format) => {
    const service = new ReportingFilingService(new AuditNotificationService());
    expect(() =>
      service.createReportJob({
        jobType: "trip_summary",
        format: format as ReportOutputFormat,
      }),
    ).toThrow();
    expect(service.listReportJobs()).toHaveLength(0);
  });

  it("does not expose P5 exports or filing packages through general report downloads", async () => {
    const service = new ReportingFilingService(new AuditNotificationService());
    expect(() =>
      service.createReportJob({
        jobType: "multi_taxi_trip_records",
        format: "pdf",
      }),
    ).toThrow();
    const filing = service.generateFilingPackage({
      packageType: "monthly_report",
    });
    await expect(
      service.renderReportArtifact(filing.packageId),
    ).rejects.toThrow();
  });

  it("enforces tenant scope and rejects incomplete jobs for each format", async () => {
    const service = new ReportingFilingService(new AuditNotificationService());
    for (const format of ["csv", "xlsx", "pdf"] as const) {
      const job = service.createReportJob(
        { jobType: "monthly_trip_report", format },
        undefined,
        "tenant-a",
      );
      await expect(
        service.renderReportArtifact(job.jobId, undefined, null, "tenant-b"),
      ).rejects.toThrow();
    }
  });
});
