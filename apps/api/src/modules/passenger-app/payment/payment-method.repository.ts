import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import type { PassengerPaymentMethod } from "@drts/contracts";
import { DatabaseService } from "../../../common/db/database.service";
import { ApiRequestError } from "../../../common/api-envelope";
import type { EncryptedPaymentToken } from "./payment-token-cipher";

export const MAX_BOUND_CARDS_PER_MEMBER = 5;

export interface StoredPaymentMethod extends PassengerPaymentMethod {
  drtsPassengerId: string;
  provider: string;
  tokenEnvelope: EncryptedPaymentToken;
}

export interface BindingClaim {
  idempotencyKey: string;
  methodId: string;
  completed: PassengerPaymentMethod | null;
}

function method(row: QueryResultRow): PassengerPaymentMethod {
  return {
    paymentMethodId: row.payment_method_id,
    last4: row.last4,
    cardType: row.card_type,
    expiryMonth: row.expiry_month,
    expiryYear: row.expiry_year,
    isDefault: row.is_default,
  };
}

function notFound(): never {
  throw new ApiRequestError(404, "not_found", "Payment method not found.");
}

function persistenceUnavailable(): never {
  // Connection cleanup errors may also contain token/parameter details.
  // Never attach the raw exception as the cause of an API error.
  throw new ApiRequestError(
    503,
    "payment_persistence_unavailable",
    "Payment persistence is unavailable.",
  );
}

export async function requireActivePaymentMethod(
  client: Pick<PoolClient, "query">,
  passengerId: string,
  id: string,
  allowExpired = false,
  lock = false,
): Promise<void> {
  const result = await client.query(
    `SELECT payment_method_id FROM passenger.psp_tokens WHERE payment_method_id=$1 AND drts_passenger_id=$2
     AND status='active' AND ($3 OR expiry_year::int>EXTRACT(YEAR FROM now()) OR
      (expiry_year::int=EXTRACT(YEAR FROM now()) AND expiry_month::int>=EXTRACT(MONTH FROM now())))${lock ? " FOR UPDATE" : ""}`,
    [id, passengerId, allowExpired],
  );
  if (!result.rows[0]) notFound();
}

@Injectable()
export class PaymentMethodRepository {
  constructor(private readonly database: DatabaseService) {}

