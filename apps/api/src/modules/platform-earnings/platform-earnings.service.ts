import { Injectable, Optional } from "@nestjs/common";
import type { MoneyAmount, PlatformEarningsItem } from "@drts/contracts";
import { PlatformEarningsRepository } from "./platform-earnings.repository";

const DEFAULT_CURRENCY = "TWD";

@Injectable()
export class PlatformEarningsService {
  constructor(@Optional() private readonly repo?: PlatformEarningsRepository) {}

  private dbEnabled(): boolean {
    return this.repo?.isEnabled() ?? false;
  }

  async byPlatform(driverId: string): Promise<{
    driverId: string;
    items: PlatformEarningsItem[];
    notes: string[];
  }> {
    if (this.dbEnabled()) {
      const items = await this.repo!.aggregateByDriver(driverId);
      return {
        driverId,
        items,
        notes: [
          "Aggregated from ops.phase1_platform_earnings_ledger when DB is configured.",
        ],
      };
    }

    return {
      driverId,
      items: [],
      notes: [
        "Platform earnings require DB-backed aggregation from ops.phase1_platform_earnings_ledger.",
        "Configure DATABASE_URL to enable the persistence-backed earnings read model.",
      ],
    };
  }

  async summary(driverId: string): Promise<{
    driverId: string;
    totalGross: MoneyAmount;
    totalServiceFee: MoneyAmount;
    totalSubsidy: MoneyAmount;
    totalNet: MoneyAmount;
    notes: string[];
  }> {
    const { items } = await this.byPlatform(driverId);
    const currency = items[0]?.grossEarning?.currency ?? DEFAULT_CURRENCY;

    const sum = (
      pick: (i: PlatformEarningsItem) => MoneyAmount,
    ): MoneyAmount => {
      let total = 0;
      for (const item of items) total += pick(item)?.amountMinor ?? 0;
      return { currency, amountMinor: total };
    };

    return {
      driverId,
      totalGross: sum((i: any) => i.grossEarning),
      totalServiceFee: sum((i: any) => i.serviceFee),
      totalSubsidy: sum((i: any) => i.subsidy),
      totalNet: sum((i: any) => i.netAmount),
      notes: [
        "Summary totals are derived from the per-platform aggregation.",
        ...(this.dbEnabled()
          ? []
          : [
              "Platform earnings remain empty until the DB-backed ledger is configured.",
            ]),
      ],
    };
  }
}
