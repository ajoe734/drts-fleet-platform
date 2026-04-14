import { Injectable, Logger, Optional } from "@nestjs/common";
import type { MoneyAmount, PlatformEarningsItem } from "@drts/contracts";
import { PlatformEarningsRepository } from "./platform-earnings.repository";

@Injectable()
export class PlatformEarningsService {
  private readonly logger = new Logger(PlatformEarningsService.name);

  // in-memory fallback: driverId -> platformCode -> item
  private memory: Map<string, Map<string, any>> = new Map();

  constructor(@Optional() private readonly repo?: PlatformEarningsRepository) {}

  private dbEnabled(): boolean {
    return this.repo?.isEnabled() ?? false;
  }

  async byPlatform(driverId: string): Promise<any> {
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

    const bucket = this.memory.get(driverId) ?? new Map<string, any>();
    if (!this.memory.has(driverId)) this.memory.set(driverId, bucket);
    return {
      driverId,
      items: Array.from(bucket.values()),
      notes: [
        "In-memory runtime fallback. Configure DATABASE_URL to enable DB-backed aggregation.",
      ],
    };
  }

  async summary(driverId: string): Promise<any> {
    const { items } = await this.byPlatform(driverId);
    const currency = items[0]?.grossEarning?.currency ?? "TWD";

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
      notes: ["Summary totals are derived from the per-platform aggregation."],
    };
  }
}
