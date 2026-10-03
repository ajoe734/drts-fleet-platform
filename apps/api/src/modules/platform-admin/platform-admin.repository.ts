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

    // (R7-followthrough) This path is also used for a placard's own initial,
    // fire-and-forget draft write, so it can still be in flight when a later
    // `claimPlacardPublish`/`finalizePlacardPublish` for the SAME row commits
    // first (e.g. the HTTP response that handed out `placardVersionId`
    // returned before this write landed). Without a guard, this unconditional
    // `ON CONFLICT DO UPDATE` would then land *after* the claim and silently
    // regress the row back to its pre-publish content. `updated_at` only
    // ever moves forward for a given row in this service, so refusing to
    // apply a write whose own `updated_at` is older than what is already
    // persisted is sufficient to make every late/stale writer here (draft
    // creation, bootstrap seeding, source-drift migration) a safe no-op
    // against a newer claim/finalize, without needing a separate revision
    // column.
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
            WHERE admin.phase1_placard_versions.updated_at <= EXCLUDED.updated_at
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

  /**
   * Cross-instance fencing for `PlatformAdminService.publishPlacardVersion`
   * (R7-followthrough/R8/R9): the in-process `placardPublishQueue` only
   * serializes calls within one Cloud Run instance, so a sibling instance
   * racing to publish the same never-before-published placard can
   * independently decide to write durable artifact bytes unless something
   * stops it *before* either one touches the document-artifact store. This
   * is that something: an atomic `INSERT ... ON CONFLICT DO UPDATE` claim.
   *
   * `claim` carries an internal `__publishClaimToken` (not part of the
   * public `PlacardVersionRecord` contract -- it never survives
   * `finalizePlacardPublish`, and callers strip it before returning a
   * record to anything outside this module). It serves two purposes:
   *
   * - R8: if this call's own INSERT commits but the caller never observes
   *   the result (dropped connection after commit), a later attempt by the
   *   SAME in-flight caller can tell "the row I'm looking at IS the one I
   *   just wrote" apart from "someone else already holds this placard" --
   *   nothing else could produce this exact token.
   * - R9: a row that still carries a token has not been finalized yet (see
   *   `finalizePlacardPublish`), so a reader holding such a row knows its
   *   `artifactManifestHash`/`artifactDownloadUrl` are the pre-publish
   *   values, not proof of a completed publish, even though `publishedAt`
   *   is already set.
   *
   * The `WHERE` guard normally only admits a never-published row
   * (`publishedAt IS NULL`), so exactly one concurrent caller wins it and
   * every other conflicting write affects zero rows. It also admits a row
   * that still carries a token (never finalized/released) whose
   * `updated_at` is old enough to be considered abandoned -- a claim whose
   * owner crashed or lost its network before finalizing/releasing would
   * otherwise block every future publish of this placard forever. A
   * finalized row (no token) is never reclaimable through this guard
   * regardless of age.
   */
  async claimPlacardPublish(
    claim: PlacardVersionRecord,
  ): Promise<{ claimed: boolean; currentRecord: PlacardVersionRecord | null }> {
    if (!this.isEnabled()) {
      return { claimed: true, currentRecord: null };
    }

    const claimToken = this.readClaimToken(claim);

    let result;
    try {
      result = await this.databaseService!.query<JsonRecordRow>(
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
            updated_at = EXCLUDED.updated_at,
            record = EXCLUDED.record
          WHERE admin.phase1_placard_versions.record->>'publishedAt' IS NULL
             OR (
               admin.phase1_placard_versions.record->>'__publishClaimToken' IS NOT NULL
               AND admin.phase1_placard_versions.updated_at < NOW() - INTERVAL '2 minutes'
             )
          RETURNING record
        `,
        [
          claim.placardVersionId,
          claim.publicInfoVersionId,
          claim.versionCode,
          claim.createdAt,
          claim.updatedAt,
          JSON.stringify(claim),
        ],
      );
    } catch (error) {
      const reconciled = await this.reconcileAmbiguousPlacardClaim(
        claim.placardVersionId,
        claimToken,
      );
      if (reconciled) {
        return reconciled;
      }
      throw error;
    }

    if (result.rows.length === 1) {
      return {
        claimed: true,
        currentRecord: this.parseRecord<PlacardVersionRecord>(
          result.rows[0]!.record,
          "admin.phase1_placard_versions",
        ),
      };
    }

    const current = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM admin.phase1_placard_versions WHERE placard_version_id = $1`,
      [claim.placardVersionId],
    );
    return {
      claimed: false,
      currentRecord: current.rows[0]
        ? this.parseRecord<PlacardVersionRecord>(
            current.rows[0].record,
            "admin.phase1_placard_versions",
          )
        : null,
    };
  }

  /**
   * Recovers from a claim write whose commit outcome this call never
   * observed (the INSERT in `claimPlacardPublish` threw instead of
   * returning). Re-reads the row and only treats it as "mine" when it
   * carries THIS attempt's own `__publishClaimToken` -- a value nothing
   * else could have produced -- so a genuinely failed write (no matching
   * token persisted) is never mistaken for success, and a different
   * caller's committed claim is never adopted as this one's own.
   */
  private async reconcileAmbiguousPlacardClaim(
    placardVersionId: string,
    claimToken: string | null,
  ): Promise<{ claimed: boolean; currentRecord: PlacardVersionRecord } | null> {
    if (!claimToken) {
      return null;
    }
    try {
      const current = await this.databaseService!.query<JsonRecordRow>(
        `SELECT record FROM admin.phase1_placard_versions WHERE placard_version_id = $1`,
        [placardVersionId],
      );
      if (!current.rows[0]) {
        return null;
      }
      const record = this.parseRecord<PlacardVersionRecord>(
        current.rows[0].record,
        "admin.phase1_placard_versions",
      );
      if (this.readClaimToken(record) === claimToken) {
        return { claimed: true, currentRecord: record };
      }
      if (record.publishedAt) {
        return { claimed: false, currentRecord: record };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Reads a single placard row as-is (including a still-pending
   * `__publishClaimToken`, if any). Used by callers that cached a claim
   * snapshot that turned out not to be authoritative yet (R9) and need to
   * check whether it has been finalized since.
   */
  async getPlacardVersionRecord(
    placardVersionId: string,
  ): Promise<PlacardVersionRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const current = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM admin.phase1_placard_versions WHERE placard_version_id = $1`,
      [placardVersionId],
    );
    return current.rows[0]
      ? this.parseRecord<PlacardVersionRecord>(
          current.rows[0].record,
          "admin.phase1_placard_versions",
        )
      : null;
  }

  /**
   * Commits the fully-rendered publish result over a claim already won by
   * `claimPlacardPublish`, dropping the `__publishClaimToken` so readers can
   * tell this row is actually finalized (R9). Guarded by `expectedClaimToken`
   * and the affected-row count, not just the placard id: between this
   * call's own claim and this write, nothing else should have been able to
   * touch the row (the claim's token excludes every other claimant, and the
   * `persistChanges` placard guard rejects stale writers), but if something
   * unexpected did, returning `false` instead of silently "succeeding" lets
   * the caller release/report the conflict instead of reporting success for
   * a durable record that does not actually reflect it.
   */
  async finalizePlacardPublish(
    record: PlacardVersionRecord,
    expectedClaimToken: string,
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return true;
    }

    const payload: PlacardVersionRecord & {
      __publishClaimToken?: string | null;
    } = { ...record };
    delete payload.__publishClaimToken;

    const result = await this.databaseService!.query(
      `
        UPDATE admin.phase1_placard_versions
        SET updated_at = $2, record = $3::jsonb
        WHERE placard_version_id = $1 AND record->>'__publishClaimToken' = $4
      `,
      [
        record.placardVersionId,
        record.updatedAt,
        JSON.stringify(payload),
        expectedClaimToken,
      ],
    );

    return result.rowCount === 1;
  }

  /**
   * Reverts a claim this same call won via `claimPlacardPublish` but then
   * failed to materialise (render/store failure, or the pre-existing
   * store-changed-during-publish readback check). Guarded by both
   * `publishedAt` and `__publishClaimToken` matching this exact claim --
   * either guard alone would already stop this release from touching a
   * different claim, but requiring both means a release can never apply
   * after some other write has touched the row for any reason. Returns
   * whether the release actually applied so the caller can tell a no-op
   * (row already moved on) apart from a genuine revert.
   */
  async releasePlacardPublishClaim(
    placardVersionId: string,
    claimedPublishedAt: string,
    revertedRecord: PlacardVersionRecord,
    expectedClaimToken: string,
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return true;
    }

    const result = await this.databaseService!.query(
      `
        UPDATE admin.phase1_placard_versions
        SET updated_at = $2, record = $3::jsonb
        WHERE placard_version_id = $1
          AND record->>'publishedAt' = $4
          AND record->>'__publishClaimToken' = $5
      `,
      [
        placardVersionId,
        revertedRecord.updatedAt,
        JSON.stringify(revertedRecord),
        claimedPublishedAt,
        expectedClaimToken,
      ],
    );

    return result.rowCount === 1;
  }

  private readClaimToken(record: PlacardVersionRecord): string | null {
    return (
      (record as PlacardVersionRecord & { __publishClaimToken?: string | null })
        .__publishClaimToken ?? null
    );
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
