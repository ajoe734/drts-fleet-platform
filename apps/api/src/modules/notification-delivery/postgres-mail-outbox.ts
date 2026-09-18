import type { Pool, PoolClient } from "pg";

import type { DatabaseService } from "../../common/db";
import type {
  DeliveryStatus,
  MailOutbox,
  OutboxState,
  StoredDelivery,
  TransportMessage,
} from "./notification-delivery.types";

export type PostgresMailOutboxOptions = {
  pool?: Pool | null | undefined;
  databaseService?: DatabaseService | null | undefined;
  lockTimeoutMs?: number | undefined;
  lockKey?: string | undefined;
};

/**
 * Production-grade PostgreSQL outbox implementing the MailOutbox interface.
 * Fulfills consensus §B5 and V0103 invariants:
 * - Transaction callback compatibility
 * - Concurrency serialization via ops.phase1_notification_mail_outbox_lock
 * - Tenant-scoped idempotency
 * - Single persisted attempt authority (ops.phase1_notification_mail_deliveries.attempts JSONB)
 * - Survives process crashes and multi-replica execution without ephemeral disk dependencies
 */
export class PostgresMailOutbox implements MailOutbox {
  private readonly pool: Pool | null;
  private readonly databaseService: DatabaseService | null;
  private readonly lockTimeoutMs: number;
  private readonly lockKey: string;

  constructor(
    poolOrOptions?: Pool | DatabaseService | PostgresMailOutboxOptions,
    options?: Partial<PostgresMailOutboxOptions>,
  ) {
    if (
      poolOrOptions &&
      "query" in poolOrOptions &&
      "connect" in poolOrOptions &&
      !("isEnabled" in poolOrOptions)
    ) {
      this.pool = poolOrOptions as Pool;
      this.databaseService = null;
    } else if (poolOrOptions && "isEnabled" in poolOrOptions) {
      this.databaseService = poolOrOptions as DatabaseService;
      this.pool = null;
    } else if (typeof poolOrOptions === "object" && poolOrOptions !== null) {
      const opts = poolOrOptions as PostgresMailOutboxOptions;
      this.pool = opts.pool ?? null;
      this.databaseService = opts.databaseService ?? null;
      options = { ...opts, ...options };
    } else {
      this.pool = null;
      this.databaseService = null;
    }

    this.lockTimeoutMs = options?.lockTimeoutMs ?? 5_000;
    this.lockKey = options?.lockKey ?? "mail_outbox_master";

    if (!Number.isSafeInteger(this.lockTimeoutMs) || this.lockTimeoutMs < 1) {
      throw new Error("notification_outbox_invalid_lock_timeout");
    }
  }

  private async getClient(): Promise<PoolClient> {
    if (this.databaseService && this.databaseService.isEnabled()) {
      return this.databaseService.connect();
    }
    if (this.pool) {
      return this.pool.connect();
    }
    throw new Error(
      "notification_outbox_unavailable: no database pool configured",
    );
  }

