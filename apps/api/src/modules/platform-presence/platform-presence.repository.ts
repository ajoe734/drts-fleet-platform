import { Injectable, Logger, Optional } from "@nestjs/common";
import { DatabaseService } from "../../common/db";
import type {
  PlatformEligibility,
  PlatformCode,
  PlatformPresenceRecord,
  PlatformPresenceStatus,
} from "@drts/contracts";

interface PresenceRow {
  driver_id: string;
  platform_code: string;
  account_id: string | null;
  online_status: string;
  eligibility: string;
  token_expires_at: Date | string | null;
  reauth_required: boolean;
  last_online_at: Date | string | null;
  last_offline_at: Date | string | null;
  updated_at: Date | string;
  record: unknown;
}

@Injectable()
export class PlatformPresenceRepository {
  private readonly logger = new Logger(PlatformPresenceRepository.name);

  constructor(@Optional() private readonly db?: DatabaseService) {}

  isEnabled() {
    return this.db?.isEnabled() ?? false;
  }

  async listByDriver(driverId: string): Promise<PlatformPresenceRecord[]> {
    if (!this.isEnabled()) return [];

    try {
      const result = await this.db!.query<PresenceRow>(
        `SELECT driver_id, platform_code, account_id, online_status, eligibility,
                token_expires_at, reauth_required, last_online_at, last_offline_at, updated_at, record
         FROM ops.phase1_platform_presence
         WHERE driver_id = $1
         ORDER BY platform_code`,
        [driverId],
      );

      return result.rows.map((row) => this.mapRow(row));
    } catch (err) {
      this.logger.warn(
        `Failed to list platform presence for ${driverId}: ${err}`,
      );
      return [];
    }
  }

  async upsert(
    record: PlatformPresenceRecord,
  ): Promise<PlatformPresenceRecord> {
    if (!this.isEnabled()) return record;

    try {
      const jsonRecord = {
        ...record,
      };
      const result = await this.db!.query<PresenceRow>(
        `INSERT INTO ops.phase1_platform_presence (
           driver_id, platform_code, account_id, online_status, eligibility,
           token_expires_at, reauth_required, last_online_at, last_offline_at, updated_at, record
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10
         )
         ON CONFLICT (driver_id, platform_code)
         DO UPDATE SET
           account_id = EXCLUDED.account_id,
           online_status = EXCLUDED.online_status,
           eligibility = EXCLUDED.eligibility,
           token_expires_at = EXCLUDED.token_expires_at,
           reauth_required = EXCLUDED.reauth_required,
           last_online_at = EXCLUDED.last_online_at,
           last_offline_at = EXCLUDED.last_offline_at,
           updated_at = NOW(),
           record = EXCLUDED.record
         RETURNING driver_id, platform_code, account_id, online_status, eligibility,
                   token_expires_at, reauth_required, last_online_at, last_offline_at, updated_at, record`,
        [
          record.driverId,
          record.platformCode,
          record.accountId,
          record.status,
          record.eligibility,
          record.tokenExpiresAt ? new Date(record.tokenExpiresAt) : null,
          record.reauthRequired,
          record.lastOnlineAt ? new Date(record.lastOnlineAt) : null,
          record.lastOfflineAt ? new Date(record.lastOfflineAt) : null,
          jsonRecord,
        ],
      );

      const row = result.rows[0]!;
      return this.mapRow(row);
    } catch (err) {
      this.logger.warn(
        `Failed to upsert platform presence ${record.platformCode}/${record.driverId}: ${err}`,
      );
      return record;
    }
  }

  private mapRow(row: PresenceRow): PlatformPresenceRecord {
    const toIso = (v: Date | string | null): string | null =>
      v == null
        ? null
        : v instanceof Date
          ? v.toISOString()
          : new Date(v).toISOString();

    return {
      driverId: row.driver_id,
      platformCode: row.platform_code as PlatformCode,
      accountId: row.account_id,
      status: (row.online_status as PlatformPresenceStatus) ?? "offline",
      eligibility: (row.eligibility as PlatformEligibility) ?? "pending",
      tokenExpiresAt: toIso(row.token_expires_at),
      reauthRequired: row.reauth_required,
      lastOnlineAt: toIso(row.last_online_at),
      lastOfflineAt: toIso(row.last_offline_at),
      updatedAt: toIso(row.updated_at)!,
    };
  }
}
