import { describe, expect, it, vi } from "vitest";
import {
  PLATFORM_CODE_GRAB,
  PLATFORM_CODE_UBER,
} from "../../packages/contracts/src/platform-codes";

import { PlatformEarningsRepository } from "../../apps/api/src/modules/platform-earnings/platform-earnings.repository";
import { PlatformEarningsService } from "../../apps/api/src/modules/platform-earnings/platform-earnings.service";

function createRepository({
  enabled = true,
  items = [],
}: {
  enabled?: boolean;
  items?: Awaited<ReturnType<PlatformEarningsRepository["aggregateByDriver"]>>;
} = {}) {
  return {
    isEnabled: vi.fn().mockReturnValue(enabled),
    aggregateByDriver: vi.fn().mockResolvedValue(items),
  } as unknown as PlatformEarningsRepository;
}

describe("platform earnings service", () => {
  it("returns DB-backed per-platform aggregation when persistence is enabled", async () => {
    const repo = createRepository({
      items: [
        {
          platformCode: PLATFORM_CODE_UBER,
          grossEarning: { currency: "TWD", amountMinor: 120000 },
          serviceFee: { currency: "TWD", amountMinor: 18000 },
          subsidy: { currency: "TWD", amountMinor: 5000 },
          netAmount: { currency: "TWD", amountMinor: 107000 },
        },
        {
          platformCode: PLATFORM_CODE_GRAB,
          grossEarning: { currency: "TWD", amountMinor: 80000 },
          serviceFee: { currency: "TWD", amountMinor: 12000 },
          subsidy: { currency: "TWD", amountMinor: 0 },
          netAmount: { currency: "TWD", amountMinor: 68000 },
        },
      ],
    });
    const service = new PlatformEarningsService(repo);

    const breakdown = await service.byPlatform("drv-demo-001");

    expect(repo.aggregateByDriver).toHaveBeenCalledWith("drv-demo-001");
    expect(breakdown).toEqual({
      driverId: "drv-demo-001",
      items: [
        {
          platformCode: PLATFORM_CODE_UBER,
          grossEarning: { currency: "TWD", amountMinor: 120000 },
          serviceFee: { currency: "TWD", amountMinor: 18000 },
          subsidy: { currency: "TWD", amountMinor: 5000 },
          netAmount: { currency: "TWD", amountMinor: 107000 },
        },
        {
          platformCode: PLATFORM_CODE_GRAB,
          grossEarning: { currency: "TWD", amountMinor: 80000 },
          serviceFee: { currency: "TWD", amountMinor: 12000 },
          subsidy: { currency: "TWD", amountMinor: 0 },
          netAmount: { currency: "TWD", amountMinor: 68000 },
        },
      ],
      notes: [
        "Aggregated from ops.phase1_platform_earnings_ledger when DB is configured.",
      ],
    });
  });

  it("returns an explicit empty state when the DB-backed ledger is unavailable", async () => {
    const repo = createRepository({ enabled: false });
    const service = new PlatformEarningsService(repo);

    const breakdown = await service.byPlatform("demo-driver");

    expect(repo.aggregateByDriver).not.toHaveBeenCalled();
    expect(breakdown).toEqual({
      driverId: "demo-driver",
      items: [],
      notes: [
        "Platform earnings require DB-backed aggregation from ops.phase1_platform_earnings_ledger.",
        "Configure DATABASE_URL to enable the persistence-backed earnings read model.",
      ],
    });
  });

  it("derives summary totals from the DB-backed per-platform aggregation", async () => {
    const repo = createRepository({
      items: [
        {
          platformCode: PLATFORM_CODE_UBER,
          grossEarning: { currency: "TWD", amountMinor: 120000 },
          serviceFee: { currency: "TWD", amountMinor: 18000 },
          subsidy: { currency: "TWD", amountMinor: 5000 },
          netAmount: { currency: "TWD", amountMinor: 107000 },
        },
        {
          platformCode: PLATFORM_CODE_GRAB,
          grossEarning: { currency: "TWD", amountMinor: 80000 },
          serviceFee: { currency: "TWD", amountMinor: 12000 },
          subsidy: { currency: "TWD", amountMinor: 0 },
          netAmount: { currency: "TWD", amountMinor: 68000 },
        },
      ],
    });
    const service = new PlatformEarningsService(repo);

    const summary = await service.summary("drv-demo-001");

    expect(summary).toEqual({
      driverId: "drv-demo-001",
      totalGross: { currency: "TWD", amountMinor: 200000 },
      totalServiceFee: { currency: "TWD", amountMinor: 30000 },
      totalSubsidy: { currency: "TWD", amountMinor: 5000 },
      totalNet: { currency: "TWD", amountMinor: 175000 },
      notes: ["Summary totals are derived from the per-platform aggregation."],
    });
  });

  it("returns zero-value summary totals when no DB-backed ledger is configured", async () => {
    const repo = createRepository({ enabled: false });
    const service = new PlatformEarningsService(repo);

    const summary = await service.summary("demo-driver");

    expect(summary).toEqual({
      driverId: "demo-driver",
      totalGross: { currency: "TWD", amountMinor: 0 },
      totalServiceFee: { currency: "TWD", amountMinor: 0 },
      totalSubsidy: { currency: "TWD", amountMinor: 0 },
      totalNet: { currency: "TWD", amountMinor: 0 },
      notes: [
        "Summary totals are derived from the per-platform aggregation.",
        "Platform earnings remain empty until the DB-backed ledger is configured.",
      ],
    });
  });
});
