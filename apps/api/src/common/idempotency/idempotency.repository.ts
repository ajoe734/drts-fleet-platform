import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import type { IdempotencyRecord, IdempotencyStatus } from "@drts/contracts";

import { DatabaseService } from "../db";
import type {
  CompleteIdempotencyInput,
  CreateProcessingInput,
  CreateProcessingResult,
  FailIdempotencyInput,
} from "./idempotency.types";

type DbIdempotencyRow = QueryResultRow & {
  record_id: string;
  scope: string;
  idempotency_key: string;
  tenant_id: string | null;
  actor_id: string | null;
  request_path: string | null;
  payload_hash: string;
  status: string;
  status_code: number | null;
  response_body: unknown;
  action_receipt: unknown;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  expires_at: Date | string | null;
};

const SELECT_COLUMNS = `
  record_id, scope, idempotency_key, tenant_id, actor_id, request_path,
  payload_hash, status, status_code, response_body, action_receipt,
  error_message, created_at, updated_at, expires_at
`;

@Injectable()
export class IdempotencyRepository {
  private readonly memoryStore = new Map<string, IdempotencyRecord>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled(): boolean {
    return this.databaseService?.isEnabled() ?? false;
  }

  async findByKey(
    scope: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null> {
    if (!this.isEnabled()) {
      const key = this.memoryKey(scope, idempotencyKey);
      return this.memoryStore.get(key) ?? null;
    }

    const result = await this.databaseService!.query<DbIdempotencyRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM ops.idempotency_records
        WHERE scope = $1 AND idempotency_key = $2
        LIMIT 1
      `,
      [scope, idempotencyKey],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async createProcessing(
    input: CreateProcessingInput,
  ): Promise<CreateProcessingResult> {
    if (!this.isEnabled()) {
      const key = this.memoryKey(input.scope, input.idempotencyKey);
      const existing = this.memoryStore.get(key);
      if (existing) {
        return { record: existing, inserted: false };
      }
      const now = new Date().toISOString();
      const record: IdempotencyRecord = {
        recordId: randomUUID(),
        scope: input.scope,
        idempotencyKey: input.idempotencyKey,
        tenantId: input.tenantId ?? null,
        actorId: input.actorId ?? null,
        requestPath: input.requestPath ?? null,
        payloadHash: input.payloadHash,
        status: "processing",
        statusCode: null,
        responseBody: null,
        actionReceipt: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        expiresAt: null,
      };
      this.memoryStore.set(key, record);
      return { record, inserted: true };
    }

    try {
      const insertResult = await this.databaseService!.query<DbIdempotencyRow>(
        `
          INSERT INTO ops.idempotency_records (
            scope, idempotency_key, tenant_id, actor_id, request_path,
            payload_hash, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'processing', now(), now())
          ON CONFLICT (scope, idempotency_key) DO NOTHING
          RETURNING ${SELECT_COLUMNS}
        `,
        [
          input.scope,
          input.idempotencyKey,
          input.tenantId ?? null,
          input.actorId ?? null,
          input.requestPath ?? null,
          input.payloadHash,
        ],
      );

      if (insertResult.rows[0]) {
        return {
          record: this.mapRow(insertResult.rows[0]),
          inserted: true,
        };
      }
    } catch (err: unknown) {
      // Postgres unique_violation code 23505
      const pgCode = (err as { code?: string })?.code;
      if (pgCode !== "23505") {
        throw err;
      }
    }

    // Row already exists due to conflict / concurrent insert
    const existing = await this.findByKey(input.scope, input.idempotencyKey);
    if (!existing) {
      throw new Error(
        `Failed to find existing idempotency record for ${input.scope}:${input.idempotencyKey}`,
      );
    }
    return { record: existing, inserted: false };
  }

  async complete(input: CompleteIdempotencyInput): Promise<IdempotencyRecord> {
    if (!this.isEnabled()) {
      const key = this.memoryKey(input.scope, input.idempotencyKey);
      const existing = this.memoryStore.get(key);
      const now = new Date().toISOString();
      const updated: IdempotencyRecord = {
        recordId: existing?.recordId ?? randomUUID(),
        scope: input.scope,
        idempotencyKey: input.idempotencyKey,
        tenantId: existing?.tenantId ?? null,
        actorId: existing?.actorId ?? null,
        requestPath: existing?.requestPath ?? null,
        payloadHash: existing?.payloadHash ?? "",
        status: "completed",
        statusCode: input.statusCode,
        responseBody: input.responseBody,
        actionReceipt: input.actionReceipt ?? null,
        errorMessage: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        expiresAt: null,
      };
      this.memoryStore.set(key, updated);
      return updated;
    }

    const result = await this.databaseService!.query<DbIdempotencyRow>(
      `
        UPDATE ops.idempotency_records
        SET status = 'completed',
            status_code = $3,
            response_body = $4::jsonb,
            action_receipt = $5::jsonb,
            error_message = NULL,
            updated_at = now()
        WHERE scope = $1 AND idempotency_key = $2
        RETURNING ${SELECT_COLUMNS}
      `,
      [
        input.scope,
        input.idempotencyKey,
        input.statusCode,
        JSON.stringify(input.responseBody),
        input.actionReceipt ? JSON.stringify(input.actionReceipt) : null,
      ],
    );

    if (!result.rows[0]) {
      throw new Error(
        `Failed to mark idempotency record completed: ${input.scope}:${input.idempotencyKey}`,
      );
    }
    return this.mapRow(result.rows[0]);
  }

  async fail(input: FailIdempotencyInput): Promise<void> {
    if (!this.isEnabled()) {
      const key = this.memoryKey(input.scope, input.idempotencyKey);
      const existing = this.memoryStore.get(key);
      if (existing) {
        existing.status = "failed";
        existing.errorMessage = input.errorMessage ?? null;
        existing.updatedAt = new Date().toISOString();
      }
      return;
    }

    await this.databaseService!.query(
      `
        UPDATE ops.idempotency_records
        SET status = 'failed',
            error_message = $3,
            updated_at = now()
        WHERE scope = $1 AND idempotency_key = $2
      `,
      [input.scope, input.idempotencyKey, input.errorMessage ?? null],
    );
  }

  async delete(scope: string, idempotencyKey: string): Promise<void> {
    if (!this.isEnabled()) {
      this.memoryStore.delete(this.memoryKey(scope, idempotencyKey));
      return;
    }

    await this.databaseService!.query(
      `
        DELETE FROM ops.idempotency_records
        WHERE scope = $1 AND idempotency_key = $2
      `,
      [scope, idempotencyKey],
    );
  }

  clearMemoryStore(): void {
    this.memoryStore.clear();
  }

  private memoryKey(scope: string, idempotencyKey: string): string {
    return `${scope}\0${idempotencyKey}`;
  }

  private mapRow(row: DbIdempotencyRow): IdempotencyRecord {
    return {
      recordId: row.record_id,
      scope: row.scope,
      idempotencyKey: row.idempotency_key,
      tenantId: row.tenant_id,
      actorId: row.actor_id,
      requestPath: row.request_path,
      payloadHash: row.payload_hash,
      status: row.status as IdempotencyStatus,
      statusCode: row.status_code !== null ? Number(row.status_code) : null,
      responseBody: row.response_body,
      actionReceipt: row.action_receipt as IdempotencyRecord["actionReceipt"],
      errorMessage: row.error_message,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : new Date(row.updated_at).toISOString(),
      expiresAt: row.expires_at
        ? row.expires_at instanceof Date
          ? row.expires_at.toISOString()
          : new Date(row.expires_at).toISOString()
        : null,
    };
  }
}
