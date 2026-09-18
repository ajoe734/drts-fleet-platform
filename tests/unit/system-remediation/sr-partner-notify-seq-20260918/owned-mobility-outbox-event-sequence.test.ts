import { describe, expect, it, vi } from "vitest";

import type { ConsumerNotificationOutboxRecord } from "@drts/contracts";

import { OwnedMobilityRepository } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";

describe("OwnedMobilityRepository consumer notification outbox event sequence", () => {
  const outbox: ConsumerNotificationOutboxRecord = {
    outboxId: "outbox-seq-001",
    orderId: "order-seq-001",
    passengerSubjectRef: "passenger-subject-seq-001",
    eventType: "assignment_disclosure_ready",
    assignmentVersion: 1,
    payload: { assignmentId: "assignment-seq-001" },
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: "2026-09-18T00:00:00.000Z",
    createdAt: "2026-09-18T00:00:00.000Z",
    deliveredAt: null,
  };

  it("allocates the durable sequence in the same transaction as the outbox insert", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const allocateNotificationEventSequence = vi.fn().mockResolvedValue(42);
    
    const multiTaxiRepository = {
      allocateNotificationEventSequence,
    } as unknown as MultiTaxiRepository;

    const repository = new OwnedMobilityRepository({
      isEnabled: () => true,
      query,
    } as never, multiTaxiRepository);

    await repository.persistOrderWorkflow({ query } as never, {
      consumerNotificationOutbox: [outbox],
    });

    expect(query).toHaveBeenCalledTimes(2);
    
    const [checkSql] = query.mock.calls[0]!;
    expect(checkSql).toContain("SELECT 1 FROM ops.consumer_notification_outbox");
    
    expect(allocateNotificationEventSequence).toHaveBeenCalledWith(outbox.orderId, { query });

    const [insertSql, insertParams] = query.mock.calls[1]!;
    expect(insertSql).toContain("INSERT INTO ops.consumer_notification_outbox");
    
    const payloadIndex = 5; // $6
    expect(JSON.parse(insertParams[payloadIndex])).toEqual({
       ...outbox.payload,
       eventSequence: 42,
    });
  });

  it("does not burn a sequence number if the outbox already exists", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const allocateNotificationEventSequence = vi.fn().mockResolvedValue(42);
    
    const multiTaxiRepository = {
      allocateNotificationEventSequence,
    } as unknown as MultiTaxiRepository;

    const repository = new OwnedMobilityRepository({
      isEnabled: () => true,
      query,
    } as never, multiTaxiRepository);

    await repository.persistOrderWorkflow({ query } as never, {
      consumerNotificationOutbox: [outbox],
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(allocateNotificationEventSequence).not.toHaveBeenCalled();
  });

  it("falls back to the unmodified payload param when the order has no partner notification sequence row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const allocateNotificationEventSequence = vi.fn().mockResolvedValue(null);
    
    const multiTaxiRepository = {
      allocateNotificationEventSequence,
    } as unknown as MultiTaxiRepository;

    const repository = new OwnedMobilityRepository({
      isEnabled: () => true,
      query,
    } as never, multiTaxiRepository);

    await repository.persistOrderWorkflow({ query } as never, {
      consumerNotificationOutbox: [outbox],
    });

    expect(query).toHaveBeenCalledTimes(2);
    
    const [insertSql, insertParams] = query.mock.calls[1]!;
    const payloadIndex = 5; // $6
    expect(JSON.parse(insertParams[payloadIndex])).toEqual(outbox.payload);
  });
});
