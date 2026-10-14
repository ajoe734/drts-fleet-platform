import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
const repositorySource = process.env.PAX_PAYMENT_CHARGE_REPOSITORY_SOURCE;
const {
  PaymentChargeRepository,
}: typeof import("../../../apps/api/src/modules/passenger-app/payment/payment-charge.repository") =
  repositorySource
    ? await import(repositorySource)
    : await import("../../../apps/api/src/modules/passenger-app/payment/payment-charge.repository");
import { PaymentChargeService } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.service";
import { PaymentTokenCipher } from "../../../apps/api/src/modules/passenger-app/payment/payment-token-cipher";
import { FakePaymentProvider } from "../../../apps/api/src/modules/passenger-app/payment/fake-payment-provider";
import type { PaymentCapturePolicy } from "../../../apps/api/src/modules/passenger-app/payment/payment-capture.policy";
import type { OwnedMobilityMultiTaxiTripCompletedEvent } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-events";
import { PassengerCoreManualPaymentRecoveryPort } from "../../../apps/api/src/modules/billing-settlement/payment-recovery.port";

const OWNER = "synthetic_charge_owner";
const ORDER = "00000000-0000-4000-8000-000000000021";
const METHOD = "00000000-0000-4000-8000-000000000022";
const NOW = new Date("2026-10-11T11:00:00Z");
// TEST policy only, never product configuration or a financial recommendation.
const POLICY: PaymentCapturePolicy = {
  retryDelaysMs: [10],
  retryDefinitiveDeclines: true,
  unknownReadbackDelaysMs: [20, 30],
};
const EVENT: OwnedMobilityMultiTaxiTripCompletedEvent = {
  runtimeProfileCode: "multi_taxi_direct",
  orderId: ORDER,
  tripId: "synthetic_completed_task",
  plateNo: "synthetic_plate",
  pickupAt: "2026-10-11T10:00:00Z",
  dropoffAt: NOW.toISOString(),
  travelDurationSeconds: 3600,
  routeSummary: "synthetic_route",
  distanceMeters: 1000,
  fareMinor: 12345,
  tollMinor: 80,
  currency: "TWD",
  consumerServicePhone: "synthetic_phone",
  authorityComplaintPhone: "synthetic_phone",
  completedAt: NOW.toISOString(),
};

type Row = Record<string, unknown>;
type Call = { sql: string; params: readonly unknown[] };

/** SQL replies and the PSP are external boundaries. This fixture is NOT a PG
 * constraint/transaction/race simulator; it supplies row snapshots for the
 * real repository and service and records their actual SQL/PSP ordering.
 */
