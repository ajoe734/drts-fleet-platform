import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { PaymentChargeRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.repository";
import { PaymentChargeService } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.service";
import { UnconfiguredPaymentProvider } from "../../../apps/api/src/modules/passenger-app/payment/payment-provider.port";
import { paymentRecoveryNoticeExpiryFromEnv } from "../../../apps/api/src/modules/passenger-app/payment/payment-recovery-notice.config";

const ORDER = "00000000-0000-4000-8000-000000000061";
const METHOD = "00000000-0000-4000-8000-000000000062";
const OWNER = "synthetic_notice_owner";
const SUBJECT = "synthetic_notice_subject";
const NOW = new Date("2026-10-11T12:00:00Z");
const EXPIRY = "2026-10-11T13:00:00.000Z";
type Row = Record<string, unknown>;

function fixture(expiry: string | null = EXPIRY) {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", "true");
  const calls: { sql: string; params: readonly unknown[] }[] = [];
  const state = {
    channel: "first_party_app",
    eligible: true,
    foreignJournal: false,
    failedClaim: false,
    countFault: "",
    fault: "",
    missingSequence: false,
    lostCommit: false,
  };
  const route = {
    order_id: ORDER,
    tenant_id: "synthetic_captured_tenant",
    drts_passenger_id: OWNER,
    passenger_subject_ref: SUBJECT,
    app_id: "synthetic_captured_app",
    notification_policy_version: "first_party_notification_v1",
    consent_version: "synthetic_consent",
    ride_ref: "synthetic_ride",
    created_at: NOW,
  };
  const partnerRoute = {
    order_id: ORDER,
    tenant_id: "synthetic_partner_tenant",
    partner_id: "synthetic_partner",
    entry_slug: "synthetic_entry",
    partner_user_ref: "synthetic_partner_user",
    drts_passenger_id: OWNER,
    passenger_subject_ref: SUBJECT,
    identity_linked_at: NOW,
    consent_bundle_version: "synthetic_consent",
    notification_policy_version: "partner_notification_v1",
    ride_ref: "synthetic_ride",
    created_at: NOW,
  };
  let outbox: Row | null = null;
  const query = vi.fn(async (sql: string, raw?: readonly unknown[]) => {
    const params = raw ?? [];
    calls.push({ sql, params });
    if (state.fault && sql.includes(state.fault))
      throw new Error("synthetic_private_database_error");
    if (sql === "COMMIT" && state.lostCommit) {
      state.lostCommit = false;
      throw new Error("synthetic_lost_commit_ack");
    }
    if (state.countFault && sql.includes(state.countFault))
      return { rows: [], rowCount: 0 };
    let rows: Row[] = [];
    if (sql.includes("pg_try_advisory_lock")) rows = [{ locked: true }];
    else if (sql.includes("pg_advisory_unlock")) rows = [{ unlocked: true }];
    else if (sql.startsWith("SELECT status FROM passenger.accounts"))
      rows = [{ status: "active" }];
    else if (sql.startsWith("SELECT c.*"))
      rows = [
        {
          order_id: ORDER,
          payment_id: `pax-payment:${ORDER}`,
          drts_passenger_id: OWNER,
          payment_method_id: METHOD,
          idempotency_key: `pax:capture:${ORDER}`,
          amount_minor: 123,
          currency: "TWD",
          status: "manual_recovery",
          attempt_count: 1,
          readback_count: 0,
          next_operation: null,
          operation_id: null,
          provider: "synthetic_provider",
          token_envelope: null,
          method_status: "active",
          provider_capture_ref: null,
          last_error_code: "unavailable",
          billing_status: "manual_recovery",
          billing_amount: 123,
          billing_currency: "TWD",
          billing_attempts: 1,
          payment_method_token_ref: METHOD,
          provider_payment_ref: null,
          booking_owner: OWNER,
          capture_journal_operation: "capture",
          capture_journal_owner: state.foreignJournal
            ? "synthetic_foreign_owner"
            : OWNER,
          capture_journal_entity: ORDER,
          capture_journal_outcome: "failed",
        },
      ];
    else if (sql.includes("AS partner_route"))
      rows = [
        {
          first_party_route:
            state.channel === "none" || state.channel === "partner_webhook"
              ? null
              : route,
          partner_route:
            state.channel === "partner_webhook" || state.channel === "ambiguous"
              ? partnerRoute
              : null,
        },
      ];
    else if (
      sql.includes("SELECT c.order_id FROM passenger.payment_charge_records")
    )
      rows = state.eligible ? [{ order_id: ORDER }] : [];
    else if (sql.startsWith("SELECT * FROM ops.consumer_notification_outbox"))
      rows = outbox ? [outbox] : [];
    else if (sql.includes("INSERT INTO ops.consumer_notification_outbox")) {
      outbox = {
        outbox_id: params[0],
        order_id: params[1],
        passenger_subject_ref: params[2],
        event_type: "payment_recovery_required",
        payload: JSON.parse(String(params[3])),
        status: "pending",
        created_at: NOW,
      };
      rows = [{ outbox_id: params[0] }];
    } else if (
      sql.includes("UPDATE mobility.phase1_partner_notification_sequences")
    )
      rows = state.missingSequence ? [] : [{ event_sequence: 9 }];
    else if (
      sql.startsWith("UPDATE ops.consumer_notification_outbox SET payload=")
    )
      (outbox!.payload as Row).eventSequence = params[1];
    if (sql.startsWith("SELECT c.*") && state.failedClaim)
      Object.assign(rows[0]!, {
        status: "failed",
        billing_status: "failed",
        operation_id: "00000000-0000-4000-8000-000000000069",
        next_operation: "readback",
        last_error_code: "unknown",
        capture_journal_outcome: "unknown",
      });
    if (sql.startsWith("UPDATE passenger.payment_charge_records SET status=$3"))
      state.failedClaim = false;
    return { rows, rowCount: 1 };
  });
  const client = { query, release: vi.fn() };
  const poolQuery = vi.fn(async () => {
    throw new Error("producer_used_pool_instead_of_payment_client");
  });
  const database = {
    isEnabled: () => true,
    connect: vi.fn().mockResolvedValue(client),
    query: poolQuery,
  } as unknown as DatabaseService;
  const notices = new MultiTaxiRepository(database);
  const repository = new PaymentChargeRepository(database, notices, expiry);
  const service = new PaymentChargeService(repository, {
    provider: new UnconfiguredPaymentProvider(),
    cipher: null,
  });
  return {
    state,
    calls,
    client,
    poolQuery,
    repository,
    service,
    database,
    notices,
    get outbox() {
      return outbox;
    },
    process: () => service.processRecoveryNotice(ORDER),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("production payment session, consumer producer and sequence with synthetic PG replies", () => {
  it("manual-recovery finish writes both financial authorities, request and consumer outbox before one COMMIT", async () => {
    const f = fixture();
    f.state.failedClaim = true;
    await f.repository.withOrder(ORDER, async (session) => {
      const charge = await session.load();
      if (!charge?.operationId)
        throw new Error("synthetic_claim_fixture_missing");
      await session.finish(
        { ...charge, operationId: charge.operationId },
        {
          status: "manual_recovery",
          error: "unavailable",
          nextOperation: null,
          retryAt: null,
          requestRecoveryNotice: true,
        },
      );
    });
    const ledger = f.calls.findIndex((c) =>
      c.sql.startsWith("UPDATE passenger.payment_charge_records SET status=$3"),
    );
    const billing = f.calls.findIndex((c) =>
      c.sql.startsWith(
        "UPDATE billing.multi_taxi_passenger_payments SET status=$2",
      ),
    );
    const insert = f.calls.findIndex((c) =>
      c.sql.includes("INSERT INTO ops.consumer_notification_outbox"),
    );
    expect(ledger).toBeGreaterThan(0);
    expect(billing).toBeGreaterThan(ledger);
    expect(insert).toBeGreaterThan(billing);
    expect(f.calls.filter((c) => c.sql === "COMMIT")).toHaveLength(1);
    expect(f.calls[ledger]!.params[7]).toBe(true);
    expect(f.outbox?.status).toBe("pending");
    expect(f.poolQuery).not.toHaveBeenCalled();
  });
  it("atomically enqueues one typed notice on the same account-first payment PoolClient", async () => {
    const f = fixture();
    await f.process();
    expect(f.poolQuery).not.toHaveBeenCalled();
    const begin = f.calls.findIndex((c) => c.sql === "BEGIN");
    const account = f.calls.findIndex((c) =>
      c.sql.includes("passenger.accounts WHERE"),
    );
    const insert = f.calls.findIndex((c) =>
      c.sql.includes("INSERT INTO ops.consumer_notification_outbox"),
    );
    const sequence = f.calls.findIndex((c) =>
      c.sql.includes("UPDATE mobility.phase1_partner_notification_sequences"),
    );
    const commit = f.calls.findIndex((c) => c.sql === "COMMIT");
    expect(begin).toBeLessThan(account);
    expect(account).toBeLessThan(insert);
    expect(insert).toBeLessThan(sequence);
    expect(sequence).toBeLessThan(commit);
    expect(f.outbox).toMatchObject({
      outbox_id: `pax:payment-recovery:${ORDER}`,
      passenger_subject_ref: SUBJECT,
      status: "pending",
      payload: { expiresAt: EXPIRY, eventSequence: 9 },
    });
    expect(f.outbox).not.toHaveProperty("delivered_at");
    await f.process();
    expect(
      f.calls.filter((c) =>
        c.sql.includes("INSERT INTO ops.consumer_notification_outbox"),
      ),
    ).toHaveLength(1);
    expect(
      f.calls.filter((c) =>
        c.sql.includes("UPDATE mobility.phase1_partner_notification_sequences"),
      ),
    ).toHaveLength(1);
  });

  it("lost commit acknowledgement resumes with existing durable event, never allocating another sequence", async () => {
    const f = fixture();
    f.state.lostCommit = true;
    await expect(f.process()).rejects.toMatchObject({
      code: "payment_persistence_unavailable",
    });
    expect(f.client.release).toHaveBeenCalledWith(true);
    await f.process();
    expect(
      f.calls.filter((c) =>
        c.sql.includes("INSERT INTO ops.consumer_notification_outbox"),
      ),
    ).toHaveLength(1);
  });

  it("restart with a different explicit deadline preserves the original outbox deadline and sequence", async () => {
    const f = fixture();
    await f.process();
    const restarted = new PaymentChargeService(
      new PaymentChargeRepository(
        f.database,
        f.notices,
        "2026-10-11T14:00:00.000Z",
      ),
      { provider: new UnconfiguredPaymentProvider(), cipher: null },
    );
    await restarted.processRecoveryNotice(ORDER);
    expect(f.outbox?.payload).toEqual({ expiresAt: EXPIRY, eventSequence: 9 });
    expect(
      f.calls.filter((c) =>
        c.sql.includes("UPDATE mobility.phase1_partner_notification_sequences"),
      ),
    ).toHaveLength(1);
  });

  it.each([
    "order_id",
    "passenger_subject_ref",
    "event_type",
    "sequence",
    "expiry",
  ])(
    "refuses an existing notice with mismatched %s authority",
    async (kind) => {
      const f = fixture();
      await f.process();
      if (kind === "sequence") (f.outbox!.payload as Row).eventSequence = 0;
      else if (kind === "expiry")
        (f.outbox!.payload as Row).expiresAt = "synthetic_invalid_expiry";
      else f.outbox![kind] = "synthetic_foreign";
      await expect(f.process()).rejects.toMatchObject({
        code: "payment_persistence_unavailable",
      });
      expect(
        f.calls.filter((c) =>
          c.sql.includes("INSERT INTO ops.consumer_notification_outbox"),
        ),
      ).toHaveLength(1);
    },
  );

  it.each(["none", "partner_webhook", "ambiguous"])(
    "%s captured route retains the request without a manufactured outbox",
    async (channel) => {
      const f = fixture();
      f.state.channel = channel;
      await f.process();
      expect(f.outbox).toBeNull();
      expect(
        f.calls.some((c) =>
          c.sql.includes("INSERT INTO ops.consumer_notification_outbox"),
        ),
      ).toBe(false);
    },
  );

  it("irrelevant authoritative unpaid/owner row is an honest non-enqueue", async () => {
    const f = fixture();
    f.state.eligible = false;
    await f.process();
    expect(f.outbox).toBeNull();
  });

  it("foreign capture journal refuses before route or producer", async () => {
    const f = fixture();
    f.state.foreignJournal = true;
    await expect(f.process()).rejects.toMatchObject({
      code: "payment_state_conflict",
    });
    expect(f.outbox).toBeNull();
  });

  it.each(["insert", "payload", "sequence"])(
    "%s failure rolls back and exposes no fabricated delivery",
    async (kind) => {
      const f = fixture();
      if (kind === "sequence") f.state.missingSequence = true;
      else
        f.state.countFault =
          kind === "insert"
            ? "INSERT INTO ops.consumer_notification_outbox"
            : "UPDATE ops.consumer_notification_outbox SET payload=";
      await expect(f.process()).rejects.toMatchObject({
        code: "payment_persistence_unavailable",
      });
      expect(f.calls.some((c) => c.sql === "ROLLBACK")).toBe(true);
      expect(f.calls.some((c) => c.sql === "COMMIT")).toBe(false);
    },
  );

  it("missing expiry disables producer and preserves durable obligation without DB IO", async () => {
    const f = fixture(null);
    await f.process();
    expect(f.calls).toEqual([]);
  });

  it.each([
    undefined,
    "",
    "synthetic_invalid",
    "2026-10-11T11:00:00Z",
    "2026-10-11T13:00:00Z",
  ])("explicit notice expiry configuration %s has no inferred TTL", (value) => {
    fixture();
    if (value === undefined)
      expect(paymentRecoveryNoticeExpiryFromEnv({})).toBeNull();
    else if (value === "2026-10-11T13:00:00Z")
      expect(
        paymentRecoveryNoticeExpiryFromEnv({
          PAX_PAYMENT_RECOVERY_NOTICE_EXPIRES_AT: value,
        }),
      ).toBe(EXPIRY);
    else
      expect(() =>
        paymentRecoveryNoticeExpiryFromEnv({
          PAX_PAYMENT_RECOVERY_NOTICE_EXPIRES_AT: value,
        }),
      ).toThrow("payment_recovery_notice_configuration_invalid");
  });
});
