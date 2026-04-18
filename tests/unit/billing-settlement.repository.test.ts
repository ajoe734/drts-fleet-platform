import { describe, expect, it, vi } from "vitest";

import { BillingSettlementRepository } from "../../apps/api/src/modules/billing-settlement/billing-settlement.repository";

describe("billing settlement repository", () => {
  it("queries live settlement trips for a single driver with a driverId predicate", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          order_record: {
            orderId: "order-live-001",
            tenantId: "tenant-demo-001",
            updatedAt: "2026-03-28T08:00:00Z",
            quotedFare: {
              currency: "NTD",
              amountMinor: 90000,
            },
          },
          task_record: {
            driverId: "drv-demo-001",
            completedAt: "2026-03-28T08:00:00Z",
            fare: {
              currency: "NTD",
              amountMinor: 95000,
            },
          },
        },
      ],
    }));
    const repository = new BillingSettlementRepository({
      isEnabled: () => true,
      query,
    } as never);

    const trips = await repository.listLiveDriverTripsInPeriodForDriver(
      "drv-demo-001",
      "2026-03-01T00:00:00.000Z",
      "2026-03-31T23:59:59.999Z",
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("COALESCE(tasks.record->>'driverId', '') = $1"),
      ["drv-demo-001", "2026-03-01T00:00:00.000Z", "2026-03-31T23:59:59.999Z"],
    );
    expect(trips).toEqual([
      {
        tenantId: "tenant-demo-001",
        driverId: "drv-demo-001",
        orderId: "order-live-001",
        completedAt: "2026-03-28T08:00:00Z",
        grossEarning: {
          currency: "NTD",
          amountMinor: 95000,
        },
      },
    ]);
  });
});
