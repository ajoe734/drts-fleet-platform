// SR-PUSH-DURABILITY-20260911 -- durable claim/lease/fence, provider-receipt
// retention and persistence-error propagation for passenger push delivery.
//
// support/unblock/SR-PUSH-001/SR-PUSH-001-UNBLOCK-PLANNING-DECISION.md found
// that `MultiTaxiService.deliverPassengerNotification` had no claim/lease
// boundary (a concurrent or restarted caller could send the same real
// notification twice) and that a persistence failure *after* a successful
// provider acknowledgement was swallowed into a fabricated `delivered`
// return value. This suite exercises the real
// `MultiTaxiService.deliverPassengerNotification` /
// `MultiTaxiRepository.claimPushDeliveryRow` /
// `MultiTaxiRepository.recordPushDeliveryOutcome` production code added to
// close that gap, with the provider port and repository injected as test
// doubles (no external push provider choice is required for these fixes).
import { describe, expect, it, vi } from "vitest";

import type {
  ConsumerNotificationOutboxRecord,
  PassengerPushDeliveryOutcome,
} from "@drts/contracts";

import {
  MultiTaxiService,
  PassengerPushClaimConflictError,
  PassengerPushPersistenceUnknownError,
} from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import {
  UnavailablePassengerPushPort,
  type PassengerPushPort,
} from "../../../../apps/api/src/modules/multi-taxi/passenger-push.port";

function outboxRecord(
  overrides?: Partial<ConsumerNotificationOutboxRecord>,
): ConsumerNotificationOutboxRecord {
  return {
    outboxId: "outbox-100",
    orderId: "order-100",
    passengerSubjectRef: "passenger-100",
    eventType: "assignment_disclosure_ready",
    assignmentVersion: 1,
    payload: { snapshotId: "snap-100" },
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: "2026-09-11T00:00:00.000Z",
    createdAt: "2026-09-11T00:00:00.000Z",
    deliveredAt: null,
    ...overrides,
  };
}

function buildService(options: {
  repository?: Record<string, unknown>;
  passengerPushPort?: PassengerPushPort;
}) {
  return new MultiTaxiService(
    {} as never,
    options.repository as never,
    undefined as never,
    undefined as never,
    undefined as never,
    options.passengerPushPort ?? new UnavailablePassengerPushPort(),
  );
}

describe("SR-PUSH-DURABILITY-20260911: deliverPassengerNotification claim/lease/fence", () => {
  it("never attempts a claim when the provider is not configured (preserves unconfigured behavior)", async () => {
    const claimPushDeliveryRow = vi.fn();
    const service = buildService({
      repository: {
        claimPushDeliveryRow,
        updateConsumerNotificationOutboxDelivery: vi.fn(async () => undefined),
        reportPersistenceFailure: vi.fn(),
      },
    });

    const outcome = await service.deliverPassengerNotification(
      outboxRecord(),
    );

    expect(outcome.result).toBe("provider_not_configured");
    expect(claimPushDeliveryRow).not.toHaveBeenCalled();
  });

  it("throws a claim-conflict error and never calls the provider when a concurrent worker already holds the lease", async () => {
    const send = vi.fn();
    const port: PassengerPushPort = {
      isAvailable: () => true,
      providerName: () => "unit-test-push",
      send,
    };
    const service = buildService({
      passengerPushPort: port,
      repository: {
        claimPushDeliveryRow: vi.fn(async () => ({ claimed: false })),
        releasePushDeliveryClaim: vi.fn(async () => undefined),
        recordPushDeliveryOutcome: vi.fn(async () => ({
          recorded: true,
          replayed: false,
        })),
        reportPersistenceFailure: vi.fn(),
      },
    });

    await expect(
      service.deliverPassengerNotification(outboxRecord()),
    ).rejects.toThrow(PassengerPushClaimConflictError);
    expect(send).not.toHaveBeenCalled();
  });

  it("proceeds with a reclaimed fence token after a previous worker's lease expired (restarted-claim)", async () => {
    const send = vi.fn(async () => ({
      providerName: "unit-test-push",
      providerMessageRef: "msg-100",
    }));
    const port: PassengerPushPort = {
      isAvailable: () => true,
      providerName: () => "unit-test-push",
      send,
    };
    const recordPushDeliveryOutcome = vi.fn(async () => ({
      recorded: true,
      replayed: false,
    }));
    const service = buildService({
      passengerPushPort: port,
      repository: {
        claimPushDeliveryRow: vi.fn(async () => ({
          claimed: true,
          fenceToken: 4,
        })),
        releasePushDeliveryClaim: vi.fn(async () => undefined),
        recordPushDeliveryOutcome,
        reportPersistenceFailure: vi.fn(),
      },
    });

    const outcome = await service.deliverPassengerNotification(
      outboxRecord(),
    );

    expect(outcome.status).toBe("delivered");
    expect(recordPushDeliveryOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxId: "outbox-100",
        fenceToken: 4,
        providerAckState: "provider_acknowledged",
        providerMessageRef: "msg-100",
      }),
    );
  });

  it("releases the claim after a provider send failure so a prompt retry is not blocked by the lease", async () => {
    const send = vi.fn(async () => {
      throw new Error("provider 503");
    });
    const port: PassengerPushPort = {
      isAvailable: () => true,
      providerName: () => "unit-test-push",
      send,
    };
    const releasePushDeliveryClaim = vi.fn(async () => undefined);
    const service = buildService({
      passengerPushPort: port,
      repository: {
        claimPushDeliveryRow: vi.fn(async () => ({
          claimed: true,
          fenceToken: 7,
        })),
        releasePushDeliveryClaim,
        updateConsumerNotificationOutboxDelivery: vi.fn(async () => undefined),
        reportPersistenceFailure: vi.fn(),
      },
    });

    const outcome = await service.deliverPassengerNotification(
      outboxRecord(),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.result).toBe("provider_error");
    expect(releasePushDeliveryClaim).toHaveBeenCalledWith("outbox-100", 7);
  });
});

