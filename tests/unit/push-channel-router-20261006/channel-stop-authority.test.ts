// PUSH-CHANNEL-ROUTER-20261006 — repair/regression for Codex2's second-round
// reopen (R2/R3/R4, ai-status.json PUSH-CHANNEL-ROUTER-20261006 2026-10-07):
//
//   R2 a sealed router stop (`payload.channelRouting`, D3/D6/D7) must be
//     authoritative over a stale/default partner-automatic signal in
//     `listDuePartnerNotifications`/`claimPartnerNotification`, and
//     `retryPartnerNotificationDelivery`'s "deliberate retry" must clear that
//     seal so a still-ambiguous outcome can reseal and stop again.
//   R3 `recordPushDeliveryOutcome` must pre-lock the outbox row before the
//     claims row for a channel-only outcome, the same order
//     `claimPartnerNotification` always uses, to avoid a lock-order deadlock.
//   R4 `listPartnerNotificationDeliveries` must project `payload.channelRouting`
//     (not just `payload.partnerNotification`) so an ambiguous row — which
//     has a partner route by D2 and therefore appears in this partner-scoped
//     list — shows its real failureReason/retryDisposition instead of NULL.
//
// These exercise the real `MultiTaxiRepository` methods (not a re-implemented
// service-level mock) against a stubbed `pg`-shaped client/pool, the same
// pattern as tests/unit/system-remediation/sr-partner-notify-transport-20260918/repository.test.ts.
// The stub only answers canned rows for each SQL branch; it does not evaluate
// Postgres JSONB path expressions, so it cannot substitute for the hosted PG
// QA task (PUSH-CHANNEL-PG-QA-20261006) that runs this SQL against real
// Postgres. Where a case depends on JSONB extraction actually running, this
// file asserts on the literal SQL text sent to `query()` in addition to the
// JS-side control flow, and says so inline.
import { describe, expect, it, vi } from "vitest";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";

function pastIso(ms = 60_000) {
  return new Date(Date.now() - ms).toISOString();
}

