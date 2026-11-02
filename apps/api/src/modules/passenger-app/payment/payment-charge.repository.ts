import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import type { PassengerPaymentStatus } from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import { DatabaseService } from "../../../common/db/database.service";
import type { OwnedMobilityMultiTaxiTripCompletedEvent } from "../../owned-mobility/owned-mobility-events";
import type { CaptureDisposition } from "./payment-capture.policy";
import type { EncryptedPaymentToken } from "./payment-token-cipher";
import { paymentMethodId } from "./payment-method.service";
import { MultiTaxiRepository } from "../../multi-taxi/multi-taxi.repository";
import {
  PAYMENT_RECOVERY_NOTICE_EXPIRY,
  PAYMENT_RECOVERY_NOTICE_OUTBOX,
} from "./payment-recovery-notice.config";

export interface StoredCharge {
  orderId: string;
  paymentId: string;
  passengerId: string;
  methodId: string;
  key: string;
  amountMinor: number;
  status: PassengerPaymentStatus;
  attemptCount: number;
  readbackCount: number;
  nextOperation: "capture" | "readback" | null;
  retryAt: string | null;
  operationId: string | null;
  provider: string;
  tokenEnvelope: EncryptedPaymentToken | null;
  methodActive: boolean;
  providerCaptureRef: string | null;
  lastError:
    | "card_declined"
    | "unavailable"
    | "invalid_method"
    | "unknown"
    | null;
}

export interface ChargeOperation extends StoredCharge {
  operationId: string;
}

function unavailable(): never {
  // PostgreSQL/provider errors may embed token values. Never retain their cause.
  throw new ApiRequestError(
    503,
    "payment_persistence_unavailable",
    "Payment persistence is unavailable.",
  );
}

function conflict(): never {
  throw new ApiRequestError(
    409,
    "payment_state_conflict",
    "Payment state does not match the completed ride.",
  );
}

function mapCharge(row: QueryResultRow): StoredCharge {
  const amountMinor = Number(row.amount_minor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) conflict();
  return {
    orderId: row.order_id,
    paymentId: row.payment_id,
    passengerId: row.drts_passenger_id,
    methodId: row.payment_method_id,
    key: row.idempotency_key,
    amountMinor,
    status: row.status,
    attemptCount: row.attempt_count,
    readbackCount: row.readback_count,
    nextOperation: row.next_operation,
    retryAt: row.retry_at ? new Date(row.retry_at).toISOString() : null,
    operationId: row.operation_id,
    provider: row.provider,
    tokenEnvelope: row.token_envelope,
    methodActive: row.method_status === "active",
    providerCaptureRef: row.provider_capture_ref ?? null,
    lastError: row.last_error_code ?? null,
  };
}

function captureOutcome(
  charge: StoredCharge,
): "pending" | "unknown" | "completed" | "failed" {
  if (["captured", "refunded"].includes(charge.status)) return "completed";
  if (["not_selected", "authorized"].includes(charge.status)) return "pending";
  if (charge.lastError === "unknown") return "unknown";
  if (
    charge.attemptCount === 0 &&
    charge.nextOperation === "capture" &&
    charge.lastError === "unavailable"
  )
    return "pending";
  return "failed";
}

/** A single dedicated PG session holds an order advisory lock across short
 * transactions and PSP I/O. There is NO open transaction during PSP I/O.
 * Session loss releases the advisory lock; durable readback state and the
 * operation UUID still fence restarted workers and late responses.
 */
export class PaymentChargeSession {
  constructor(
    protected readonly client: PoolClient,
    readonly orderId: string,
    private readonly notices?: MultiTaxiRepository,
    private readonly noticeExpiry: string | null = null,
  ) {}

