import { describe, expect, it } from "vitest";

import {
  applyLedgerEntryToUsage,
  buildQuotaLifecycleEntrySpecs,
  buildQuotaImpact,
  createEmptyTenantQuotaUsage,
  toTenantQuotaPeriodKey,
} from "../../src/modules/tenant-partner/tenant-quota-ledger";

const LIMIT = {
  bookingCountLimit: 2,
  amountMinorLimit: 100_000,
  currency: "TWD",
  enforcementMode: "hard_block" as const,
};

describe("tenant quota ledger helpers", () => {
  it("attributes reservation windows by Asia/Taipei month", () => {
    expect(toTenantQuotaPeriodKey("2026-05-31T23:30:00+08:00")).toBe("2026-05");
    expect(toTenantQuotaPeriodKey("2026-05-31T16:30:00.000Z")).toBe("2026-06");
  });

  it("moves reserved usage to consumed usage without changing remaining quota", () => {
    const reserved = applyLedgerEntryToUsage(
      createEmptyTenantQuotaUsage(LIMIT),
      LIMIT,
      {
        dimension: "booking_count",
        amount: 1,
        entryType: "reserve",
      },
    );
    const consumed = applyLedgerEntryToUsage(reserved, LIMIT, {
      dimension: "booking_count",
      amount: 1,
      entryType: "consume",
    });

    expect(consumed.pendingReservedBookingCount).toBe(0);
    expect(consumed.confirmedBookingCount).toBe(1);
    expect(consumed.bookingCountRemaining).toBe(1);
  });

  it("marks over-limit hard-block impacts as block", () => {
    const impact = buildQuotaImpact({
      scope: "tenant",
      costCenterCode: null,
      periodKey: "2026-05",
      dimension: "amount_minor",
      delta: 150_000,
      limit: LIMIT,
      usage: createEmptyTenantQuotaUsage(LIMIT),
    });

    expect(impact.remainingBefore).toBe(100_000);
    expect(impact.remainingAfter).toBe(-50_000);
    expect(impact.limitValue).toBe(100_000);
    expect(impact.remainingPercentAfter).toBe(0);
    expect(impact.triggered).toBe("block");
  });

  it("builds release and reserve entries when a booking moves across months", () => {
    const entries = buildQuotaLifecycleEntrySpecs({
      transition: "update",
      current: {
        costCenterCode: "CC-FIN-04",
        reservationWindowStart: "2026-05-31T15:30:00.000Z",
        estimatedAmountMinor: 80_000,
      },
      next: {
        costCenterCode: "CC-FIN-04",
        reservationWindowStart: "2026-06-01T15:30:00.000Z",
        estimatedAmountMinor: 80_000,
      },
    });

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          costCenterCode: null,
          periodKey: "2026-05",
          dimension: "booking_count",
          entryType: "release",
        }),
        expect.objectContaining({
          costCenterCode: "CC-FIN-04",
          periodKey: "2026-05",
          dimension: "amount_minor",
          amount: 80_000,
          entryType: "release",
        }),
        expect.objectContaining({
          costCenterCode: null,
          periodKey: "2026-06",
          dimension: "booking_count",
          entryType: "reserve",
        }),
        expect.objectContaining({
          costCenterCode: "CC-FIN-04",
          periodKey: "2026-06",
          dimension: "amount_minor",
          amount: 80_000,
          entryType: "reserve",
        }),
      ]),
    );
  });

  it("builds release entries for cancellation and consume entries for completion", () => {
    const current = {
      costCenterCode: null,
      reservationWindowStart: "2026-05-13T10:00:00.000Z",
      estimatedAmountMinor: 50_000,
    };

    expect(
      buildQuotaLifecycleEntrySpecs({
        transition: "cancel",
        current,
        next: null,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          periodKey: "2026-05",
          dimension: "booking_count",
          entryType: "release",
        }),
        expect.objectContaining({
          periodKey: "2026-05",
          dimension: "amount_minor",
          amount: 50_000,
          entryType: "release",
        }),
      ]),
    );

    expect(
      buildQuotaLifecycleEntrySpecs({
        transition: "consume",
        current,
        next: null,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          periodKey: "2026-05",
          dimension: "booking_count",
          entryType: "consume",
        }),
        expect.objectContaining({
          periodKey: "2026-05",
          dimension: "amount_minor",
          amount: 50_000,
          entryType: "consume",
        }),
      ]),
    );
  });
});
