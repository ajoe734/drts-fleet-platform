import { describe, expect, it } from "vitest";
import {
  PLATFORM_CODE_GRAB,
  PLATFORM_CODE_LINE_TAXI,
  PLATFORM_CODE_UBER,
} from "../../packages/contracts/src/platform-codes";

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
      totalGross: { currency: "TWD", amountMinor: 200000 },
      totalServiceFee: { currency: "TWD", amountMinor: 30000 },
      totalSubsidy: { currency: "TWD", amountMinor: 5000 },
      totalNet: { currency: "TWD", amountMinor: 175000 },
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
