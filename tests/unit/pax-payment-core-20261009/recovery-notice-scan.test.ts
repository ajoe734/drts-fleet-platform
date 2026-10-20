import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { PaymentChargeRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.repository";
import type { PaymentChargeService } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.service";
import { PaymentChargeWorker } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.worker";

const order = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const firstPage = Array.from({ length: 25 }, (_, index) => order(index + 1));
const laterOrder = order(26);

describe("recovery notice scan fairness", () => {
  afterEach(() => vi.useRealTimers());

  // Run the actual worker and repository. DB pages and notice processing are
  // external boundaries here: this does not prove SQL execution or delivery.
  function fixture() {
    vi.useFakeTimers();
    let firstPageEligible = false;
    let laterEnqueued = false;
    const query = vi.fn(async (_sql: string, values: readonly unknown[]) => {
      const cursor = values[1] ?? null;
      const ids =
        cursor === null
          ? firstPage
          : cursor === order(25) && !laterEnqueued
            ? [laterOrder]
            : [];
      return { rows: ids.map((order_id) => ({ order_id })) };
    });
    const repository = new PaymentChargeRepository({
      isEnabled: () => true,
      query,
    } as unknown as DatabaseService);
    const enqueued: string[] = [];
    const processRecoveryNotice = vi.fn(async (id: string) => {
      // Initial older requests lack a lawful captured route. They remain
      // durable requests; processing them does not manufacture an outbox.
      if (id === laterOrder) {
        laterEnqueued = true;
        enqueued.push(id);
      } else if (firstPageEligible) enqueued.push(id);
    });
    const service = {
      isCaptureConfigured: () => false,
      isRecoveryNoticeConfigured: () => true,
      processRecoveryNotice,
    } as unknown as PaymentChargeService;
    const worker = new PaymentChargeWorker(repository, service);
    return {
      worker,
      repository,
      query,
      processRecoveryNotice,
      enqueued,
      allowOlderRequests: () => (firstPageEligible = true),
    };
  }

  it("reaches a later eligible request despite a full page of retained non-deliveries", async () => {
    const f = fixture();
    try {
      f.worker.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(0);
      expect(f.enqueued).toEqual([]);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(f.enqueued).toEqual([laterOrder]);
      expect(f.processRecoveryNotice).toHaveBeenCalledTimes(26);
    } finally {
      await f.worker.onModuleDestroy();
    }
  });

  it("wraps the scan to retry retained requests after lawful route coordination", async () => {
    const f = fixture();
    try {
      f.worker.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(1_000);
      f.allowOlderRequests();
      // End-of-scan resets only the scan cursor. Original producer guards,
      // request rows, expiry, event identity and claims still own delivery.
      await vi.advanceTimersByTimeAsync(2_000);
      expect(f.enqueued).toEqual([laterOrder, ...firstPage]);
    } finally {
      await f.worker.onModuleDestroy();
    }
  });

  it("retries a failed page read at the same position before advancing", async () => {
    const f = fixture();
    try {
      f.worker.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(0);
      f.query.mockRejectedValueOnce(new Error("synthetic_private_db_error"));
      await vi.advanceTimersByTimeAsync(1_000);
      expect(f.enqueued).toEqual([]);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(f.enqueued).toEqual([laterOrder]);
      expect(f.query.mock.calls[1]?.[1]).toEqual([25, order(25)]);
      expect(f.query.mock.calls[2]?.[1]).toEqual([25, order(25)]);
    } finally {
      await f.worker.onModuleDestroy();
    }
  });
});
