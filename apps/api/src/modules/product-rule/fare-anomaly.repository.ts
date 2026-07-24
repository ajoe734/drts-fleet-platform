import { Injectable, Optional } from "@nestjs/common";

import {
  FARE_QUOTE_ANOMALIES,
  type ActionReceipt,
  type FareQuoteAnomaly,
  type RouteFareDisclosureSnapshot,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type FareAnomalyRow = {
  record: unknown;
};

export interface PersistedFareQuoteAnomaly {
  reason: FareQuoteAnomaly;
  snapshot: RouteFareDisclosureSnapshot;
  recoveryPending: boolean;
  lastRecoveryRequestedAt: string | null;
  lastRecoveryIdempotencyKey: string | null;
  lastRecoveryReceipt: ActionReceipt | null;
}

function cloneRecord(
  record: PersistedFareQuoteAnomaly,
): PersistedFareQuoteAnomaly {
  return structuredClone(record);
}

@Injectable()
export class FareAnomalyRepository {
  private readonly records = new Map<string, PersistedFareQuoteAnomaly>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  async loadUnresolved() {
    if (!this.databaseService?.isEnabled()) {
      return;
    }

    const result = await this.databaseService.query<FareAnomalyRow>(`
      SELECT record
      FROM ops.fare_quote_anomalies
      WHERE resolved_at IS NULL
      ORDER BY occurred_at DESC
    `);

    this.records.clear();
    for (const row of result.rows) {
      const record = this.normalize(row.record);
      this.records.set(record.snapshot.quoteSnapshotId, record);
    }
  }

  list() {
    return [...this.records.values()]
      .map(cloneRecord)
      .sort(
        (left, right) =>
          Date.parse(right.snapshot.generatedAt) -
          Date.parse(left.snapshot.generatedAt),
      );
  }

  get(quoteSnapshotId: string) {
    const record = this.records.get(quoteSnapshotId);
    return record ? cloneRecord(record) : null;
  }

  async save(record: PersistedFareQuoteAnomaly) {
    const cloned = cloneRecord(record);

    if (this.databaseService?.isEnabled()) {
      await this.databaseService.query(
        `
          INSERT INTO ops.fare_quote_anomalies (
            quote_snapshot_id,
            order_id,
            reason_code,
            occurred_at,
            recovery_pending,
            last_recovery_requested_at,
            resolved_at,
            record
          ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7::jsonb)
          ON CONFLICT (quote_snapshot_id) DO UPDATE SET
            order_id = EXCLUDED.order_id,
            reason_code = EXCLUDED.reason_code,
            occurred_at = EXCLUDED.occurred_at,
            recovery_pending = EXCLUDED.recovery_pending,
            last_recovery_requested_at = EXCLUDED.last_recovery_requested_at,
            resolved_at = NULL,
            record = EXCLUDED.record
        `,
        [
          cloned.snapshot.quoteSnapshotId,
          cloned.snapshot.orderId,
          cloned.reason,
          cloned.snapshot.generatedAt,
          cloned.recoveryPending,
          cloned.lastRecoveryRequestedAt,
          JSON.stringify(cloned),
        ],
      );
    }

    this.records.set(cloned.snapshot.quoteSnapshotId, cloned);
    return cloneRecord(cloned);
  }

  async resolve(quoteSnapshotId: string, resolvedAt: string) {
    if (this.databaseService?.isEnabled()) {
      await this.databaseService.query(
        `
          UPDATE ops.fare_quote_anomalies
          SET resolved_at = $2
          WHERE quote_snapshot_id = $1
        `,
        [quoteSnapshotId, resolvedAt],
      );
    }

    this.records.delete(quoteSnapshotId);
  }

  private normalize(value: unknown): PersistedFareQuoteAnomaly {
    if (!value || typeof value !== "object") {
      throw new Error("Invalid fare quote anomaly persistence record.");
    }

    const record = value as Partial<PersistedFareQuoteAnomaly>;
    if (
      !record.snapshot ||
      typeof record.snapshot.quoteSnapshotId !== "string" ||
      !FARE_QUOTE_ANOMALIES.includes(record.reason as FareQuoteAnomaly)
    ) {
      throw new Error("Unknown fare quote anomaly persistence shape.");
    }

    return cloneRecord(record as PersistedFareQuoteAnomaly);
  }
}
