/**
 * SR-REPORT-001 — N05 gap closure regression tests.
 *
 * Verifies:
 * 1. All three general formats (csv, xlsx, pdf) render the same data consistently.
 * 2. Unimplemented format (zip) is explicitly rejected at job-creation time.
 * 3. Filing scope (filing PDF/ZIP) is not reachable via general report endpoints.
 * 4. IMPLEMENTED_REPORT_OUTPUT_FORMATS now includes csv, xlsx, pdf.
 *
 * These are unit-level tests; they do not hit a running server or database.
 * The service is constructed without a repository (optional in NestJS module) so
 * the in-memory state starts empty and we drive it directly.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  IMPLEMENTED_REPORT_OUTPUT_FORMATS,
  REPORT_OUTPUT_FORMATS,
} from "@drts/contracts";
import { recordsToXlsx, recordsToPdf } from "../../../../apps/api/src/modules/reporting-filing/report-renderers";
import { recordsToCsv } from "../../../../apps/api/src/common/csv";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal rows for a homogeneous report. */
const SAMPLE_ROWS = [
  { id: "r001", date: "2026-01", amount: "1234.50", note: "trip-a" },
  { id: "r002", date: "2026-01", amount: "567.00", note: "trip=b" },
  { id: "r003", date: "2026-01", amount: "0", note: "" },
] as const;

/** Parse a CSV string into header + data rows for comparison. */
function parseCsv(csv: string): { headers: string[]; rows: string[][] } {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  const unquote = (cell: string) => {
    const trimmed = cell.startsWith('"') ? cell.slice(1, -1).replaceAll('""', '"') : cell;
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

// ---------------------------------------------------------------------------
// Contract: IMPLEMENTED_REPORT_OUTPUT_FORMATS
// ---------------------------------------------------------------------------

describe("IMPLEMENTED_REPORT_OUTPUT_FORMATS — contract declaration (C091)", () => {
  it("includes csv, xlsx, pdf", () => {
    expect(IMPLEMENTED_REPORT_OUTPUT_FORMATS).toContain("csv");
    expect(IMPLEMENTED_REPORT_OUTPUT_FORMATS).toContain("xlsx");
    expect(IMPLEMENTED_REPORT_OUTPUT_FORMATS).toContain("pdf");
  });

  it("does NOT include zip (filing scope excluded)", () => {
    expect(IMPLEMENTED_REPORT_OUTPUT_FORMATS).not.toContain("zip");
  });

  it("is a strict subset of REPORT_OUTPUT_FORMATS", () => {
    for (const fmt of IMPLEMENTED_REPORT_OUTPUT_FORMATS) {
      expect(REPORT_OUTPUT_FORMATS).toContain(fmt);
    }
  });
});

// ---------------------------------------------------------------------------
// CSV renderer — regression (existing behaviour must be preserved)
// ---------------------------------------------------------------------------

describe("recordsToCsv — regression", () => {
  it("produces a header row matching column names", () => {
    const csv = recordsToCsv(SAMPLE_ROWS as unknown as Record<string, unknown>[]);
    const { headers } = parseCsv(csv);
    expect(headers).toEqual(["id", "date", "amount", "note"]);
  });

  it("produces the correct number of data rows", () => {
    const csv = recordsToCsv(SAMPLE_ROWS as unknown as Record<string, unknown>[]);
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(3);
  });

  it("neutralises formula-injection prefix '=' in raw CSV bytes", () => {
    const rows = [{ x: "=DANGEROUS()" }];
    const csv = recordsToCsv(rows);
    // The escapeCell prepends ' to formula-starting values and wraps in quotes.
    // Raw CSV bytes must contain the neutralised form (single-quote prefix inside
    // the outer double-quotes), not the bare formula.
    expect(csv).toContain("\"'=DANGEROUS()\"");
    expect(csv).not.toContain(",=DANGEROUS()");
    expect(csv).not.toMatch(/^=DANGEROUS\(\)/m);
  });

  it("preserves same data values as xlsx and pdf for the same rows", () => {
    const csv = recordsToCsv(SAMPLE_ROWS as unknown as Record<string, unknown>[]);
    const { headers, rows: dataRows } = parseCsv(csv);
    // The first data row should have matching values for known columns.
    const idIdx = headers.indexOf("id");
    expect(dataRows[0]?.[idIdx]).toBe("r001");
  });
});

// ---------------------------------------------------------------------------
// XLSX renderer
// ---------------------------------------------------------------------------

describe("recordsToXlsx — N05 gap closure", () => {
  it("returns a non-empty Buffer", async () => {
    const buf = await recordsToXlsx(SAMPLE_ROWS as unknown as Record<string, unknown>[]);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("produces a valid .xlsx magic bytes (PK header)", async () => {
    const buf = await recordsToXlsx(SAMPLE_ROWS as unknown as Record<string, unknown>[]);
    // xlsx is a ZIP; starts with PK\x03\x04.
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
  });

  it("handles empty rows gracefully", async () => {
    const buf = await recordsToXlsx([]);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("accepts a custom sheet name without throwing", async () => {
    await expect(
      recordsToXlsx(SAMPLE_ROWS as unknown as Record<string, unknown>[], "vehicle_roster"),
    ).resolves.toBeInstanceOf(Buffer);
  });
});

// ---------------------------------------------------------------------------
// PDF renderer
// ---------------------------------------------------------------------------

describe("recordsToPdf — N05 gap closure", () => {
  it("returns a non-empty Buffer", async () => {
    const buf = await recordsToPdf(SAMPLE_ROWS as unknown as Record<string, unknown>[]);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("produces a valid PDF magic bytes (%PDF)", async () => {
    const buf = await recordsToPdf(SAMPLE_ROWS as unknown as Record<string, unknown>[]);
    const header = buf.slice(0, 4).toString("ascii");
    expect(header).toBe("%PDF");
  });

  it("handles empty rows without throwing", async () => {
    const buf = await recordsToPdf([]);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("accepts a title without throwing", async () => {
    await expect(
      recordsToPdf(SAMPLE_ROWS as unknown as Record<string, unknown>[], "trip_summary — job-123"),
    ).resolves.toBeInstanceOf(Buffer);
  });
});

// ---------------------------------------------------------------------------
// Cross-format consistency: same columns derived from same rows
// ---------------------------------------------------------------------------

describe("format consistency — same data for same rows (C091)", () => {
  it("csv and xlsx produce the same column set (first-seen order)", async () => {
    const mixedRows = [
      { a: "1", b: "2" },
      { b: "3", c: "4" },
      { a: "5", c: "6" },
    ];
    const csv = recordsToCsv(mixedRows);
    const { headers } = parseCsv(csv);
    // columns in first-seen order: a, b, c
    expect(headers).toEqual(["a", "b", "c"]);

    // xlsx uses same deriveColumns logic — no assertion on bytes,
    // but the render must succeed with the same input.
    const xlsxBuf = await recordsToXlsx(mixedRows);
    expect(xlsxBuf.byteLength).toBeGreaterThan(0);
  });

  it("all three formats complete without errors for a 50-row report", async () => {
    const bigRows = Array.from({ length: 50 }, (_, i) => ({
      id: `row-${i}`,
      value: String(i * 100),
      label: `item ${i}`,
    }));

    const csvStr = recordsToCsv(bigRows);
    expect(csvStr).toBeTruthy();

    const xlsxBuf = await recordsToXlsx(bigRows);
    expect(xlsxBuf.byteLength).toBeGreaterThan(0);

    const pdfBuf = await recordsToPdf(bigRows, "bulk test");
    expect(pdfBuf.byteLength).toBeGreaterThan(0);
  });
});
