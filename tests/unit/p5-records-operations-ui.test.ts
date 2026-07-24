import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { MultiTaxiTripOperationalAdminView } from "@drts/contracts";
import { describe, expect, it } from "vitest";

import {
  buildRecordsQueryPath,
  calculateRetentionCoverage,
  formatRecordDateTime,
  getLegalHoldActionError,
  isExportTerminal,
  isRetentionFloorMet,
  normalizeRecordsScope,
  requireControlledDownloadUrl,
} from "../../apps/platform-admin-web/app/platform-admin/p5/records/records-operations-model";
import { recordsT } from "../../apps/platform-admin-web/app/platform-admin/p5/records/records-translations";

const recordsComponentSource = readFileSync(
  join(
    process.cwd(),
    "apps/platform-admin-web/app/platform-admin/p5/records/records-operations-console.tsx",
  ),
  "utf8",
);
const recordsPageSource = readFileSync(
  join(
    process.cwd(),
    "apps/platform-admin-web/app/platform-admin/p5/records/page.tsx",
  ),
  "utf8",
);
const apiClientSource = readFileSync(
  join(process.cwd(), "packages/api-client/src/index.ts"),
  "utf8",
);

function retentionRecord(
  generatedAt: string,
  retainUntil: string,
): MultiTaxiTripOperationalAdminView {
  return { generatedAt, retainUntil } as MultiTaxiTripOperationalAdminView;
}

describe("P5 records operations UI model", () => {
  it("normalizes and encodes the canonical record and legal-hold query fields", () => {
    expect(
      normalizeRecordsScope({
        month: " 2026-07 ",
        q: " ORD/7 台北 ",
        legalHold: "active",
      }),
    ).toEqual({
      month: "2026-07",
      q: "ORD/7 台北",
      legalHold: "active",
    });
    expect(
      buildRecordsQueryPath({
        month: " 2026-07 ",
        q: " ORD/7 台北 ",
        legalHold: "active",
      }),
    ).toBe(
      "/api/platform-admin/multi-taxi-trip-records?month=2026-07&q=ORD%2F7+%E5%8F%B0%E5%8C%97&legalHold=active",
    );
    expect(normalizeRecordsScope({ legalHold: "all" })).toEqual({});
  });

  it("calculates the 730-day retention floor without treating invalid dates as compliant", () => {
    const compliant = retentionRecord(
      "2026-01-01T00:00:00.000Z",
      "2028-01-01T00:00:00.000Z",
    );
    const short = retentionRecord(
      "2026-01-01T00:00:00.000Z",
      "2027-12-31T00:00:00.000Z",
    );
    const invalid = retentionRecord("invalid", "2028-01-01T00:00:00.000Z");

    expect(isRetentionFloorMet(compliant)).toBe(true);
    expect(isRetentionFloorMet(short)).toBe(false);
    expect(isRetentionFloorMet(invalid)).toBe(false);
    expect(calculateRetentionCoverage([compliant, short, invalid])).toEqual({
      covered: 1,
      total: 3,
      percent: 33,
    });
    expect(calculateRetentionCoverage([])).toEqual({
      covered: 0,
      total: 0,
      percent: 100,
    });
  });

  it("only treats persisted terminal job states as terminal", () => {
    expect(isExportTerminal("pending")).toBe(false);
    expect(isExportTerminal("running")).toBe(false);
    expect(isExportTerminal("completed")).toBe(true);
    expect(isExportTerminal("failed")).toBe(true);
  });

  it("formats canonical timestamps in the mandated Taipei display timezone", () => {
    expect(formatRecordDateTime("2026-07-24T04:00:00.000Z", "en")).toContain(
      "GMT+8",
    );
    expect(formatRecordDateTime("invalid", "zh")).toBeNull();
    expect(formatRecordDateTime(null, "zh")).toBeNull();
  });

  it("accepts only HTTPS server-issued download URLs", () => {
    expect(
      requireControlledDownloadUrl(
        "https://downloads.example.test/export.csv?signature=abc",
      ),
    ).toBe("https://downloads.example.test/export.csv?signature=abc");
    expect(() =>
      requireControlledDownloadUrl("http://downloads.example.test/export.csv"),
    ).toThrow("must use HTTPS");
    expect(() => requireControlledDownloadUrl("javascript:alert(1)")).toThrow(
      "must use HTTPS",
    );
    expect(() => requireControlledDownloadUrl("not-a-url")).toThrow();
  });

  it("preserves canonical legal-hold error status and server detail", () => {
    expect(
      getLegalHoldActionError(
        {
          statusCode: 409,
          apiMessage: "An active legal hold already exists.",
        },
        "fallback",
      ),
    ).toEqual({
      status: 409,
      message: "An active legal hold already exists.",
    });
    expect(
      getLegalHoldActionError(
        { statusCode: 403, apiMessage: "Operator is not allowed." },
        "fallback",
      ),
    ).toEqual({
      status: 403,
      message: "Operator is not allowed.",
    });
    expect(
      getLegalHoldActionError({ statusCode: 503 }, "authority unavailable"),
    ).toEqual({
      status: 503,
      message: "authority unavailable",
    });
    expect(
      getLegalHoldActionError(new Error("network failed"), "fallback"),
    ).toEqual({
      status: null,
      message: "network failed",
    });
  });

  it("keeps feature-local translations complete and interpolated", () => {
    expect(recordsT("en", "query.resultCount", { count: 8 })).toBe(
      "8 matching records",
    );
    expect(recordsT("zh", "query.resultCount", { count: 8 })).toBe(
      "符合 8 筆紀錄",
    );
    expect(recordsT("en", "hold.state.active")).toBe("Active");
    expect(recordsT("en", "hold.state.none")).toBe("None");
    expect(recordsT("en", "hold.state.unavailable")).toBe("Unavailable");
    expect(
      recordsT("zh", "hold.confirmRelease", { holdId: "hold-001" }),
    ).toContain("hold-001");
    expect(recordsT("zh", "hold.error503")).toContain("503");
  });
});

