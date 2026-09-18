import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  DriverDeviceBindingRecord,
  DriverDeviceInvitationRecord,
  DriverRefreshFamilyRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

@Injectable()
export class DriverDeviceSessionRepository {
  private readonly logger = new Logger(DriverDeviceSessionRepository.name);

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

  async saveInvitation(
    record: DriverDeviceInvitationRecord,
  ): Promise<DriverDeviceInvitationRecord> {
    if (!this.isEnabled()) {
      this.fallbackInvitations.set(record.invitationId, { ...record });
      return { ...record };
    }

    const client = await this.databaseService!.connect();
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
      this.reportPersistenceFailure(error, "saveInvitation");
      this.fallbackInvitations.set(record.invitationId, { ...record });
      return { ...record };
    } finally {
      client.release();
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

    try {
      const result = await this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM iam.driver_device_invitations
          WHERE registration_code_hash = $1
          LIMIT 1
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

    const client = await this.databaseService!.connect();
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
      this.reportPersistenceFailure(error, "saveBinding");
      this.fallbackBindings.set(record.bindingId, { ...record });
      return { ...record };
    } finally {
      client.release();
    }
  }

  async findBindingById(
    bindingId: string,
  ): Promise<DriverDeviceBindingRecord | null> {
    if (!this.isEnabled()) {
      const existing = this.fallbackBindings.get(bindingId);
      return existing ? { ...existing } : null;
    }

    try {
      const result = await this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM iam.driver_device_bindings
          WHERE binding_id = $1
          LIMIT 1
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
      this.reportPersistenceFailure(error, "findBindingById");
      const existing = this.fallbackBindings.get(bindingId);
      return existing ? { ...existing } : null;
    }
  }

  async findActiveBindingByDeviceId(
    deviceId: string,
  ): Promise<DriverDeviceBindingRecord | null> {
    if (!this.isEnabled()) {
      for (const binding of this.fallbackBindings.values()) {
        if (binding.deviceId === deviceId && binding.status === "active") {
          return { ...binding };
        }
      }
      return null;
    }

    try {
      const result = await this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM iam.driver_device_bindings
          WHERE device_id = $1 AND status = 'active'
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [deviceId],
      );
      if (result.rows.length === 0) {
        return null;
      }
      return this.parseRecord<DriverDeviceBindingRecord>(
        result.rows[0]?.record,
        "iam.driver_device_bindings",
      );
    } catch (error) {
      this.reportPersistenceFailure(error, "findActiveBindingByDeviceId");
      for (const binding of this.fallbackBindings.values()) {
        if (binding.deviceId === deviceId && binding.status === "active") {
          return { ...binding };
        }
      }
      return null;
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

    try {
      const result = await this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM iam.driver_device_bindings
          WHERE driver_id = $1
          ORDER BY updated_at DESC
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

    const client = await this.databaseService!.connect();
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
      this.reportPersistenceFailure(error, "saveRefreshFamily");
      this.fallbackRefreshFamilies.set(record.familyId, { ...record });
      return { ...record };
    } finally {
      client.release();
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

    try {
      const result = await this.databaseService!.query<
        JsonRecordRow & { is_reused: boolean }
      >(
        `
          SELECT record, (current_token_hash != $1) as is_reused
          FROM iam.driver_refresh_families
          WHERE current_token_hash = $1 OR $1 = ANY(previous_token_hashes)
          LIMIT 1
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
    if (!this.isEnabled()) {
      for (const fam of this.fallbackRefreshFamilies.values()) {
        if (fam.bindingId === bindingId && fam.status === "active") {
          return { ...fam };
        }
      }
      return null;
    }

    try {
      const result = await this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM iam.driver_refresh_families
          WHERE binding_id = $1 AND status = 'active'
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [bindingId],
      );
      if (result.rows.length === 0) {
        return null;
      }
      return this.parseRecord<DriverRefreshFamilyRecord>(
        result.rows[0]?.record,
        "iam.driver_refresh_families",
      );
    } catch (error) {
      this.reportPersistenceFailure(
        error,
        "findActiveRefreshFamilyByBindingId",
      );
      for (const fam of this.fallbackRefreshFamilies.values()) {
        if (fam.bindingId === bindingId && fam.status === "active") {
          return { ...fam };
        }
      }
      return null;
    }
  }

  async loadAllBindings(): Promise<DriverDeviceBindingRecord[]> {
    if (!this.isEnabled()) {
      return Array.from(this.fallbackBindings.values()).map((b) => ({ ...b }));
    }

    try {
      const result = await this.databaseService!.query<JsonRecordRow>(
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
