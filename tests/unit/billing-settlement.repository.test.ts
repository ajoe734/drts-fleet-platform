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
    const firstCall = query.mock.calls[0] as [string, unknown[]] | undefined;
    const sql = firstCall?.[0];
    expect(sql).toContain("COALESCE(tasks.record->>'completedAt', '') ~");
    expect(sql).toContain("tasks.record->>'completedAt' >= $2");
    expect(sql).not.toContain("::timestamptz");
    expect(trips).toEqual([
      expect.objectContaining({
        tenantId: "tenant-demo-001",
        driverId: "drv-demo-001",
        orderId: "order-live-001",
        completedAt: "2026-03-28T08:00:00Z",
        grossEarning: {
          currency: "NTD",
          amountMinor: 95000,
        },
        serviceProduct: undefined,
        sourcePlatform: undefined,
      }),
    ]);
  });

  it("loads driver fee plans from the canonical table for cross-instance readback (C125-F1)", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          record: {
            feePlanId: "fee-plan-canonical-001",
            planName: "Canonical Readback Plan",
            version: "canonical-v1",
            serviceFeeBps: 1300,
            reimbursementMode: "platform_funded",
            status: "published",
            publishedAt: "2026-10-20T00:00:00.000Z",
          },
        },
      ],
    }));
    const repository = new BillingSettlementRepository({
      isEnabled: () => true,
      query,
    } as never);

    const plans = await repository.loadDriverFeePlans();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("billing.phase1_driver_fee_plans"),
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("published_at DESC"));
    expect(plans).toEqual([
      expect.objectContaining({
        feePlanId: "fee-plan-canonical-001",
        version: "canonical-v1",
        status: "published",
      }),
    ]);
  });

  it("returns an empty driver fee plan list when persistence is disabled", async () => {
    const repository = new BillingSettlementRepository({
      isEnabled: () => false,
      query: vi.fn(),
    } as never);

    expect(await repository.loadDriverFeePlans()).toEqual([]);
  });
});
