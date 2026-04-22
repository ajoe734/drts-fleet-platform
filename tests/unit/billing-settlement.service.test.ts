import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import type {
  BillingSettlementRepository,
  LiveSettlementTripRecord,
} from "../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function createAuditNotificationService() {
  return new AuditNotificationService();
}

function createDriverTrips(): LiveSettlementTripRecord[] {
  return [
    {
      tenantId: "tenant-alpha",
      driverId: "drv-live-001",
      orderId: "order-live-031",
      completedAt: "2026-03-05T09:40:00Z",
      grossEarning: {
        currency: "NTD",
        amountMinor: 125000,
      },
      subsidy: {
        currency: "NTD",
        amountMinor: 5000,
      },
    },
    {
      tenantId: "tenant-alpha",
      driverId: "drv-live-001",
      orderId: "order-live-034",
      completedAt: "2026-03-28T08:00:00Z",
      grossEarning: {
        currency: "NTD",
        amountMinor: 90000,
      },
    },
    {
      tenantId: "tenant-alpha",
      driverId: "drv-live-002",
      orderId: "order-live-033",
      completedAt: "2026-03-22T12:00:00Z",
      grossEarning: {
        currency: "NTD",
        amountMinor: 150000,
      },
      subsidy: {
        currency: "NTD",
        amountMinor: 10000,
      },
    },
  ];
}

function publishFeePlan(service: BillingSettlementService) {
  service.publishDriverFeePlan({
    planName: "default-driver-plan",
    version: "v1",
    serviceFeeBps: 1000,
    reimbursementMode: "platform_funded",
  });
}

describe("BillingSettlementService live driver statement ingestion", () => {
  it("uses live driver trips as the only settlement source when generating statements", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00.000Z"));

    const repository = {
      isEnabled: vi.fn(() => true),
      persistChanges: vi.fn(async () => undefined),
      listLiveDriverTripsInPeriod: vi.fn(async () => createDriverTrips()),
      reportPersistenceFailure: vi.fn(),
    } as unknown as BillingSettlementRepository;

    const service = new BillingSettlementService(
      createAuditNotificationService(),
      repository,
    );
    publishFeePlan(service);

    const result = await service.generateDriverStatements({
      periodMonth: "2026-03",
    });

    expect(repository.listLiveDriverTripsInPeriod).toHaveBeenCalledWith(
      "2026-03-01T00:00:00.000Z",
      "2026-03-31T23:59:59.999Z",
    );
    expect(result.items).toHaveLength(2);

    const statement001 = result.items.find(
      (item) => item.driverId === "drv-live-001",
    );
    expect(statement001?.lines.map((line) => line.orderId)).toEqual([
      "order-live-034",
      "order-live-031",
    ]);
    expect(statement001?.grossEarning.amountMinor).toBe(215000);
    expect(statement001?.serviceFee.amountMinor).toBe(21500);
    expect(statement001?.subsidy.amountMinor).toBe(5000);
    expect(statement001?.netAmount.amountMinor).toBe(198500);

    const statement002 = result.items.find(
      (item) => item.driverId === "drv-live-002",
    );
    expect(statement002?.lines.map((line) => line.orderId)).toEqual([
      "order-live-033",
    ]);
  });

  it("stops generating statements when the live repository query fails instead of falling back to seeded trips", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00.000Z"));

    const repository = {
      isEnabled: vi.fn(() => true),
      persistChanges: vi.fn(async () => undefined),
      listLiveDriverTripsInPeriod: vi.fn(async () => {
        throw new Error("db offline");
      }),
      reportPersistenceFailure: vi.fn(),
    } as unknown as BillingSettlementRepository;

    const service = new BillingSettlementService(
      createAuditNotificationService(),
      repository,
    );
    publishFeePlan(service);

    await expect(
      service.generateDriverStatements({
        periodMonth: "2026-03",
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "No eligible trips found for the requested statement period.",
        },
      },
    });

    expect(repository.reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "list_live_driver_trips_in_period",
    );
  });

  it("uses the driver-scoped repository query when generating a single driver's statement", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00.000Z"));

    const repository = {
      isEnabled: vi.fn(() => true),
      persistChanges: vi.fn(async () => undefined),
      listLiveDriverTripsInPeriod: vi.fn(async () => {
        throw new Error("should not fetch all drivers");
      }),
      listLiveDriverTripsInPeriodForDriver: vi.fn(async () => [
        {
          tenantId: "tenant-alpha",
          driverId: "drv-live-001",
          orderId: "order-live-034",
          completedAt: "2026-03-28T08:00:00Z",
          grossEarning: {
            currency: "NTD",
            amountMinor: 90000,
          },
        },
      ]),
      reportPersistenceFailure: vi.fn(),
    } as unknown as BillingSettlementRepository;

    const service = new BillingSettlementService(
      createAuditNotificationService(),
      repository,
    );
    publishFeePlan(service);

    const result = await service.generateDriverStatements({
      periodMonth: "2026-03",
      driverId: "drv-live-001",
    });

    expect(
      repository.listLiveDriverTripsInPeriodForDriver,
    ).toHaveBeenCalledWith(
      "drv-live-001",
      "2026-03-01T00:00:00.000Z",
      "2026-03-31T23:59:59.999Z",
    );
    expect(repository.listLiveDriverTripsInPeriod).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.driverId).toBe("drv-live-001");
    expect(result.items[0]?.lines.map((line) => line.orderId)).toEqual([
      "order-live-034",
    ]);
  });
});
