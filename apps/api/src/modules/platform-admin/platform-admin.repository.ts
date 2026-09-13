import { Injectable, Logger, Optional } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import type {
  PlatformAdminTenantRecord,
  PlacardVersionRecord,
  PlatformAdapter,
  PublicInfoVersionRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

export type PlatformAdminQueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

export type PlatformAdminState = {
  platformTenants: PlatformAdminTenantRecord[];
  publicInfoVersions: PublicInfoVersionRecord[];
  placardVersions: PlacardVersionRecord[];
  platformAdapters: PlatformAdapter[];
};

export type PersistPlatformAdminChanges = {
  platformTenants?: readonly PlatformAdminTenantRecord[];
  publicInfoVersions?: readonly PublicInfoVersionRecord[];
  placardVersions?: readonly PlacardVersionRecord[];
  platformAdapters?: readonly PlatformAdapter[];
  deletedPlatformTenantIds?: readonly string[];
  deletedPublicInfoVersionIds?: readonly string[];
};

/**
 * Thrown by `mutateAdapterWithAudit` when the persisted row's `revision`
 * does not match `expectedRevision` -- a stale snapshot, not a generic DB
 * error. Callers must surface a conflict, never retry-and-overwrite.
 */
export class PlatformAdapterRevisionConflictError extends Error {
  constructor(
    public readonly adapterId: string,
    public readonly expectedRevision: number,
  ) {
    super(
      `Platform adapter ${adapterId} was not at expected revision ${expectedRevision} (stale snapshot or missing row).`,
    );
    this.name = "PlatformAdapterRevisionConflictError";
  }
}

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
        platformAdapters: [],
      };
    }

    const [tenantResult, publicInfoResult, placardResult, adapterResult] =
      await Promise.all([
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
        this.databaseService!.query<JsonRecordRow>(
          `
          SELECT record
          FROM admin.phase1_platform_adapters
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
      platformAdapters: adapterResult.rows.map((row) =>
        this.parseRecord<PlatformAdapter>(
          row.record,
          "admin.phase1_platform_adapters",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistPlatformAdminChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const tenantId of changes.deletedPlatformTenantIds ?? []) {
      writes.push(
        this.databaseService!.query(
          `DELETE FROM admin.phase1_platform_tenants WHERE tenant_id = $1`,
          [tenantId],
        ),
      );
    }

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

    for (const adapter of changes.platformAdapters ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_platform_adapters (
              id,
              revision,
              credential_expiry_reference,
              credential_expiry_expires_at,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb
            )
            ON CONFLICT (id) DO UPDATE SET
              revision = EXCLUDED.revision,
              credential_expiry_reference = EXCLUDED.credential_expiry_reference,
              credential_expiry_expires_at = EXCLUDED.credential_expiry_expires_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            adapter.id,
            adapter.revision ?? 1,
            adapter.credentialExpiry?.reference ?? null,
            adapter.credentialExpiry?.expiresAt ?? null,
            adapter.createdAt,
            adapter.updatedAt,
            JSON.stringify(adapter),
          ],
        ),
      );
    }

    await Promise.all(writes);
  }

  async withTransaction<T>(work: (executor: PoolClient) => Promise<T>) {
    if (!this.isEnabled()) {
      throw new Error("DATABASE_URL is not configured");
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '8s'");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        this.logger.warn(
          `Platform-admin transaction rollback failed: ${
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError)
          }`,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Applies one revision-guarded mutation to an already-persisted adapter row
   * and records the audit evidence in the same transaction: `UPDATE ... WHERE
   * id = $1 AND revision = $expectedRevision` (bumping revision in the same
   * statement) followed by an INSERT into
   * `admin.phase1_platform_adapter_mutation_audit`, both committed together
   * so a returned `lastMutationAudit` is always visible. Throws
   * `PlatformAdapterRevisionConflictError` when the row is missing or the
   * expected revision no longer matches (zero rows affected) -- the caller
   * must surface a conflict, never retry-and-overwrite. Only ever called when
   * `isEnabled()`; if the adapter row has not been persisted yet (e.g. an
   * in-memory seed adapter mutated before its first persisted write), the
   * caller is responsible for persisting the initial row first.
   */
  async mutateAdapterWithAudit(
    adapterId: string,
    expectedRevision: number,
    updatedRecord: PlatformAdapter,
    audit: {
      previousRevision: number;
      newRevision: number;
      reason: string;
      actorId: string | null;
    },
  ): Promise<void> {
    await this.withTransaction(async (client) => {
      const result = await client.query(
        `
          UPDATE admin.phase1_platform_adapters
          SET
            revision = $2,
            credential_expiry_reference = $3,
            credential_expiry_expires_at = $4,
            updated_at = $5,
            record = $6::jsonb
          WHERE id = $1 AND revision = $7
        `,
        [
          adapterId,
          audit.newRevision,
          updatedRecord.credentialExpiry?.reference ?? null,
          updatedRecord.credentialExpiry?.expiresAt ?? null,
          updatedRecord.updatedAt,
          JSON.stringify(updatedRecord),
          expectedRevision,
        ],
      );

      if (result.rowCount !== 1) {
        throw new PlatformAdapterRevisionConflictError(
          adapterId,
          expectedRevision,
        );
      }

      await client.query(
        `
          INSERT INTO admin.phase1_platform_adapter_mutation_audit (
            adapter_id,
            previous_revision,
            new_revision,
            reason,
            actor_id
          ) VALUES ($1, $2, $3, $4, $5)
        `,
        [
          adapterId,
          audit.previousRevision,
          audit.newRevision,
          audit.reason,
          audit.actorId,
        ],
      );
    });
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
