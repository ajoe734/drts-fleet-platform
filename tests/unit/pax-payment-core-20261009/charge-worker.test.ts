import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { PaymentChargeRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.repository";
import { PaymentChargeService } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.service";
import { PaymentChargeWorker } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.worker";

describe("hosted worker lifecycle with fake clock and mocked processing boundary", () => {
  afterEach(() => vi.useRealTimers());

  function fixture(enabled = true) {
    vi.useFakeTimers();
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ order_id: "synthetic_order" }] });
    const repository = new PaymentChargeRepository({
      isEnabled: () => enabled,
      query,
    } as unknown as DatabaseService);
    const processOrder = vi.fn().mockResolvedValue(undefined);
    const processRecoveryNotice = vi.fn().mockResolvedValue(undefined);
    const service = {
      isCaptureConfigured: () => true,
      isRecoveryNoticeConfigured: () => false,
      processOrder,
      processRecoveryNotice,
    } as unknown as PaymentChargeService;
    const worker = new PaymentChargeWorker(repository, service);
    return { query, processOrder, processRecoveryNotice, worker, service };
  }

  it("drains retained notice requests with capture disabled using the existing worker and notice due query", async () => {
    const f = fixture();
    const noticeOrder = "00000000-0000-4000-8000-000000000061";
    f.query.mockResolvedValue({ rows: [{ order_id: noticeOrder }] });
    vi.spyOn(f.service, "isCaptureConfigured").mockReturnValue(false);
    vi.spyOn(f.service, "isRecoveryNoticeConfigured").mockReturnValue(true);
    f.worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.processOrder).not.toHaveBeenCalled();
    expect(f.processRecoveryNotice).toHaveBeenCalledWith(noticeOrder);
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining("recovery_notice_requested_at IS NOT NULL"),
      [25, null],
    );
    await f.worker.onModuleDestroy();
  });

  it("scans durable due rows at startup and on later polls; stops cleanly", async () => {
    const f = fixture();
    f.worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.processOrder).toHaveBeenCalledWith("synthetic_order");
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining("retry_at<=now()"),
      [25],
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.processOrder).toHaveBeenCalledTimes(2);
    await f.worker.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(f.processOrder).toHaveBeenCalledTimes(2);
  });

  it.each(["database", "policy"])(
    "does not start without %s",
    async (missing) => {
      const f = fixture(missing !== "database");
      if (missing === "policy")
        vi.spyOn(f.service, "isCaptureConfigured").mockReturnValue(false);
      f.worker.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(3_000);
      expect(f.query).not.toHaveBeenCalled();
      expect(f.processOrder).not.toHaveBeenCalled();
      await f.worker.onModuleDestroy();
    },
  );

  it("does not overlap an in-flight batch; shutdown waits for its completion", async () => {
    const f = fixture();
    let finish!: () => void;
    f.processOrder.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    f.worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(f.query).toHaveBeenCalledOnce();
    const stopped = vi.fn();
    const shutdown = f.worker.onModuleDestroy().then(stopped);
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).not.toHaveBeenCalled();
    finish();
    await shutdown;
    expect(stopped).toHaveBeenCalledOnce();
  });

  it("retains failed/busy orders for the next durable poll without leaking errors or stopping other rows", async () => {
    const f = fixture();
    f.query.mockResolvedValue({
      rows: [{ order_id: "synthetic_busy" }, { order_id: "synthetic_other" }],
    });
    f.processOrder.mockRejectedValueOnce(
      new Error("synthetic_private_db_error"),
    );
    f.worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.processOrder.mock.calls.map((call) => call[0])).toEqual([
      "synthetic_busy",
      "synthetic_other",
      "synthetic_busy",
      "synthetic_other",
    ]);
    await f.worker.onModuleDestroy();
  });
});
