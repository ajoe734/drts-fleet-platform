import { describe, expect, it, vi } from "vitest";

import type { ConsumerNotificationOutboxRecord } from "@drts/contracts";

import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { OwnedMobilityRepository } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";

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

  it("allocates the durable sequence atomically in the same transaction as the outbox insert", async () => {
    const query = vi.fn().mockImplementation(async (sql) => {
      if (sql.includes("INSERT")) return { rowCount: 1, rows: [] };
      if (sql.includes("UPDATE mobility.phase1_partner_notification_sequences")) return { rowCount: 1, rows: [{ event_sequence: 42 }] };
      return { rowCount: 0, rows: [] };
    });
    
    const dbMock = { isEnabled: () => true, query };
    const multiTaxiRepo = new MultiTaxiRepository(dbMock as never);
    const repository = new OwnedMobilityRepository(dbMock as never, multiTaxiRepo);

    await repository.persistOrderWorkflow({ query } as never, {
      consumerNotificationOutbox: [outbox],
    });

    console.log(query.mock.calls); expect(query).toHaveBeenCalledTimes(3);
    
    const [sql1, params1] = query.mock.calls[0]!;
    expect(sql1).toContain("INSERT INTO ops.consumer_notification_outbox");
    expect(sql1).toContain("ON CONFLICT (outbox_id) DO NOTHING");
    expect(sql1).toContain("RETURNING 1");
    expect(params1).toEqual([
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

    const [sql2, params2] = query.mock.calls[1]!;
    expect(sql2).toContain("UPDATE mobility.phase1_partner_notification_sequences");
    expect(sql2).toContain("RETURNING next_sequence - 1 AS event_sequence");
    expect(params2).toEqual([outbox.orderId]);

    const [sql3, params3] = query.mock.calls[2]!;
    expect(sql3).toContain("UPDATE ops.consumer_notification_outbox");
    expect(sql3).toContain("SET payload = jsonb_set(payload, '{eventSequence}', $2::jsonb)");
    expect(params3).toEqual([
      outbox.outboxId,
      JSON.stringify(42),
    ]);
  });

  it("falls back to skipping the sequence if no rows are returned by allocateNotificationEventSequence", async () => {
    const query = vi.fn().mockImplementation(async (sql) => {
      if (sql.includes("INSERT")) return { rowCount: 1, rows: [] };
      if (sql.includes("UPDATE mobility.phase1_partner_notification_sequences")) return { rowCount: 0, rows: [] };
      return { rowCount: 0, rows: [] };
    });
    const dbMock = { isEnabled: () => true, query };
    const multiTaxiRepo = new MultiTaxiRepository(dbMock as never);
    const repository = new OwnedMobilityRepository(dbMock as never, multiTaxiRepo);

    await repository.persistOrderWorkflow({ query } as never, {
      consumerNotificationOutbox: [outbox],
    });

    expect(query).toHaveBeenCalledTimes(2);
    const [sql1] = query.mock.calls[0]!;
    expect(sql1).toContain("INSERT INTO ops.consumer_notification_outbox");
    
    const [sql2] = query.mock.calls[1]!;
    expect(sql2).toContain("UPDATE mobility.phase1_partner_notification_sequences");
  });

  it("skips allocation entirely if outbox row already exists on retry", async () => {
    const query = vi.fn().mockImplementation(async (sql) => {
      if (sql.includes("INSERT")) return { rowCount: 0, rows: [] };
      return { rowCount: 0, rows: [] };
    });
    const dbMock = { isEnabled: () => true, query };
    const multiTaxiRepo = new MultiTaxiRepository(dbMock as never);
    const repository = new OwnedMobilityRepository(dbMock as never, multiTaxiRepo);

    await repository.persistOrderWorkflow({ query } as never, {
      consumerNotificationOutbox: [outbox],
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql1] = query.mock.calls[0]!;
    expect(sql1).toContain("INSERT INTO ops.consumer_notification_outbox");
  });
});
