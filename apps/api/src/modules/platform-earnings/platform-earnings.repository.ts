import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import { ApiRequestError } from "../../common/api-envelope";
import { DatabaseService } from "../../common/db";
import type { MoneyAmount, PlatformCode } from "@drts/contracts";

export const PLATFORM_EARNINGS_TIMEZONE = "Asia/Taipei" as const;

export const PLATFORM_EARNINGS_PERIODS = ["today", "week", "month"] as const;
export type PlatformEarningsPeriod = (typeof PLATFORM_EARNINGS_PERIODS)[number];

export interface PlatformEarningsPeriodRange {
  period: PlatformEarningsPeriod;
  startDate: string;
  endDate: string;
  timeZone: string;
}

export interface PlatformEarningsAggregateRow {
  platform_code: string;
  currency_code: string;
  gross_minor: number;
  fee_minor: number;
  subsidy_minor: number;
  net_minor: number;
}

export interface PlatformEarningsAggregateItem {
  platformCode: PlatformCode;
  grossEarning: MoneyAmount;
  serviceFee: MoneyAmount;
  subsidy: MoneyAmount;
  netAmount: MoneyAmount;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNonUuidDriverCastError(driverId: string, err: unknown): boolean {
  if (UUID_PATTERN.test(driverId.trim())) {
    return false;
  }
  const pgCode = (err as { code?: unknown } | null)?.code;
  return pgCode === "22P02";
}

function extractCalendarDatePartsInTimeZone(
  referenceDate: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    throw new Error(`Unable to derive calendar date in timezone ${timeZone}`);
  }

  return { year, month, day };
}

function formatUtcCalendarDate(utcDate: Date): string {
  const year = String(utcDate.getUTCFullYear()).padStart(4, "0");
  const month = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utcDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolvePlatformEarningsPeriodRange(
  period?: string | null,
  referenceDate: Date = new Date(),
  timeZone: string = PLATFORM_EARNINGS_TIMEZONE,
): PlatformEarningsPeriodRange | null {
  if (period === undefined || period === null) {
    return null;
  }

  const normalized = typeof period === "string" ? period.trim() : "";
  if (
    !normalized ||
    !(PLATFORM_EARNINGS_PERIODS as readonly string[]).includes(normalized)
  ) {
    const message = `Invalid earnings period "${period}". Expected one of: ${PLATFORM_EARNINGS_PERIODS.join(", ")}.`;
    const error = new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "INVALID_EARNINGS_PERIOD",
      message,
      {
        period,
        allowedPeriods: [...PLATFORM_EARNINGS_PERIODS],
      },
      false,
    );
    error.message = message;
    throw error;
  }

  const validPeriod = normalized as PlatformEarningsPeriod;
  const { year, month, day } = extractCalendarDatePartsInTimeZone(
    referenceDate,
    timeZone,
  );
  const anchorUtc = new Date(Date.UTC(year, month - 1, day));
  const todayIso = formatUtcCalendarDate(anchorUtc);

  if (validPeriod === "today") {
    return {
      period: "today",
      startDate: todayIso,
      endDate: todayIso,
      timeZone,
    };
  }

  if (validPeriod === "week") {
    const utcDayOfWeek = anchorUtc.getUTCDay();
    const daysSinceMonday = (utcDayOfWeek + 6) % 7;
    const weekStartUtc = new Date(
      Date.UTC(year, month - 1, day - daysSinceMonday),
    );
    const weekEndUtc = new Date(
      Date.UTC(year, month - 1, day - daysSinceMonday + 6),
    );
    return {
      period: "week",
      startDate: formatUtcCalendarDate(weekStartUtc),
      endDate: formatUtcCalendarDate(weekEndUtc),
      timeZone,
    };
  }

  const monthStartUtc = new Date(Date.UTC(year, month - 1, 1));
  const monthEndUtc = new Date(Date.UTC(year, month, 0));
  return {
    period: "month",
    startDate: formatUtcCalendarDate(monthStartUtc),
    endDate: formatUtcCalendarDate(monthEndUtc),
    timeZone,
  };
}

@Injectable()
export class PlatformEarningsRepository {
  private readonly logger = new Logger(PlatformEarningsRepository.name);

  constructor(@Optional() private readonly db?: DatabaseService) {}

  isEnabled() {
    return this.db?.isEnabled() ?? false;
  }

  async aggregateByDriver(
    driverId: string,
    periodOrRange?: string | PlatformEarningsPeriodRange | null,
    referenceDate?: Date,
  ): Promise<PlatformEarningsAggregateItem[]> {
    const periodRange =
      typeof periodOrRange === "string"
        ? resolvePlatformEarningsPeriodRange(periodOrRange, referenceDate)
        : (periodOrRange ?? null);

    if (!this.isEnabled()) return [];

    const sql = periodRange
      ? `SELECT platform_code,
                COALESCE(currency_code, 'TWD') AS currency_code,
                SUM(gross_minor)   AS gross_minor,
                SUM(fee_minor)     AS fee_minor,
                SUM(subsidy_minor) AS subsidy_minor,
                SUM(net_minor)     AS net_minor
         FROM ops.phase1_platform_earnings_ledger
         WHERE driver_id = $1
           AND period_date >= $2::date
           AND period_date <= $3::date
         GROUP BY platform_code, currency_code
         ORDER BY platform_code`
      : `SELECT platform_code,
                COALESCE(currency_code, 'TWD') AS currency_code,
                SUM(gross_minor)   AS gross_minor,
                SUM(fee_minor)     AS fee_minor,
                SUM(subsidy_minor) AS subsidy_minor,
                SUM(net_minor)     AS net_minor
         FROM ops.phase1_platform_earnings_ledger
         WHERE driver_id = $1
         GROUP BY platform_code, currency_code
         ORDER BY platform_code`;

    const params: unknown[] = periodRange
      ? [driverId, periodRange.startDate, periodRange.endDate]
      : [driverId];

    try {
      const result = await this.db!.query<PlatformEarningsAggregateRow>(
        sql,
        params,
      );

      return result.rows.map((row) => ({
        platformCode: row.platform_code as PlatformCode,
        grossEarning: {
          currency: row.currency_code,
          amountMinor: Number(row.gross_minor ?? 0),
        },
        serviceFee: {
          currency: row.currency_code,
          amountMinor: Number(row.fee_minor ?? 0),
        },
        subsidy: {
          currency: row.currency_code,
          amountMinor: Number(row.subsidy_minor ?? 0),
        },
        netAmount: {
          currency: row.currency_code,
          amountMinor: Number(row.net_minor ?? 0),
        },
      }));
    } catch (err) {
      this.logger.warn(
        `Failed to aggregate platform earnings for ${driverId}: ${err}`,
      );
      if (isNonUuidDriverCastError(driverId, err)) {
        return [];
      }
      if (err instanceof ApiRequestError) {
        throw err;
      }
      const message =
        "Platform earnings canonical read is currently unavailable.";
      const apiError = new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PLATFORM_EARNINGS_READ_UNAVAILABLE",
        message,
        {
          driverId,
          ...(periodRange
            ? {
                period: periodRange.period,
                startDate: periodRange.startDate,
                endDate: periodRange.endDate,
              }
            : {}),
        },
        true,
      );
      apiError.message = message;
      throw apiError;
    }
  }
}
