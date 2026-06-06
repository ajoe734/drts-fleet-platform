import type { DriverStatementRecord } from "@drts/contracts";

export type DriverEarningsPeriod = "today" | "week" | "month";

function formatPeriodMonth(value: Date) {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function getLatestStatementMonth(
  statements: DriverStatementRecord[],
): string | null {
  const months = Array.from(
    new Set(
      statements
        .map((statement) => statement.periodMonth.trim())
        .filter((periodMonth) => periodMonth.length > 0),
    ),
  ).sort((left, right) => right.localeCompare(left));

  return months[0] ?? null;
}

export function resolveGroupedEarningsStatementMonth(
  statements: DriverStatementRecord[],
  now: Date = new Date(),
): string | null {
  const currentMonth = formatPeriodMonth(now);
  if (
    statements.some(
      (statement) => statement.periodMonth.trim() === currentMonth,
    )
  ) {
    return currentMonth;
  }

  return getLatestStatementMonth(statements);
}

export function filterStatementsForGroupedEarnings(
  statements: DriverStatementRecord[],
  _period: DriverEarningsPeriod,
  now: Date = new Date(),
): DriverStatementRecord[] {
  const targetMonth = resolveGroupedEarningsStatementMonth(statements, now);
  if (!targetMonth) {
    return [];
  }

  // Statement contracts are monthly aggregates, so non-platform grouping
  // can only align to the best available statement month.
  return statements.filter(
    (statement) => statement.periodMonth.trim() === targetMonth,
  );
}
