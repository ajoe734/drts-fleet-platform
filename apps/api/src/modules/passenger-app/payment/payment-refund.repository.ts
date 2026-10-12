import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiRequestError } from "../../../common/api-envelope";
import { DatabaseService } from "../../../common/db/database.service";
import {
  PaymentChargeRepository,
  PaymentChargeSession,
  type StoredCharge,
} from "./payment-charge.repository";

export type RefundState = "unknown" | "completed" | "failed";
export interface StoredRefund {
  key: string;
  reason: string;
  actorId: string;
  state: RefundState;
  operationId: string | null;
  providerRef: string | null;
}
export interface RefundClaim {
  charge: StoredCharge;
  refund: StoredRefund;
  operationId: string;
  operation: "refund" | "readback";
}

function conflict(): never {
  throw new ApiRequestError(
    409,
    "invalid_state",
    "Refund state does not match the payment authority.",
  );
}

/** Uses the SAME advisory order lock and account-first transaction order as
 * capture/manual recovery. Refund ambiguity never changes captured to failed.
 */
export class PaymentRefundSession extends PaymentChargeSession {
  async loadRefund(): Promise<StoredRefund | null> {
    const result = await this.client.query(
      `SELECT refund_idempotency_key,refund_reason,refund_actor_id,refund_status,
              refund_operation_id,provider_refund_ref,c.drts_passenger_id,
              k.operation AS refund_journal_operation,k.drts_passenger_id AS refund_journal_owner,
              k.entity_id AS refund_journal_entity,k.outcome AS refund_journal_outcome
       FROM passenger.payment_charge_records c
       LEFT JOIN passenger.payment_idempotency_keys k ON k.idempotency_key=c.refund_idempotency_key
       WHERE c.order_id=$1`,
      [this.orderId],
    );
    const row = result.rows[0];
    if (!row?.refund_idempotency_key) return null;
    // A simple FK proves only key existence. Replays must verify its refund
    // operation/account/order/outcome as well, including terminal receipts.
    if (
      row.refund_idempotency_key !== `pax:refund:${this.orderId}` ||
      row.refund_journal_operation !== "refund" ||
      row.refund_journal_owner !== row.drts_passenger_id ||
      row.refund_journal_entity !== this.orderId ||
      row.refund_journal_outcome !== row.refund_status
    )
      conflict();
    return {
      key: row.refund_idempotency_key,
      reason: row.refund_reason,
      actorId: row.refund_actor_id,
      state: row.refund_status,
      operationId: row.refund_operation_id,
      providerRef: row.provider_refund_ref ?? null,
    };
  }