describe("push-channel-router_resolution_and_no_channel: channel-stop authority (R2)", () => {
  it("claimPartnerNotification denies an ambiguous row sealed manual_only even when context AND payload.partnerNotification both still say automatic", async () => {
    const outboxRow = {
      outbox_id: "outbox-1",
      order_id: "order-1",
      passenger_subject_ref: "subject-1",
      event_type: "trip_cancelled",
      assignment_version: 1,
      status: "failed",
      attempt_count: 1,
      next_attempt_at: pastIso(),
      created_at: pastIso(3_600_000),
      delivered_at: null,
      payload: {
        channelRouting: {
          resolvedChannel: "ambiguous",
          deliveryTarget: null,
          deliveryStage: null,
          retryDisposition: "manual_only",
          failureReason: "route_ambiguous",
          receiptId: null,
          downstreamStatus: "unknown",
          expiresAt: null,
        },
        // A stale/concurrently-held partner context signal, exactly R2's
        // "existing partner automatic context has the same effect" case.
        partnerNotification: { retryDisposition: "automatic" },
      },
    };
    let insertCalled = false;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM ops.consumer_notification_outbox WHERE outbox_id=$1 FOR UPDATE"))
        return { rows: [outboxRow] };
      if (sql.includes("FROM mobility.phase1_partner_notification_delivery_contexts WHERE outbox_id=$1"))
        // The second conflicting-state case: an automatic DB context row.
        return { rows: [{ retry_disposition: "automatic", retry_policy_snapshot: { maxAttempts: 5 } }] };
      if (sql.includes("INSERT INTO ops.phase1_push_delivery_claims")) {
        insertCalled = true;
        return { rows: [{ fence_token: 1 }] };
      }
      return { rows: [] };
    });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      connect: async () => ({ query, release: vi.fn() }),
    } as never);

    const result = await repository.claimPartnerNotification("outbox-1", "worker-1", 120);

    expect(result).toBeNull();
    expect(insertCalled).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("claimPartnerNotification still claims an ordinary partner-automatic row with no channelRouting (partner behaviour unchanged)", async () => {
    const outboxRow = {
      outbox_id: "outbox-2",
      order_id: "order-2",
      passenger_subject_ref: "subject-2",
      event_type: "assignment_disclosure_ready",
      assignment_version: 1,
      status: "failed",
      attempt_count: 1,
      next_attempt_at: pastIso(),
      created_at: pastIso(3_600_000),
      delivered_at: null,
      payload: { partnerNotification: { retryDisposition: "automatic" } },
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM ops.consumer_notification_outbox WHERE outbox_id=$1 FOR UPDATE"))
        return { rows: [outboxRow] };
      if (sql.includes("FROM mobility.phase1_partner_notification_delivery_contexts WHERE outbox_id=$1"))
        return { rows: [{ retry_disposition: "automatic", retry_policy_snapshot: { maxAttempts: 5 } }] };
      if (sql.includes("INSERT INTO ops.phase1_push_delivery_claims"))
        return { rows: [{ fence_token: 1 }] };
      return { rows: [] };
    });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      connect: async () => ({ query, release: vi.fn() }),
    } as never);

    const result = await repository.claimPartnerNotification("outbox-2", "worker-1", 120);

    expect(result).not.toBeNull();
    expect(result?.fenceToken).toBe(1);
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("listDuePartnerNotifications' due-set SQL checks payload.channelRouting before the partner context/payload signals", async () => {
    const query = vi.fn(async (sql: string) => {
      void sql;
      return { rows: [] };
    });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.listDuePartnerNotifications(50);

    const sql = query.mock.calls[0]![0];
    const channelIdx = sql.indexOf(`o.payload->'channelRouting'->>'retryDisposition'`);
    const contextIdx = sql.indexOf("c.retry_disposition");
    const partnerIdx = sql.indexOf(`o.payload->'partnerNotification'->>'retryDisposition'`);
    expect(channelIdx).toBeGreaterThan(-1);
    expect(contextIdx).toBeGreaterThan(-1);
    expect(partnerIdx).toBeGreaterThan(-1);
    // COALESCE's first non-null argument wins: channelRouting must be listed
    // before both partner signals so a sealed stop is never out-prioritized.
    expect(channelIdx).toBeLessThan(contextIdx);
    expect(channelIdx).toBeLessThan(partnerIdx);
  });

  it("retryPartnerNotificationDelivery's manual requeue clears a sealed channelRouting stop (deliberate retry can re-resolve once)", async () => {
    const createdAt = pastIso(3_600_000);
    const outboxRow = {
      status: "failed",
      event_type: "trip_cancelled",
      next_attempt_at: pastIso(),
      payload: {
        channelRouting: {
          resolvedChannel: "ambiguous",
          deliveryTarget: null,
          deliveryStage: null,
          retryDisposition: "manual_only",
          failureReason: "route_ambiguous",
          receiptId: null,
          downstreamStatus: "unknown",
          expiresAt: null,
        },
      },
      attempt_count: 1,
      order_id: "order-3",
      assignment_version: 1,
      created_at: createdAt,
      route_entry_slug: "entry-1",
      route_tenant_id: "tenant-1",
      route_partner_id: "partner-1",
    };
    const persistedPayloads: Record<string, unknown>[] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
        if (sql.includes("FROM ops.consumer_notification_outbox o") && sql.includes("FOR UPDATE OF o"))
          return { rows: [outboxRow] };
        if (sql.includes("FROM mobility.phase1_partner_notification_delivery_contexts WHERE outbox_id = $1 FOR UPDATE"))
          return { rows: [] }; // D2: ambiguous rows never get a partner delivery context.
        if (sql.includes("FROM ops.phase1_push_delivery_claims WHERE outbox_id = $1 AND claim_state = 'claimed'"))
          return { rows: [] };
        if (sql.includes("INSERT INTO admin.audit_logs")) return { rows: [] };
        if (sql.startsWith("UPDATE ops.consumer_notification_outbox SET status = 'pending'")) {
          persistedPayloads.push(JSON.parse(params![1] as string));
          return { rows: [] };
        }
        if (sql === "UPDATE ops.consumer_notification_outbox SET payload = $2::jsonb WHERE outbox_id = $1") {
          persistedPayloads.push(JSON.parse(params![1] as string));
          return { rows: [] };
        }
        if (sql.includes("UPDATE mobility.phase1_partner_notification_delivery_contexts SET retry_disposition"))
          return { rows: [] };
        throw new Error(`unexpected client.query: ${sql}`);
      }),
      release: vi.fn(),
    };
    const poolQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FROM mobility.phase1_order_partner_notification_routes"))
        return {
          rows: [
            {
              order_id: "order-3",
              tenant_id: "tenant-1",
              partner_id: "partner-1",
              entry_slug: "entry-1",
              partner_user_ref: "user-ref-1",
              drts_passenger_id: "passenger-1",
              passenger_subject_ref: "subject-3",
              identity_linked_at: createdAt,
              consent_bundle_version: "v1",
              notification_policy_version: "v1",
              ride_ref: "ride-1",
              created_at: createdAt,
            },
          ],
        };
      if (sql.includes("FROM ops.phase1_owned_orders"))
        return { rows: [{ status: "assigned", assignment_version: 1 }] };
      return { rows: [] };
    });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      query: poolQuery,
      connect: async () => client,
    } as never);

    const outcome = await repository.retryPartnerNotificationDelivery(
      { entrySlug: "entry-1", tenantId: "tenant-1", partnerId: "partner-1" },
      "outbox-3",
    );

    expect(outcome).toEqual({ kind: "requeued" });
    expect(persistedPayloads.length).toBeGreaterThan(0);
    for (const payload of persistedPayloads) {
      expect(payload).not.toHaveProperty("channelRouting");
    }
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });
});

