import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConsumerNotificationOutboxRecord } from "@drts/contracts";
import { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import {
  type PassengerPushPort,
  UnavailablePassengerPushPort,
} from "../../../../apps/api/src/modules/multi-taxi/passenger-push.port";

const now = new Date("2026-09-08T21:10:00.000Z");
function record(
  overrides: Partial<ConsumerNotificationOutboxRecord> = {},
): ConsumerNotificationOutboxRecord {
  return {
    outboxId: "sr-push-001-outbox-001",
    orderId: "sr-push-001-order-001",
    passengerSubjectRef: "sr-push-001-passenger-001",
    eventType: "assignment_disclosure_ready",
    assignmentVersion: 1,
    payload: { snapshotId: "sr-push-001-snapshot-001" },
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: now.toISOString(),
    createdAt: now.toISOString(),
    deliveredAt: null,
    ...overrides,
  };
}

function harness(port: PassengerPushPort = new UnavailablePassengerPushPort()) {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const repository = {
    updateConsumerNotificationOutboxDelivery: vi.fn(async () => undefined),
    reportPersistenceFailure: vi.fn(),
  };
  const service = new MultiTaxiService(
    {} as never,
    repository as never,
    undefined,
    undefined,
    undefined,
    port,
  );
  return { service, repository };
}

// Test double only: this is not evidence of a provider or device delivery.
function acknowledgingPort() {
  return {
    isAvailable: () => true,
    providerName: () => "test-double",
    send: vi.fn(async () => ({
      providerName: "test-double",
      providerMessageRef: "sr-push-001-test-receipt-001",
    })),
  };
}

afterEach(() => vi.useRealTimers());

describe("SR-PUSH-001 existing outbox boundary", () => {
  it("keeps an unconfigured provider undelivered and schedules a retry", async () => {
    const { service, repository } = harness();
    const outcome = await service.deliverPassengerNotification(record());
    expect(outcome).toMatchObject({
      status: "failed",
      result: "provider_not_configured",
      deliveredAt: null,
      providerName: null,
      attemptCount: 1,
      nextAttemptAt: "2026-09-08T21:11:00.000Z",
    });
    expect(
      repository.updateConsumerNotificationOutboxDelivery,
    ).toHaveBeenCalledWith(outcome);
  });

  it.each(["provider 503", "expired device"])(
    "keeps %s undelivered and caps retry delay at 32 minutes",
    async (reason) => {
      const port = acknowledgingPort();
      port.send.mockRejectedValue(new Error(reason));
      const { service } = harness(port);
      expect(
        await service.deliverPassengerNotification(record({ attemptCount: 8 })),
      ).toMatchObject({
        status: "failed",
        result: "provider_error",
        deliveredAt: null,
        attemptCount: 9,
        nextAttemptAt: "2026-09-08T21:42:00.000Z",
      });
    },
  );

  it("forwards outbox identity and persists an acknowledged attempt", async () => {
    const port = acknowledgingPort();
    const { service, repository } = harness(port);
    const outcome = await service.deliverPassengerNotification(
      record(),
      "sr-push-001-request-001",
    );
    expect(port.send).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxId: record().outboxId,
        passengerSubjectRef: record().passengerSubjectRef,
      }),
      { requestId: "sr-push-001-request-001" },
    );
    expect(outcome.status).toBe("delivered");
    expect(
      repository.updateConsumerNotificationOutboxDelivery,
    ).toHaveBeenCalledWith(outcome);
  });

  // Expected-failure regressions keep the baseline audit executable. Remove
  // `.fails` when supervisor authorizes and the corresponding fix lands.
  it.fails(
    "must not send an already delivered outbox row again (scope expansion required)",
    async () => {
      const port = acknowledgingPort();
      const { service } = harness(port);
      await service.deliverPassengerNotification(
        record({
          status: "delivered",
          deliveredAt: now.toISOString(),
          attemptCount: 1,
        }),
      );
      expect(port.send).not.toHaveBeenCalled();
    },
  );

  it.fails(
    "must not report durable delivery when the outbox write fails (scope expansion required)",
    async () => {
      const { service, repository } = harness(acknowledgingPort());
      repository.updateConsumerNotificationOutboxDelivery.mockRejectedValue(
        new Error("database unavailable"),
      );
      await expect(
        service.deliverPassengerNotification(record()),
      ).rejects.toThrow();
    },
  );
});
