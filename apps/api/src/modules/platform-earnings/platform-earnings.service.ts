import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  PLATFORM_CODE_GRAB,
  PLATFORM_CODE_LINE_TAXI,
  PLATFORM_CODE_UBER,
} from "@drts/contracts";
import type {
  MoneyAmount,
  PlatformCode,
  PlatformEarningsItem,
} from "@drts/contracts";
import { PlatformEarningsRepository } from "./platform-earnings.repository";

const DEFAULT_CURRENCY = "TWD";

type PlatformEarningsSeedRecord = {
  driverId: string;
  platformCode: PlatformCode;
  grossMinor: number;
  serviceFeeMinor: number;
  subsidyMinor: number;
  netMinor: number;
};

// Mirrors the billing-settlement demo March baselines so the non-DB fallback
// still exposes realistic per-platform earnings for seeded drivers.
const PLATFORM_EARNINGS_SEED: PlatformEarningsSeedRecord[] = [
  {
    driverId: "drv-demo-001",
    platformCode: PLATFORM_CODE_UBER,
    grossMinor: 120000,
    serviceFeeMinor: 18000,
    subsidyMinor: 5000,
    netMinor: 107000,
  },
  {
    driverId: "drv-demo-001",
    platformCode: PLATFORM_CODE_GRAB,
    grossMinor: 80000,
    serviceFeeMinor: 12000,
    subsidyMinor: 0,
    netMinor: 68000,
  },
  {
    driverId: "drv-demo-002",
    platformCode: PLATFORM_CODE_LINE_TAXI,
    grossMinor: 150000,
    serviceFeeMinor: 22500,
    subsidyMinor: 10000,
    netMinor: 137500,
  },
];

const DEMO_DRIVER_ALIASES: Record<string, string> = {
  "demo-driver": "drv-demo-001",
  "driver-demo-001": "drv-demo-001",
};

function money(amountMinor: number): MoneyAmount {
  return {
    currency: DEFAULT_CURRENCY,
    amountMinor,
  };
}

function toSeedItem(record: PlatformEarningsSeedRecord): PlatformEarningsItem {
  return {
    platformCode: record.platformCode,
    grossEarning: money(record.grossMinor),
    serviceFee: money(record.serviceFeeMinor),
    subsidy: money(record.subsidyMinor),
    netAmount: money(record.netMinor),
  };
}

function buildSeedMemory(): Map<string, Map<string, PlatformEarningsItem>> {
  const memory = new Map<string, Map<string, PlatformEarningsItem>>();

  for (const record of PLATFORM_EARNINGS_SEED) {
    const bucket =
      memory.get(record.driverId) ?? new Map<string, PlatformEarningsItem>();
    bucket.set(record.platformCode, toSeedItem(record));
    memory.set(record.driverId, bucket);
  }

  return memory;
}

@Injectable()
export class PlatformEarningsService {
  private readonly logger = new Logger(PlatformEarningsService.name);

  // in-memory fallback: driverId -> platformCode -> item
  private memory: Map<string, Map<string, PlatformEarningsItem>> =
    buildSeedMemory();

  constructor(@Optional() private readonly repo?: PlatformEarningsRepository) {}

  private dbEnabled(): boolean {
    return this.repo?.isEnabled() ?? false;
  }

  private resolveMemoryDriverId(driverId: string): string {
    return this.memory.has(driverId)
      ? driverId
      : (DEMO_DRIVER_ALIASES[driverId] ?? driverId);
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

    const memoryDriverId = this.resolveMemoryDriverId(driverId);
    const bucket =
      this.memory.get(memoryDriverId) ??
      new Map<string, PlatformEarningsItem>();
    if (!this.memory.has(memoryDriverId))
      this.memory.set(memoryDriverId, bucket);
    return {
      driverId,
      items: Array.from(bucket.values()),
      notes: [
        "In-memory runtime fallback seeded from the billing settlement demo drivers.",
        "Configure DATABASE_URL to enable DB-backed aggregation.",
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
      notes: ["Summary totals are derived from the per-platform aggregation."],
    };
  }
}
