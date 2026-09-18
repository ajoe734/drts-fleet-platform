import { PLATFORM_CURRENCY } from "@drts/contracts";
import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { DatabaseService } from "../../common/db";
import type { CertificateSupportRow } from "./certificate-support.types";

type ElectronicReceiptRow = QueryResultRow & {
  receipt_id: string;
  order_id: string;
  receipt_no: string;
  receipt_version: number;
  is_current: boolean;
  supersedes_receipt_id: string | null;
  regeneration_idempotency_key: string | null;
  regenerated_by_actor_id: string | null;
  regeneration_reason: string | null;
  regeneration_audit_id: string | null;
  amount_minor: string | number;
  currency: string;
  issued_at: Date | string;
  record: unknown;
};

export type PersistInitialCertificate = {
  receiptId: string;
  orderId: string;
  receiptNo: string;
  amountMinor: number;
  currency: typeof PLATFORM_CURRENCY;
  issuedAt: string;
  record: Record<string, unknown>;
};

export type RegenerateCertificateInput = {
  certificateId: string;
  actorId: string;
  reason: string;
  idempotencyKey: string;
  issuedAt: string;
};

export type RegenerateCertificatePersistenceResult = {
  row: CertificateSupportRow;
  replayed: boolean;
};

const SELECT_COLUMNS = `
  receipt_id, order_id, receipt_no, receipt_version, is_current,
  supersedes_receipt_id, regeneration_idempotency_key,
  regenerated_by_actor_id, regeneration_reason, regeneration_audit_id,
  amount_minor, currency, issued_at, record
`;