  async withAccount<T>(
    passengerId: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database
      .connect()
      .catch(() => persistenceUnavailable());
    let committed = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      const account = await client.query(
        "SELECT status FROM passenger.accounts WHERE drts_passenger_id=$1 FOR UPDATE",
        [passengerId],
      );
      if (account.rows[0]?.status !== "active")
        throw new ApiRequestError(
          401,
          "unauthorized",
          "An active passenger account is required.",
        );
      const result = await work(client);
      await client.query("COMMIT");
      committed = true;
      return result;
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      // DB errors can contain parameter values; never propagate their causes.
      return persistenceUnavailable();
    } finally {
      if (!committed) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* Evict without exposing raw DB errors. */
        }
      }
      try {
        if (committed) client.release();
        else client.release(true);
      } catch {
        persistenceUnavailable();
      }
    }
  }

  async list(passengerId: string): Promise<PassengerPaymentMethod[]> {
    return this.withAccount(passengerId, async (client) => {
      const result = await client.query(
        `SELECT payment_method_id,last4,card_type,expiry_month,expiry_year,is_default
         FROM passenger.psp_tokens WHERE drts_passenger_id=$1 AND status='active'
         ORDER BY is_default DESC,created_at,payment_method_id`,
        [passengerId],
      );
      return result.rows.map(method);
    });
  }

  /** Completion needs only the selected owner's public card metadata. Do not
   * load/decrypt a PSP token or take an account lock inside an order workflow. */
  async findReceiptDisplay(
    passengerId: string,
    id: string,
  ): Promise<string | null> {
    const result = await this.database.query(
      `SELECT card_type,last4 FROM passenger.psp_tokens
       WHERE drts_passenger_id=$1 AND payment_method_id=$2 AND status='active'`,
      [passengerId, id],
    );
    const row = result.rows[0];
    if (
      !row ||
      typeof row.card_type !== "string" ||
      !/^[A-Za-z0-9 _-]{1,40}$/.test(row.card_type) ||
      typeof row.last4 !== "string" ||
      !/^[0-9]{4}$/.test(row.last4)
    )
      return null;
    return `${row.card_type.trim()} ••••${row.last4}`;
  }

  async claimBinding(
    passengerId: string,
    provider: string,
    credential: string,
  ): Promise<BindingClaim> {
    const digest = createHash("sha256")
      .update(JSON.stringify([provider, credential]))
      .digest("hex");
    const idempotencyKey = `pax:bind:${digest}`;
    return this.withAccount(passengerId, async (client) => {
      await client.query(
        `INSERT INTO passenger.payment_idempotency_keys
          (idempotency_key,operation,drts_passenger_id,entity_id,credential_digest)
         VALUES ($1,'bind',$2,$3,$4) ON CONFLICT (idempotency_key) DO NOTHING`,
        [idempotencyKey, passengerId, randomUUID(), digest],
      );
      const claim = await client.query(
        `SELECT drts_passenger_id,entity_id,outcome FROM passenger.payment_idempotency_keys
         WHERE idempotency_key=$1 AND operation='bind' FOR UPDATE`,
        [idempotencyKey],
      );
      if (claim.rows[0]?.drts_passenger_id !== passengerId)
        throw new ApiRequestError(
          400,
          "invalid_credential",
          "Payment credential is invalid.",
        );
      const row = claim.rows[0];
      let completed: PassengerPaymentMethod | null = null;
      if (row.outcome === "completed") {
        const stored = await client.query(
          `SELECT payment_method_id,last4,card_type,expiry_month,expiry_year,is_default
           FROM passenger.psp_tokens WHERE payment_method_id=$1 AND drts_passenger_id=$2 AND status='active'`,
          [row.entity_id, passengerId],
        );
        if (!stored.rows[0]) notFound();
        completed = method(stored.rows[0]);
      }
      return { idempotencyKey, methodId: row.entity_id, completed };
    });
  }

  async completeBinding(
    passengerId: string,
    key: string,
    value: StoredPaymentMethod,
  ): Promise<PassengerPaymentMethod> {
    return this.withAccount(passengerId, async (client) => {
      const claim = await client.query(
        `SELECT entity_id,outcome FROM passenger.payment_idempotency_keys
         WHERE idempotency_key=$1 AND drts_passenger_id=$2 AND operation='bind' FOR UPDATE`,
        [key, passengerId],
      );
      if (claim.rows[0]?.entity_id !== value.paymentMethodId) notFound();
      // Concurrent PSP replay can finish first. Return its committed metadata,
      // without making a second method or overwriting another default.
      if (claim.rows[0].outcome !== "completed") {
        const countResult = await client.query(
          `SELECT COUNT(*)::int AS count FROM passenger.psp_tokens WHERE drts_passenger_id=$1 AND status='active'`,
          [passengerId],
        );
        const activeCount = Number(countResult.rows[0]?.count ?? 0);
        if (
          Number.isFinite(activeCount) &&
          activeCount >= MAX_BOUND_CARDS_PER_MEMBER
        ) {
          throw new ApiRequestError(
            409,
            "card_limit_exceeded",
            "每個會員最多只能綁定 5 張信用卡，請先移除既有卡片後再新增。",
          );
        }
        // Both uses must infer varchar; leave the 100-character limit to the
        // column constraint instead of a length-qualified cast that truncates.
        await client.query(
          `INSERT INTO passenger.psp_tokens
           (payment_method_id,drts_passenger_id,provider,token_envelope,last4,card_type,expiry_month,expiry_year,is_default)
           VALUES ($1,$2::varchar,$3,$4::jsonb,$5,$6,$7,$8,
             NOT EXISTS(SELECT 1 FROM passenger.psp_tokens WHERE drts_passenger_id=$2::varchar AND status='active' AND is_default))`,
          [
            value.paymentMethodId,
            passengerId,
            value.provider,
            JSON.stringify(value.tokenEnvelope),
            value.last4,
            value.cardType,
            value.expiryMonth,
            value.expiryYear,
          ],
        );
        await client.query(
          `UPDATE passenger.payment_idempotency_keys SET outcome='completed',error_code=NULL,updated_at=now()
           WHERE idempotency_key=$1 AND drts_passenger_id=$2`,
          [key, passengerId],
        );
      }
      const stored = await client.query(
        `SELECT payment_method_id,last4,card_type,expiry_month,expiry_year,is_default
         FROM passenger.psp_tokens WHERE payment_method_id=$1 AND drts_passenger_id=$2 AND status='active'`,
        [value.paymentMethodId, passengerId],
      );
      if (!stored.rows[0]) notFound();
      return method(stored.rows[0]);
    });
  }

  async bindingOutcome(
    passengerId: string,
    key: string,
    outcome: "pending" | "failed" | "action_required",
    error?: string,
  ): Promise<void> {
    await this.withAccount(passengerId, async (client) => {
      await client.query(
        `UPDATE passenger.payment_idempotency_keys SET outcome=$3,error_code=$4,updated_at=now()
         WHERE idempotency_key=$1 AND drts_passenger_id=$2 AND operation='bind' AND outcome<>'completed'`,
        [key, passengerId, outcome, error ?? null],
      );
    });
  }

  async findActionRequiredBinding(
    passengerId: string,
    idempotencyKey?: string,
  ): Promise<{ idempotencyKey: string; methodId: string } | null> {
    return this.withAccount(passengerId, async (client) => {
      const result = idempotencyKey
        ? await client.query(
            `SELECT idempotency_key,entity_id FROM passenger.payment_idempotency_keys
             WHERE drts_passenger_id=$1 AND idempotency_key=$2 AND operation='bind'
               AND outcome IN ('action_required','pending','completed') FOR UPDATE`,
            [passengerId, idempotencyKey],
          )
        : await client.query(
            `SELECT idempotency_key,entity_id FROM passenger.payment_idempotency_keys
             WHERE drts_passenger_id=$1 AND operation='bind'
               AND outcome IN ('action_required','pending','completed')
             ORDER BY CASE WHEN outcome IN ('action_required','pending') THEN 0 ELSE 1 END,
                      updated_at DESC,created_at DESC LIMIT 1 FOR UPDATE`,
            [passengerId],
          );
      const row = result.rows[0];
      if (!row) return null;
      return {
        idempotencyKey: String(row.idempotency_key),
        methodId: String(row.entity_id),
      };
    });
  }

  async findBindingByMerchantMember(
    matchPassengerId: (passengerId: string) => boolean,
    idempotencyKey?: string,
  ): Promise<{
    passengerId: string;
    idempotencyKey: string;
    methodId: string;
  } | null> {
    const result = await this.database
      .query(
        idempotencyKey
          ? `SELECT idempotency_key,drts_passenger_id,entity_id
             FROM passenger.payment_idempotency_keys
             WHERE idempotency_key=$1 AND operation='bind'
               AND outcome IN ('action_required','pending','completed')`
          : `SELECT idempotency_key,drts_passenger_id,entity_id
             FROM passenger.payment_idempotency_keys
             WHERE operation='bind'
               AND outcome IN ('action_required','pending','completed')
             ORDER BY CASE WHEN outcome IN ('action_required','pending') THEN 0 ELSE 1 END,
                      updated_at DESC,created_at DESC`,
        idempotencyKey ? [idempotencyKey] : [],
      )
      .catch(() => persistenceUnavailable());
    for (const row of result.rows) {
      const pid =
        typeof row.drts_passenger_id === "string"
          ? row.drts_passenger_id.trim()
          : "";
      if (pid && matchPassengerId(pid)) {
        return {
          passengerId: pid,
          idempotencyKey: String(row.idempotency_key),
          methodId: String(row.entity_id),
        };
      }
    }
    return null;
  }

  async setDefault(
    passengerId: string,
    id: string,
  ): Promise<PassengerPaymentMethod> {
    return this.withAccount(passengerId, async (client) => {
      await this.requireActive(client, passengerId, id);
      await client.query(
        "UPDATE passenger.psp_tokens SET is_default=false WHERE drts_passenger_id=$1 AND is_default",
        [passengerId],
      );
      const result = await client.query(
        `UPDATE passenger.psp_tokens SET is_default=true WHERE payment_method_id=$1 AND drts_passenger_id=$2 AND status='active'
         RETURNING payment_method_id,last4,card_type,expiry_month,expiry_year,is_default`,
        [id, passengerId],
      );
      return method(result.rows[0]);
    });
  }

  async remove(passengerId: string, id: string): Promise<void> {
    await this.withAccount(passengerId, async (client) => {
      await this.requireActive(client, passengerId, id, true);
      const used = await client.query(
        `SELECT 1 FROM passenger.booking_histories h
         JOIN ops.phase1_owned_orders o ON o.order_id=h.order_id::text
         LEFT JOIN billing.multi_taxi_passenger_payments p ON p.order_id=h.order_id::text
         WHERE h.drts_passenger_id=$1 AND lower(o.record->>'paymentMethodTokenRef')=lower($2)
           AND o.status<>'cancelled' AND (p.status IS NULL OR p.status NOT IN ('captured','refunded')) LIMIT 1`,
        [passengerId, id],
      );
      if (used.rows.length)
        throw new ApiRequestError(
          409,
          "pending_payment_block",
          "A ride still requires this payment method.",
        );
      await client.query(
        `UPDATE passenger.psp_tokens SET status='removed',token_envelope=NULL,is_default=false,removed_at=now()
         WHERE payment_method_id=$1 AND drts_passenger_id=$2`,
        [id, passengerId],
      );
    });
  }

  async requireActive(
    client: Pick<PoolClient, "query">,
    passengerId: string,
    id: string,
    allowExpired = false,
  ): Promise<void> {
    await requireActivePaymentMethod(client, passengerId, id, allowExpired);
  }
}