describe("SR-PUSH-DURABILITY-20260911: acknowledgment-then-persistence-failure propagation", () => {
  it("throws instead of resolving `delivered` when the receipt/outbox transaction does not commit after a provider ack", async () => {
    const send = vi.fn(async () => ({
      providerName: "unit-test-push",
      providerMessageRef: "msg-200",
    }));
    const port: PassengerPushPort = {
      isAvailable: () => true,
      providerName: () => "unit-test-push",
      send,
    };
    const reportPersistenceFailure = vi.fn();
    const service = buildService({
      passengerPushPort: port,
      repository: {
        claimPushDeliveryRow: vi.fn(async () => ({
          claimed: true,
          fenceToken: 1,
        })),
        releasePushDeliveryClaim: vi.fn(async () => undefined),
        recordPushDeliveryOutcome: vi.fn(async () => {
          throw new Error("db unavailable");
        }),
        reportPersistenceFailure,
      },
    });

    await expect(
      service.deliverPassengerNotification(outboxRecord()),
    ).rejects.toThrow(PassengerPushPersistenceUnknownError);
    expect(reportPersistenceFailure).toHaveBeenCalledTimes(1);
  });

  it("throws instead of resolving `delivered` when the fence token was reclaimed by another worker before the receipt commit", async () => {
    const send = vi.fn(async () => ({
      providerName: "unit-test-push",
      providerMessageRef: "msg-300",
    }));
    const port: PassengerPushPort = {
      isAvailable: () => true,
      providerName: () => "unit-test-push",
      send,
    };
    const service = buildService({
      passengerPushPort: port,
      repository: {
        claimPushDeliveryRow: vi.fn(async () => ({
          claimed: true,
          fenceToken: 1,
        })),
        releasePushDeliveryClaim: vi.fn(async () => undefined),
        recordPushDeliveryOutcome: vi.fn(async () => ({
          recorded: false,
          reason: "fence_lost",
        })),
        reportPersistenceFailure: vi.fn(),
      },
    });

    await expect(
      service.deliverPassengerNotification(outboxRecord()),
    ).rejects.toThrow(PassengerPushPersistenceUnknownError);
  });
});

function deliveryOutcome(
  overrides?: Partial<PassengerPushDeliveryOutcome>,
): PassengerPushDeliveryOutcome {
  return {
    outboxId: "outbox-1",
    status: "delivered",
    result: "delivered",
    attemptCount: 1,
    nextAttemptAt: "2026-09-11T00:00:00.000Z",
    deliveredAt: "2026-09-11T00:00:00.000Z",
    providerName: "unit-test-push",
    ...overrides,
  };
}

