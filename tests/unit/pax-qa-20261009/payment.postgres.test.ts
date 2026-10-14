import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PaymentChargeService } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.service";
import { assertPassengerCanBook } from "../../../apps/api/src/modules/passenger-app/payment/booking-payment.guard";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
  platformIdentity,
} from "./payment-postgres-harness";

const captured = {
  status: "captured" as const,
  providerRef: "qa-cas-ref",
  nextOperation: null,
  retryAt: null,
  error: null,
  requestRecoveryNotice: false as const,
};

describe.skipIf(!hostedPaymentEnabled)(
  "PAX QA Payment production PostgreSQL",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterAll(() => h.close(), 30000);

    it("commits the bind claim before PSP and encrypts an owner-bound token", async () => {
      const owner = await h.account();
      const credential = "qa.opaque.credential.durable";
      h.provider.bind.mockImplementationOnce(async (input, key) => {
        expect(input).toBe(credential);
        const claim = await h.pool!.query(
          "SELECT * FROM passenger.payment_idempotency_keys WHERE idempotency_key=$1",
          [key],
        );
        expect(claim.rows[0]).toMatchObject({
          operation: "bind",
          drts_passenger_id: owner,
          outcome: "pending",
        });
        return {
          status: "completed",
          card: {
            token: "qa.secret.synthetic.token",
            last4: "0042",
            cardType: "SYNTHETIC",
            expiryMonth: "12",
            expiryYear: "2099",
          },
        };
      });
      const method = await h.method(owner, credential);
      const row = (
        await h.pool!.query(
          "SELECT * FROM passenger.psp_tokens WHERE payment_method_id=$1",
          [method.paymentMethodId],
        )
      ).rows[0];
      expect(method.isDefault).toBe(true);
      expect(JSON.stringify(row)).not.toContain("qa.secret.synthetic.token");
      expect(JSON.stringify(row)).not.toContain(credential);
      expect(
        h.cipher.decrypt(row.token_envelope, owner, method.paymentMethodId),
      ).toBe("qa.secret.synthetic.token");
      expect(() =>
        h.cipher.decrypt(
          row.token_envelope,
          "foreign-owner",
          method.paymentMethodId,
        ),
      ).toThrow();
      expect(await h.method(owner, credential)).toEqual(method);
      expect(h.provider.bind).toHaveBeenCalledTimes(1);
    });

    it("concurrent same-credential binding converges and foreign replay is refused", async () => {
      const owner = await h.account();
      const foreign = await h.account();
      const credential = "qa.opaque.credential.concurrent";
      const [a, b] = await Promise.all([
        h.method(owner, credential),
        h.method(owner, credential),
      ]);
      expect(a).toEqual(b);
      expect(
        (
          await h.pool!.query(
            "SELECT count(*)::int AS count FROM passenger.psp_tokens",
          )
        ).rows[0].count,
      ).toBe(1);
      const calls = h.provider.bind.mock.calls.length;
      await expect(
        h.methodService.bind(foreign, { providerToken: credential }),
      ).rejects.toMatchObject({ code: "invalid_credential" });
      expect(h.provider.bind).toHaveBeenCalledTimes(calls);
    });

    it("default changes serialize and foreign card mutation cannot change the owner", async () => {
      const owner = await h.account();
      const foreign = await h.account();
      const a = await h.method(owner);
      const b = await h.method(owner);
      expect(b.isDefault).toBe(false);
      await Promise.all([
        h.methods.setDefault(owner, a.paymentMethodId),
        h.methods.setDefault(owner, b.paymentMethodId),
      ]);
      expect(
        (await h.methods.list(owner)).filter((m) => m.isDefault),
      ).toHaveLength(1);
      await expect(
        h.methods.setDefault(foreign, a.paymentMethodId),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        h.methods.remove(foreign, a.paymentMethodId),
      ).rejects.toMatchObject({ code: "not_found" });
      expect(await h.methods.list(foreign)).toEqual([]);
      expect(await h.methods.list(owner)).toHaveLength(2);
    });

    it("binding final-write failure rolls back token insertion and retains the original claim", async () => {
      const owner = await h.account();
      const foreign = await h.account();
      await h.pool!.query(
        "ALTER TABLE passenger.payment_idempotency_keys ADD CONSTRAINT qa_fail_bind_finish CHECK (operation<>'bind' OR outcome<>'completed')",
      );
      const credential = "qa.opaque.credential.rollback";
      await expect(h.method(owner, credential)).rejects.toMatchObject({
        code: "payment_persistence_unavailable",
      });
      expect(
        (await h.pool!.query("SELECT * FROM passenger.psp_tokens")).rows,
      ).toHaveLength(0);
      const claim = (
        await h.pool!.query("SELECT * FROM passenger.payment_idempotency_keys")
      ).rows[0];
      expect(claim).toMatchObject({
        outcome: "pending",
        drts_passenger_id: owner,
      });
      await expect(h.method(foreign, credential)).rejects.toMatchObject({
        code: "invalid_credential",
      });
      await h.pool!.query(
        "ALTER TABLE passenger.payment_idempotency_keys DROP CONSTRAINT qa_fail_bind_finish",
      );
      expect((await h.method(owner, credential)).paymentMethodId).toBe(
        claim.entity_id,
      );
      expect(h.provider.bind.mock.calls.map((args) => args[1])).toEqual([
        claim.idempotency_key,
        claim.idempotency_key,
      ]);
    });

    it("captures actual completion fare once with durable dual billing and journal state", async () => {
      const { event } = await h.obligation();
      h.provider.capture.mockImplementationOnce(async (command) => {
        const row = (
          await h.pool!.query(
            "SELECT * FROM passenger.payment_charge_records WHERE order_id=$1",
            [event.orderId],
          )
        ).rows[0];
        expect(row).toMatchObject({
          status: "failed",
          attempt_count: 1,
          next_operation: "readback",
          last_error_code: "unknown",
        });
        expect(row.operation_id).toMatch(/^[0-9a-f-]{36}$/);
        const billing = (
          await h.pool!.query(
            "SELECT * FROM billing.multi_taxi_passenger_payments WHERE order_id=$1",
            [event.orderId],
          )
        ).rows[0];
        expect(billing).toMatchObject({
          status: "failed",
          attempt_count: 1,
          amount_minor: "125",
          currency: "TWD",
        });
        const activity = await h.pool!.query(
          "SELECT a.state,a.xact_start FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.datname=current_database() AND l.locktype='advisory'",
        );
        expect(activity.rows).toHaveLength(1);
        expect(activity.rows[0]).toMatchObject({
          state: "idle",
          xact_start: null,
        });
        expect(command).toMatchObject({
          idempotencyKey: `pax:capture:${event.orderId}`,
          amountMinor: 125,
          currency: "TWD",
        });
        return { status: "completed", providerRef: "qa-durable-capture" };
      });
      await h.chargeService.onTripCompleted(event);
      // PSP exceptions are intentionally swallowed by core as unknown. Check
      // before replay so an assertion inside the PSP probe cannot disappear.
      expect((await h.state(event.orderId)).charge?.status).toBe("captured");
      expect(h.provider.readCapture).not.toHaveBeenCalled();
      await h.chargeService.onTripCompleted(event);
      const state = await h.state(event.orderId);
      expect(state.charge).toMatchObject({
        status: "captured",
        attemptCount: 1,
        operationId: null,
        providerCaptureRef: "qa-durable-capture",
      });
      expect(state.billing).toMatchObject({
        status: "captured",
        attempt_count: 1,
        provider_payment_ref: "qa-durable-capture",
      });
      expect(state.journal).toHaveLength(1);
      expect(state.journal[0].outcome).toBe("completed");
      expect(h.provider.capture).toHaveBeenCalledTimes(1);
    });

    it("rejects mismatched completion authority before any payment or PSP write", async () => {
      const { event } = await h.obligation();
      await expect(
        h.chargeService.onTripCompleted({
          ...event,
          fareMinor: event.fareMinor + 1,
        }),
      ).rejects.toMatchObject({ code: "payment_state_conflict" });
      expect((await h.state(event.orderId)).charge).toBeNull();
      expect(
        (
          await h.pool!.query(
            "SELECT * FROM billing.multi_taxi_passenger_payments",
          )
        ).rows,
      ).toHaveLength(0);
      expect(h.provider.capture).not.toHaveBeenCalled();
    });

    it("foreign-method FK failure rolls back capture claim and first billing insert", async () => {
      const owner = await h.account();
      const foreign = await h.account();
      const foreignMethod = await h.method(foreign);
      const event = await h.ride(owner, foreignMethod.paymentMethodId);
      await expect(
        h.chargeService.onTripCompleted(event),
      ).rejects.toMatchObject({ code: "payment_persistence_unavailable" });
      expect(
        (
          await h.pool!.query(
            "SELECT * FROM passenger.payment_idempotency_keys WHERE operation='capture'",
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await h.pool!.query(
            "SELECT * FROM billing.multi_taxi_passenger_payments",
          )
        ).rows,
      ).toHaveLength(0);
      expect(h.provider.capture).not.toHaveBeenCalled();
    });

    it("failed finish rolls back both authorities and resumes by original-key readback", async () => {
      const { event } = await h.obligation();
      await h.pool!.query(
        "ALTER TABLE billing.multi_taxi_passenger_payments ADD CONSTRAINT qa_fail_capture_finish CHECK (status<>'captured')",
      );
      await expect(
        h.chargeService.onTripCompleted(event),
      ).rejects.toMatchObject({ code: "payment_persistence_unavailable" });
      let state = await h.state(event.orderId);
      expect(state.charge).toMatchObject({
        status: "failed",
        nextOperation: "readback",
        attemptCount: 1,
      });
      expect(state.billing.status).toBe("failed");
      expect(state.journal[0].outcome).toBe("unknown");
      await h.pool!.query(
        "ALTER TABLE billing.multi_taxi_passenger_payments DROP CONSTRAINT qa_fail_capture_finish",
      );
      await h.chargeService.processOrder(event.orderId);
      state = await h.state(event.orderId);
      expect(state.charge?.status).toBe("captured");
      expect(state.billing.status).toBe("captured");
      expect(h.provider.capture).toHaveBeenCalledTimes(1);
      expect(h.provider.readCapture).toHaveBeenCalledExactlyOnceWith(
        `pax:capture:${event.orderId}`,
      );
    });

    it("two independent PG sessions cannot concurrently present one order to PSP", async () => {
      const { event } = await h.obligation();
      let entered!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      h.provider.capture.mockImplementationOnce(async () => {
        entered();
        await held;
        return { status: "completed", providerRef: "qa-concurrent-capture" };
      });
      const first = h.chargeService.onTripCompleted(event);
      try {
        await Promise.race([
          started,
          first.then(() => {
            throw new Error("Completion did not enter the PSP probe.");
          }),
        ]);
        const a = await h.pool!.connect();
        const b = await h.pool!.connect();
        try {
          const pids = await Promise.all([
            a.query("SELECT pg_backend_pid() AS pid"),
            b.query("SELECT pg_backend_pid() AS pid"),
          ]);
          expect(pids[0].rows[0].pid).not.toBe(pids[1].rows[0].pid);
        } finally {
          a.release();
          b.release();
        }
        const second = new PaymentChargeService(
          h.charges,
          { provider: h.provider, cipher: h.cipher },
          {
            retryDelaysMs: [],
            retryDefinitiveDeclines: false,
            unknownReadbackDelaysMs: [0],
          },
        );
        await expect(second.onTripCompleted(event)).rejects.toMatchObject({
          code: "payment_processing_pending",
        });
      } finally {
        release();
        await first;
      }
      expect(h.provider.capture).toHaveBeenCalledTimes(1);
      expect((await h.state(event.orderId)).charge?.status).toBe("captured");
    });

    it("operation UUID CAS fences late capture and allows the newer readback result", async () => {
      const { event } = await h.obligation();
      await h.charges.withOrder(event.orderId, async (session) => {
        const initialized = await session.initialize(event);
        const first = await session.begin(initialized!, "capture");
        const second = await session.begin((await session.load())!, "readback");
        expect(second.operationId).not.toBe(first.operationId);
        await expect(session.finish(first, captured)).rejects.toMatchObject({
          code: "payment_state_conflict",
        });
        expect((await session.load())?.operationId).toBe(second.operationId);
        await session.finish(second, captured);
      });
      expect((await h.state(event.orderId)).charge).toMatchObject({
        status: "captured",
        attemptCount: 1,
        readbackCount: 1,
      });
      expect(h.provider.capture).not.toHaveBeenCalled();
    });

    it("definitive decline exhausts synthetic policy and blocks booking, deletion and removal", async () => {
      const { owner, method, event } = await h.obligation();
      h.provider.capture.mockResolvedValueOnce({
        status: "failed",
        error: "card_declined",
        retryable: false,
      });
      await h.chargeService.onTripCompleted(event);
      const state = await h.state(event.orderId);
      expect(state.charge).toMatchObject({
        status: "manual_recovery",
        nextOperation: null,
        attemptCount: 1,
      });
      expect(state.billing.status).toBe("manual_recovery");
      expect(
        (
          await h.pool!.query(
            "SELECT recovery_notice_requested_at FROM passenger.payment_charge_records",
          )
        ).rows[0].recovery_notice_requested_at,
      ).not.toBeNull();
      await expect(
        h.methods.withAccount(owner, (client) =>
          assertPassengerCanBook(client, owner, method.paymentMethodId),
        ),
      ).rejects.toMatchObject({ code: "pending_payment_block" });
      await expect(
        h.accountStore.transaction((tx) =>
          tx.anonymize(owner, new Date().toISOString()),
        ),
      ).rejects.toMatchObject({ code: "pending_payment_block" });
      await expect(
        h.methods.remove(owner, method.paymentMethodId),
      ).rejects.toMatchObject({ code: "pending_payment_block" });
      await h.chargeService.processOrder(event.orderId);
      expect(h.provider.capture).toHaveBeenCalledTimes(1);
    });

    it("retryable definitive failure uses one original key then enters manual recovery", async () => {
      const { event } = await h.obligation();
      h.provider.capture.mockResolvedValue({
        status: "failed",
        error: "unavailable",
        retryable: true,
      });
      await h.chargeService.onTripCompleted(event);
      expect((await h.state(event.orderId)).charge).toMatchObject({
        status: "failed",
        nextOperation: "capture",
        attemptCount: 1,
      });
      await h.chargeService.processOrder(event.orderId);
      expect((await h.state(event.orderId)).charge).toMatchObject({
        status: "manual_recovery",
        attemptCount: 2,
      });
      expect(
        h.provider.capture.mock.calls.map(
          ([command]) => command.idempotencyKey,
        ),
      ).toEqual([
        `pax:capture:${event.orderId}`,
        `pax:capture:${event.orderId}`,
      ]);
      expect(h.provider.readCapture).not.toHaveBeenCalled();
    });

    it("lost capture ACK reads the original key without another capture", async () => {
      const { event } = await h.obligation();
      h.provider.capture.mockRejectedValueOnce(
        new Error("qa.secret.synthetic.provider-error"),
      );
      await h.chargeService.onTripCompleted(event);
      expect((await h.state(event.orderId)).charge).toMatchObject({
        status: "failed",
        nextOperation: "readback",
        lastError: "unknown",
      });
      await h.chargeService.processOrder(event.orderId);
      expect((await h.state(event.orderId)).charge?.status).toBe("captured");
      expect(h.provider.capture).toHaveBeenCalledTimes(1);
      expect(h.provider.readCapture).toHaveBeenCalledExactlyOnceWith(
        `pax:capture:${event.orderId}`,
      );
    });

    it("unknown readbacks exhaust separately without presenting new money", async () => {
      const { event } = await h.obligation();
      h.provider.capture.mockResolvedValueOnce({ status: "unknown" });
      h.provider.readCapture.mockResolvedValue({ status: "unknown" });
      await h.chargeService.onTripCompleted(event);
      await h.chargeService.processOrder(event.orderId);
      await h.chargeService.processOrder(event.orderId);
      expect((await h.state(event.orderId)).charge).toMatchObject({
        status: "manual_recovery",
        attemptCount: 1,
        readbackCount: 2,
        lastError: "unknown",
      });
      expect(h.provider.capture).toHaveBeenCalledTimes(1);
      expect(h.provider.readCapture).toHaveBeenCalledTimes(2);
    });

    it("missing financial policy persists the obligation without PSP contact", async () => {
      const { event } = await h.obligation();
      const disabled = new PaymentChargeService(
        h.charges,
        { provider: h.provider, cipher: h.cipher },
        null,
      );
      await disabled.onTripCompleted(event);
      expect((await h.state(event.orderId)).charge).toMatchObject({
        status: "failed",
        attemptCount: 0,
        nextOperation: "capture",
      });
      expect(h.provider.capture).not.toHaveBeenCalled();
    });

    it("full Ops refund updates both authorities and same-reason replay is read-only", async () => {
      const { event } = await h.obligation();
      await h.chargeService.onTripCompleted(event);
      const result = await h.refundService.refund(
        platformIdentity(),
        event.orderId,
        { reason: "synthetic full refund" },
      );
      expect(result).toEqual({
        success: true,
        refundId: `pax:refund:${event.orderId}`,
      });
      expect(
        await h.refundService.refund(platformIdentity(), event.orderId, {
          reason: "synthetic full refund",
        }),
      ).toEqual(result);
      await expect(
        h.refundService.refund(platformIdentity(), event.orderId, {
          reason: "different reason",
        }),
      ).rejects.toMatchObject({ code: "invalid_state" });
      const state = await h.state(event.orderId);
      expect(state.charge?.status).toBe("refunded");
      expect(state.billing.status).toBe("refunded");
      expect(state.journal.map((row) => row.outcome)).toEqual([
        "completed",
        "completed",
      ]);
      expect(h.provider.refund).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          idempotencyKey: `pax:refund:${event.orderId}`,
          amountMinor: 125,
          currency: "TWD",
        }),
      );
    });

    it("lost refund ACK preserves captured status and resumes by refund readback", async () => {
      const { event } = await h.obligation();
      await h.chargeService.onTripCompleted(event);
      let observed:
        | { refund_status: string; refund_operation_id: string }
        | undefined;
      h.provider.refund.mockImplementationOnce(async () => {
        const row = (
          await h.pool!.query(
            "SELECT refund_status,refund_operation_id FROM passenger.payment_charge_records WHERE order_id=$1",
            [event.orderId],
          )
        ).rows[0];
        observed = row;
        throw new Error("qa.secret.synthetic.refund-error");
      });
      await expect(
        h.refundService.refund(platformIdentity(), event.orderId, {
          reason: "synthetic uncertain refund",
        }),
      ).rejects.toMatchObject({ code: "payment_processing_pending" });
      expect(observed?.refund_status).toBe("unknown");
      expect(observed?.refund_operation_id).toMatch(/^[0-9a-f-]{36}$/);
      const uncertain = await h.state(event.orderId);
      expect(uncertain.charge?.status).toBe("captured");
      expect(uncertain.billing.status).toBe("captured");
      expect(
        uncertain.journal.find((row) => row.operation === "refund").outcome,
      ).toBe("unknown");
      await h.refundService.refund(platformIdentity(), event.orderId, {
        reason: "synthetic uncertain refund",
      });
      expect((await h.state(event.orderId)).charge?.status).toBe("refunded");
      expect(h.provider.refund).toHaveBeenCalledTimes(1);
      expect(h.provider.readRefund).toHaveBeenCalledExactlyOnceWith(
        `pax:refund:${event.orderId}`,
      );
    });

    it("refund final-write failure rolls back refunded status then uses original-key readback", async () => {
      const { event } = await h.obligation();
      await h.chargeService.onTripCompleted(event);
      await h.pool!.query(
        "ALTER TABLE billing.multi_taxi_passenger_payments ADD CONSTRAINT qa_fail_refund_finish CHECK (status<>'refunded')",
      );
      await expect(
        h.refundService.refund(platformIdentity(), event.orderId, {
          reason: "synthetic rollback refund",
        }),
      ).rejects.toMatchObject({ code: "payment_persistence_unavailable" });
      const state = await h.state(event.orderId);
      expect(state.charge?.status).toBe("captured");
      expect(state.billing.status).toBe("captured");
      expect(
        state.journal.find((row) => row.operation === "refund").outcome,
      ).toBe("unknown");
      await h.pool!.query(
        "ALTER TABLE billing.multi_taxi_passenger_payments DROP CONSTRAINT qa_fail_refund_finish",
      );
      await h.refundService.refund(platformIdentity(), event.orderId, {
        reason: "synthetic rollback refund",
      });
      expect((await h.state(event.orderId)).charge?.status).toBe("refunded");
      expect(h.provider.refund).toHaveBeenCalledTimes(1);
      expect(h.provider.readRefund).toHaveBeenCalledTimes(1);
    });

    it("settled method removal clears token but retains financial history", async () => {
      const { owner, method, event } = await h.obligation();
      await expect(
        h.methods.remove(owner, method.paymentMethodId),
      ).rejects.toMatchObject({ code: "pending_payment_block" });
      await h.chargeService.onTripCompleted(event);
      await h.methods.withAccount(owner, (client) =>
        assertPassengerCanBook(client, owner, method.paymentMethodId),
      );
      await h.methods.remove(owner, method.paymentMethodId);
      const row = (
        await h.pool!.query(
          "SELECT * FROM passenger.psp_tokens WHERE payment_method_id=$1",
          [method.paymentMethodId],
        )
      ).rows[0];
      expect(row).toMatchObject({
        status: "removed",
        token_envelope: null,
        is_default: false,
      });
      expect(await h.methods.list(owner)).toEqual([]);
      expect((await h.state(event.orderId)).charge?.status).toBe("captured");
      expect(
        (
          await h.pool!.query(
            "SELECT * FROM passenger.booking_histories WHERE order_id=$1",
            [event.orderId],
          )
        ).rows,
      ).toHaveLength(1);
    });
  },
);
