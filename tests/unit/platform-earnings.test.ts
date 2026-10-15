import { describe, expect, it, vi } from "vitest";
import {
  PLATFORM_CODE_FORWARDER_SANDBOX,
  PLATFORM_CODE_GRAB,
  PLATFORM_CODE_LINE_TAXI,
  PLATFORM_CODE_UBER,
} from "../../packages/contracts/src/platform-codes";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import type { DatabaseService } from "../../apps/api/src/common/db";
import { PlatformEarningsController } from "../../apps/api/src/modules/platform-earnings/platform-earnings.controller";
import {
  PlatformEarningsRepository,
  resolvePlatformEarningsPeriodRange,
} from "../../apps/api/src/modules/platform-earnings/platform-earnings.repository";
import { PlatformEarningsService } from "../../apps/api/src/modules/platform-earnings/platform-earnings.service";

function makeDriverIdentity(
  actorId: string | null = "11111111-1111-4111-8111-111111111111",
): BootstrapRequestIdentity {
  return {
    actorId: actorId as string,
    actorType: "driver_user",
    realm: "driver",
    tenantId: null,
    roles: ["driver_operator"],
    scopes: ["driver:read"],
    authMode: "jwt_bearer",
    roleFamilies: ["driver"],
    requestId: null,
  };
}

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

  it("applies Asia/Taipei today/week/month period_date SQL predicates and parameters while preserving absent-period callers", async () => {
    const ownDriverId = "11111111-1111-4111-8111-111111111111";
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      isEnabled: () => true,
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return {
          rows: [
            {
              platform_code: PLATFORM_CODE_UBER,
              currency_code: "TWD",
              gross_minor: 50000,
              fee_minor: 5000,
              subsidy_minor: 2000,
              net_minor: 47000,
            },
          ],
          rowCount: 1,
        };
      }),
    } as unknown as DatabaseService;

    const repo = new PlatformEarningsRepository(db);
    const service = new PlatformEarningsService(repo);
    const controller = new PlatformEarningsController(service);

    // 2026-10-01 00:30 Asia/Taipei (2026-09-30T16:30:00Z) — tests month/week rollover
    const refDate = new Date("2026-09-30T16:30:00.000Z");

    await service.byPlatform(ownDriverId, "today", refDate);
    expect(calls[0]?.sql).toContain("WHERE driver_id = $1");
    expect(calls[0]?.sql).toContain("period_date >= $2::date");
    expect(calls[0]?.sql).toContain("period_date <= $3::date");
    expect(calls[0]?.params).toEqual([ownDriverId, "2026-10-01", "2026-10-01"]);

    await service.byPlatform(ownDriverId, "week", refDate);
    expect(calls[1]?.params).toEqual([ownDriverId, "2026-09-28", "2026-10-04"]);

    await service.byPlatform(ownDriverId, "month", refDate);
    expect(calls[2]?.params).toEqual([ownDriverId, "2026-10-01", "2026-10-31"]);

    // Controller absent-period call preserves un-windowed WHERE driver_id = $1
    const unwindowed = await controller.getByPlatform(
      makeDriverIdentity(ownDriverId),
      undefined,
      undefined,
      "req-unwindowed",
    );
    expect(calls[3]?.sql).toContain("WHERE driver_id = $1");
    expect(calls[3]?.sql).not.toContain("period_date >=");
    expect(calls[3]?.params).toEqual([ownDriverId]);
    expect(unwindowed.data.items).toEqual([
      {
        platformCode: PLATFORM_CODE_UBER,
        grossEarning: { currency: "TWD", amountMinor: 50000 },
        serviceFee: { currency: "TWD", amountMinor: 5000 },
        subsidy: { currency: "TWD", amountMinor: 2000 },
        netAmount: { currency: "TWD", amountMinor: 47000 },
      },
    ]);

    // Year rollover in Asia/Taipei: 2027-01-01 02:00 Asia/Taipei (2026-12-31T18:00:00Z)
    expect(
      resolvePlatformEarningsPeriodRange(
        "week",
        new Date("2026-12-31T18:00:00.000Z"),
      ),
    ).toEqual({
      period: "week",
      startDate: "2026-12-28",
      endDate: "2027-01-03",
      timeZone: "Asia/Taipei",
    });

    await expect(
      controller.getByPlatform(
        makeDriverIdentity(ownDriverId),
        undefined,
        "quarter",
      ),
    ).rejects.toMatchObject({
      code: "INVALID_EARNINGS_PERIOD",
      status: 400,
    });
  });

  it("distinguishes rejecting canonical SQL from genuine zero-row empty data and demo driver fallback", async () => {
    const ownDriverId = "22222222-2222-4222-8222-222222222222";
    const rejectingDb = {
      isEnabled: () => true,
      query: vi.fn(async () => {
        throw new Error("connection terminated unexpectedly");
      }),
    } as unknown as DatabaseService;

    const rejectingController = new PlatformEarningsController(
      new PlatformEarningsService(new PlatformEarningsRepository(rejectingDb)),
    );

    await expect(
      rejectingController.getByPlatform(
        makeDriverIdentity(ownDriverId),
        undefined,
        "month",
      ),
    ).rejects.toMatchObject({
      code: "PLATFORM_EARNINGS_READ_UNAVAILABLE",
      status: 503,
    });

    await expect(
      rejectingController.getByPlatform(
        makeDriverIdentity("drv-demo-001"),
        undefined,
        "month",
      ),
    ).rejects.toMatchObject({
      code: "PLATFORM_EARNINGS_READ_UNAVAILABLE",
      status: 503,
    });

    const emptyDb = {
      isEnabled: () => true,
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as unknown as DatabaseService;

    const emptyController = new PlatformEarningsController(
      new PlatformEarningsService(new PlatformEarningsRepository(emptyDb)),
    );

    const genuineEmpty = await emptyController.getByPlatform(
      makeDriverIdentity(ownDriverId),
      undefined,
      "today",
    );
    expect(genuineEmpty.data.items).toEqual([]);

    const emptySummary = await emptyController.getSummary(
      makeDriverIdentity(ownDriverId),
      undefined,
      "today",
    );
    expect(emptySummary.data.totalNet).toEqual({
      currency: "TWD",
      amountMinor: 0,
    });

    const demoFallback = await emptyController.getByPlatform(
      makeDriverIdentity("drv-demo-001"),
      undefined,
      "month",
    );
    expect(demoFallback.data.items).toHaveLength(3);
  });

  it("enforces own-driver access and preserves platform/currency separation and minor-unit arithmetic", async () => {
    const ownDriverId = "33333333-3333-4333-8333-333333333333";
    const db = {
      isEnabled: () => true,
      query: vi.fn(async () => ({
        rows: [
          {
            platform_code: PLATFORM_CODE_UBER,
            currency_code: "TWD",
            gross_minor: 120000,
            fee_minor: 18000,
            subsidy_minor: 5000,
            net_minor: 107000,
          },
          {
            platform_code: PLATFORM_CODE_GRAB,
            currency_code: "TWD",
            gross_minor: 80000,
            fee_minor: 12000,
            subsidy_minor: 0,
            net_minor: 68000,
          },
        ],
        rowCount: 2,
      })),
    } as unknown as DatabaseService;

    const controller = new PlatformEarningsController(
      new PlatformEarningsService(new PlatformEarningsRepository(db)),
    );

    await expect(
      controller.getByPlatform(null, undefined, "month"),
    ).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
      status: 401,
    });

    await expect(
      controller.getByPlatform(makeDriverIdentity(null), undefined, "month"),
    ).rejects.toMatchObject({
      code: "DRIVER_IDENTITY_REQUIRED",
      status: 401,
    });

    await expect(
      controller.getByPlatform(
        makeDriverIdentity(ownDriverId),
        "99999999-9999-4999-8999-999999999999",
        "month",
      ),
    ).rejects.toMatchObject({
      code: "DRIVER_IDENTITY_MISMATCH",
      status: 403,
    });

    const summary = await controller.getSummary(
      makeDriverIdentity(ownDriverId),
      undefined,
      "month",
    );
    expect(summary.data).toMatchObject({
      driverId: ownDriverId,
      totalGross: { currency: "TWD", amountMinor: 200000 },
      totalServiceFee: { currency: "TWD", amountMinor: 30000 },
      totalSubsidy: { currency: "TWD", amountMinor: 5000 },
      totalNet: { currency: "TWD", amountMinor: 175000 },
    });
  });
});
