import { describe, expect, it } from "vitest";
import type { DriverStatementRecord } from "@drts/contracts";

import {
  filterStatementsForGroupedEarnings,
  resolveGroupedEarningsStatementMonth,
} from "@/lib/driver-earnings-period";

function makeStatement(periodMonth: string): DriverStatementRecord {
  return {
    statementId: `stmt-${periodMonth}`,
    driverId: "driver-001",
    periodMonth,
    receiptNo: `RCPT-${periodMonth}`,
    payoutStatus: "pending",
    grossEarning: { amountMinor: 1000, currency: "TWD" },
    serviceFee: { amountMinor: 100, currency: "TWD" },
    subsidy: { amountMinor: 0, currency: "TWD" },
    netAmount: { amountMinor: 900, currency: "TWD" },
    feePlanVersion: "v1",
    lines: [],
    createdAt: `${periodMonth}-01T00:00:00.000Z`,
    updatedAt: `${periodMonth}-02T00:00:00.000Z`,
  };
}

describe("driver earnings period helpers", () => {
  it("prefers the current month when statements exist for it", () => {
    const statements = [makeStatement("2026-05"), makeStatement("2026-06")];

    expect(
      resolveGroupedEarningsStatementMonth(
        statements,
        new Date("2026-06-06T00:00:00.000Z"),
      ),
    ).toBe("2026-06");
    expect(
      filterStatementsForGroupedEarnings(
        statements,
        "today",
        new Date("2026-06-06T00:00:00.000Z"),
      ),
    ).toHaveLength(1);
  });

  it("falls back to the latest available statement month when the current month is absent", () => {
    const statements = [makeStatement("2026-04"), makeStatement("2026-05")];

    expect(
      resolveGroupedEarningsStatementMonth(
        statements,
        new Date("2026-06-06T00:00:00.000Z"),
      ),
    ).toBe("2026-05");
    expect(
      filterStatementsForGroupedEarnings(
        statements,
        "week",
        new Date("2026-06-06T00:00:00.000Z"),
      ).map((statement) => statement.periodMonth),
    ).toEqual(["2026-05"]);
  });
});
