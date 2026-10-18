import { describe, expect, it, vi } from "vitest";
import {
  PLATFORM_CODE_FORWARDER_SANDBOX,
  PLATFORM_CODE_GRAB,
  PLATFORM_CODE_LINE_TAXI,
  PLATFORM_CODE_UBER,
} from "../../packages/contracts/src/platform-codes";

import type { DatabaseService } from "../../apps/api/src/common/db";
import { PlatformEarningsRepository } from "../../apps/api/src/modules/platform-earnings/platform-earnings.repository";
import { PlatformEarningsService } from "../../apps/api/src/modules/platform-earnings/platform-earnings.service";

describe("platform earnings service", () => {
  it("returns the seeded per-platform fallback for the billing settlement demo drivers", async () => {
    const service = new PlatformEarningsService();

    const driverOneBreakdown = await service.byPlatform("drv-demo-001");
    const driverTwoBreakdown = await service.byPlatform("drv-demo-002");

    expect(driverOneBreakdown.items).toEqual([
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
      {
        platformCode: PLATFORM_CODE_FORWARDER_SANDBOX,
        grossEarning: { currency: "TWD", amountMinor: 30000 },
        serviceFee: { currency: "TWD", amountMinor: 0 },
        subsidy: { currency: "TWD", amountMinor: 0 },
        netAmount: { currency: "TWD", amountMinor: 30000 },
      },
    ]);
    expect(driverTwoBreakdown.items).toEqual([
      {
        platformCode: PLATFORM_CODE_LINE_TAXI,
        grossEarning: { currency: "TWD", amountMinor: 150000 },
        serviceFee: { currency: "TWD", amountMinor: 22500 },
        subsidy: { currency: "TWD", amountMinor: 10000 },
        netAmount: { currency: "TWD", amountMinor: 137500 },
      },
    ]);
  });

  it("derives seeded summary totals from the per-platform fallback", async () => {
    const service = new PlatformEarningsService();

    const summary = await service.summary("drv-demo-001");

    expect(summary).toMatchObject({
      driverId: "drv-demo-001",
      totalGross: { currency: "TWD", amountMinor: 230000 },
      totalServiceFee: { currency: "TWD", amountMinor: 30000 },
      totalSubsidy: { currency: "TWD", amountMinor: 5000 },
      totalNet: { currency: "TWD", amountMinor: 205000 },
    });
  });

  it("maps the current demo driver fallback identity onto the seeded driver baseline", async () => {
    const service = new PlatformEarningsService();

    const seeded = await service.byPlatform("drv-demo-001");
    const demoFallback = await service.byPlatform("demo-driver");
    const expoDemoDriver = await service.byPlatform("driver-demo-001");

    expect(demoFallback.driverId).toBe("demo-driver");
    expect(demoFallback.items).toEqual(seeded.items);
    expect(expoDemoDriver.driverId).toBe("driver-demo-001");
    expect(expoDemoDriver.items).toEqual(seeded.items);
  });
});

describe("platform earnings controlled and successful empty modes", () => {
  it("keeps seeded aliases after a successful no-row SQL read", async () => {
    const db = {
      isEnabled: () => true,
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as DatabaseService;
    const service = new PlatformEarningsService(
      new PlatformEarningsRepository(db),
    );
    const baseline = await new PlatformEarningsService().byPlatform(
      "drv-demo-001",
    );
    for (const driverId of ["drv-demo-001", "demo-driver", "driver-demo-001"]) {
      expect((await service.byPlatform(driverId, "month")).items).toEqual(
        baseline.items,
      );
    }
    const ordinaryDriver = "11111111-1111-4111-8111-111111111111";
    expect((await service.byPlatform(ordinaryDriver, "today")).items).toEqual(
      [],
    );
    expect((await service.summary(ordinaryDriver, "today")).totalNet).toEqual({
      currency: "TWD",
      amountMinor: 0,
    });
    expect(db.query).toHaveBeenCalledTimes(5);
  });

  it("keeps explicit disabled-DB seeds without executing SQL and validates periods", async () => {
    const db = {
      isEnabled: () => false,
      query: vi.fn(),
    } as unknown as DatabaseService;
    const repo = new PlatformEarningsRepository(db);
    const service = new PlatformEarningsService(repo);
    expect(
      (await service.byPlatform("drv-demo-002", "week")).items,
    ).toHaveLength(1);
    expect((await service.byPlatform("unseeded", "today")).items).toEqual([]);
    await expect(
      service.byPlatform("drv-demo-001", "year"),
    ).rejects.toMatchObject({ code: "INVALID_EARNINGS_PERIOD" });
    await expect(
      repo.aggregateByDriver("drv-demo-001", "year"),
    ).rejects.toMatchObject({ code: "INVALID_EARNINGS_PERIOD" });
    expect(db.query).not.toHaveBeenCalled();
  });
});
