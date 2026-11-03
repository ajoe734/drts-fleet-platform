import { Injectable, Optional } from "@nestjs/common";

import type {
  RegulatoryAgencyRecord,
  RegulatoryAgencyStatus,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type AgencyRow = {
  agency_id: string;
  agency_code: string;
  display_name: string;
  status: RegulatoryAgencyStatus;
  created_by_principal_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function fromRow(row: AgencyRow): RegulatoryAgencyRecord {
  return {
    agencyId: row.agency_id,
    agencyCode: row.agency_code,
    displayName: row.display_name,
    status: row.status,
    createdByPrincipalId: row.created_by_principal_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export class AgencyCodeConflictError extends Error {
  constructor(public readonly agencyCode: string) {
    super(`Agency code '${agencyCode}' already exists.`);
    this.name = "AgencyCodeConflictError";
  }
}

/**
 * BUREAU-R13 `core.regulatory_agencies` (V0132). Outside a database the
 * agencies live only in process memory; nothing is seeded (open decision D1).
 */
@Injectable()
export class AgencyDirectoryRepository {
  private readonly fallbackAgencies = new Map<string, RegulatoryAgencyRecord>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async create(
    record: RegulatoryAgencyRecord,
  ): Promise<RegulatoryAgencyRecord> {
    if (!this.isEnabled()) {
      for (const existing of this.fallbackAgencies.values()) {
        if (existing.agencyCode === record.agencyCode) {
          throw new AgencyCodeConflictError(record.agencyCode);
        }
      }
      this.fallbackAgencies.set(record.agencyId, { ...record });
      return { ...record };
    }
    try {
      const result = await this.databaseService!.query<AgencyRow>(
        `INSERT INTO core.regulatory_agencies (
           agency_id, agency_code, display_name, status,
           created_by_principal_id, created_at, updated_at, record
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         RETURNING *`,
        [
          record.agencyId,
          record.agencyCode,
          record.displayName,
          record.status,
          record.createdByPrincipalId,
          record.createdAt,
          record.updatedAt,
          JSON.stringify(record),
        ],
      );
      return fromRow(result.rows[0]!);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new AgencyCodeConflictError(record.agencyCode);
      }
      throw error;
    }
  }

  async update(
    agencyId: string,
    changes: Partial<Pick<RegulatoryAgencyRecord, "displayName" | "status">>,
  ): Promise<RegulatoryAgencyRecord | null> {
    const now = new Date().toISOString();
    if (!this.isEnabled()) {
      const existing = this.fallbackAgencies.get(agencyId);
      if (!existing) return null;
      const updated = { ...existing, ...changes, updatedAt: now };
      this.fallbackAgencies.set(agencyId, updated);
      return { ...updated };
    }
    const result = await this.databaseService!.query<AgencyRow>(
      `UPDATE core.regulatory_agencies
          SET display_name = COALESCE($2, display_name),
              status = COALESCE($3, status),
              updated_at = $4::timestamptz,
              record = record
                || jsonb_build_object(
                  'displayName', COALESCE($2, display_name),
                  'status', COALESCE($3, status),
                  'updatedAt', $4::text
                )
        WHERE agency_id = $1
        RETURNING *`,
      [agencyId, changes.displayName ?? null, changes.status ?? null, now],
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async findById(agencyId: string): Promise<RegulatoryAgencyRecord | null> {
    if (!this.isEnabled()) {
      const record = this.fallbackAgencies.get(agencyId);
      return record ? { ...record } : null;
    }
    const result = await this.databaseService!.query<AgencyRow>(
      `SELECT * FROM core.regulatory_agencies WHERE agency_id = $1`,
      [agencyId],
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async list(): Promise<RegulatoryAgencyRecord[]> {
    if (!this.isEnabled()) {
      return [...this.fallbackAgencies.values()]
        .sort((left, right) => left.agencyCode.localeCompare(right.agencyCode))
        .map((record) => ({ ...record }));
    }
    const result = await this.databaseService!.query<AgencyRow>(
      `SELECT * FROM core.regulatory_agencies ORDER BY agency_code ASC`,
      [],
    );
    return result.rows.map(fromRow);
  }
}
