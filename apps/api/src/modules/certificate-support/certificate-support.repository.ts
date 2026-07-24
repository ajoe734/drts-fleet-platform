import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../common/db";
import type { CertificateSupportRow } from "./certificate-support.types";

type ElectronicReceiptRow = QueryResultRow & {
  receipt_id: string;
  order_id: string;
  receipt_no: string;
  amount_minor: string | number;
  currency: string;
  issued_at: Date | string;
  record: unknown;
};

@Injectable()
export class CertificateSupportRepository {
  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  async list(search: string | null): Promise<CertificateSupportRow[]> {
    if (!this.databaseService?.isEnabled()) {
      return [];
    }

    const result = await this.databaseService.query<ElectronicReceiptRow>(
      `
        SELECT receipt_id, order_id, receipt_no, amount_minor, currency,
               issued_at, record
        FROM reporting.multi_taxi_electronic_receipts
        WHERE (
          $1::text IS NULL
          OR receipt_id ILIKE '%' || $1 || '%'
          OR receipt_no ILIKE '%' || $1 || '%'
          OR order_id ILIKE '%' || $1 || '%'
          OR COALESCE(record ->> 'tripId', record ->> 'trip_id', '')
             ILIKE '%' || $1 || '%'
        )
        ORDER BY issued_at DESC
        LIMIT 50
      `,
      [search],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findById(certificateId: string): Promise<CertificateSupportRow | null> {
    if (!this.databaseService?.isEnabled()) {
      return null;
    }

    const result = await this.databaseService.query<ElectronicReceiptRow>(
      `
        SELECT receipt_id, order_id, receipt_no, amount_minor, currency,
               issued_at, record
        FROM reporting.multi_taxi_electronic_receipts
        WHERE receipt_id = $1 OR receipt_no = $1
        ORDER BY issued_at DESC
        LIMIT 1
      `,
      [certificateId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: ElectronicReceiptRow): CertificateSupportRow {
    return {
      receiptId: row.receipt_id,
      orderId: row.order_id,
      receiptNo: row.receipt_no,
      amountMinor: Number(row.amount_minor),
      currency: row.currency,
      issuedAt:
        row.issued_at instanceof Date
          ? row.issued_at.toISOString()
          : new Date(row.issued_at).toISOString(),
      record: this.toRecord(row.record),
    };
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
