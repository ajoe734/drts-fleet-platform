import { Injectable, Logger, Optional } from "@nestjs/common";
import { DatabaseService } from "../../common/db";
import type { MoneyAmount } from "@drts/contracts";

export interface PlatformEarningsAggregateRow {
  platform_code: string;
  currency_code: string;
  gross_minor: number;
  fee_minor: number;
  subsidy_minor: number;
  net_minor: number;
}

export interface PlatformEarningsAggregateItem {
  platformCode: string;
  grossEarning: MoneyAmount;
  serviceFee: MoneyAmount;
  subsidy: MoneyAmount;
  netAmount: MoneyAmount;
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
  ): Promise<PlatformEarningsAggregateItem[]> {
    if (!this.isEnabled()) return [];
    try {
      const result = await this.db!.query<PlatformEarningsAggregateRow>(
        `SELECT platform_code,
                COALESCE(currency_code, 'TWD') AS currency_code,
                SUM(gross_minor)   AS gross_minor,
                SUM(fee_minor)     AS fee_minor,
                SUM(subsidy_minor) AS subsidy_minor,
                SUM(net_minor)     AS net_minor
         FROM ops.phase1_platform_earnings_ledger
         WHERE driver_id = $1
         GROUP BY platform_code, currency_code
         ORDER BY platform_code`,
        [driverId],
      );

      return result.rows.map((row) => ({
        platformCode: row.platform_code,
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
      return [];
    }
  }
}
