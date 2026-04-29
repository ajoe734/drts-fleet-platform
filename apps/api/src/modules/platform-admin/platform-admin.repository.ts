import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  PlatformAdminTenantRecord,
  PlacardVersionRecord,
  PublicInfoVersionRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

export type PlatformAdminState = {
  platformTenants: PlatformAdminTenantRecord[];
  publicInfoVersions: PublicInfoVersionRecord[];
  placardVersions: PlacardVersionRecord[];
};

export type PersistPlatformAdminChanges = {
  platformTenants?: readonly PlatformAdminTenantRecord[];
  publicInfoVersions?: readonly PublicInfoVersionRecord[];
  placardVersions?: readonly PlacardVersionRecord[];
  deletedPublicInfoVersionIds?: readonly string[];
};

@Injectable()
export class PlatformAdminRepository {
  private readonly logger = new Logger(PlatformAdminRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<PlatformAdminState> {
    if (!this.isEnabled()) {
      return {
        platformTenants: [],
        publicInfoVersions: [],
        placardVersions: [],
      };
    }

    const [tenantResult, publicInfoResult, placardResult] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_platform_tenants
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_public_info_versions
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_placard_versions
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
    ]);

    return {
      platformTenants: tenantResult.rows.map((row) =>
        this.parseRecord<PlatformAdminTenantRecord>(
          row.record,
          "admin.phase1_platform_tenants",
        ),
      ),
      publicInfoVersions: publicInfoResult.rows.map((row) =>
        this.parseRecord<PublicInfoVersionRecord>(
          row.record,
          "admin.phase1_public_info_versions",
        ),
      ),
      placardVersions: placardResult.rows.map((row) =>
        this.parseRecord<PlacardVersionRecord>(
          row.record,
          "admin.phase1_placard_versions",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistPlatformAdminChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const tenant of changes.platformTenants ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_platform_tenants (
              tenant_id,
              tenant_code,
              tenant_status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (tenant_id) DO UPDATE SET
              tenant_code = EXCLUDED.tenant_code,
              tenant_status = EXCLUDED.tenant_status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            tenant.id,
            tenant.code,
            tenant.status,
            tenant.createdAt,
            tenant.updatedAt,
            JSON.stringify(tenant),
          ],
        ),
      );
    }

    for (const version of changes.publicInfoVersions ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_public_info_versions (
              version_id,
              status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5::jsonb
            )
            ON CONFLICT (version_id) DO UPDATE SET
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            version.versionId,
            version.status,
            version.createdAt,
            version.updatedAt,
            JSON.stringify(version),
          ],
        ),
      );
    }

    for (const versionId of changes.deletedPublicInfoVersionIds ?? []) {
      writes.push(
        this.databaseService!.query(
          `DELETE FROM admin.phase1_public_info_versions WHERE version_id = $1`,
          [versionId],
        ),
      );
    }

    for (const placard of changes.placardVersions ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_placard_versions (
              placard_version_id,
              public_info_version_id,
              version_code,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (placard_version_id) DO UPDATE SET
              public_info_version_id = EXCLUDED.public_info_version_id,
              version_code = EXCLUDED.version_code,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            placard.placardVersionId,
            placard.publicInfoVersionId,
            placard.versionCode,
            placard.createdAt,
            placard.updatedAt,
            JSON.stringify(placard),
          ],
        ),
      );
    }

    await Promise.all(writes);
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Platform-admin persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
