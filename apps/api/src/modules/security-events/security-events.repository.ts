import { Injectable, Logger, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import type { SecurityEventQuery, SecurityEventRecord } from "@drts/contracts";

import { DatabaseService } from "../../common/db";

export type SecurityEventQueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

type SecurityEventRow = {
  event_id: string;
  occurred_at: string | Date;
  event_type: string;
  event_family: SecurityEventRecord["eventFamily"];
  outcome: SecurityEventRecord["outcome"];
  severity: SecurityEventRecord["severity"];
  actor_id: string | null;
  actor_type: SecurityEventRecord["actorType"];
  subject_id_hash: string | null;
  realm: SecurityEventRecord["realm"];
  tenant_id: string | null;
  partner_id: string | null;
  target_type: string | null;
  target_id: string | null;
  session_id: string | null;
  token_id_hash: string | null;
  auth_methods: string[] | null;
  source_ip_prefix: string | null;
  user_agent_hash: string | null;
  request_id: string | null;
  trace_id: string | null;
  reason_code: string | null;
  approval_id: string | null;
  policy_version: string | null;
  before_summary: Record<string, unknown> | null;
  after_summary: Record<string, unknown> | null;
  masked_context: Record<string, unknown> | null;
};

@Injectable()
export class SecurityEventsRepository {
  private readonly logger = new Logger(SecurityEventsRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async append(
    record: SecurityEventRecord,
    executor?: SecurityEventQueryExecutor,
  ) {
    const queryExecutor = executor ?? this.databaseService;
    if (!queryExecutor) {
      return;
    }

    await queryExecutor.query(
      `
        INSERT INTO admin.security_events (
          event_id,
          occurred_at,
          event_type,
          event_family,
          outcome,
          severity,
          actor_id,
          actor_type,
          subject_id_hash,
          realm,
          tenant_id,
          partner_id,
          target_type,
          target_id,
          session_id,
          token_id_hash,
          auth_methods,
          source_ip_prefix,
          user_agent_hash,
          request_id,
          trace_id,
          reason_code,
          approval_id,
          policy_version,
          before_summary,
          after_summary,
          masked_context
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25::jsonb, $26::jsonb, $27::jsonb
        )
      `,
      [
        record.eventId,
        record.occurredAt,
        record.eventType,
        record.eventFamily,
        record.outcome,
        record.severity,
        record.actorId,
        record.actorType,
        record.subjectIdHash,
        record.realm,
        record.tenantId,
        record.partnerId,
        record.targetType,
        record.targetId,
        record.sessionId,
        record.tokenIdHash,
        record.authMethods,
        record.sourceIpPrefix,
        record.userAgentHash,
        record.requestId,
        record.traceId,
        record.reasonCode,
        record.approvalId,
        record.policyVersion,
        JSON.stringify(record.beforeSummary),
        JSON.stringify(record.afterSummary),
        JSON.stringify(record.maskedContext),
      ],
    );
  }

  async findMany(query: SecurityEventQuery) {
    if (!this.isEnabled()) {
      return [];
    }

    const clauses: string[] = [];
    const values: unknown[] = [];

    if (query.tenantId) {
      values.push(query.tenantId);
      clauses.push(`tenant_id = $${values.length}`);
    }
    if (query.partnerId) {
      values.push(query.partnerId);
      clauses.push(`partner_id = $${values.length}`);
    }
    if (query.actorId) {
      values.push(query.actorId);
      clauses.push(`actor_id = $${values.length}`);
    }
    if (query.eventFamily) {
      values.push(query.eventFamily);
      clauses.push(`event_family = $${values.length}`);
    }
    if (query.eventType) {
      values.push(query.eventType);
      clauses.push(`event_type = $${values.length}`);
    }
    if (query.outcome) {
      values.push(query.outcome);
      clauses.push(`outcome = $${values.length}`);
    }

    const requestedLimit =
      typeof query.limit === "number" && Number.isFinite(query.limit)
        ? query.limit
        : 100;
    const limit = Math.min(Math.max(requestedLimit, 1), 500);
    values.push(limit);

    const result = await this.databaseService!.query<SecurityEventRow>(
      `
        SELECT
          event_id,
          occurred_at,
          event_type,
          event_family,
          outcome,
          severity,
          actor_id,
          actor_type,
          subject_id_hash,
          realm,
          tenant_id,
          partner_id,
          target_type,
          target_id,
          session_id,
          token_id_hash,
          auth_methods,
          source_ip_prefix,
          user_agent_hash,
          request_id,
          trace_id,
          reason_code,
          approval_id,
          policy_version,
          before_summary,
          after_summary,
          masked_context
        FROM admin.security_events
        ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY occurred_at DESC, event_id ASC
        LIMIT $${values.length}
      `,
      values,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Security event persistence skipped during ${context}: ${detail}`,
    );
  }

  private mapRow(row: SecurityEventRow): SecurityEventRecord {
    const occurredAt =
      row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : new Date(row.occurred_at).toISOString();

    return {
      eventId: row.event_id,
      occurredAt,
      eventType: row.event_type,
      eventFamily: row.event_family,
      outcome: row.outcome,
      severity: row.severity,
      actorId: row.actor_id,
      actorType: row.actor_type,
      subjectIdHash: row.subject_id_hash,
      realm: row.realm,
      tenantId: row.tenant_id,
      partnerId: row.partner_id,
      targetType: row.target_type,
      targetId: row.target_id,
      sessionId: row.session_id,
      tokenIdHash: row.token_id_hash,
      authMethods: [...(row.auth_methods ?? [])],
      sourceIpPrefix: row.source_ip_prefix,
      userAgentHash: row.user_agent_hash,
      requestId: row.request_id,
      traceId: row.trace_id,
      reasonCode: row.reason_code,
      approvalId: row.approval_id,
      policyVersion: row.policy_version,
      beforeSummary: row.before_summary,
      afterSummary: row.after_summary,
      maskedContext: row.masked_context ?? {},
    };
  }
}
