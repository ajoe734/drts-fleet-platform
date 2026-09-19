import { Module, type INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiTaxiModule } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.module";
import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { PartnerNotificationWorker } from "../../../../apps/api/src/modules/multi-taxi/partner-notification.worker";
import { PASSENGER_PUSH_PORT } from "../../../../apps/api/src/modules/multi-taxi/passenger-push.port";
import { harness } from "./transport-harness";

@Module({})
class WorkerTestModule {}

const apps: INestApplicationContext[] = [];
async function boot(h: ReturnType<typeof harness>) {
  // Real Nest bootstrap/shutdown invokes the production provider. Only durable
  // storage and the partner socket are replaced; no delivery method is called
  // by these tests and no product HTTP listener is started.
  const app = await NestFactory.createApplicationContext(
    {
      module: WorkerTestModule,
      providers: [
        PartnerNotificationWorker,
        { provide: MultiTaxiRepository, useValue: h.repository },
        { provide: MultiTaxiService, useValue: h.createService() },
        { provide: PASSENGER_PUSH_PORT, useValue: h.adapter },
      ],
    },
    { logger: false },
  );
  apps.push(app);
  await vi.advanceTimersByTimeAsync(0);
  return app;
}

beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("consumer outbox production lifecycle", () => {
  it("registers the worker and dispatches a durable pending row on application bootstrap", async () => {
    expect(Reflect.getMetadata("providers", MultiTaxiModule)).toContain(
      PartnerNotificationWorker,
    );
    const h = harness();
    await boot(h);
    expect(h.repository.loadState).toHaveBeenCalledOnce();
    expect(h.repository.listDuePartnerNotifications).toHaveBeenCalledOnce();
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.row).toMatchObject({ status: "delivered", attemptCount: 1 });
    expect(h.getContext()?.receiptId).toBe("real-partner-receipt-42");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.fetch).toHaveBeenCalledOnce();
  });

  it("polls newly committed rows after startup", async () => {
    const h = harness();
    h.repository.listDuePartnerNotifications.mockResolvedValueOnce([]);
    await boot(h);
    expect(h.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.row.status).toBe("delivered");
    expect(h.fetch).toHaveBeenCalledOnce();
  });

  it("automatically retries only when due and accepts a duplicate ack for identical bytes", async () => {
    const h = harness();
    const normal = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementationOnce(async (...args) => {
      await normal(...args);
      throw new Error("timeout after partner durable enqueue");
    });
    await boot(h);
    expect(h.row.status).toBe("failed");
    expect(h.getContext()?.retryDisposition).toBe("automatic");
    const untilDue = Date.parse(h.row.nextAttemptAt) - Date.now();
    await vi.advanceTimersByTimeAsync(untilDue - 1);
    expect(h.fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.row).toMatchObject({ status: "delivered", attemptCount: 2 });
    expect(h.getContext()?.receiptId).toBe("real-partner-receipt-42");
    expect(h.received.size).toBe(1);
    expect(h.fetch.mock.calls[1]![1]?.body).toBe(
      h.fetch.mock.calls[0]![1]?.body,
    );
  });

  it("recovers after process restart and lease expiry when ack persistence failed", async () => {
    const h = harness();
    h.repository.recordPushDeliveryOutcome.mockRejectedValueOnce(
      new Error("DB unavailable"),
    );
    const first = await boot(h);
    expect(h.row).toMatchObject({ status: "sending", attemptCount: 1 });
    expect(h.repository.reportPersistenceFailure).toHaveBeenCalledOnce();
    await first.close();
    await boot(h);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(h.fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.row).toMatchObject({ status: "delivered", attemptCount: 2 });
    expect(h.fetch.mock.calls[1]![1]?.body).toBe(
      h.fetch.mock.calls[0]![1]?.body,
    );
    expect(h.received.size).toBe(1);
  });

  it("two running application workers compete through the existing claim", async () => {
    const h = harness();
    await Promise.all([boot(h), boot(h)]);
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.row.status).toBe("delivered");
    expect(h.repository.reportPersistenceFailure).not.toHaveBeenCalled();
  });

  it("does not overlap polls while a selected delivery is in flight and drains on shutdown", async () => {
    const h = harness();
    const normal = h.fetch.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.fetch.mockImplementationOnce(async (...args) => {
      await gate;
      return normal(...args);
    });
    const app = await boot(h);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.repository.listDuePartnerNotifications).toHaveBeenCalledOnce();
    let closed = false;
    const closing = app.close().then(() => {
      closed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(closed).toBe(false);
    release();
    await closing;
    const count = h.repository.listDuePartnerNotifications.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.repository.listDuePartnerNotifications).toHaveBeenCalledTimes(
      count,
    );
    expect(h.row.status).toBe("delivered");
  });

  it("recovers from a selection failure on the next poll", async () => {
    const h = harness();
    h.repository.listDuePartnerNotifications.mockRejectedValueOnce(
      new Error("DB reconnecting"),
    );
    await boot(h);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.repository.reportPersistenceFailure).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.row.status).toBe("delivered");
  });

  it("stops automatically after five attempts with no tenant passenger retry timer", async () => {
    const h = harness();
    h.row.eventType = "receipt_ready";
    h.fetch.mockResolvedValue({ ok: false, status: 503 });
    await boot(h);
    for (let attempt = 1; attempt < 5; attempt++) {
      expect(h.row.attemptCount).toBe(attempt);
      await vi.advanceTimersByTimeAsync(
        Date.parse(h.row.nextAttemptAt) - Date.now(),
      );
    }
    expect(h.getContext()?.retryDisposition).toBe("terminal");
    const tenant = h.tenant as unknown as {
      schedulePersistedWebhookRetries(): void;
      retryTimers: Map<string, unknown>;
    };
    tenant.schedulePersistedWebhookRetries();
    expect(tenant.retryTimers.size).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000_000);
    expect(h.fetch).toHaveBeenCalledTimes(5);
  });

  it.each([401, 204])(
    "does not rescan blocked/manual HTTP %i outcomes",
    async (status) => {
      const h = harness();
      h.fetch.mockResolvedValue({ ok: status < 300, status });
      await boot(h);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(h.fetch).toHaveBeenCalledOnce();
      expect(h.repository.claimPartnerNotification).toHaveBeenCalledOnce();
    },
  );

  it("terminalizes an expired notification without HTTP or repeated claims", async () => {
    const h = harness();
    h.row.payload.expiresAt = new Date(Date.now() - 1).toISOString();
    await boot(h);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.row.payload.partnerNotification).toMatchObject({
      failureReason: "notification_expired",
      retryDisposition: "terminal",
    });
    expect(h.repository.claimPartnerNotification).toHaveBeenCalledOnce();
  });

  it("records absent route configuration even though generic availability is false", async () => {
    const h = harness();
    h.bindings.findByEntrySlug.mockResolvedValue(null);
    expect(h.adapter.isAvailable()).toBe(false);
    await boot(h);
    expect(h.row.payload.partnerNotification).toMatchObject({
      retryDisposition: "configuration_blocked",
    });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("does not start without durable storage", async () => {
    const h = harness();
    vi.spyOn(h.repository, "isEnabled").mockReturnValue(false);
    await boot(h);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.repository.listDuePartnerNotifications).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