  async beginRefund(
    charge: StoredCharge,
    actorId: string,
    reason: string,
  ): Promise<RefundClaim> {
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
        current.status !== "captured" ||
        !current.providerCaptureRef ||
        current.amountMinor !== charge.amountMinor ||
        current.providerCaptureRef !== charge.providerCaptureRef
      )
        conflict();
      const prior = await this.loadRefund();
      const key = `pax:refund:${this.orderId}`;
      if (
        prior &&
        (prior.key !== key ||
          prior.reason !== reason ||
          prior.state !== "unknown")
      )
        conflict();
      const inserted = await this.client.query(
        `INSERT INTO passenger.payment_idempotency_keys (idempotency_key,operation,drts_passenger_id,entity_id)
         VALUES ($1,'refund',$2,$3) ON CONFLICT (idempotency_key) DO NOTHING`,
        [key, current.passengerId, this.orderId],
      );
      const journal = await this.client.query(
        `SELECT operation,drts_passenger_id,entity_id,outcome FROM passenger.payment_idempotency_keys
         WHERE idempotency_key=$1 FOR UPDATE`,
        [key],
      );
      const row = journal.rows[0];
      if (
        (!prior && inserted.rowCount !== 1) ||
        row?.operation !== "refund" ||
        row.drts_passenger_id !== current.passengerId ||
        row.entity_id !== this.orderId ||
        (prior && row.outcome !== "unknown")
      )
        conflict();
      const operationId = randomUUID();
      const update = await this.client.query(
        `UPDATE passenger.payment_charge_records SET refund_idempotency_key=$2,
          refund_reason=COALESCE(refund_reason,$3),refund_actor_id=COALESCE(refund_actor_id,$4),
          refund_status='unknown',refund_operation_id=$5,updated_at=now()
         WHERE order_id=$1 AND status='captured'`,
        [this.orderId, key, reason, actorId, operationId],
      );
      if (update.rowCount !== 1) conflict();
      const journalUpdate = await this.client.query(
        `UPDATE passenger.payment_idempotency_keys SET outcome='unknown',error_code=NULL,updated_at=now()
         WHERE idempotency_key=$1 AND operation='refund' AND drts_passenger_id=$2 AND entity_id=$3 AND outcome=$4`,
        [key, current.passengerId, this.orderId, prior ? "unknown" : "pending"],
      );
      if (journalUpdate.rowCount !== 1) conflict();
      return {
        charge: current,
        refund: {
          key,
          reason,
          actorId: prior?.actorId ?? actorId,
          state: "unknown",
          operationId,
          providerRef: null,
        },
        operationId,
        operation: prior ? "readback" : "refund",
      };
    });
  }

  async finishRefund(
    claim: RefundClaim,
    result: {
      state: RefundState;
      providerRef: string | null;
      error: "card_declined" | "unavailable" | "invalid_method" | null;
    },
  ): Promise<void> {
    await this.transaction(claim.charge.passengerId, async () => {
      await this.client.query(
        "SELECT order_id FROM passenger.payment_charge_records WHERE order_id=$1 FOR UPDATE",
        [this.orderId],
      );
      await this.client.query(
        "SELECT payment_id FROM billing.multi_taxi_passenger_payments WHERE payment_id=$1 FOR UPDATE",
        [claim.charge.paymentId],
      );
      const current = await this.load();
      const refund = await this.loadRefund();
      if (
        !current ||
        current.status !== "captured" ||
        current.providerCaptureRef !== claim.charge.providerCaptureRef ||
        current.amountMinor !== claim.charge.amountMinor ||
        refund?.operationId !== claim.operationId ||
        refund.state !== "unknown" ||
        refund.key !== claim.refund.key
      )
        conflict();
      const update = await this.client.query(
        `UPDATE passenger.payment_charge_records SET refund_status=$3,provider_refund_ref=$4,
          refund_operation_id=NULL,status=CASE WHEN $3='completed' THEN 'refunded' ELSE status END,
          updated_at=now() WHERE order_id=$1 AND refund_operation_id=$2 AND status='captured'`,
        [this.orderId, claim.operationId, result.state, result.providerRef],
      );
      if (update.rowCount !== 1) conflict();
      if (result.state === "completed") {
        const billing = await this.client.query(
          `UPDATE billing.multi_taxi_passenger_payments SET status='refunded',updated_at=now()
           WHERE payment_id=$1 AND status='captured' AND provider_payment_ref=$2 AND amount_minor=$3`,
          [
            claim.charge.paymentId,
            claim.charge.providerCaptureRef,
            claim.charge.amountMinor,
          ],
        );
        if (billing.rowCount !== 1) conflict();
      }
      const journal = await this.client.query(
        `UPDATE passenger.payment_idempotency_keys SET outcome=$2,error_code=$3,updated_at=now()
         WHERE idempotency_key=$1 AND operation='refund' AND drts_passenger_id=$4 AND entity_id=$5 AND outcome='unknown'`,
        [
          claim.refund.key,
          result.state,
          result.error,
          current.passengerId,
          this.orderId,
        ],
      );
      if (journal.rowCount !== 1) conflict();
    });
  }
}

@Injectable()
export class PaymentRefundRepository extends PaymentChargeRepository {
  constructor(database: DatabaseService) {
    super(database);
  }
  protected override createSession(
    client: PoolClient,
    orderId: string,
  ): PaymentRefundSession {
    return new PaymentRefundSession(client, orderId);
  }
  withRefundOrder<T>(
    orderId: string,
    work: (session: PaymentRefundSession) => Promise<T>,
  ): Promise<T> {
    return this.withOrder(orderId, (session) => {
      if (!(session instanceof PaymentRefundSession))
        throw new Error("payment_refund_session_invalid");
      return work(session);
    });
  }
}
