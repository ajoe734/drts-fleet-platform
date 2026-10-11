import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import type { RequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
import {
  AUTH_ALLOWED_REALMS_KEY,
  AUTH_REQUIRED_SCOPES_KEY,
} from "../../../apps/api/src/common/auth/auth.constants";
const repositorySource = process.env.PAX_PAYMENT_REFUND_REPOSITORY_SOURCE;
const {
  PaymentRefundRepository,
}: typeof import("../../../apps/api/src/modules/passenger-app/payment/payment-refund.repository") =
  repositorySource
    ? await import(repositorySource)
    : await import("../../../apps/api/src/modules/passenger-app/payment/payment-refund.repository");
import { PaymentRefundService } from "../../../apps/api/src/modules/passenger-app/payment/payment-refund.service";
import { PaymentRefundController } from "../../../apps/api/src/modules/passenger-app/payment/payment-refund.controller";
import { FakePaymentProvider } from "../../../apps/api/src/modules/passenger-app/payment/fake-payment-provider";

const ORDER = "00000000-0000-4000-8000-000000000031";
const METHOD = "00000000-0000-4000-8000-000000000032";
const OWNER = "synthetic_refund_owner";
const BODY = { reason: "synthetic_ops_full_refund" };
const IDENTITY: RequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "platform_admin",
  actorId: "synthetic_ops_actor",
  realm: "platform",
  tenantId: null,
  scopes: ["billing:write"],
  roles: [],
  roleFamilies: ["platform"],
  requestId: "synthetic_request",
};
type Row = Record<string, unknown>;

/** Synthetic row replies/faults at the PG boundary, NOT an engine or rollback
 * simulator. Production session/service/controller and the fake PSP execute.
 * Assertions concern real SQL ordering/fences/commands, never claimed PG races.
 */
