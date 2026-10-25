import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import type {
  AgencyAccessLogQuery,
  AgencyAccessLogRecord,
  AgencyPage,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

export type AgencyAccessLogInput = Omit<
  AgencyAccessLogRecord,
  "accessId" | "occurredAt"
>;

type AccessLogRow = {
  access_id: string;
  occurred_at: string | Date;
  agency_id: string;
  principal_id: string;
  membership_id: string;
  session_id: string | null;
  action: AgencyAccessLogRecord["action"];
  resource_type: AgencyAccessLogRecord["resourceType"];
  route_key: string;
  resource_id: string | null;
  filter: AgencyAccessLogRecord["filter"] | string;
  row_count: number | null;
  total_count: number | null;
  outcome: AgencyAccessLogRecord["outcome"];
  reason_code: string | null;
  export_manifest_hash: string | null;
  request_id: string | null;
  source_ip_prefix: string | null;
  user_agent_hash: string | null;
  total?: string | number;
};

const MAX_PAGE_SIZE = 200;
const MAX_IN_MEMORY_ACCESS_LOGS = 10_000;

function fromRow(row: AccessLogRow): AgencyAccessLogRecord {
  return {
    accessId: row.access_id,
    occurredAt:
      row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : row.occurred_at,
    agencyId: row.agency_id,
    principalId: row.principal_id,
    membershipId: row.membership_id,
    sessionId: row.session_id,
    action: row.action,
    resourceType: row.resource_type,
    routeKey: row.route_key,
    resourceId: row.resource_id,
    filter:
      typeof row.filter === "string"
        ? (JSON.parse(row.filter) as AgencyAccessLogRecord["filter"])
        : row.filter,
    rowCount: row.row_count,
    totalCount: row.total_count,
    outcome: row.outcome,
    reasonCode: row.reason_code,
    exportManifestHash: row.export_manifest_hash,
    requestId: row.request_id,
    sourceIpPrefix: row.source_ip_prefix,
    userAgentHash: row.user_agent_hash,
  };
}

export function normalizeAccessLogPage(query: AgencyAccessLogQuery) {
  const page =
    Number.isSafeInteger(Number(query.page)) && Number(query.page) > 0
      ? Number(query.page)
      : 1;
  const requested = Number(query.pageSize);
  const pageSize =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, MAX_PAGE_SIZE)
      : 50;
  return { page, pageSize };
}

/**
 * BUREAU-R13 `admin.agency_access_logs` (V0133). Append and read only: the
 * repository exposes no update/delete, and the table's triggers reject them
 * for every application role anyway.
 */
@Injectable()
export class AgencyAccessLogRepository {
  private fallbackLogs: AgencyAccessLogRecord[] = [];

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async append(input: AgencyAccessLogInput): Promise<AgencyAccessLogRecord> {
    if (!this.isEnabled()) {
      const record: AgencyAccessLogRecord = {
        ...input,
        filter: { ...input.filter },
        accessId: randomUUID(),
        occurredAt: new Date().toISOString(),
      };
      this.fallbackLogs = [record, ...this.fallbackLogs].slice(
        0,
        MAX_IN_MEMORY_ACCESS_LOGS,
      );
      return { ...record, filter: { ...record.filter } };
    }
    const result = await this.databaseService!.query<AccessLogRow>(
      `INSERT INTO admin.agency_access_logs (
         agency_id, principal_id, membership_id, session_id, action,
         resource_type, route_key, resource_id, filter, row_count,
         total_count, outcome, reason_code, export_manifest_hash,
         request_id, source_ip_prefix, user_agent_hash
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14,
         $15, $16, $17
       )
       RETURNING *`,
      [
        input.agencyId,
        input.principalId,
        input.membershipId,
        input.sessionId,
        input.action,
        input.resourceType,
        input.routeKey,
        input.resourceId,
        JSON.stringify(input.filter),
        input.rowCount,
        input.totalCount,
        input.outcome,
        input.reasonCode,
        input.exportManifestHash,
        input.requestId,
        input.sourceIpPrefix,
        input.userAgentHash,
      ],
    );
    return fromRow(result.rows[0]!);
  }

  async list(
    query: AgencyAccessLogQuery,
  ): Promise<AgencyPage<AgencyAccessLogRecord>> {
    const { page, pageSize } = normalizeAccessLogPage(query);
    const from = query.from ? Date.parse(query.from) : null;
    const to = query.to ? Date.parse(query.to) : null;
    if (!this.isEnabled()) {
      const matches = this.fallbackLogs.filter(
        (record) =>
          (!query.agencyId || record.agencyId === query.agencyId) &&
          (!query.principalId || record.principalId === query.principalId) &&
          (!query.action || record.action === query.action) &&
          (from === null || Date.parse(record.occurredAt) >= from) &&
          (to === null || Date.parse(record.occurredAt) <= to),
      );
      return {
        items: matches
          .slice((page - 1) * pageSize, page * pageSize)
          .map((record) => ({ ...record, filter: { ...record.filter } })),
        page,
        pageSize,
        total: matches.length,
      };
    }
    const result = await this.databaseService!.query<AccessLogRow>(
      `SELECT *, count(*) OVER () AS total
         FROM admin.agency_access_logs
        WHERE ($1::text IS NULL OR agency_id = $1)
          AND ($2::text IS NULL OR principal_id = $2)
          AND ($3::text IS NULL OR action = $3)
          AND ($4::timestamptz IS NULL OR occurred_at >= $4::timestamptz)
          AND ($5::timestamptz IS NULL OR occurred_at <= $5::timestamptz)
        ORDER BY occurred_at DESC, access_id DESC
        LIMIT $6 OFFSET $7`,
      [
        query.agencyId ?? null,
        query.principalId ?? null,
        query.action ?? null,
        query.from ?? null,
        query.to ?? null,
        pageSize,
        (page - 1) * pageSize,
      ],
    );
    return {
      items: result.rows.map(fromRow),
      page,
      pageSize,
      total: Number(result.rows[0]?.total ?? 0),
    };
  }
}