function fixture(policy: PaymentCapturePolicy | undefined = POLICY) {
  const calls: Call[] = [];
  const cipher = new PaymentTokenCipher(
    JSON.stringify({
      activeKeyId: "synthetic_key",
      keys: { synthetic_key: randomBytes(32).toString("base64") },
    }),
  );
  const token = `synthetic_token_${"a".repeat(64)}`;
  const method: Row = {
    provider: "fake",
    token_envelope: cipher.encrypt(token, OWNER, METHOD),
    method_status: "active",
  };
  const source: Row = {
    drts_passenger_id: OWNER,
    status: "completed",
    task_status: "completed",
    runtime_profile_code: "multi_taxi_direct",
    order_record: {
      passenger: { passengerId: OWNER },
      paymentMethodTokenRef: METHOD,
      quotedFare: { amountMinor: 1000, currency: "TWD" },
    },
    task_record: {
      completedAt: NOW.toISOString(),
      fare: { amountMinor: EVENT.fareMinor, currency: "TWD" },
    },
  };
  let charge: Row | null = null;
  let billing: Row | null = null;
  const journal: Row = {
    operation: "capture",
    drts_passenger_id: OWNER,
    entity_id: ORDER,
    outcome: "pending",
  };
  let guest = false;
  let fault: ((sql: string) => boolean) | null = null;
  let countFault: ((sql: string) => boolean) | null = null;
  let lockAvailable = true;
  const client = {
    query: vi.fn(async (sql: string, raw?: readonly unknown[]) => {
      const params = raw ?? [];
      calls.push({ sql, params });
      if (fault?.(sql)) throw new Error("synthetic_private_db_detail");
      if (countFault?.(sql)) return { rows: [], rowCount: 0 };
      let rows: Row[] = [];
      if (sql.includes("pg_try_advisory_lock"))
        rows = [{ locked: lockAvailable }];
      else if (sql.includes("pg_advisory_unlock")) rows = [{ unlocked: true }];
      else if (sql.startsWith("SELECT status FROM passenger.accounts"))
        rows = [{ status: "active" }];
      else if (
        sql.startsWith(
          "SELECT drts_passenger_id FROM passenger.booking_histories",
        )
      )
        rows = guest ? [] : [{ drts_passenger_id: OWNER }];
      else if (sql.startsWith("SELECT o.status")) rows = [source];
      else if (sql.startsWith("SELECT operation,drts_passenger_id"))
        rows = [journal];
      else if (
        sql.includes("INSERT INTO billing.multi_taxi_passenger_payments")
      )
        billing ??= {
          payment_id: params[0],
          order_id: params[1],
          payment_method_token_ref: params[2],
          status: "failed",
          amount_minor: params[3],
          currency: "TWD",
          attempt_count: 0,
          provider_payment_ref: null,
        };
      else if (sql.includes("INSERT INTO passenger.payment_charge_records"))
        charge ??= {
          order_id: params[0],
          payment_id: params[1],
          drts_passenger_id: params[2],
          payment_method_id: params[3],
          idempotency_key: params[4],
          amount_minor: params[5],
          completed_at: params[6],
          currency: "TWD",
          status: "failed",
          attempt_count: 0,
          readback_count: 0,
          next_operation: "capture",
          operation_id: null,
          retry_at: null,
          provider_capture_ref: null,
          last_error_code: "unavailable",
        };
      else if (sql.startsWith("SELECT c.*"))
        rows =
          charge && billing
            ? [
                {
                  ...charge,
                  ...method,
                  billing_status: billing.status,
                  billing_amount: billing.amount_minor,
                  billing_currency: billing.currency,
                  billing_attempts: billing.attempt_count,
                  payment_method_token_ref: billing.payment_method_token_ref,
                  provider_payment_ref: billing.provider_payment_ref,
                  booking_owner: source.drts_passenger_id,
                  capture_journal_operation: journal.operation,
                  capture_journal_owner: journal.drts_passenger_id,
                  capture_journal_entity: journal.entity_id,
                  capture_journal_outcome: journal.outcome,
                },
              ]
            : [];
      else if (
        sql.startsWith(
          "UPDATE passenger.payment_charge_records SET status='failed'",
        )
      )
        Object.assign(charge!, {
          status: "failed",
          attempt_count: params[1],
          readback_count: params[2],
          operation_id: params[3],
          next_operation: "readback",
          last_error_code: "unknown",
          retry_at: null,
        });
      else if (
        sql.startsWith("UPDATE passenger.payment_charge_records SET status=$3")
      ) {
        if (charge?.operation_id !== params[1])
          return { rows: [], rowCount: 0 };
        Object.assign(charge!, {
          status: params[2],
          provider_capture_ref: params[3],
          last_error_code: params[4],
          next_operation: params[5],
          retry_at: params[6],
          operation_id: null,
        });
        if (params[7] === true && !charge!.recovery_notice_requested_at)
          charge!.recovery_notice_requested_at = NOW.toISOString();
      } else if (
        sql.startsWith(
          "UPDATE billing.multi_taxi_passenger_payments SET status='failed'",
        )
      )
        Object.assign(billing!, { status: "failed", attempt_count: params[1] });
      else if (
        sql.startsWith(
          "UPDATE billing.multi_taxi_passenger_payments SET status=$2",
        )
      )
        Object.assign(billing!, {
          status: params[1],
          provider_payment_ref: params[2],
          attempt_count: params[3],
        });
      else if (
        sql.startsWith(
          "UPDATE passenger.payment_idempotency_keys SET outcome='unknown'",
        )
      )
        journal.outcome = "unknown";
      else if (
        sql.startsWith(
          "UPDATE passenger.payment_idempotency_keys SET outcome=$2",
        )
      )
        Object.assign(journal, { outcome: params[1], error_code: params[2] });
      return { rows, rowCount: 1 };
    }),
    release: vi.fn(),
  };
  const repository = new PaymentChargeRepository({
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as DatabaseService);
  const provider = new FakePaymentProvider({ DRTS_ENV: "test" });
  const runtime = { provider, cipher };
  const service = new PaymentChargeService(repository, runtime, policy);
  return {
    calls,
    source,
    client,
    repository,
    provider,
    cipher,
    token,
    runtime,
    service,
    method,
    journal,
    get notices() {
      return calls.filter(
        (call) =>
          call.sql.startsWith(
            "UPDATE passenger.payment_charge_records SET status=$3",
          ) && call.params[7] === true,
      );
    },
    get charge() {
      return charge;
    },
    get billing() {
      return billing;
    },
    setGuest: () => {
      guest = true;
    },
    setJournalOwner: (owner: string) => {
      journal.drts_passenger_id = owner;
    },
    setFault: (fn: (sql: string) => boolean) => {
      fault = fn;
    },
    setCountFault: (fn: (sql: string) => boolean) => {
      countFault = fn;
    },
    setLockUnavailable: () => {
      lockAvailable = false;
    },
  };
}

describe("real completion/capture/retry service and SQL repository, synthetic PG replies", () => {
  it.each([
    "key",
    "payment",
    "owner",
    "operation",
    "entity",
    "outcome",
    "booking",
  ])(
    "refuses %s capture authority drift in retry, manual recovery and duplicate completion",
    async (kind) => {
      const f = fixture();
      const disabled = new PaymentChargeService(f.repository, f.runtime);
      await disabled.onTripCompleted(EVENT);
      if (kind === "key") f.charge!.idempotency_key = `pax:capture:${METHOD}`;
      if (kind === "payment") f.charge!.payment_id = `pax-payment:${METHOD}`;
      if (kind === "owner") f.journal.drts_passenger_id = "synthetic_foreign";
      if (kind === "operation") f.journal.operation = "refund";
      if (kind === "entity") f.journal.entity_id = METHOD;
      if (kind === "outcome") f.journal.outcome = "completed";
      if (kind === "booking") f.source.drts_passenger_id = "synthetic_foreign";
      const capture = vi.spyOn(f.provider, "capture");
      const callsBefore = f.calls.length;
      await expect(f.service.processOrder(ORDER, NOW)).rejects.toMatchObject({
        code: "payment_state_conflict",
      });
      await expect(
        f.service.beginManualRecovery(ORDER, `pax-payment:${ORDER}`),
      ).rejects.toMatchObject({ code: "payment_state_conflict" });
      await expect(disabled.onTripCompleted(EVENT)).rejects.toMatchObject({
        code: "payment_state_conflict",
      });
      expect(capture).not.toHaveBeenCalled();
      expect(f.charge?.attempt_count).toBe(0);
      expect(
        f.calls
          .slice(callsBefore)
          .some((call) => call.sql.startsWith("UPDATE ")),
      ).toBe(false);
    },
  );

  it.each(["readback", "captured", "manual_recovery"])(
    "refuses a foreign capture journal in %s without PSP or ledger mutation",
    async (state) => {
      const f = fixture();
      const capture = vi.spyOn(f.provider, "capture");
      if (state !== "captured")
        capture.mockResolvedValue({ status: "unknown" });
      await f.service.onTripCompleted(EVENT);
      if (state === "manual_recovery")
        await f.service.beginManualRecovery(ORDER, `pax-payment:${ORDER}`);
      f.journal.drts_passenger_id = "synthetic_foreign";
      const read = vi.spyOn(f.provider, "readCapture");
      const callsBefore = f.calls.length;
      await expect(
        f.service.processOrder(ORDER, new Date("2100-01-01T00:00:00Z")),
      ).rejects.toMatchObject({ code: "payment_state_conflict" });
      expect(capture).toHaveBeenCalledOnce();
      expect(read).not.toHaveBeenCalled();
      expect(
        f.calls
          .slice(callsBefore)
          .some((call) => call.sql.startsWith("UPDATE ")),
      ).toBe(false);
    },
  );

  it.each(["charge", "billing", "journal"])(
    "refuses %s zero-row begin write before PSP",
    async (kind) => {
      const f = fixture();
      await new PaymentChargeService(f.repository, f.runtime).onTripCompleted(
        EVENT,
      );
      f.setCountFault((sql) =>
        sql.startsWith(
          kind === "charge"
            ? "UPDATE passenger.payment_charge_records SET status='failed'"
            : kind === "billing"
              ? "UPDATE billing.multi_taxi_passenger_payments SET status='failed'"
              : "UPDATE passenger.payment_idempotency_keys SET outcome='unknown'",
        ),
      );
      const capture = vi.spyOn(f.provider, "capture");
      await expect(f.service.processOrder(ORDER, NOW)).rejects.toMatchObject({
        code: "payment_state_conflict",
      });
      expect(capture).not.toHaveBeenCalled();
      expect(f.calls.at(-2)?.sql).toBe("ROLLBACK");
    },
  );

  it.each(["charge", "billing", "journal"])(
    "refuses %s zero-row final write and never acknowledges capture",
    async (kind) => {
      const f = fixture();
      f.setCountFault((sql) =>
        sql.startsWith(
          kind === "charge"
            ? "UPDATE passenger.payment_charge_records SET status=$3"
            : kind === "billing"
              ? "UPDATE billing.multi_taxi_passenger_payments SET status=$2"
              : "UPDATE passenger.payment_idempotency_keys SET outcome=$2",
        ),
      );
      const capture = vi.spyOn(f.provider, "capture");
      await expect(f.service.onTripCompleted(EVENT)).rejects.toMatchObject({
        code: "payment_state_conflict",
      });
      expect(capture).toHaveBeenCalledOnce();
      expect(f.calls.at(-2)?.sql).toBe("ROLLBACK");
      // Row snapshots do not simulate rollback; assert the real transaction's
      // refusal instead of claiming restored durable state.
    },
  );

  it("refuses retry whose capture journal belongs to a foreign owner", async () => {
    const f = fixture();
    await new PaymentChargeService(f.repository, f.runtime).onTripCompleted(
      EVENT,
    );
    f.setJournalOwner("synthetic_foreign_owner");
    const capture = vi.spyOn(f.provider, "capture");
    await expect(f.service.processOrder(ORDER, NOW)).rejects.toMatchObject({
      code: "payment_state_conflict",
    });
    expect(capture).not.toHaveBeenCalled();
    expect(f.charge?.attempt_count).toBe(0);
  });

  it("commits claim and attempt before PSP, captures actual completed fare and writes both authorities", async () => {
    const f = fixture();
    const original = f.provider.capture.bind(f.provider);
    const capture = vi
      .spyOn(f.provider, "capture")
      .mockImplementation(async (command) => {
        expect(f.calls.at(-1)?.sql).toBe("COMMIT");
        expect(f.charge).toMatchObject({
          attempt_count: 1,
          next_operation: "readback",
          status: "failed",
        });
        expect(f.billing).toMatchObject({ status: "failed", attempt_count: 1 });
        return original(command);
      });
    await f.service.onTripCompleted(EVENT);
    expect(capture).toHaveBeenCalledWith({
      idempotencyKey: `pax:capture:${ORDER}`,
      token: f.token,
      amountMinor: 12345,
      currency: "TWD",
    });
    expect(f.charge).toMatchObject({
      status: "captured",
      attempt_count: 1,
      next_operation: null,
      operation_id: null,
    });
    expect(f.billing).toMatchObject({
      status: "captured",
      amount_minor: 12345,
      attempt_count: 1,
    });
    expect(f.billing?.provider_payment_ref).toBe(
      f.charge?.provider_capture_ref,
    );
    expect(JSON.stringify(f.calls)).not.toContain(f.token);
    expect(f.notices).toHaveLength(0);
    await f.service.onTripCompleted(EVENT);
    await f.service.processOrder(ORDER, NOW);
    expect(capture).toHaveBeenCalledOnce();
    const accountLock = f.calls.findIndex((call) =>
      call.sql.includes("FROM passenger.accounts"),
    );
    expect(accountLock).toBeLessThan(
      f.calls.findIndex((call) => call.sql.includes("INSERT INTO billing")),
    );
  });

  it("recovers a lost PSP acknowledgement by reading original key with no additional capture attempt", async () => {
    const f = fixture();
    const original = f.provider.capture.bind(f.provider);
    const capture = vi
      .spyOn(f.provider, "capture")
      .mockImplementation(async (command) => {
        await original(command);
        throw new Error("synthetic_private_psp_token");
      });
    const read = vi.spyOn(f.provider, "readCapture");
    await f.service.onTripCompleted(EVENT);
    expect(f.charge).toMatchObject({
      status: "failed",
      next_operation: "readback",
      attempt_count: 1,
      readback_count: 0,
    });
    await f.service.processOrder(ORDER, new Date(String(f.charge?.retry_at)));
    expect(read).toHaveBeenCalledWith(`pax:capture:${ORDER}`);
    expect(capture).toHaveBeenCalledOnce();
    expect(f.charge).toMatchObject({
      status: "captured",
      attempt_count: 1,
      readback_count: 1,
    });
    expect(f.billing).toMatchObject({ status: "captured", attempt_count: 1 });
    expect(JSON.stringify(f.calls)).not.toContain(
      "synthetic_private_psp_token",
    );
  });

  it("waits until retry due, retries definitive failure under the same key, then requests manual notice on exhaustion", async () => {
    const f = fixture();
    const capture = vi.spyOn(f.provider, "capture").mockResolvedValue({
      status: "failed",
      error: "unavailable",
      retryable: true,
    });
    await f.service.onTripCompleted(EVENT);
    const due = new Date(String(f.charge?.retry_at));
    await f.service.processOrder(ORDER, new Date(due.getTime() - 1));
    expect(capture).toHaveBeenCalledOnce();
    await f.service.processOrder(ORDER, due);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture.mock.calls[0]![0].idempotencyKey).toBe(
      capture.mock.calls[1]![0].idempotencyKey,
    );
    expect(f.charge).toMatchObject({
      status: "manual_recovery",
      attempt_count: 2,
      retry_at: null,
      next_operation: null,
    });
    expect(f.billing).toMatchObject({
      status: "manual_recovery",
      attempt_count: 2,
    });
    expect(f.notices).toHaveLength(1);
    expect(f.charge?.recovery_notice_requested_at).toBe(NOW.toISOString());
    await f.service.processOrder(ORDER, due);
    expect(f.notices).toHaveLength(1);
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("bounds unknown readbacks separately from capture attempts", async () => {
    const f = fixture();
    const capture = vi
      .spyOn(f.provider, "capture")
      .mockResolvedValue({ status: "pending" });
    const read = vi
      .spyOn(f.provider, "readCapture")
      .mockResolvedValue({ status: "unknown" });
    await f.service.onTripCompleted(EVENT);
    await f.service.processOrder(ORDER, new Date(String(f.charge?.retry_at)));
    await f.service.processOrder(ORDER, new Date(String(f.charge?.retry_at)));
    expect(capture).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledTimes(2);
    expect(f.charge).toMatchObject({
      status: "manual_recovery",
      attempt_count: 1,
      readback_count: 2,
      last_error_code: "unknown",
    });
    expect(f.notices).toHaveLength(1);
  });

  it("keeps a committed unknown attempt on write failure, sanitizes errors, and resumes only readback", async () => {
    const f = fixture();
    const capture = vi.spyOn(f.provider, "capture");
    f.setFault((sql) =>
      sql.startsWith("UPDATE passenger.payment_charge_records SET status=$3"),
    );
    await expect(f.service.onTripCompleted(EVENT)).rejects.toMatchObject({
      code: "payment_persistence_unavailable",
    });
    expect(f.charge).toMatchObject({
      status: "failed",
      next_operation: "readback",
      attempt_count: 1,
    });
    expect(f.client.release).toHaveBeenCalledWith(true);
    f.setFault(() => false);
    const restarted = new PaymentChargeService(f.repository, f.runtime, POLICY);
    await restarted.processOrder(ORDER, NOW);
    expect(capture).toHaveBeenCalledOnce();
    expect(f.charge?.status).toBe("captured");
  });

  it("missing policy records the obligation and refuses money; explicitly invalid policy is rejected", async () => {
    const f = fixture();
    const disabled = new PaymentChargeService(f.repository, f.runtime);
    const capture = vi.spyOn(f.provider, "capture");
    await disabled.onTripCompleted(EVENT);
    expect(f.charge).toMatchObject({
      status: "failed",
      attempt_count: 0,
    });
    expect(capture).not.toHaveBeenCalled();
    expect(
      () =>
        new PaymentChargeService(
          f.repository,
          f.runtime,
          {} as PaymentCapturePolicy,
        ),
    ).toThrow("payment_capture_policy_invalid");
  });

  it("allows legacy guest IDs without adding a payment listener failure", async () => {
    const f = fixture();
    const capture = vi.spyOn(f.provider, "capture");
    await f.service.onTripCompleted({
      ...EVENT,
      orderId: "synthetic_guest_legacy_order",
    });
    expect(f.calls).toHaveLength(0);
    expect(capture).not.toHaveBeenCalled();
  });

  it.each([
    { fareMinor: -1 },
    { fareMinor: 1.5 },
    { fareMinor: Number.MAX_SAFE_INTEGER + 1 },
    { currency: "NTD" },
    { completedAt: "invalid" },
    { tripId: "" },
  ])(
    "rejects invalid owned completion before claiming money: %j",
    async (fields) => {
      const f = fixture();
      const capture = vi.spyOn(f.provider, "capture");
      await expect(
        f.service.onTripCompleted({
          ...EVENT,
          ...fields,
        } as OwnedMobilityMultiTaxiTripCompletedEvent),
      ).rejects.toMatchObject({ code: "payment_completion_invalid" });
      expect(capture).not.toHaveBeenCalled();
      expect(f.charge).toBeNull();
    },
  );

  it("does not call PSP when the pre-request COMMIT acknowledgement is lost, and resumes only readback", async () => {
    const f = fixture();
    const disabled = new PaymentChargeService(f.repository, f.runtime);
    await disabled.onTripCompleted(EVENT);
    const capture = vi.spyOn(f.provider, "capture");
    f.setFault((sql) => sql === "COMMIT");
    await expect(f.service.processOrder(ORDER, NOW)).rejects.toMatchObject({
      code: "payment_persistence_unavailable",
    });
    expect(capture).not.toHaveBeenCalled();
    expect(f.calls.at(-2)?.sql).toBe("ROLLBACK");
    // Supply the potentially committed snapshot, not a PG rollback simulation.
    f.setFault(() => false);
    const read = vi.spyOn(f.provider, "readCapture");
    await new PaymentChargeService(
      f.repository,
      f.runtime,
      POLICY,
    ).processOrder(ORDER, NOW);
    expect(read).toHaveBeenCalledWith(`pax:capture:${ORDER}`);
    expect(capture).not.toHaveBeenCalled();
    expect(f.charge?.attempt_count).toBe(1);
  });

  it("manual recovery stops all retries, writes both authorities and requests notice without another attempt", async () => {
    const f = fixture();
    const capture = vi
      .spyOn(f.provider, "capture")
      .mockResolvedValue({ status: "pending" });
    await f.service.onTripCompleted(EVENT);
    const port = new PassengerCoreManualPaymentRecoveryPort(f.service);
    expect(
      await port.recover("begin_manual_recovery", {
        orderId: ORDER,
        paymentId: `pax-payment:${ORDER}`,
        status: "failed",
        amountMinor: EVENT.fareMinor,
        currency: "TWD",
        attemptCount: 1,
      }),
    ).toEqual({ status: "accepted", passengerLedgerManaged: true });
    expect(f.charge).toMatchObject({
      status: "manual_recovery",
      attempt_count: 1,
      next_operation: null,
    });
    expect(f.billing).toMatchObject({
      status: "manual_recovery",
      attempt_count: 1,
    });
    await f.service.beginManualRecovery(ORDER, `pax-payment:${ORDER}`);
    await f.service.processOrder(ORDER, NOW);
    expect(capture).toHaveBeenCalledOnce();
    expect(f.notices).toHaveLength(1);
  });

  it("keeps legacy manual handoff available and refuses unprovisioned Ops capture retries", async () => {
    const f = fixture();
    const port = new PassengerCoreManualPaymentRecoveryPort(f.service);
    const payment = {
      orderId: "synthetic_legacy_order",
      paymentId: "synthetic_legacy_payment",
      status: "failed" as const,
      amountMinor: 1000,
      currency: "TWD",
      attemptCount: 1,
    };
    expect(await port.recover("begin_manual_recovery", payment)).toEqual({
      status: "accepted",
    });
    expect(port.isAvailable("retry_capture")).toBe(false);
    await expect(port.recover("retry_capture", payment)).rejects.toThrow(
      "not provisioned",
    );
    expect(f.calls).toHaveLength(0);
  });

  it("refuses a provider switch during unknown readback", async () => {
    const f = fixture();
    const capture = vi
      .spyOn(f.provider, "capture")
      .mockResolvedValue({ status: "unknown" });
    const read = vi.spyOn(f.provider, "readCapture");
    await f.service.onTripCompleted(EVENT);
    f.method.provider = "synthetic_original_other_provider";
    await f.service.processOrder(ORDER, new Date(String(f.charge?.retry_at)));
    expect(capture).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
    expect(f.charge?.status).toBe("failed");
  });

  it("a contracted empty unknown budget goes straight to manual after a lost response", async () => {
    const f = fixture({ ...POLICY, unknownReadbackDelaysMs: [] });
    vi.spyOn(f.provider, "capture").mockRejectedValue(
      new Error("synthetic_private_ack"),
    );
    await f.service.onTripCompleted(EVENT);
    expect(f.charge?.status).toBe("manual_recovery");
    expect(f.notices).toHaveLength(1);
  });

  it("keeps recovery notice requests on the owned ledger until the consumer event contract is authorized", async () => {
    const f = fixture({ ...POLICY, retryDefinitiveDeclines: false });
    vi.spyOn(f.provider, "capture").mockResolvedValue({
      status: "failed",
      error: "card_declined",
      retryable: true,
    });
    await f.service.onTripCompleted(EVENT);
    expect(f.charge?.status).toBe("manual_recovery");
    expect(f.charge?.recovery_notice_requested_at).toBe(NOW.toISOString());
    expect(
      f.calls.some((call) =>
        call.sql.includes("INSERT INTO ops.consumer_notification_outbox"),
      ),
    ).toBe(false);
  });

  it.each(["guest", "lock", "owner", "fare", "status", "subject", "task"])(
    "refuses/ignores %s before PSP and financial mutation",
    async (kind) => {
      const f = fixture();
      const capture = vi.spyOn(f.provider, "capture");
      if (kind === "guest") f.setGuest();
      if (kind === "lock") f.setLockUnavailable();
      if (kind === "owner") f.setJournalOwner("synthetic_foreign");
      if (kind === "fare")
        (f.source.task_record as Row).fare = {
          amountMinor: 1000,
          currency: "TWD",
        };
      if (kind === "status") f.source.status = "cancelled";
      if (kind === "subject")
        (f.source.order_record as Row).passenger = {
          passengerId: "synthetic_foreign",
        };
      if (kind === "task") f.source.task_status = "started";
      const operation = f.service.onTripCompleted(EVENT);
      if (kind === "guest") await operation;
      else
        await expect(operation).rejects.toMatchObject({
          code:
            kind === "lock"
              ? "payment_processing_pending"
              : "payment_state_conflict",
        });
      expect(capture).not.toHaveBeenCalled();
      expect(f.billing).toBeNull();
      expect(f.charge).toBeNull();
    },
  );

  it.each(["accepted", "empty_ref", "wrong_provider"])(
    "cannot declare capture from %s",
    async (kind) => {
      const f = fixture();
      const capture = vi.spyOn(f.provider, "capture");
      if (kind === "wrong_provider")
        f.method.provider = "synthetic_other_provider";
      else
        capture.mockResolvedValue(
          (kind === "accepted"
            ? { status: "accepted" }
            : { status: "completed", providerRef: "" }) as never,
        );
      await f.service.onTripCompleted(EVENT);
      expect(f.charge?.status).not.toBe("captured");
      if (kind === "wrong_provider") expect(capture).not.toHaveBeenCalled();
      else expect(f.charge?.next_operation).toBe("readback");
    },
  );

  it("refuses drift in the existing billing authority and never overwrites a late operation", async () => {
    const f = fixture();
    const disabled = new PaymentChargeService(f.repository, f.runtime);
    await disabled.onTripCompleted(EVENT);
    f.billing!.amount_minor = 1000;
    await expect(f.service.processOrder(ORDER, NOW)).rejects.toMatchObject({
      code: "payment_state_conflict",
    });
    f.billing!.amount_minor = EVENT.fareMinor;
    await expect(
      f.repository.withOrder(ORDER, async (session) => {
        const charge = (await session.load())!;
        const claim = await session.begin(charge, "capture");
        f.charge!.operation_id = "00000000-0000-4000-8000-000000000099";
        await session.finish(claim, {
          status: "captured",
          providerRef: "synthetic_ref",
          error: null,
          nextOperation: null,
          retryAt: null,
          requestRecoveryNotice: false,
        });
      }),
    ).rejects.toMatchObject({ code: "payment_state_conflict" });
    expect(f.billing?.status).toBe("failed");
    expect(f.calls.at(-2)?.sql).toBe("ROLLBACK");
  });
});