async function fixture() {
  const provider = new FakePaymentProvider({ DRTS_ENV: "test" });
  const capture = await provider.capture({
    idempotencyKey: `pax:capture:${ORDER}`,
    token: `synthetic_token_${"a".repeat(64)}`,
    amountMinor: 12345,
    currency: "TWD",
  });
  if (capture.status !== "completed")
    throw new Error("synthetic_capture_setup_failed");
  const charge: Row = {
    order_id: ORDER,
    payment_id: `pax-payment:${ORDER}`,
    drts_passenger_id: OWNER,
    payment_method_id: METHOD,
    idempotency_key: `pax:capture:${ORDER}`,
    amount_minor: 12345,
    currency: "TWD",
    status: "captured",
    attempt_count: 1,
    readback_count: 0,
    next_operation: null,
    retry_at: null,
    operation_id: null,
    provider_capture_ref: capture.providerRef,
    provider: "fake",
    method_status: "removed",
    token_envelope: null,
  };
  const billing: Row = {
    status: "captured",
    amount_minor: 12345,
    currency: "TWD",
    attempt_count: 1,
    provider_payment_ref: capture.providerRef,
  };
  const journal: Row = {
    operation: "refund",
    drts_passenger_id: OWNER,
    entity_id: ORDER,
    outcome: "pending",
  };
  const captureJournal: Row = {
    operation: "capture",
    drts_passenger_id: OWNER,
    entity_id: ORDER,
    outcome: "completed",
  };
  const calls: { sql: string; params: readonly unknown[] }[] = [];
  let journalExists = false;
  let absent = false;
  let locked = true;
  let fault: ((sql: string) => boolean) | null = null;
  let countFault: ((sql: string) => boolean) | null = null;
  const client = {
    query: vi.fn(async (sql: string, raw?: readonly unknown[]) => {
      const params = raw ?? [];
      calls.push({ sql, params });
      if (fault?.(sql)) throw new Error("synthetic_private_db_detail");
      if (countFault?.(sql)) return { rows: [], rowCount: 0 };
      let rows: Row[] = [];
      let rowCount = 1;
      if (sql.includes("pg_try_advisory_lock")) rows = [{ locked }];
      else if (sql.includes("pg_advisory_unlock")) rows = [{ unlocked: true }];
      else if (sql.startsWith("SELECT status FROM passenger.accounts"))
        rows = [{ status: "deleted" }];
      else if (sql.startsWith("SELECT c.*"))
        rows = absent
          ? []
          : [
              {
                ...charge,
                billing_status: billing.status,
                billing_amount: billing.amount_minor,
                billing_currency: billing.currency,
                billing_attempts: billing.attempt_count,
                payment_method_token_ref: METHOD,
                provider_payment_ref: billing.provider_payment_ref,
                booking_owner: OWNER,
                capture_journal_operation: captureJournal.operation,
                capture_journal_owner: captureJournal.drts_passenger_id,
                capture_journal_entity: captureJournal.entity_id,
                capture_journal_outcome: captureJournal.outcome,
              },
            ];
      else if (sql.startsWith("SELECT refund_idempotency_key"))
        rows = [
          {
            ...charge,
            refund_journal_operation: journal.operation,
            refund_journal_owner: journal.drts_passenger_id,
            refund_journal_entity: journal.entity_id,
            refund_journal_outcome: journal.outcome,
          },
        ];
      else if (sql.includes("INSERT INTO passenger.payment_idempotency_keys")) {
        rowCount = journalExists ? 0 : 1;
        journalExists = true;
      } else if (sql.startsWith("SELECT operation,drts_passenger_id"))
        rows = [journal];
      else if (
        sql.startsWith(
          "UPDATE passenger.payment_charge_records SET refund_idempotency_key",
        )
      )
        Object.assign(charge, {
          refund_idempotency_key: params[1],
          refund_reason: charge.refund_reason ?? params[2],
          refund_actor_id: charge.refund_actor_id ?? params[3],
          refund_status: "unknown",
          refund_operation_id: params[4],
        });
      else if (
        sql.startsWith(
          "UPDATE passenger.payment_idempotency_keys SET outcome='unknown'",
        )
      )
        journal.outcome = "unknown";
      else if (
        sql.startsWith(
          "UPDATE passenger.payment_charge_records SET refund_status",
        )
      )
        Object.assign(charge, {
          refund_status: params[2],
          provider_refund_ref: params[3],
          refund_operation_id: null,
          status: params[2] === "completed" ? "refunded" : charge.status,
        });
      else if (
        sql.startsWith(
          "UPDATE billing.multi_taxi_passenger_payments SET status='refunded'",
        )
      )
        billing.status = "refunded";
      else if (
        sql.startsWith(
          "UPDATE passenger.payment_idempotency_keys SET outcome=$2",
        )
      )
        Object.assign(journal, { outcome: params[1], error_code: params[2] });
      return { rows, rowCount };
    }),
    release: vi.fn(),
  };
  const repository = new PaymentRefundRepository({
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as DatabaseService);
  const runtime = { provider, cipher: null };
  const service = new PaymentRefundService(repository, runtime);
  const controller = new PaymentRefundController(service);
  return {
    provider,
    charge,
    billing,
    journal,
    captureJournal,
    calls,
    client,
    repository,
    service,
    controller,
    runtime,
    refund: () => service.refund(IDENTITY, ORDER, BODY),
    setFault: (value: (sql: string) => boolean) => {
      fault = value;
    },
    setCountFault: (value: (sql: string) => boolean) => {
      countFault = value;
    },
    setAbsent: () => {
      absent = true;
    },
    setLocked: () => {
      locked = false;
    },
    setOrphanJournal: () => {
      journalExists = true;
    },
  };
}

describe("formal full refund service/controller and repository with synthetic PG replies", () => {
  it.each(["operation", "drts_passenger_id", "entity_id", "outcome"])(
    "refuses refund whose capture journal has mismatched %s",
    async (field) => {
      const f = await fixture();
      f.captureJournal[field] = "synthetic_foreign";
      const refund = vi.spyOn(f.provider, "refund");
      await expect(f.refund()).rejects.toMatchObject({
        code: "payment_state_conflict",
      });
      expect(refund).not.toHaveBeenCalled();
      expect(f.calls.some((call) => call.sql.startsWith("UPDATE "))).toBe(
        false,
      );
    },
  );

  it.each(["begin", "final"])(
    "refuses a %s zero-row refund journal write",
    async (stage) => {
      const f = await fixture();
      const refund = vi.spyOn(f.provider, "refund");
      f.setCountFault((sql) =>
        sql.startsWith(
          stage === "begin"
            ? "UPDATE passenger.payment_idempotency_keys SET outcome='unknown'"
            : "UPDATE passenger.payment_idempotency_keys SET outcome=$2",
        ),
      );
      await expect(f.refund()).rejects.toMatchObject({ code: "invalid_state" });
      if (stage === "begin") expect(refund).not.toHaveBeenCalled();
      else expect(refund).toHaveBeenCalledOnce();
      expect(f.calls.at(-2)?.sql).toBe("ROLLBACK");
    },
  );

  it("commits the single full refund claim before PSP and writes both authorities only after success", async () => {
    const f = await fixture();
    const original = f.provider.refund.bind(f.provider);
    const refund = vi
      .spyOn(f.provider, "refund")
      .mockImplementation(async (command) => {
        expect(f.calls.at(-1)?.sql).toBe("COMMIT");
        expect(f.charge.refund_status).toBe("unknown");
        expect(f.billing.status).toBe("captured");
        return original(command);
      });
    const response = await f.controller.refund(IDENTITY, ORDER, BODY);
    expect(response.data).toEqual({
      success: true,
      refundId: `pax:refund:${ORDER}`,
    });
    expect(refund).toHaveBeenCalledWith({
      idempotencyKey: `pax:refund:${ORDER}`,
      captureRef: f.charge.provider_capture_ref,
      amountMinor: 12345,
      currency: "TWD",
    });
    expect(f.charge).toMatchObject({
      status: "refunded",
      refund_actor_id: IDENTITY.actorId,
      refund_reason: BODY.reason,
      attempt_count: 1,
      refund_operation_id: null,
    });
    expect(f.billing).toMatchObject({
      status: "refunded",
      attempt_count: 1,
      provider_payment_ref: f.charge.provider_capture_ref,
    });
    expect(
      f.calls.find((call) => call.sql.includes("pg_try_advisory_lock"))?.params,
    ).toEqual([`pax:capture:${ORDER}`]);
    const firstLock = f.calls.find((call) => call.sql.includes("FOR UPDATE"));
    expect(firstLock?.sql).toContain("passenger.accounts");
    expect(firstLock?.params).toEqual([OWNER]);
    await expect(f.refund()).resolves.toEqual(response.data);
    expect(refund).toHaveBeenCalledOnce();
    expect(JSON.stringify(response)).not.toContain(
      String(f.charge.provider_capture_ref),
    );
  });

  it("reads the original refund after PSP success with lost acknowledgement; never refunds twice", async () => {
    const f = await fixture();
    const original = f.provider.refund.bind(f.provider);
    const refund = vi
      .spyOn(f.provider, "refund")
      .mockImplementation(async (command) => {
        await original(command);
        throw new Error("synthetic_private_psp_error");
      });
    const read = vi.spyOn(f.provider, "readRefund");
    await expect(f.refund()).rejects.toMatchObject({
      code: "payment_processing_pending",
    });
    expect(f.charge.status).toBe("captured");
    expect(f.billing.status).toBe("captured");
    await expect(f.refund()).resolves.toMatchObject({ success: true });
    expect(refund).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledExactlyOnceWith(`pax:refund:${ORDER}`);
  });

  it("lost pre-request COMMIT acknowledges no PSP operation; next request only reads", async () => {
    const f = await fixture();
    let once = true;
    f.setFault((sql) => sql === "COMMIT" && once && !(once = false));
    const refund = vi.spyOn(f.provider, "refund");
    const read = vi.spyOn(f.provider, "readRefund");
    await expect(f.refund()).rejects.toMatchObject({
      code: "payment_persistence_unavailable",
    });
    f.setFault(() => false);
    await expect(f.refund()).rejects.toMatchObject({
      code: "payment_processing_pending",
    });
    expect(refund).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledOnce();
    expect(f.charge.status).toBe("captured");
  });

  it("lost final COMMIT response replays the durable completed refund", async () => {
    const f = await fixture();
    let commits = 0;
    f.setFault((sql) => sql === "COMMIT" && ++commits === 2);
    const refund = vi.spyOn(f.provider, "refund");
    await expect(f.refund()).rejects.toMatchObject({
      code: "payment_persistence_unavailable",
    });
    f.setFault(() => false);
    await expect(f.refund()).resolves.toMatchObject({ success: true });
    expect(refund).toHaveBeenCalledOnce();
  });

  it.each(["pending", "unknown", "accepted", "empty_ref", "bad_error", "null"])(
    "%s PSP reply never asserts refunded",
    async (kind) => {
      const f = await fixture();
      const response =
        kind === "empty_ref"
          ? { status: "completed", providerRef: "" }
          : kind === "bad_error"
            ? {
                status: "failed",
                error: "synthetic_private_psp_detail",
                retryable: true,
              }
            : kind === "null"
              ? null
              : { status: kind };
      const refund = vi
        .spyOn(f.provider, "refund")
        .mockResolvedValue(response as never);
      await expect(f.refund()).rejects.toMatchObject({
        code: "payment_processing_pending",
      });
      await expect(f.refund()).rejects.toMatchObject({
        code: "payment_processing_pending",
      });
      expect(refund).toHaveBeenCalledOnce();
      expect(f.charge).toMatchObject({
        status: "captured",
        refund_status: "unknown",
      });
      expect(f.billing.status).toBe("captured");
      expect(f.journal.error_code).toBeNull();
    },
  );

  it("a definitive failed refund remains captured with no invented automatic retry", async () => {
    const f = await fixture();
    const refund = vi.spyOn(f.provider, "refund").mockResolvedValue({
      status: "failed",
      error: "unavailable",
      retryable: true,
    });
    await expect(f.refund()).rejects.toMatchObject({
      code: "payment_refund_failed",
    });
    await expect(f.refund()).rejects.toMatchObject({ code: "invalid_state" });
    expect(refund).toHaveBeenCalledOnce();
    expect(f.charge).toMatchObject({
      status: "captured",
      refund_status: "failed",
    });
    expect(f.billing.status).toBe("captured");
  });

  it.each([
    "passenger",
    "ops",
    "tenant",
    "system",
    "observer",
    "no_scope",
    "no_actor",
    "tenant_bound",
    "anonymous",
  ])("%s authority refuses before any repository call", async (kind) => {
    const f = await fixture();
    const identity =
      kind === "anonymous"
        ? null
        : ({
            ...IDENTITY,
            ...(kind === "no_scope"
              ? { scopes: [] }
              : kind === "no_actor"
                ? { actorId: null }
                : kind === "tenant_bound"
                  ? { tenantId: "synthetic_tenant" }
                  : kind === "observer"
                    ? { actorType: "ops_observer" }
                    : { realm: kind }),
          } as RequestIdentity);
    await expect(f.service.refund(identity, ORDER, BODY)).rejects.toMatchObject(
      { code: "forbidden" },
    );
    expect(f.client.query).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    {},
    { reason: "" },
    { reason: "\n" },
    { reason: "a".repeat(501) },
    { ...BODY, amount: 100 },
    { ...BODY, rideId: ORDER },
    { ...BODY, token: "synthetic_token" },
    { ...BODY, cardNumber: "synthetic_forbidden_card_field" },
  ])(
    "rejects malformed or unsupported request %j before persistence",
    async (body) => {
      const f = await fixture();
      await expect(
        f.service.refund(IDENTITY, ORDER, body),
      ).rejects.toMatchObject({ code: "invalid_request" });
      expect(f.client.query).not.toHaveBeenCalled();
    },
  );

  it.each([
    "failed",
    "manual_recovery",
    "not_selected",
    "authorized",
    "refunded",
  ])("%s charge is ineligible without any PSP call", async (status) => {
    const f = await fixture();
    f.charge.status = status;
    f.billing.status = status;
    f.captureJournal.outcome =
      status === "refunded"
        ? "completed"
        : ["authorized", "not_selected"].includes(status)
          ? "pending"
          : "failed";
    const refund = vi.spyOn(f.provider, "refund");
    await expect(f.refund()).rejects.toMatchObject({ code: "invalid_state" });
    expect(refund).not.toHaveBeenCalled();
  });

  it.each([
    "absent",
    "locked",
    "drift",
    "provider",
    "orphan",
    "owner",
    "operation",
    "entity",
    "missing_capture_ref",
  ])("%s state refuses before PSP", async (kind) => {
    const f = await fixture();
    if (kind === "absent") f.setAbsent();
    if (kind === "locked") f.setLocked();
    if (kind === "drift") f.billing.amount_minor = 1;
    if (kind === "provider") f.charge.provider = "synthetic_other_psp";
    if (kind === "orphan") f.setOrphanJournal();
    if (kind === "owner")
      f.journal.drts_passenger_id = "synthetic_other_passenger";
    if (kind === "operation") f.journal.operation = "capture";
    if (kind === "entity") f.journal.entity_id = METHOD;
    if (kind === "missing_capture_ref") {
      f.charge.provider_capture_ref = null;
      f.billing.provider_payment_ref = null;
    }
    const refund = vi.spyOn(f.provider, "refund");
    await expect(f.refund()).rejects.toMatchObject({
      code:
        kind === "absent"
          ? "not_found"
          : kind === "locked"
            ? "payment_processing_pending"
            : kind === "drift"
              ? "payment_state_conflict"
              : kind === "provider"
                ? "payment_provider_unavailable"
                : "invalid_state",
    });
    expect(refund).not.toHaveBeenCalled();
  });

  it("a different reason cannot alter/replay an existing full refund", async () => {
    const f = await fixture();
    await f.refund();
    await expect(
      f.service.refund(IDENTITY, ORDER, { reason: "synthetic_changed_reason" }),
    ).rejects.toMatchObject({ code: "invalid_state" });
    expect(f.charge.refund_reason).toBe(BODY.reason);
  });

  it("refuses completed replay whose refund journal belongs to a foreign owner", async () => {
    const f = await fixture();
    const refund = vi.spyOn(f.provider, "refund");
    await f.refund();
    f.journal.drts_passenger_id = "synthetic_foreign_owner";
    await expect(f.refund()).rejects.toMatchObject({ code: "invalid_state" });
    expect(refund).toHaveBeenCalledOnce();
  });

  it.each(["key", "operation", "entity", "outcome"])(
    "refuses a completed replay with mismatched %s journal identity",
    async (kind) => {
      const f = await fixture();
      await f.refund();
      if (kind === "key")
        f.charge.refund_idempotency_key = `pax:refund:${METHOD}`;
      if (kind === "operation") f.journal.operation = "capture";
      if (kind === "entity") f.journal.entity_id = METHOD;
      if (kind === "outcome") f.journal.outcome = "unknown";
      await expect(f.refund()).rejects.toMatchObject({ code: "invalid_state" });
    },
  );

  it("final persistence failure retains readback and never presents the PSP refund again", async () => {
    const f = await fixture();
    const refund = vi.spyOn(f.provider, "refund");
    const read = vi.spyOn(f.provider, "readRefund");
    f.setFault((sql) =>
      sql.startsWith(
        "UPDATE passenger.payment_charge_records SET refund_status",
      ),
    );
    await expect(f.refund()).rejects.toMatchObject({
      code: "payment_persistence_unavailable",
    });
    expect(f.charge).toMatchObject({
      status: "captured",
      refund_status: "unknown",
    });
    expect(f.billing.status).toBe("captured");
    expect(f.client.release).toHaveBeenCalledWith(true);
    f.setFault(() => false);
    await expect(f.refund()).resolves.toMatchObject({ success: true });
    expect(refund).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
  });

  it("throwing readback keeps the captured obligation and redacts PSP details", async () => {
    const f = await fixture();
    const refund = vi
      .spyOn(f.provider, "refund")
      .mockResolvedValue({ status: "unknown" });
    vi.spyOn(f.provider, "readRefund").mockRejectedValue(
      new Error("synthetic_private_psp_error"),
    );
    await expect(f.refund()).rejects.toMatchObject({
      code: "payment_processing_pending",
    });
    const failure = await f.refund().catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "payment_processing_pending" });
    expect(String(failure)).not.toContain("synthetic_private_psp_error");
    expect(refund).toHaveBeenCalledOnce();
    expect(f.billing.status).toBe("captured");
  });

  it("unknown readback never switches payment providers", async () => {
    const f = await fixture();
    const refund = vi
      .spyOn(f.provider, "refund")
      .mockResolvedValue({ status: "unknown" });
    const read = vi.spyOn(f.provider, "readRefund");
    await expect(f.refund()).rejects.toMatchObject({
      code: "payment_processing_pending",
    });
    f.charge.provider = "synthetic_other_psp";
    await expect(f.refund()).rejects.toMatchObject({
      code: "payment_provider_unavailable",
    });
    expect(refund).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    "BEGIN",
    "SELECT pg_try_advisory_lock",
    "UPDATE passenger.payment_charge_records SET refund_idempotency_key",
  ])(
    "%s failure prevents PSP money and exposes only a generic persistence error",
    async (prefix) => {
      const f = await fixture();
      f.setFault((sql) => sql.startsWith(prefix));
      const refund = vi.spyOn(f.provider, "refund");
      const failure = await f.refund().catch((error: unknown) => error);
      expect(failure).toMatchObject({
        code: "payment_persistence_unavailable",
      });
      expect(String(failure)).not.toContain("synthetic_private_db_detail");
      expect(refund).not.toHaveBeenCalled();
      expect(f.client.release).toHaveBeenCalledWith(true);
    },
  );

  it("release failure after success does not permit a duplicate refund", async () => {
    const f = await fixture();
    const refund = vi.spyOn(f.provider, "refund");
    f.client.release.mockImplementation(() => {
      throw new Error("synthetic_private_release_error");
    });
    await expect(f.refund()).rejects.toMatchObject({
      code: "payment_persistence_unavailable",
    });
    f.client.release.mockReset();
    await expect(f.refund()).resolves.toMatchObject({ success: true });
    expect(refund).toHaveBeenCalledOnce();
  });

  it("late provider response cannot overwrite a newer operation UUID", async () => {
    const f = await fixture();
    vi.spyOn(f.provider, "refund").mockImplementation(async () => {
      f.charge.refund_operation_id = "00000000-0000-4000-8000-000000000099";
      return { status: "completed", providerRef: "synthetic_ref" };
    });
    await expect(f.refund()).rejects.toMatchObject({ code: "invalid_state" });
    expect(f.charge.status).toBe("captured");
    expect(f.billing.status).toBe("captured");
    expect(
      f.calls.some((call) =>
        call.sql.startsWith(
          "UPDATE passenger.payment_charge_records SET refund_status",
        ),
      ),
    ).toBe(false);
  });

  it.each(["charge", "billing"])(
    "%s zero-row final update aborts receipt with ROLLBACK",
    async (kind) => {
      const f = await fixture();
      f.setCountFault((sql) =>
        sql.startsWith(
          kind === "charge"
            ? "UPDATE passenger.payment_charge_records SET refund_status"
            : "UPDATE billing.multi_taxi_passenger_payments SET status='refunded'",
        ),
      );
      await expect(f.refund()).rejects.toMatchObject({ code: "invalid_state" });
      expect(f.calls.some((call) => call.sql === "ROLLBACK")).toBe(true);
      expect(
        f.calls.some((call) =>
          call.sql.startsWith(
            "UPDATE passenger.payment_idempotency_keys SET outcome=$2",
          ),
        ),
      ).toBe(false);
    },
  );

  it("the actual controller metadata and exact auth policy both require platform billing writes", () => {
    expect(
      Reflect.getMetadata(AUTH_ALLOWED_REALMS_KEY, PaymentRefundController),
    ).toEqual(["platform"]);
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_SCOPES_KEY, PaymentRefundController),
    ).toEqual(["billing:write"]);
    expect(
      resolveRouteAuthPolicy(
        "POST",
        `/api/passenger-app/platform/rides/${ORDER}/refund`,
      ),
    ).toMatchObject({
      allowedRealms: ["platform"],
      requiredScopes: ["billing:write"],
    });
  });
});