describe("push-channel-router R3: recordPushDeliveryOutcome lock order for a channel-only outcome", () => {
  it("pre-locks the outbox row before the claims row, same order as the partner path and claimPartnerNotification", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT fence_token")) return { rows: [{ fence_token: 7 }] };
      if (sql.includes("INSERT INTO ops.phase1_push_delivery_receipts"))
        return { rows: [{ receipt_id: "receipt-1" }] };
      return { rows: [] };
    });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      connect: async () => ({ query, release: vi.fn() }),
    } as never);

    const result = await repository.recordPushDeliveryOutcome({
      outboxId: "outbox-4",
      passengerSubjectRef: "subject-4",
      fenceToken: 7,
      providerName: null,
      providerAckState: "provider_rejected",
      providerMessageRef: null,
      deliveryOutcome: {
        outboxId: "outbox-4",
        status: "failed",
        result: "provider_error",
        attemptCount: 1,
        nextAttemptAt: new Date().toISOString(),
        deliveredAt: null,
        providerName: null,
      },
      channelMetadata: {
        resolvedChannel: "ambiguous",
        deliveryTarget: null,
        deliveryStage: null,
        retryDisposition: "manual_only",
        failureReason: "route_ambiguous",
        receiptId: null,
        downstreamStatus: "unknown",
        expiresAt: null,
      },
    });

    expect(result).toEqual({ recorded: true, replayed: false });
    const sql = query.mock.calls.map(([q]) => q as string);
    expect(sql[0]).toBe("BEGIN");
    // Same literal pre-lock claimPartnerNotification and the partner path
    // both use — must run before the claims-row SELECT ... FOR UPDATE.
    expect(sql[1]).toBe(
      "SELECT outbox_id FROM ops.consumer_notification_outbox WHERE outbox_id=$1 FOR UPDATE",
    );
    const claimLockIdx = sql.findIndex((q) => q.includes("SELECT fence_token"));
    expect(claimLockIdx).toBe(2);
    expect(sql.some((q) => q.includes("'{channelRouting}'"))).toBe(true);
    expect(sql.at(-1)).toBe("COMMIT");
  });
});

describe("push-channel-router_resolution_and_no_channel: Ops visibility for ambiguous rows (R4)", () => {
  it("listPartnerNotificationDeliveries' projection falls back to payload.channelRouting for retryDisposition/failureReason", async () => {
    const countQuery = vi.fn(async (sql: string) => {
      void sql;
      return { rows: [{ cnt: "1" }] };
    });
    let selectSql = "";
    const selectQuery = vi.fn(async (sql: string) => {
      selectSql = sql;
      return {
        rows: [
          {
            outboxId: "outbox-5",
            orderId: "order-5",
            entrySlug: "entry-1",
            tenantId: "tenant-1",
            partnerId: "partner-1",
            bindingId: null,
            bindingVersion: null,
            webhookId: null,
            endpointFingerprint: null,
            wirePayload: null,
            wirePayloadHash: null,
            eventSequence: null,
            // Values a real Postgres run of the corrected SQL would produce
            // for an ambiguous row with no partner ctx/payload.partnerNotification:
            // this stub does not evaluate the JSONB path expressions itself.
            expiresAt: null,
            deliveryTarget: null,
            deliveryStage: null,
            retryDisposition: "manual_only",
            failureReason: "route_ambiguous",
            receiptId: null,
            downstreamStatus: null,
            createdAt: new Date().toISOString(),
            deliveredAt: null,
            status: "failed",
            deliveryId: null,
            eventType: "assignment_disclosure_ready",
            result: "provider_error",
            attempts: 1,
            maxAttempts: null,
            nextAttemptAt: new Date().toISOString(),
            leaseExpiresAt: null,
          },
        ],
      };
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT COUNT(*)")) return countQuery(sql);
      return selectQuery(sql);
    });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      query,
    } as never);

    const { rows, total } = await repository.listPartnerNotificationDeliveries(
      { entrySlug: "entry-1", tenantId: "tenant-1", partnerId: "partner-1" },
      { pageSize: 50, page: 1 },
    );

    expect(total).toBe(1);
    expect(rows[0]).toMatchObject({
      retryDisposition: "manual_only",
      failureReason: "route_ambiguous",
      result: "provider_error",
    });
    // Static SQL-text assertion (the stub above does not execute JSONB path
    // expressions): the fix must add channelRouting as a COALESCE fallback
    // for every projected partner-context-shaped column, and must not widen
    // the entry/tenant/partner scoping used to exclude genuinely
    // channel-less (phone/voice/corporate-dispatch) rows.
    for (const column of [
      "retryDisposition",
      "failureReason",
      "deliveryTarget",
      "deliveryStage",
      "receiptId",
      "downstreamStatus",
    ]) {
      expect(selectSql).toMatch(
        new RegExp(`o\\.payload->'channelRouting'->>'${column}'[\\s\\S]*as "${column}"`),
      );
    }
    expect(selectSql).toContain("'no_notification_channel'");
    expect(selectSql).toContain("COALESCE(ctx.entry_slug, r.entry_slug) = $1");
  });
});
