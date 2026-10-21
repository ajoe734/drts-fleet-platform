import { AsyncLocalStorage } from "node:async_hooks";

import { Injectable, Logger, Optional } from "@nestjs/common";
import { type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import type {
  DriverDeviceBindingRecord,
  DriverDeviceInvitationRecord,
  DriverRefreshFamilyRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type TransactionQueryClient = Pick<PoolClient, "query">;

@Injectable()
export class DriverDeviceSessionRepository {
  private readonly logger = new Logger(DriverDeviceSessionRepository.name);

  private readonly fallbackTransactionClientStorage =
    new AsyncLocalStorage<TransactionQueryClient>();

  private inMemoryLockChain: Promise<void> = Promise.resolve();

  private readonly fallbackInvitations = new Map<
    string,
    DriverDeviceInvitationRecord
  >();

  private readonly fallbackBindings = new Map<
    string,
    DriverDeviceBindingRecord
  >();

  private readonly fallbackRefreshFamilies = new Map<
    string,
    DriverRefreshFamilyRecord
  >();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  private get activeTransactionClient(): TransactionQueryClient | undefined {
    return (
      this.databaseService?.getActiveTransactionClient?.() ??
      this.fallbackTransactionClientStorage.getStore()
    );
  }

  private canUseTransactionalAdvisoryLock(): boolean {
    return this.isEnabled();
  }

  private async runWithTransaction<T>(
    callback: (client: TransactionQueryClient) => Promise<T>,
  ): Promise<T> {
    const existingClient = this.activeTransactionClient;
    if (existingClient) {
      return callback(existingClient);
    }

    if (typeof this.databaseService?.withTransaction === "function") {
      return this.databaseService.withTransaction(async (client) =>
        callback(client),
      );
    }

    const pooledClient = await this.databaseService!.connect();
    try {
      await pooledClient.query("BEGIN");
      const result = await this.fallbackTransactionClientStorage.run(
        pooledClient,
        () => callback(pooledClient),
      );
      await pooledClient.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await pooledClient.query("ROLLBACK");
      } catch {
        // Ignore rollback error and surface original failure
      }
      throw error;
    } finally {
      pooledClient.release();
    }
  }

  private async runWithInMemoryLock<T>(callback: () => Promise<T>): Promise<T> {
    if (this.activeTransactionClient) {
      return callback();
    }

    const previous = this.inMemoryLockChain;
    let release!: () => void;
    this.inMemoryLockChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await callback();
    } finally {
      release();
    }
  }

  private async acquireAdvisoryXactLocks(
    client: TransactionQueryClient,
    lockKeys: readonly string[],
  ): Promise<void> {
    const sortedUniqueKeys = [
      ...new Set(lockKeys.map((key) => key.trim()).filter(Boolean)),
    ].sort();
    for (const key of sortedUniqueKeys) {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [key],
      );
    }
  }

  private async runWithFallbackRollbackGuard<T>(
    callback: () => Promise<T>,
  ): Promise<T> {
    const invitationsSnapshot = new Map(
      Array.from(this.fallbackInvitations.entries(), ([key, value]) => [
        key,
        { ...value },
      ]),
    );
    const bindingsSnapshot = new Map(
      Array.from(this.fallbackBindings.entries(), ([key, value]) => [
        key,
        { ...value },
      ]),
    );
    const familiesSnapshot = new Map(
      Array.from(this.fallbackRefreshFamilies.entries(), ([key, value]) => [
        key,
        {
          ...value,
          previousTokenHashes: [...value.previousTokenHashes],
        },
      ]),
    );

    try {
      return await callback();
    } catch (error) {
      this.fallbackInvitations.clear();
      for (const [key, value] of invitationsSnapshot.entries()) {
        this.fallbackInvitations.set(key, value);
      }
      this.fallbackBindings.clear();
      for (const [key, value] of bindingsSnapshot.entries()) {
        this.fallbackBindings.set(key, value);
      }
      this.fallbackRefreshFamilies.clear();
      for (const [key, value] of familiesSnapshot.entries()) {
        this.fallbackRefreshFamilies.set(key, value);
      }
      throw error;
    }
  }

  async withRegistrationLock<T>(
    scope: { regCodeHash: string; deviceId: string },
    callback: () => Promise<T>,
  ): Promise<T> {
    return this.runWithInMemoryLock(async () => {
      if (!this.canUseTransactionalAdvisoryLock()) {
        return this.runWithFallbackRollbackGuard(callback);
      }

      return this.runWithTransaction(async (client) => {
        await this.acquireAdvisoryXactLocks(client, [
          `iam.driver_device_session:1:device:${scope.deviceId}`,
          `iam.driver_device_session:1:invite:${scope.regCodeHash}`,
        ]);
        return callback();
      });
    });
  }

  async lockDriverRegistrationScope(driverId: string): Promise<void> {
    const normalizedDriverId = driverId.trim();
    if (!normalizedDriverId) {
      return;
    }

    const client = this.activeTransactionClient;
    if (!client) {
      return;
    }

    await this.acquireAdvisoryXactLocks(client, [
      `iam.driver_device_session:2:driver:${normalizedDriverId}`,
    ]);
  }

  async withDeviceDriverLock<T>(
    scope: { deviceId: string; driverId: string },
    callback: () => Promise<T>,
  ): Promise<T> {
    return this.runWithInMemoryLock(async () => {
      if (!this.canUseTransactionalAdvisoryLock()) {
        return this.runWithFallbackRollbackGuard(callback);
      }

      return this.runWithTransaction(async (client) => {
        await this.acquireAdvisoryXactLocks(client, [
          `iam.driver_device_session:1:device:${scope.deviceId}`,
        ]);
        await this.acquireAdvisoryXactLocks(client, [
          `iam.driver_device_session:2:driver:${scope.driverId}`,
        ]);
        return callback();
      });
    });
  }

  private async executeQuery<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    const txClient = this.activeTransactionClient;
    if (txClient) {
      return txClient.query<T>(text, values as unknown[]);
    }
    return this.databaseService!.query<T>(text, values);
  }

  async saveInvitation(
    record: DriverDeviceInvitationRecord,
  ): Promise<DriverDeviceInvitationRecord> {
    if (!this.isEnabled()) {
      this.fallbackInvitations.set(record.invitationId, { ...record });
      return { ...record };
    }

    const txClient = this.activeTransactionClient;
    const pooledClient = txClient
      ? null
      : await this.databaseService!.connect();
    const client = txClient ?? pooledClient!;
    try {
      const result = await client.query<JsonRecordRow>(
        `
          INSERT INTO iam.driver_device_invitations (
            invitation_id,
            driver_id,
            registration_code_hash,
            status,
            expires_at,
            accepted_at,
            revoked_at,
            created_at,
            updated_at,
            record
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
          )
          ON CONFLICT (invitation_id) DO UPDATE SET
            status = EXCLUDED.status,
            accepted_at = EXCLUDED.accepted_at,
            revoked_at = EXCLUDED.revoked_at,
            updated_at = EXCLUDED.updated_at,
            record = EXCLUDED.record
          RETURNING record
        `,
        [
          record.invitationId,
          record.driverId,
          record.registrationCodeHash,
          record.status,
          record.expiresAt,
          record.acceptedAt,
          record.revokedAt,
          record.createdAt,
          record.updatedAt,
          JSON.stringify(record),
        ],
      );
      return this.parseRecord<DriverDeviceInvitationRecord>(
        result.rows[0]?.record,
        "iam.driver_device_invitations",
      );
    } catch (error) {
      if (txClient) {
        throw error;
      }
      this.reportPersistenceFailure(error, "saveInvitation");
      this.fallbackInvitations.set(record.invitationId, { ...record });
      return { ...record };
    } finally {
      pooledClient?.release();
    }
  }

  async findInvitationByCodeHash(
    hash: string,
  ): Promise<DriverDeviceInvitationRecord | null> {
    if (!this.isEnabled()) {
      for (const inv of this.fallbackInvitations.values()) {
        if (inv.registrationCodeHash === hash) {
          return { ...inv };
        }
      }
      return null;
    }

    const txClient = this.activeTransactionClient;
    const lockClause = txClient ? "FOR UPDATE" : "";
    try {
      const result = await this.executeQuery<JsonRecordRow>(
        `
          SELECT record
          FROM iam.driver_device_invitations
          WHERE registration_code_hash = $1
          LIMIT 1
          ${lockClause}
        `,
        [hash],
      );
      if (result.rows.length === 0) {
        return null;
      }
      return this.parseRecord<DriverDeviceInvitationRecord>(
        result.rows[0]?.record,
        "iam.driver_device_invitations",
      );
    } catch (error) {
      if (txClient) {
        throw error;
      }
      this.reportPersistenceFailure(error, "findInvitationByCodeHash");
      for (const inv of this.fallbackInvitations.values()) {
        if (inv.registrationCodeHash === hash) {
          return { ...inv };
        }
      }
      return null;
    }
  }

  async saveBinding(
    record: DriverDeviceBindingRecord,
  ): Promise<DriverDeviceBindingRecord> {
    if (!this.isEnabled()) {
      this.fallbackBindings.set(record.bindingId, { ...record });
      return { ...record };
    }

    const txClient = this.activeTransactionClient;
    const pooledClient = txClient
      ? null
      : await this.databaseService!.connect();
    const client = txClient ?? pooledClient!;
    try {
      const result = await client.query<JsonRecordRow>(
        `
          INSERT INTO iam.driver_device_bindings (
            binding_id,
            driver_id,
            device_id,
            device_label,
            status,
            issued_at,
            refreshed_at,
            revoked_at,
            rebound_from_binding_id,
            created_at,
            updated_at,
            record
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
          )
          ON CONFLICT (binding_id) DO UPDATE SET
            status = EXCLUDED.status,
            refreshed_at = EXCLUDED.refreshed_at,
            revoked_at = EXCLUDED.revoked_at,
            rebound_from_binding_id = EXCLUDED.rebound_from_binding_id,
            updated_at = EXCLUDED.updated_at,
            record = EXCLUDED.record
          RETURNING record
        `,
        [
          record.bindingId,
          record.driverId,
          record.deviceId,
          record.deviceLabel,
          record.status,
          record.issuedAt,
          record.refreshedAt,
          record.revokedAt,
          record.reboundFromBindingId ?? null,
          record.createdAt,
          record.updatedAt,
          JSON.stringify(record),
        ],
      );
      return this.parseRecord<DriverDeviceBindingRecord>(
        result.rows[0]?.record,
        "iam.driver_device_bindings",
      );
    } catch (error) {
      if (txClient) {
        throw error;
      }
      this.reportPersistenceFailure(error, "saveBinding");
      this.fallbackBindings.set(record.bindingId, { ...record });
      return { ...record };
    } finally {
      pooledClient?.release();
    }
  }

  async findBindingById(
    bindingId: string,
  ): Promise<DriverDeviceBindingRecord | null> {
    if (!this.isEnabled()) {
      const existing = this.fallbackBindings.get(bindingId);
      return existing ? { ...existing } : null;
    }

    const txClient = this.activeTransactionClient;
    const lockClause = txClient ? "FOR UPDATE" : "";
    try {
      const result = await this.executeQuery<JsonRecordRow>(
        `
          SELECT record
          FROM iam.driver_device_bindings
          WHERE binding_id = $1
          LIMIT 1
          ${lockClause}
        `,
        [bindingId],
      );
      if (result.rows.length === 0) {
        return null;
      }
      return this.parseRecord<DriverDeviceBindingRecord>(
        result.rows[0]?.record,
        "iam.driver_device_bindings",
      );
    } catch (error) {
      if (txClient) {
        throw error;
      }
      this.reportPersistenceFailure(error, "findBindingById");
      const existing = this.fallbackBindings.get(bindingId);
      return existing ? { ...existing } : null;
    }
  }

  async findActiveBindingByDeviceId(
    deviceId: string,
  ): Promise<DriverDeviceBindingRecord | null> {
    const activeBindings = await this.findActiveBindingsByDeviceId(deviceId);
    return activeBindings[0] ?? null;
  }

  async findActiveBindingsByDeviceId(
    deviceId: string,
  ): Promise<DriverDeviceBindingRecord[]> {
    if (!this.isEnabled()) {
      return Array.from(this.fallbackBindings.values())
        .filter(
          (binding) =>
            binding.deviceId === deviceId && binding.status === "active",
        )
        .map((binding) => ({ ...binding }));
    }

    const txClient = this.activeTransactionClient;
    const lockClause = txClient ? "FOR UPDATE" : "";
    try {
      const result = await this.executeQuery<JsonRecordRow>(
        `
          SELECT record
          FROM iam.driver_device_bindings
          WHERE device_id = $1 AND status = 'active'
          ORDER BY updated_at DESC, created_at DESC, binding_id DESC
          ${lockClause}
        `,
        [deviceId],
      );
      return result.rows.map((row) =>
        this.parseRecord<DriverDeviceBindingRecord>(
          row.record,
          "iam.driver_device_bindings",
        ),
      );
    } catch (error) {
      if (txClient) {
        throw error;
      }
      this.reportPersistenceFailure(error, "findActiveBindingsByDeviceId");
      return Array.from(this.fallbackBindings.values())
        .filter(
          (binding) =>
            binding.deviceId === deviceId && binding.status === "active",
        )
        .map((binding) => ({ ...binding }));
    }
  }

  async findActiveBindingsByDriverId(
    driverId: string,
  ): Promise<DriverDeviceBindingRecord[]> {
    if (!this.isEnabled()) {
      return Array.from(this.fallbackBindings.values())
        .filter(
          (binding) =>
            binding.driverId === driverId && binding.status === "active",
        )
        .map((binding) => ({ ...binding }));
    }

    const txClient = this.activeTransactionClient;
    const lockClause = txClient ? "FOR UPDATE" : "";
    try {
      const result = await this.executeQuery<JsonRecordRow>(
        `
          SELECT record
          FROM iam.driver_device_bindings
          WHERE driver_id = $1 AND status = 'active'
          ORDER BY updated_at DESC, created_at DESC, binding_id DESC
          ${lockClause}
        `,
        [driverId],
      );
      return result.rows.map((row) =>
        this.parseRecord<DriverDeviceBindingRecord>(
          row.record,
          "iam.driver_device_bindings",
        ),
      );
    } catch (error) {
      if (txClient) {
        throw error;
      }
      this.reportPersistenceFailure(error, "findActiveBindingsByDriverId");
      return Array.from(this.fallbackBindings.values())
        .filter(
          (binding) =>
            binding.driverId === driverId && binding.status === "active",
        )
        .map((binding) => ({ ...binding }));
    }
  }

  async findBindingsForDriver(
    driverId: string,
  ): Promise<DriverDeviceBindingRecord[]> {
    if (!this.isEnabled()) {
      return Array.from(this.fallbackBindings.values())
        .filter((b) => b.driverId === driverId)
        .map((b) => ({ ...b }));
    }

    const txClient = this.activeTransactionClient;
    const lockClause = txClient ? "FOR UPDATE" : "";
    try {
      const result = await this.executeQuery<JsonRecordRow>(
        `
          SELECT record
          FROM iam.driver_device_bindings
          WHERE driver_id = $1
          ORDER BY updated_at DESC
          ${lockClause}
        `,
        [driverId],
      );
      return result.rows.map((row) =>
        this.parseRecord<DriverDeviceBindingRecord>(
          row.record,
          "iam.driver_device_bindings",
        ),
      );
    } catch (error) {
      if (txClient) {
        throw error;
      }
      this.reportPersistenceFailure(error, "findBindingsForDriver");
      return Array.from(this.fallbackBindings.values())
        .filter((b) => b.driverId === driverId)
        .map((b) => ({ ...b }));
    }
  }

  async saveRefreshFamily(
    record: DriverRefreshFamilyRecord,
  ): Promise<DriverRefreshFamilyRecord> {
    if (!this.isEnabled()) {
      this.fallbackRefreshFamilies.set(record.familyId, { ...record });
      return { ...record };
    }

    const txClient = this.activeTransactionClient;
    const pooledClient = txClient
      ? null
      : await this.databaseService!.connect();
    const client = txClient ?? pooledClient!;
    try {
      const result = await client.query<JsonRecordRow>(
        `
          INSERT INTO iam.driver_refresh_families (
            family_id,
            binding_id,
            driver_id,
            current_token_hash,
            previous_token_hashes,
            rotation_counter,
            status,
            expires_at,
            revoked_at,
            compromised_at,
            created_at,
            updated_at,
            record
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
          )
          ON CONFLICT (family_id) DO UPDATE SET
            current_token_hash = EXCLUDED.current_token_hash,
            previous_token_hashes = EXCLUDED.previous_token_hashes,
            rotation_counter = EXCLUDED.rotation_counter,
            status = EXCLUDED.status,
            expires_at = EXCLUDED.expires_at,
            revoked_at = EXCLUDED.revoked_at,
            compromised_at = EXCLUDED.compromised_at,
            updated_at = EXCLUDED.updated_at,
            record = EXCLUDED.record
          RETURNING record
        `,
        [
          record.familyId,
          record.bindingId,
          record.driverId,
          record.currentTokenHash,
          record.previousTokenHashes,
          record.rotationCounter,
          record.status,
          record.expiresAt,
          record.revokedAt,
          record.compromisedAt,
          record.createdAt,
          record.updatedAt,
          JSON.stringify(record),
        ],
      );
      return this.parseRecord<DriverRefreshFamilyRecord>(
        result.rows[0]?.record,
        "iam.driver_refresh_families",
      );
    } catch (error) {
      if (txClient) {
        throw error;
      }
      this.reportPersistenceFailure(error, "saveRefreshFamily");
      this.fallbackRefreshFamilies.set(record.familyId, { ...record });
      return { ...record };
    } finally {
      pooledClient?.release();
    }
  }

  async findRefreshFamilyByTokenHash(
    tokenHash: string,
  ): Promise<{ family: DriverRefreshFamilyRecord; isReused: boolean } | null> {
    if (!this.isEnabled()) {
      for (const fam of this.fallbackRefreshFamilies.values()) {
        if (fam.currentTokenHash === tokenHash) {
          return { family: { ...fam }, isReused: false };
        }
        if (fam.previousTokenHashes?.includes(tokenHash)) {
          return { family: { ...fam }, isReused: true };
        }
      }
      return null;
    }

    const txClient = this.activeTransactionClient;
    const lockClause = txClient ? "FOR UPDATE" : "";
    try {
      const result = await this.executeQuery<
        JsonRecordRow & { is_reused: boolean }
      >(
        `
          SELECT record, (current_token_hash != $1) as is_reused
          FROM iam.driver_refresh_families
          WHERE current_token_hash = $1 OR $1 = ANY(previous_token_hashes)
          LIMIT 1
          ${lockClause}
        `,
        [tokenHash],
      );
      if (result.rows.length === 0) {
        return null;
      }
      const family = this.parseRecord<DriverRefreshFamilyRecord>(
        result.rows[0]?.record,
        "iam.driver_refresh_families",
      );
      return { family, isReused: Boolean(result.rows[0]?.is_reused) };
    } catch (error) {
      if (txClient) {
        throw error;
      }
      this.reportPersistenceFailure(error, "findRefreshFamilyByTokenHash");
      for (const fam of this.fallbackRefreshFamilies.values()) {
        if (fam.currentTokenHash === tokenHash) {
          return { family: { ...fam }, isReused: false };
        }
        if (fam.previousTokenHashes?.includes(tokenHash)) {
          return { family: { ...fam }, isReused: true };
        }
      }
      return null;
    }
  }

  async findActiveRefreshFamilyByBindingId(
    bindingId: string,
  ): Promise<DriverRefreshFamilyRecord | null> {
    const families = await this.findActiveRefreshFamiliesByBindingId(bindingId);
    return families[0] ?? null;
  }

  async findActiveRefreshFamiliesByBindingId(
    bindingId: string,
  ): Promise<DriverRefreshFamilyRecord[]> {
    if (!this.isEnabled()) {
      return Array.from(this.fallbackRefreshFamilies.values())
        .filter((fam) => fam.bindingId === bindingId && fam.status === "active")
        .map((fam) => ({ ...fam }));
    }

    const txClient = this.activeTransactionClient;
    const lockClause = txClient ? "FOR UPDATE" : "";
    try {
      const result = await this.executeQuery<JsonRecordRow>(
        `
          SELECT record
          FROM iam.driver_refresh_families
          WHERE binding_id = $1 AND status = 'active'
          ORDER BY updated_at DESC, created_at DESC, family_id DESC
          ${lockClause}
        `,
        [bindingId],
      );
      return result.rows.map((row) =>
        this.parseRecord<DriverRefreshFamilyRecord>(
          row.record,
          "iam.driver_refresh_families",
        ),
      );
    } catch (error) {
      if (txClient) {
        throw error;
      }
      this.reportPersistenceFailure(
        error,
        "findActiveRefreshFamiliesByBindingId",
      );
      return Array.from(this.fallbackRefreshFamilies.values())
        .filter((fam) => fam.bindingId === bindingId && fam.status === "active")
        .map((fam) => ({ ...fam }));
    }
  }

  async loadAllBindings(): Promise<DriverDeviceBindingRecord[]> {
    if (!this.isEnabled()) {
      return Array.from(this.fallbackBindings.values()).map((b) => ({ ...b }));
    }

    try {
      const result = await this.executeQuery<JsonRecordRow>(
        `SELECT record FROM iam.driver_device_bindings ORDER BY updated_at DESC`,
      );
      return result.rows.map((row) =>
        this.parseRecord<DriverDeviceBindingRecord>(
          row.record,
          "iam.driver_device_bindings",
        ),
      );
    } catch (error) {
      this.reportPersistenceFailure(error, "loadAllBindings");
      return Array.from(this.fallbackBindings.values()).map((b) => ({ ...b }));
    }
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Driver device session persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
