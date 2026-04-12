import { Injectable, Logger, Optional } from "@nestjs/common";

import type { AuditLogRecord } from "@drts/contracts";

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

  async append(record: AuditLogRecord) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
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
