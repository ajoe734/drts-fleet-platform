import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  EvidenceAccessLogRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";
import {
  BOOTSTRAP_AUDIT_LOG,
  cloneAuditLog,
  normalizeUuidOrNull,
} from "./audit-log.persistence";

interface AuditLogRow {
  audit_id: string;
  actor_id: string | null;
  actor_type: AuditLogRecord["actorType"];
  tenant_id: string | null;
  module_name: string;
  action_name: string;
  resource_type: string;
  resource_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  request_id: string;
  created_at: Date | string;
}

// Minimal surface shared by the pool (DatabaseService) and a checked-out
// PoolClient, so the same INSERT helpers run both standalone and inside a
// transaction.
interface Queryable {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
}

@Injectable()
export class AuditLogRepository {
  private readonly logger = new Logger(AuditLogRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  getBootstrapSeed() {
    return cloneAuditLog(BOOTSTRAP_AUDIT_LOG);
  }

  async loadRecent(limit = 200) {
    if (!this.isEnabled()) {
      return [this.getBootstrapSeed()];
    }

    await this.ensureBootstrapSeed();

    const result = await this.databaseService!.query<AuditLogRow>(
      `
        SELECT
          audit_id,
          actor_id,
          actor_type,
          tenant_id,
          module_name,
          action_name,
          resource_type,
          resource_id,
          old_value,
          new_value,
          request_id,
          created_at
        FROM admin.audit_logs
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [limit],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async loadEvidenceGovernanceTrail() {
    if (!this.isEnabled()) {
      return [this.getBootstrapSeed()];
    }

    await this.ensureBootstrapSeed();

    const result = await this.databaseService!.query<AuditLogRow>(
      `
        SELECT
          audit_id,
          actor_id,
          actor_type,
          tenant_id,
          module_name,
          action_name,
          resource_type,
          resource_id,
          old_value,
          new_value,
          request_id,
          created_at
        FROM admin.audit_logs
        WHERE resource_type IN ('evidence_legal_hold', 'evidence_deletion_exception')
        ORDER BY created_at ASC
      `,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async append(record: AuditLogRecord) {
    if (!this.isEnabled()) {
      return;
    }

    await this.insertAuditLog(this.databaseService!, record);
  }

  async appendEvidenceAccessLog(record: EvidenceAccessLogRecord) {
    if (!this.isEnabled()) {
      return;
    }

    await this.insertEvidenceAccessLog(this.databaseService!, record);
  }

  // Atomic evidence-access dual-write. The canonical audit body and its
  // evidence-access projection must land together or not at all: a successful
  // mirror insert with a failed canonical insert would strand an orphan row in
  // av_evidence.evidence_access_logs that violates the 1:1 link to the shared
  // Phase 1 audit store. Both inserts therefore run in a single transaction —
  // the canonical row first so the FK on evidence_access_logs.audit_id is
  // satisfied — and any failure rolls both back. When the row has no
  // evidence-access projection, the single canonical insert is already atomic.
  async appendWithEvidenceAccess(
    record: AuditLogRecord,
    evidenceAccess: EvidenceAccessLogRecord | null,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    if (!evidenceAccess) {
      await this.append(record);
      return;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      await this.insertAuditLog(client, record);
      await this.insertEvidenceAccessLog(client, evidenceAccess);
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback failures; surface the original error instead.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertAuditLog(exec: Queryable, record: AuditLogRecord) {
    await exec.query(
      `
        INSERT INTO admin.audit_logs (
          audit_id,
          actor_id,
          actor_type,
          tenant_id,
          module_name,
          action_name,
          resource_type,
          resource_id,
          old_value,
          new_value,
          request_id,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12
        )
        ON CONFLICT (audit_id) DO NOTHING
      `,
      [
        record.auditId,
        normalizeUuidOrNull(record.actorId),
        record.actorType,
        normalizeUuidOrNull(record.tenantId),
        record.moduleName,
        record.actionName,
        record.resourceType,
        record.resourceId,
        JSON.stringify(record.oldValuesSummary ?? null),
        JSON.stringify(record.newValuesSummary ?? null),
        record.requestId,
        record.createdAt,
      ],
    );
  }

  // Mirrors the evidence-access projection into av_evidence.evidence_access_logs,
  // linked 1:1 by audit_id back to the canonical admin.audit_logs row.
  private async insertEvidenceAccessLog(
    exec: Queryable,
    record: EvidenceAccessLogRecord,
  ) {
    await exec.query(
      `
        INSERT INTO av_evidence.evidence_access_logs (
          audit_id,
          evidence_family,
          access_action,
          actor_id,
          actor_type,
          tenant_id,
          resource_type,
          resource_id,
          request_id,
          context,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11
        )
        ON CONFLICT (audit_id) DO NOTHING
      `,
      [
        record.auditId,
        record.evidenceFamily,
        record.accessAction,
        record.actorId,
        record.actorType,
        record.tenantId,
        record.resourceType,
        record.resourceId,
        record.requestId,
        JSON.stringify(record.context ?? null),
        record.createdAt,
      ],
    );
  }

  private async ensureBootstrapSeed() {
    await this.append(this.getBootstrapSeed());
  }

  private mapRow(row: AuditLogRow): AuditLogRecord {
    const createdAt =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString();

    return {
      auditId: row.audit_id,
      actorId: row.actor_id,
      actorType: row.actor_type,
      tenantId: row.tenant_id,
      moduleName: row.module_name,
      actionName: row.action_name,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      requestId: row.request_id,
      createdAt,
      ...(row.old_value ? { oldValuesSummary: row.old_value } : {}),
      ...(row.new_value ? { newValuesSummary: row.new_value } : {}),
    };
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Audit log persistence skipped during ${context}: ${detail}`,
    );
  }
}