describe("SR-PUSH-DURABILITY-20260911: MultiTaxiRepository claim/lease/fence SQL", () => {
  it("claims via a fence-incrementing upsert and returns the granted fence token", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO ops.phase1_push_delivery_claims")) {
        return { rows: [{ fence_token: 3 }] };
      }
      return { rows: [] };
    });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      query,
    } as never);

    const result = await repository.claimPushDeliveryRow(
      "outbox-1",
      "passenger-1",
      "worker-a",
      120,
    );

    expect(result).toEqual({ claimed: true, fenceToken: 3 });
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      "fence_token = ops.phase1_push_delivery_claims.fence_token + 1",
    );
    expect(sql).toContain(
      "ops.phase1_push_delivery_claims.lease_expires_at < now()",
    );
    expect(parameters).toEqual(["outbox-1", "passenger-1", "worker-a", 120]);
  });

  it("reports the claim as denied when the upsert affects zero rows (an unexpired lease is held elsewhere)", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      query,
    } as never);

    const result = await repository.claimPushDeliveryRow(
      "outbox-1",
      "passenger-1",
      "worker-b",
      120,
    );

    expect(result).toEqual({ claimed: false });
  });
});

describe("SR-PUSH-DURABILITY-20260911: MultiTaxiRepository receipt persistence transaction", () => {
  it("commits the receipt, the outbox update, and the claim release in one transaction", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT fence_token") && sql.includes("FOR UPDATE")) {
        return { rows: [{ fence_token: 2 }] };
      }
      if (sql.includes("INSERT INTO ops.phase1_push_delivery_receipts")) {
        return { rows: [{ receipt_id: "receipt-1" }] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.recordPushDeliveryOutcome({
      outboxId: "outbox-1",
      passengerSubjectRef: "passenger-1",
      fenceToken: 2,
      providerName: "unit-test-push",
      providerAckState: "provider_acknowledged",
      providerMessageRef: "msg-1",
      deliveryOutcome: deliveryOutcome(),
    });

    expect(result).toEqual({ recorded: true, replayed: false });
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).toContain("dedupe_key");
    expect(sql).toContain("UPDATE ops.consumer_notification_outbox");
    expect(sql).toContain("SET claim_state = 'released'");
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects the write and rolls back when the fence token has moved on to another worker", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT fence_token") && sql.includes("FOR UPDATE")) {
        return { rows: [{ fence_token: 5 }] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.recordPushDeliveryOutcome({
      outboxId: "outbox-1",
      passengerSubjectRef: "passenger-1",
      fenceToken: 2,
      providerName: "unit-test-push",
      providerAckState: "provider_acknowledged",
      providerMessageRef: "msg-1",
      deliveryOutcome: deliveryOutcome(),
    });

    expect(result).toEqual({ recorded: false, reason: "fence_lost" });
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back and rethrows when the receipt/outbox write fails mid-transaction", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT fence_token") && sql.includes("FOR UPDATE")) {
        return { rows: [{ fence_token: 2 }] };
      }
      if (sql.includes("INSERT INTO ops.phase1_push_delivery_receipts")) {
        throw new Error("db down");
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    await expect(
      repository.recordPushDeliveryOutcome({
        outboxId: "outbox-1",
        passengerSubjectRef: "passenger-1",
        fenceToken: 2,
        providerName: "unit-test-push",
        providerAckState: "provider_acknowledged",
        providerMessageRef: "msg-1",
        deliveryOutcome: deliveryOutcome(),
      }),
    ).rejects.toThrow("db down");

    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("marks a retried write for the same claimed attempt as replayed instead of inserting a second receipt", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT fence_token") && sql.includes("FOR UPDATE")) {
        return { rows: [{ fence_token: 2 }] };
      }
      if (sql.includes("INSERT INTO ops.phase1_push_delivery_receipts")) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.recordPushDeliveryOutcome({
      outboxId: "outbox-1",
      passengerSubjectRef: "passenger-1",
      fenceToken: 2,
      providerName: "unit-test-push",
      providerAckState: "provider_acknowledged",
      providerMessageRef: "msg-1",
      deliveryOutcome: deliveryOutcome(),
    });

    expect(result).toEqual({ recorded: true, replayed: true });
  });
});
