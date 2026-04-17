import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementRepository } from "../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function createAuditNotificationService() {
  return new AuditNotificationService();
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
  it("merges live driver trips into generated statements and prefers live rows over seed snapshots", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00.000Z"));

    const repository = {
      isEnabled: vi.fn(() => true),
      persistChanges: vi.fn(async () => undefined),
      listLiveDriverTripsInPeriod: vi.fn(async () => [
        {
          tenantId: "tenant-demo-001",
          driverId: "drv-demo-001",
          orderId: "order-demo-031",
          completedAt: "2026-03-05T09:40:00Z",
          grossEarning: {
            currency: "NTD",
            amountMinor: 125000,
          },
        },
        {
          tenantId: "tenant-demo-001",
          driverId: "drv-demo-001",
          orderId: "order-demo-034",
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
    });

    expect(repository.listLiveDriverTripsInPeriod).toHaveBeenCalledWith(
      "2026-03-01T00:00:00.000Z",
      "2026-03-31T23:59:59.999Z",
    );
    expect(result.items).toHaveLength(2);

    const statement001 = result.items.find(
      (item) => item.driverId === "drv-demo-001",
    );
    expect(statement001?.lines.map((line) => line.orderId)).toEqual([
      "order-demo-034",
      "order-demo-032",
      "order-demo-031",
    ]);
    expect(statement001?.grossEarning.amountMinor).toBe(295000);
    expect(statement001?.serviceFee.amountMinor).toBe(29500);
    expect(statement001?.netAmount.amountMinor).toBe(265500);

    const statement002 = result.items.find(
      (item) => item.driverId === "drv-demo-002",
    );
    expect(statement002?.lines.map((line) => line.orderId)).toEqual([
      "order-demo-033",
    ]);
  });

  it("falls back to seed trips when the live repository query fails", async () => {
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

    const result = await service.generateDriverStatements({
      periodMonth: "2026-03",
    });

    expect(repository.reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "list_live_driver_trips_in_period",
    );
    expect(result.items).toHaveLength(2);
    const statement001 = result.items.find(
      (item) => item.driverId === "drv-demo-001",
    );
    expect(statement001?.lines.map((line) => line.orderId)).toEqual([
      "order-demo-032",
      "order-demo-031",
    ]);

    const statement002 = result.items.find(
      (item) => item.driverId === "drv-demo-002",
    );
    expect(statement002?.lines.map((line) => line.orderId)).toEqual([
      "order-demo-033",
    ]);
  });
});