  protected async transaction<T>(
    passengerId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    await this.client.query("BEGIN");
    try {
      // Same first lock as Booking, method removal and account deletion.
      const account = await this.client.query(
        "SELECT status FROM passenger.accounts WHERE drts_passenger_id=$1 FOR UPDATE",
        [passengerId],
      );
      if (!account.rows[0]) conflict();
      const value = await work();
      await this.client.query("COMMIT");
      return value;
    } catch (error) {
      await this.client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  async initialize(
    event: OwnedMobilityMultiTaxiTripCompletedEvent,
  ): Promise<StoredCharge | null> {
    const owner = await this.client.query(
      "SELECT drts_passenger_id FROM passenger.booking_histories WHERE order_id=$1",
      [this.orderId],
    );
    if (!owner.rows[0]) return null; // Guest/partner trips are outside this core.
    if (
      event.runtimeProfileCode !== "multi_taxi_direct" ||
      event.currency !== "TWD" ||
      !Number.isSafeInteger(event.fareMinor) ||
      event.fareMinor < 0 ||
      typeof event.tripId !== "string" ||
      !event.tripId ||
      typeof event.completedAt !== "string" ||
      !Number.isFinite(Date.parse(event.completedAt))
    ) {
      throw new ApiRequestError(
        400,
        "payment_completion_invalid",
        "Completed trip payment fields are invalid.",
      );
    }
    const passengerId: string = owner.rows[0].drts_passenger_id;
    return this.transaction(passengerId, async () => {
      const source = await this.client.query(
        `SELECT o.status,o.runtime_profile_code,o.record AS order_record,
                t.status AS task_status,t.record AS task_record,h.drts_passenger_id
         FROM passenger.booking_histories h
         JOIN ops.phase1_owned_orders o ON o.order_id=h.order_id::text
         JOIN ops.phase1_driver_tasks t ON t.order_id=o.order_id AND t.task_id=$2
         WHERE h.order_id=$1 FOR SHARE OF h,o,t`,
        [this.orderId, event.tripId],
      );
      const row = source.rows[0];
      if (
        !row ||
        row.drts_passenger_id !== passengerId ||
        row.status !== "completed" ||
        row.task_status !== "completed" ||
        row.runtime_profile_code !== "multi_taxi_direct" ||
        row.order_record?.passenger?.passengerId !== passengerId ||
        row.task_record?.fare?.amountMinor !== event.fareMinor ||
        row.task_record?.fare?.currency !== event.currency ||
        new Date(row.task_record?.completedAt).getTime() !==
          new Date(event.completedAt).getTime()
      )
        conflict();
      const methodId = paymentMethodId(row.order_record.paymentMethodTokenRef);
      const key = `pax:capture:${this.orderId}`;
      const paymentId = `pax-payment:${this.orderId}`;
      await this.client.query(
        `INSERT INTO passenger.payment_idempotency_keys
           (idempotency_key,operation,drts_passenger_id,entity_id)
         VALUES ($1,'capture',$2,$3) ON CONFLICT (idempotency_key) DO NOTHING`,
        [key, passengerId, this.orderId],
      );
      const claim = await this.client.query(
        `SELECT operation,drts_passenger_id,entity_id FROM passenger.payment_idempotency_keys
         WHERE idempotency_key=$1 FOR UPDATE`,
        [key],
      );
      if (
        claim.rows[0]?.operation !== "capture" ||
        claim.rows[0]?.drts_passenger_id !== passengerId ||
        claim.rows[0]?.entity_id !== this.orderId
      )
        conflict();
      await this.client.query(
        `INSERT INTO billing.multi_taxi_passenger_payments
           (payment_id,order_id,payment_method_token_ref,status,amount_minor,currency)
         VALUES ($1,$2,$3,'failed',$4,'TWD') ON CONFLICT (order_id) DO NOTHING`,
        [paymentId, this.orderId, methodId, event.fareMinor],
      );
      await this.client.query(
        `INSERT INTO passenger.payment_charge_records
           (order_id,payment_id,drts_passenger_id,payment_method_id,idempotency_key,
            amount_minor,currency,status,completed_at,next_operation,last_error_code)
         VALUES ($1,$2,$3,$4,$5,$6,'TWD','failed',$7,'capture','unavailable')
         ON CONFLICT (order_id) DO NOTHING`,
        [
          this.orderId,
          paymentId,
          passengerId,
          methodId,
          key,
          event.fareMinor,
          event.completedAt,
        ],
      );
      const stored = await this.load();
      if (
        !stored ||
        stored.passengerId !== passengerId ||
        stored.methodId !== methodId ||
        stored.paymentId !== paymentId ||
        stored.key !== key ||
        stored.amountMinor !== event.fareMinor
      )
        conflict();
      return stored;
    });
  }

  async load(): Promise<StoredCharge | null> {
    const result = await this.client.query(
      `SELECT c.*,m.provider,m.token_envelope,m.status AS method_status,
              p.status AS billing_status,p.amount_minor AS billing_amount,
              p.currency AS billing_currency,p.attempt_count AS billing_attempts,
              p.payment_method_token_ref,p.provider_payment_ref,h.drts_passenger_id AS booking_owner,
              k.operation AS capture_journal_operation,k.drts_passenger_id AS capture_journal_owner,
              k.entity_id AS capture_journal_entity,k.outcome AS capture_journal_outcome
       FROM passenger.payment_charge_records c
       JOIN passenger.psp_tokens m ON m.payment_method_id=c.payment_method_id AND m.drts_passenger_id=c.drts_passenger_id
       JOIN billing.multi_taxi_passenger_payments p ON p.payment_id=c.payment_id AND p.order_id=c.order_id::text
       LEFT JOIN passenger.booking_histories h ON h.order_id=c.order_id
       LEFT JOIN passenger.payment_idempotency_keys k ON k.idempotency_key=c.idempotency_key
       WHERE c.order_id=$1`,
      [this.orderId],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (
      row.order_id !== this.orderId ||
      row.payment_id !== `pax-payment:${this.orderId}` ||
      row.idempotency_key !== `pax:capture:${this.orderId}` ||
      row.booking_owner !== row.drts_passenger_id ||
      row.capture_journal_operation !== "capture" ||
      row.capture_journal_owner !== row.drts_passenger_id ||
      row.capture_journal_entity !== this.orderId ||
      row.status !== row.billing_status ||
      String(row.amount_minor) !== String(row.billing_amount) ||
      row.currency !== "TWD" ||
      row.billing_currency !== "TWD" ||
      row.attempt_count !== row.billing_attempts ||
      row.payment_method_id !== row.payment_method_token_ref ||
      (row.provider_capture_ref ?? null) !== (row.provider_payment_ref ?? null)
    )
      conflict();
    const charge = mapCharge(row);
    if (row.capture_journal_outcome !== captureOutcome(charge)) conflict();
    return charge;
  }

  async begin(
    charge: StoredCharge,
    operation: "capture" | "readback" | "settle",
  ): Promise<ChargeOperation> {
    return this.transaction(charge.passengerId, async () => {
      await this.client.query(
        "SELECT order_id FROM passenger.payment_charge_records WHERE order_id=$1 FOR UPDATE",
        [this.orderId],
      );
      await this.client.query(
        "SELECT payment_id FROM billing.multi_taxi_passenger_payments WHERE payment_id=$1 FOR UPDATE",
        [charge.paymentId],
      );
      const current = await this.load();
      if (
        !current ||
        current.status !== charge.status ||
        current.attemptCount !== charge.attemptCount ||
        current.readbackCount !== charge.readbackCount ||
        current.operationId !== charge.operationId ||
        !["not_selected", "failed"].includes(current.status)
      )
        conflict();
      const operationId = randomUUID();
      const attemptCount =
        current.attemptCount + (operation === "capture" ? 1 : 0);
      const readbackCount =
        operation === "capture"
          ? 0
          : current.readbackCount + (operation === "readback" ? 1 : 0);
      const update = await this.client.query(
        `UPDATE passenger.payment_charge_records SET status='failed',attempt_count=$2,readback_count=$3,
          next_operation='readback',operation_id=$4,last_error_code='unknown',retry_at=NULL,updated_at=now()
         WHERE order_id=$1`,
        [this.orderId, attemptCount, readbackCount, operationId],
      );
      if (update.rowCount !== 1) conflict();
      const billing = await this.client.query(
        `UPDATE billing.multi_taxi_passenger_payments SET status='failed',attempt_count=$2,updated_at=now()
         WHERE payment_id=$1`,
        [charge.paymentId, attemptCount],
      );
      if (billing.rowCount !== 1) conflict();
      const journal = await this.client.query(
        `UPDATE passenger.payment_idempotency_keys SET outcome='unknown',error_code=NULL,updated_at=now()
         WHERE idempotency_key=$1 AND operation='capture' AND drts_passenger_id=$2 AND entity_id=$3 AND outcome=$4`,
        [
          current.key,
          current.passengerId,
          this.orderId,
          captureOutcome(current),
        ],
      );
      if (journal.rowCount !== 1) conflict();
      return {
        ...current,
        status: "failed",
        attemptCount,
        readbackCount,
        nextOperation: "readback",
        retryAt: null,
        operationId,
      };
    });
  }

  async finish(
    claim: ChargeOperation,
    decision: CaptureDisposition,
  ): Promise<void> {
    await this.transaction(claim.passengerId, async () => {
      await this.client.query(
        "SELECT order_id FROM passenger.payment_charge_records WHERE order_id=$1 FOR UPDATE",
        [this.orderId],
      );
      await this.client.query(
        "SELECT payment_id FROM billing.multi_taxi_passenger_payments WHERE payment_id=$1 FOR UPDATE",
        [claim.paymentId],
      );
      const current = await this.load();
      if (
        !current ||
        current.operationId !== claim.operationId ||
        current.status !== "failed" ||
        current.attemptCount !== claim.attemptCount ||
        current.readbackCount !== claim.readbackCount
      )
        conflict();
      const update = await this.client.query(
        `UPDATE passenger.payment_charge_records SET status=$3,provider_capture_ref=$4,last_error_code=$5,
          next_operation=$6,retry_at=$7,operation_id=NULL,
          recovery_notice_requested_at=CASE WHEN $8 THEN COALESCE(recovery_notice_requested_at,now()) ELSE recovery_notice_requested_at END,
          updated_at=now() WHERE order_id=$1 AND operation_id=$2 AND status='failed'`,
        [
          this.orderId,
          claim.operationId,
          decision.status,
          decision.status === "captured" ? decision.providerRef : null,
          decision.error,
          decision.nextOperation,
          decision.retryAt,
          decision.requestRecoveryNotice,
        ],
      );
      if (update.rowCount !== 1) conflict(); // Late response cannot overwrite a newer worker.
      const billing = await this.client.query(
        `UPDATE billing.multi_taxi_passenger_payments SET status=$2,provider_payment_ref=$3,
          attempt_count=$4,updated_at=now() WHERE payment_id=$1 AND status='failed' AND attempt_count=$4`,
        [
          claim.paymentId,
          decision.status,
          decision.status === "captured" ? decision.providerRef : null,
          claim.attemptCount,
        ],
      );
      if (billing.rowCount !== 1) conflict();
      const journal = await this.client.query(
        `UPDATE passenger.payment_idempotency_keys SET outcome=$2,error_code=$3,updated_at=now()
         WHERE idempotency_key=$1 AND operation='capture' AND drts_passenger_id=$4 AND entity_id=$5 AND outcome='unknown'`,
        [
          claim.key,
          decision.status === "captured"
            ? "completed"
            : decision.error === "unknown"
              ? "unknown"
              : "failed",
          decision.error === "unknown" ? null : decision.error,
          current.passengerId,
          this.orderId,
        ],
      );
      if (journal.rowCount !== 1) conflict();
      if (decision.requestRecoveryNotice && this.notices && this.noticeExpiry)
        await this.notices.enqueuePaymentRecoveryNotice(
          this.client,
          this.orderId,
          this.noticeExpiry,
        );
    });
  }

  async enqueueRecoveryNotice(): Promise<void> {
    if (!this.notices || !this.noticeExpiry) return;
    const charge = await this.load();
    if (!charge || charge.status !== "manual_recovery") return;
    await this.transaction(charge.passengerId, async () => {
      const current = await this.load();
      if (
        !current ||
        current.passengerId !== charge.passengerId ||
        current.status !== "manual_recovery"
      )
        conflict();
      await this.notices!.enqueuePaymentRecoveryNotice(
        this.client,
        this.orderId,
        this.noticeExpiry!,
      );
    });
  }

  async hasPriorDeclineForMethod(
    passengerId: string,
    methodId: string,
  ): Promise<boolean> {
    const result = await this.client.query(
      `SELECT 1 FROM passenger.payment_charge_records
       WHERE drts_passenger_id=$1 AND payment_method_id=$2 AND order_id<>$3
         AND status IN ('failed','manual_recovery')
         AND last_error_code IN ('card_declined','invalid_method')
       LIMIT 1`,
      [passengerId, methodId, this.orderId],
    );
    return (result.rowCount ?? result.rows.length) > 0;
  }
}

@Injectable()
export class PaymentChargeRepository {
  constructor(
    private readonly database: DatabaseService,
    @Optional()
    @Inject(PAYMENT_RECOVERY_NOTICE_OUTBOX)
    private readonly notices?: MultiTaxiRepository,
    @Optional()
    @Inject(PAYMENT_RECOVERY_NOTICE_EXPIRY)
    private readonly noticeExpiry?: string | null,
  ) {}

  isEnabled(): boolean {
    return this.database.isEnabled();
  }

  protected createSession(
    client: PoolClient,
    orderId: string,
  ): PaymentChargeSession {
    return new PaymentChargeSession(
      client,
      orderId,
      this.notices,
      this.noticeExpiry ?? null,
    );
  }

  isRecoveryNoticeConfigured(): boolean {
    return (
      !!this.notices?.isEnabled() &&
      !!this.noticeExpiry &&
      Date.parse(this.noticeExpiry) > Date.now() &&
      process.env.PASSENGER_PUSH_FIRST_PARTY_ENABLED === "true"
    );
  }

  async listRecoveryNoticeOrders(
    limit: number,
    afterOrderId: string | null = null,
  ): Promise<string[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new Error("payment_batch_invalid");
    const cursor = afterOrderId === null ? null : paymentMethodId(afterOrderId);
    try {
      const result = await this.database.query(
        `SELECT c.order_id FROM passenger.payment_charge_records c WHERE c.status='manual_recovery' AND c.recovery_notice_requested_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ops.consumer_notification_outbox o WHERE o.outbox_id='pax:payment-recovery:'||c.order_id::text)
        AND ($2::uuid IS NULL OR c.order_id>$2::uuid)
        ORDER BY c.order_id LIMIT $1`,
        [limit, cursor],
      );
      return result.rows.map((row) => row.order_id);
    } catch {
      return unavailable();
    }
  }

  async listDueOrders(limit: number): Promise<string[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new Error("payment_batch_invalid");
    try {
      const result = await this.database.query(
        `SELECT order_id FROM passenger.payment_charge_records
         WHERE status IN ('not_selected','failed') AND next_operation IS NOT NULL
           AND (retry_at IS NULL OR retry_at<=now())
         ORDER BY retry_at NULLS FIRST,created_at,order_id LIMIT $1`,
        [limit],
      );
      return result.rows.map((row) => row.order_id);
    } catch {
      return unavailable();
    }
  }

  async withOrder<T>(
    orderId: string,
    work: (session: PaymentChargeSession) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.connect().catch(() => unavailable());
    let locked = false;
    let evict = false;
    const key = `pax:capture:${orderId}`;
    try {
      const lock = await client.query(
        "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",
        [key],
      );
      locked = lock.rows[0]?.locked === true;
      if (!locked)
        throw new ApiRequestError(
          503,
          "payment_processing_pending",
          "Payment is being processed.",
        );
      return await work(this.createSession(client, orderId));
    } catch (error) {
      evict = true;
      if (error instanceof ApiRequestError) throw error;
      return unavailable();
    } finally {
      if (locked) {
        try {
          const result = await client.query(
            "SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked",
            [key],
          );
          if (result.rows[0]?.unlocked !== true) evict = true;
        } catch {
          evict = true;
        }
      }
      // release itself can fail after a durable COMMIT. Do not leak its error
      // or turn an acknowledged PSP charge into a new capture opportunity.
      try {
        client.release(evict ? true : undefined);
      } catch {
        unavailable();
      }
    }
  }
}
