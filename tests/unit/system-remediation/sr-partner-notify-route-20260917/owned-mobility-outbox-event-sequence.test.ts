import { describe, expect, it, vi } from "vitest";

import type { ConsumerNotificationOutboxRecord } from "@drts/contracts";

import { OwnedMobilityRepository } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";

/**
 * design §5: "新增每 order 持久化 notification eventSequence，於生成 outbox 同交易
 * 分配". These tests cover the CTE added to
 * OwnedMobilityRepository#persistChangesWithExecutor's consumer notification
 * outbox INSERT -- the sole real outbox producer in the codebase today (the
 * other, in owned-autonomous-dispatch-executor.service.ts, writes
 * driver-facing rows that never have a partner notification route/sequence,
 * and is exercised implicitly by the "no matching sequence row" case below).
 */
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

  it("allocates the durable sequence atomically in the same statement as the outbox insert", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new OwnedMobilityRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.persistOrderWorkflow({ query } as never, {
      consumerNotificationOutbox: [outbox],
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;

    // Single statement: the sequence UPDATE is a CTE of the outbox INSERT,
    // not a second query -- so there is no separate transaction boundary to
    // get wrong.
    expect(sql).toContain("WITH seq AS");
    expect(sql).toContain(
      "UPDATE mobility.phase1_partner_notification_sequences",
    );
    expect(sql).toContain("RETURNING next_sequence - 1 AS event_sequence");
    expect(sql).toContain("INSERT INTO ops.consumer_notification_outbox");

    // A retried write for the same outbox_id must not burn a sequence number
    // once it has become a no-op via ON CONFLICT DO NOTHING.
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain(
      "SELECT 1 FROM ops.consumer_notification_outbox WHERE outbox_id = $1",
    );

    // Additive to the existing payload jsonb column, not a new column: no
    // migration required, no other outbox reader has to change.
    expect(sql).toContain("jsonb_set($6::jsonb, '{eventSequence}'");
    expect(sql).toContain("ON CONFLICT (outbox_id) DO NOTHING");

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
  });

  it("falls back to the unmodified payload param when the order has no partner notification sequence row", async () => {
    // Orders without an OrderPartnerNotificationRoute (the vast majority --
    // direct/call-center bookings, or multi-taxi orders with no linked
    // partner identity) never get a phase1_partner_notification_sequences
    // row, so `seq` is empty. COALESCE must fall back to the plain $6
    // payload param rather than erroring or writing a null eventSequence, so
    // the same bound payload parameter has to appear on both branches of the
    // fallback.
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new OwnedMobilityRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.persistOrderWorkflow({ query } as never, {
      consumerNotificationOutbox: [outbox],
    });

    const [sql] = query.mock.calls[0]!;
    expect(sql).toContain("COALESCE(");
    expect(sql.match(/\$6::jsonb/g)?.length).toBe(2);
    expect(sql).toContain("FROM seq");
  });
});
