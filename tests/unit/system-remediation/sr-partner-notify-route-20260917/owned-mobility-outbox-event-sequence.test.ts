import { describe, expect, it, vi } from "vitest";

import type { ConsumerNotificationOutboxRecord } from "@drts/contracts";

import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { OwnedMobilityRepository } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";

// Design §5: preserve ROUTE's atomic allocation, deduplication, payload and
// no-route coverage as SEQ replaces its inline CTE with the shared allocator.
// Real rollback and concurrency are additionally covered by SEQ's Postgres suite.
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

  function harness(sequence: number | null = 7, duplicate = false) {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO ops.consumer_notification_outbox")) {
        return { rows: duplicate ? [] : [{ outbox_id: outbox.outboxId }] };
      }
      if (
        sql.includes("UPDATE mobility.phase1_partner_notification_sequences")
      ) {
        return {
          rows: sequence === null ? [] : [{ event_sequence: String(sequence) }],
        };
      }
      return { rows: [] };
    });
    const client = { query, release: vi.fn() };
    const poolQuery = vi.fn(() => {
      throw new Error("must use transaction client");
    });
    const database = {
      isEnabled: () => true,
      query: poolQuery,
      connect: vi.fn(async () => client),
    };
    const allocator = new MultiTaxiRepository(database as never);
    const allocate = vi.spyOn(allocator, "allocateNotificationEventSequence");
    return {
      repository: new OwnedMobilityRepository(database as never, allocator),
      query,
      client,
      database,
      allocate,
    };
  }

  it("allocates the durable sequence in the same transaction as the outbox insert", async () => {
    const { repository, query, client, database, allocate } = harness();
    await repository.withTransaction((tx) =>
      repository.persistOrderWorkflow(tx, {
        consumerNotificationOutbox: [outbox],
      }),
    );
    const calls = query.mock.calls as unknown as [string, unknown[]][];
    expect(calls.map(([sql]) => sql.trim())).toEqual([
      "BEGIN",
      "SET LOCAL lock_timeout = '3s'",
      "SET LOCAL statement_timeout = '8s'",
      expect.stringContaining("INSERT INTO ops.consumer_notification_outbox"),
      expect.stringContaining(
        "UPDATE mobility.phase1_partner_notification_sequences",
      ),
      expect.stringContaining("UPDATE ops.consumer_notification_outbox"),
      "COMMIT",
    ]);
    expect(allocate).toHaveBeenCalledExactlyOnceWith(outbox.orderId, client);
    expect(database.query).not.toHaveBeenCalled();
    expect(database.connect).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);
    const [insert, params] = calls[3]!;
    expect(insert).toContain("ON CONFLICT (outbox_id) DO NOTHING");
    expect(insert).toContain("RETURNING outbox_id");
    expect(params).toEqual([
      outbox.outboxId,
      outbox.orderId,
      outbox.passengerSubjectRef,
      outbox.eventType,
      outbox.assignmentVersion,
      JSON.stringify(outbox.payload),
      outbox.status,
      outbox.attemptCount,
      outbox.nextAttemptAt,
      outbox.createdAt,
      outbox.deliveredAt,
    ]);
    expect(calls[4]![0]).toContain(
      "RETURNING next_sequence - 1 AS event_sequence",
    );
    expect(calls[4]![1]).toEqual([outbox.orderId]);
    expect(calls[5]![0]).toContain("jsonb_set(payload, '{eventSequence}'");
    expect(calls[5]![1]).toEqual([outbox.outboxId, 7]);
    expect(outbox.payload).toEqual({ assignmentId: "assignment-seq-001" });
  });

  it("keeps the unmodified payload when the order has no partner notification sequence row", async () => {
    const { repository, query, allocate } = harness(null);
    await repository.persistChanges({ consumerNotificationOutbox: [outbox] });
    const calls = query.mock.calls as unknown as [string, unknown[]][];
    expect(allocate).toHaveBeenCalledTimes(1);
    expect(calls[3]![1][5]).toBe(JSON.stringify(outbox.payload));
    expect(
      calls.some(([sql]) =>
        sql.includes("UPDATE ops.consumer_notification_outbox"),
      ),
    ).toBe(false);
    expect(calls.at(-1)![0]).toBe("COMMIT");
  });

  it("does not allocate or overwrite the payload when an event is retried", async () => {
    const { repository, query, allocate } = harness(7, true);
    await repository.persistChanges({ consumerNotificationOutbox: [outbox] });
    expect(allocate).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes("UPDATE"))).toBe(
      false,
    );
  });
});