describe("P5 records operations production boundaries", () => {
  it("routes records to the production feature component", () => {
    expect(recordsPageSource).toContain("<RecordsOperationsConsole />");
    expect(recordsPageSource).not.toContain("P5AdminConsole");
  });

  it("never creates a browser export or falls back to fixture data", () => {
    expect(recordsComponentSource).not.toContain("new Blob");
    expect(recordsComponentSource).not.toContain("createObjectURL");
    expect(recordsComponentSource).not.toContain("fixture");
    expect(recordsComponentSource).not.toMatch(
      /multi-taxi-trip-records\/export(?:["'`?])/,
    );
    expect(recordsComponentSource).toContain(
      "multi-taxi-trip-records/export-jobs",
    );
  });

  it("connects canonical legal-hold create and release without changing retention semantics", () => {
    expect(recordsComponentSource).toContain("row.legalHold.state");
    expect(recordsComponentSource).toContain("record.legalHold.activeHolds");
    expect(recordsComponentSource).toContain('value="active"');
    expect(recordsComponentSource).toContain('value="none"');
    expect(recordsComponentSource).toContain('t("hold.body")');
    expect(recordsComponentSource).toContain("client.placeEvidenceLegalHold");
    expect(recordsComponentSource).toContain("client.releaseEvidenceLegalHold");
    expect(recordsComponentSource).toContain('family: "proof_bundle"');
    expect(recordsComponentSource).toContain("subjectId: record.orderId");
    expect(recordsComponentSource).toContain("window.confirm");
    expect(recordsComponentSource).toContain("hold.placedBy");
    expect(apiClientSource).toContain('"/api/audit/legal-holds"');
    expect(apiClientSource).toContain(
      "`/api/audit/legal-holds/${encodeURIComponent(holdId)}/release`",
    );
  });
});