  async transaction<T>(operation: (state: OutboxState) => T): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL lock_timeout = '${this.lockTimeoutMs}ms'`);

      // Ensure lock row exists and acquire exclusive lock for concurrency serialization
      await client.query(
        "INSERT INTO ops.phase1_notification_mail_outbox_lock (lock_key) VALUES ($1) ON CONFLICT DO NOTHING",
        [this.lockKey],
      );
      await client.query(
        "SELECT lock_key FROM ops.phase1_notification_mail_outbox_lock WHERE lock_key = $1 FOR UPDATE",
        [this.lockKey],
      );

      // Read current state from ops.phase1_notification_mail_deliveries
      const { rows } = await client.query(`
        SELECT
          delivery_id,
          tenant_id,
          idempotency_key,
          message_id,
          payload_hash,
          status,
          recipient_email,
          from_email,
          subject,
          body,
          queued_at,
          sent_at,
          next_attempt_at,
          lease_attempt_id,
          lease_expires_at,
          attempts
        FROM ops.phase1_notification_mail_deliveries
      `);

      const deliveries: Record<string, StoredDelivery> = {};
      for (const row of rows) {
        const queuedAt =
          row.queued_at instanceof Date
            ? row.queued_at.toISOString()
            : new Date(row.queued_at).toISOString();
        const sentAt = row.sent_at
          ? row.sent_at instanceof Date
            ? row.sent_at.toISOString()
            : new Date(row.sent_at).toISOString()
          : null;
        const nextAttemptAt = row.next_attempt_at
          ? row.next_attempt_at instanceof Date
            ? row.next_attempt_at.toISOString()
            : new Date(row.next_attempt_at).toISOString()
          : null;
        const leaseExpiresAt = row.lease_expires_at
          ? row.lease_expires_at instanceof Date
            ? row.lease_expires_at.toISOString()
            : new Date(row.lease_expires_at).toISOString()
          : null;

        const message: TransportMessage = {
          deliveryId: row.delivery_id,
          tenantId: row.tenant_id,
          idempotencyKey: row.idempotency_key,
          messageId: row.message_id,
          recipientEmail: row.recipient_email,
          fromEmail: row.from_email,
          subject: row.subject,
          body: row.body,
        };

        const attempts = Array.isArray(row.attempts)
          ? row.attempts
          : typeof row.attempts === "string"
            ? JSON.parse(row.attempts)
            : [];

        deliveries[row.delivery_id] = {
          message,
          payloadHash: row.payload_hash,
          receipt: {
            deliveryId: row.delivery_id,
            tenantId: row.tenant_id,
            idempotencyKey: row.idempotency_key,
            messageId: row.message_id,
            status: row.status as DeliveryStatus,
            queuedAt,
            sentAt,
            nextAttemptAt,
            attempts,
          },
          lease:
            row.lease_attempt_id && leaseExpiresAt
              ? {
                  attemptId: row.lease_attempt_id,
                  expiresAt: leaseExpiresAt,
                }
              : null,
        };
      }

      const state: OutboxState = {
        version: 1,
        deliveries,
      };

      const initialSnapshot = JSON.stringify(state);
      const initialDeliveryIds = new Set(Object.keys(deliveries));

      const result = operation(state);
      if (result instanceof Promise) {
        throw new Error("notification_outbox_requires_synchronous_transaction");
      }

      this.validate(state);

      const afterSnapshot = JSON.stringify(state);
      if (initialSnapshot !== afterSnapshot) {
        for (const [id, entry] of Object.entries(state.deliveries)) {
          if (!initialDeliveryIds.has(id)) {
            // New record
            await client.query(
              `INSERT INTO ops.phase1_notification_mail_deliveries (
                delivery_id,
                tenant_id,
                idempotency_key,
                message_id,
                payload_hash,
                status,
                recipient_email,
                from_email,
                subject,
                body,
                queued_at,
                sent_at,
                next_attempt_at,
                lease_attempt_id,
                lease_expires_at,
                attempts
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
              [
                entry.message.deliveryId,
                entry.message.tenantId,
                entry.message.idempotencyKey,
                entry.message.messageId,
                entry.payloadHash,
                entry.receipt.status,
                entry.message.recipientEmail,
                entry.message.fromEmail,
                entry.message.subject,
                entry.message.body,
                entry.receipt.queuedAt,
                entry.receipt.sentAt,
                entry.receipt.nextAttemptAt,
                entry.lease?.attemptId ?? null,
                entry.lease?.expiresAt ?? null,
                JSON.stringify(entry.receipt.attempts),
              ],
            );
          } else {
            // Existing record
            await client.query(
              `UPDATE ops.phase1_notification_mail_deliveries SET
                status = $1,
                sent_at = $2,
                next_attempt_at = $3,
                lease_attempt_id = $4,
                lease_expires_at = $5,
                attempts = $6,
                updated_at = now()
              WHERE delivery_id = $7`,
              [
                entry.receipt.status,
                entry.receipt.sentAt,
                entry.receipt.nextAttemptAt,
                entry.lease?.attemptId ?? null,
                entry.lease?.expiresAt ?? null,
                JSON.stringify(entry.receipt.attempts),
                id,
              ],
            );
          }
        }

        // Handle deletions
        for (const id of initialDeliveryIds) {
          if (!state.deliveries[id]) {
            await client.query(
              "DELETE FROM ops.phase1_notification_mail_deliveries WHERE delivery_id = $1",
              [id],
            );
          }
        }
      }

      await client.query("COMMIT");
      return structuredClone(result);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private validate(state: OutboxState) {
    if (
      !state ||
      state.version !== 1 ||
      !state.deliveries ||
      typeof state.deliveries !== "object" ||
      Array.isArray(state.deliveries)
    ) {
      throw new Error("notification_outbox_invalid_format");
    }
    for (const [id, delivery] of Object.entries(state.deliveries)) {
      const receipt = delivery?.receipt;
      if (
        !receipt ||
        receipt.deliveryId !== id ||
        delivery.message?.deliveryId !== id ||
        typeof delivery.payloadHash !== "string" ||
        !["queued", "sent", "failed"].includes(receipt.status) ||
        !Array.isArray(receipt.attempts) ||
        (receipt.status === "sent" &&
          (!receipt.sentAt ||
            !receipt.attempts.some(
              (attempt) =>
                attempt.outcome === "sent" && attempt.acknowledgement?.response,
            )))
      ) {
        throw new Error("notification_outbox_invalid_record");
      }
    }
  }
}
