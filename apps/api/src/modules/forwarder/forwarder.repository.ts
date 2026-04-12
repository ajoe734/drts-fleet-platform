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

    await Promise.all(writes);
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