@Injectable()
export class CertificateSupportRepository {
  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async list(search: string | null): Promise<CertificateSupportRow[]> {
    this.assertEnabled();
    const result = await this.databaseService!.query<ElectronicReceiptRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM reporting.multi_taxi_electronic_receipts
        WHERE (
          $1::text IS NULL
          OR receipt_id ILIKE '%' || $1 || '%'
          OR receipt_no ILIKE '%' || $1 || '%'
          OR order_id ILIKE '%' || $1 || '%'
          OR COALESCE(record ->> 'tripId', record ->> 'trip_id', '')
             ILIKE '%' || $1 || '%'
        )
        ORDER BY issued_at DESC, receipt_version DESC
        LIMIT 50
      `,
      [search],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findById(certificateId: string): Promise<CertificateSupportRow | null> {
    this.assertEnabled();
    const result = await this.databaseService!.query<ElectronicReceiptRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM reporting.multi_taxi_electronic_receipts
        WHERE receipt_id = $1 OR receipt_no = $1
        ORDER BY issued_at DESC
        LIMIT 1
      `,
      [certificateId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async persistInitial(
    input: PersistInitialCertificate,
  ): Promise<CertificateSupportRow> {
    this.assertEnabled();
    await this.databaseService!.query(
      `
        INSERT INTO reporting.multi_taxi_electronic_receipts (
          receipt_id, order_id, receipt_no, receipt_version, is_current,
          amount_minor, currency, issued_at, record
        ) VALUES ($1, $2, $3, 1, true, $4, $5, $6, $7::jsonb)
        ON CONFLICT DO NOTHING
      `,
      [
        input.receiptId,
        input.orderId,
        input.receiptNo,
        input.amountMinor,
        input.currency,
        input.issuedAt,
        JSON.stringify(input.record),
      ],
    );

    const result = await this.databaseService!.query<ElectronicReceiptRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM reporting.multi_taxi_electronic_receipts
        WHERE order_id = $1 AND is_current
        LIMIT 1
      `,
      [input.orderId],
    );
    if (!result.rows[0]) {
      throw new Error("Certificate writer did not persist a current receipt.");
    }
    return this.mapRow(result.rows[0]);
  }

  async regenerate(
    input: RegenerateCertificateInput,
  ): Promise<RegenerateCertificatePersistenceResult> {
    this.assertEnabled();
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const replay = await this.findRegenerationReplay(client, input);
      if (replay) {
        await client.query("COMMIT");
        return { row: replay, replayed: true };
      }

      const sourceResult = await client.query<ElectronicReceiptRow>(
        `
          SELECT ${SELECT_COLUMNS}
          FROM reporting.multi_taxi_electronic_receipts
          WHERE receipt_id = $1 OR receipt_no = $1
          ORDER BY issued_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [input.certificateId],
      );
      const source = sourceResult.rows[0];
      if (!source) {
        await client.query("ROLLBACK");
        return Promise.reject(new Error("CERTIFICATE_NOT_FOUND"));
      }

      if (!source.is_current) {
        const concurrentReplay = await this.findRegenerationReplay(
          client,
          input,
        );
        if (concurrentReplay) {
          await client.query("COMMIT");
          return { row: concurrentReplay, replayed: true };
        }
        await client.query("ROLLBACK");
        return Promise.reject(new Error("CERTIFICATE_NOT_CURRENT"));
      }

      const nextVersion = Number(source.receipt_version) + 1;
      const nextReceiptId = `receipt-${randomUUID()}`;
      const baseReceiptNo = source.receipt_no.replace(/-R\d+$/i, "");
      const nextReceiptNo = `${baseReceiptNo}-R${nextVersion}`;
      const sourceRecord = this.toRecord(source.record);
      const nextRecord: Record<string, unknown> = {
        ...sourceRecord,
        certificateVersion: `v${nextVersion}`,
        certificateState: "available",
        htmlUrl: this.artifactUrl(nextReceiptId, "html"),
        pdfUrl: this.artifactUrl(nextReceiptId, "pdf"),
        generatedFrom: "certificate_regeneration",
        generatedAt: input.issuedAt,
        regeneration: {
          reason: input.reason,
          actorId: input.actorId,
          idempotencyKey: input.idempotencyKey,
          sourceCertificateId: source.receipt_id,
        },
      };
      delete nextRecord.supersededByCertificateId;
      delete nextRecord.supersededByReceiptId;

      await client.query(
        `
          UPDATE reporting.multi_taxi_electronic_receipts
          SET is_current = false,
              record = jsonb_set(
                jsonb_set(record, '{certificateState}', '"superseded"', true),
                '{supersededByCertificateId}',
                to_jsonb($2::text),
                true
              )
          WHERE receipt_id = $1
        `,
        [source.receipt_id, nextReceiptId],
      );

      const inserted = await client.query<ElectronicReceiptRow>(
        `
          INSERT INTO reporting.multi_taxi_electronic_receipts (
            receipt_id, order_id, receipt_no, receipt_version, is_current,
            supersedes_receipt_id, regeneration_idempotency_key,
            regenerated_by_actor_id, regeneration_reason,
            amount_minor, currency, issued_at, record
          ) VALUES (
            $1, $2, $3, $4, true, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
          )
          RETURNING ${SELECT_COLUMNS}
        `,
        [
          nextReceiptId,
          source.order_id,
          nextReceiptNo,
          nextVersion,
          source.receipt_id,
          input.idempotencyKey,
          input.actorId,
          input.reason,
          source.amount_minor,
          source.currency,
          input.issuedAt,
          JSON.stringify(nextRecord),
        ],
      );
      await client.query("COMMIT");
      return { row: this.mapRow(inserted.rows[0]!), replayed: false };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The original persistence failure is the actionable error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async attachRegenerationAudit(
    receiptId: string,
    idempotencyKey: string,
    auditId: string,
  ) {
    this.assertEnabled();
    await this.databaseService!.query(
      `
        UPDATE reporting.multi_taxi_electronic_receipts
        SET regeneration_audit_id = $3
        WHERE receipt_id = $1 AND regeneration_idempotency_key = $2
      `,
      [receiptId, idempotencyKey, auditId],
    );
  }

  private async findRegenerationReplay(
    client: PoolClient,
    input: RegenerateCertificateInput,
  ): Promise<CertificateSupportRow | null> {
    const result = await client.query<ElectronicReceiptRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM reporting.multi_taxi_electronic_receipts
        WHERE regeneration_idempotency_key = $1
        LIMIT 1
      `,
      [input.idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (
      row.supersedes_receipt_id !== input.certificateId &&
      !this.matchesSourceCertificate(row.record, input.certificateId)
    ) {
      throw new Error("IDEMPOTENCY_KEY_REUSED");
    }
    if (
      row.regenerated_by_actor_id !== input.actorId ||
      row.regeneration_reason !== input.reason
    ) {
      throw new Error("IDEMPOTENCY_KEY_REUSED");
    }
    return this.mapRow(row);
  }

  private matchesSourceCertificate(record: unknown, certificateId: string) {
    const regeneration = this.toRecord(this.toRecord(record).regeneration);
    return regeneration.sourceCertificateId === certificateId;
  }

  private artifactUrl(receiptId: string, format: "html" | "pdf") {
    return `/control-plane-proxy/platform-admin/multi-taxi/certificates/${encodeURIComponent(
      receiptId,
    )}/artifacts/${format}`;
  }

  private assertEnabled() {
    if (!this.isEnabled()) {
      throw new Error("CERTIFICATE_WRITER_UNAVAILABLE");
    }
  }

  private mapRow(row: ElectronicReceiptRow): CertificateSupportRow {
    return {
      receiptId: row.receipt_id,
      orderId: row.order_id,
      receiptNo: row.receipt_no,
      receiptVersion: Number(row.receipt_version),
      isCurrent: row.is_current,
      supersedesReceiptId: row.supersedes_receipt_id,
      regenerationIdempotencyKey: row.regeneration_idempotency_key,
      regeneratedByActorId: row.regenerated_by_actor_id,
      regenerationReason: row.regeneration_reason,
      regenerationAuditId: row.regeneration_audit_id,
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
