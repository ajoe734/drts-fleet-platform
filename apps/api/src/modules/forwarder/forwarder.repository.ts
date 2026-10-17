import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  AdapterHealthRecord,
  ForwardedOrderRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

export type ForwarderState = {
  forwardedOrders: ForwardedOrderRecord[];
  adapterHealth: AdapterHealthRecord[];
};

export type PersistForwarderChanges = {
  forwardedOrders?: readonly ForwardedOrderRecord[];
  adapterHealth?: readonly AdapterHealthRecord[];
};

@Injectable()
export class ForwarderRepository {
  private readonly logger = new Logger(ForwarderRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<ForwarderState> {
    if (!this.isEnabled()) {
      return {
        forwardedOrders: [],
        adapterHealth: [],
      };
    }

    const [ordersResult, adapterHealthResult] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_forwarded_orders
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_adapter_health
          ORDER BY last_checked_at DESC
        `,
      ),
    ]);

    return {
      forwardedOrders: ordersResult.rows.map((row) =>
        this.parseRecord<ForwardedOrderRecord>(
          row.record,
          "ops.phase1_forwarded_orders",
        ),
      ),
      adapterHealth: adapterHealthResult.rows.map((row) =>
        this.parseRecord<AdapterHealthRecord>(
          row.record,
          "ops.phase1_adapter_health",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistForwarderChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const order of changes.forwardedOrders ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO ops.phase1_forwarded_orders (
              mirror_order_id,
              platform_code,
              external_order_id,
              status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb
            )
            ON CONFLICT (mirror_order_id) DO UPDATE SET
              platform_code = EXCLUDED.platform_code,
              external_order_id = EXCLUDED.external_order_id,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
            WHERE EXCLUDED.updated_at >= ops.phase1_forwarded_orders.updated_at
          `,
          [
            order.mirrorOrderId,
            order.platformCode,
            order.externalOrderId,
            order.status,
            order.createdAt,
            order.updatedAt,
            JSON.stringify(order),
          ],
        ),
      );
    }

    for (const adapter of changes.adapterHealth ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO ops.phase1_adapter_health (
              platform_code,
              status,
              last_checked_at,
              record
            ) VALUES (
              $1, $2, $3, $4::jsonb
            )
            ON CONFLICT (platform_code) DO UPDATE SET
              status = EXCLUDED.status,
              last_checked_at = EXCLUDED.last_checked_at,
              record = EXCLUDED.record
          `,
          [
            adapter.platformCode,
            adapter.status,
            adapter.lastCheckedAt,
            JSON.stringify(adapter),
          ],
        ),
      );
    }

    // Promise.allSettled (not Promise.all): a batch must not report
    // done/failed until every one of its own writes has actually landed.
    // Fail-fast on the first rejection would let the still-pending writes
    // keep running in the background after the caller's per-order lock has
    // already been released on the error path, so a stale write from this
    // same batch could land after a later command's newer write and
    // resurrect expired data. Waiting for every settlement keeps the whole
    // batch's durable effect inside the critical section that held the lock.
    const settled = await Promise.allSettled(writes);
    const failures = settled.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length > 0) {
      const detail = failures
        .map((failure) =>
          failure.reason instanceof Error
            ? failure.reason.message
            : String(failure.reason),
        )
        .join("; ");
      throw new Error(
        `${failures.length}/${writes.length} forwarder persistence write(s) failed: ${detail}`,
      );
    }
  }

  /**
   * Single-row readback used to recover canonical truth for a specific
   * mirror identity after an uncertain write (restart/reconciliation path),
   * rather than trusting an in-memory guess about whether a prior command
   * actually landed. Reuses the same existing table/columns as loadState and
   * persistChanges; this is not a new migration or schema.
   */
  async findOrderByIdentity(
    platformCode: ForwardedOrderRecord["platformCode"],
    externalOrderId: string,
  ): Promise<ForwardedOrderRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_forwarded_orders
        WHERE platform_code = $1 AND external_order_id = $2
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `,
      [platformCode, externalOrderId],
    );

    const row = result.rows[0];
    return row
      ? this.parseRecord<ForwardedOrderRecord>(
          row.record,
          "ops.phase1_forwarded_orders",
        )
      : null;
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Forwarder persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
