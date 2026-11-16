import { Injectable, Optional } from "@nestjs/common";

import { DatabaseService } from "../../common/db";
import type { EncryptedTotpSecret } from "./totp-secret-cipher";

export interface TotpCredentialRecord {
  principalId: string;
  secretCiphertext: EncryptedTotpSecret;
  secretKeyVersion: string;
  confirmedAt: string | null;
  lastUsedStep: number | null;
}

export interface TotpRecoveryCodeInput {
  recoveryCodeId: string;
  codeHash: string;
}

interface FallbackRecoveryCode {
  codeHash: string;
  usedAt: string | null;
}

/**
 * Persistence for iam.identity_totp_credentials / identity_totp_recovery_codes
 * (SA/SD docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md
 * §2/§7). Falls back to an in-memory store when no DATABASE_URL is configured,
 * matching IdentityRepository's fallback convention so unit tests don't need a
 * real Postgres.
 */
@Injectable()
export class TotpCredentialRepository {
  private readonly fallbackCredentials = new Map<
    string,
    TotpCredentialRecord
  >();
  private readonly fallbackRecoveryCodes = new Map<
    string,
    Map<string, FallbackRecoveryCode>
  >();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  private isEnabled(): boolean {
    return Boolean(this.databaseService?.isEnabled());
  }

  private encodeEnvelope(envelope: EncryptedTotpSecret): Buffer {
    return Buffer.from(JSON.stringify(envelope), "utf8");
  }

  private decodeEnvelope(raw: Buffer): EncryptedTotpSecret {
    return JSON.parse(raw.toString("utf8")) as EncryptedTotpSecret;
  }

  /** Always resets confirmed_at/last_used_step: a fresh enroll (first time,
   * or re-enroll after a lost-device recovery) must invalidate any prior
   * secret before the new one can be confirmed (SA/SD §7). */
  async upsertPendingSecret(
    principalId: string,
    envelope: EncryptedTotpSecret,
    secretKeyVersion: string,
  ): Promise<void> {
    if (!this.isEnabled()) {
      this.fallbackCredentials.set(principalId, {
        principalId,
        secretCiphertext: envelope,
        secretKeyVersion,
        confirmedAt: null,
        lastUsedStep: null,
      });
      return;
    }
    const now = new Date().toISOString();
    await this.databaseService!.query(
      `INSERT INTO iam.identity_totp_credentials
         (principal_id, secret_ciphertext, secret_key_version, confirmed_at, last_used_step, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, NULL, $4, $4)
       ON CONFLICT (principal_id) DO UPDATE SET
         secret_ciphertext = EXCLUDED.secret_ciphertext,
         secret_key_version = EXCLUDED.secret_key_version,
         confirmed_at = NULL,
         last_used_step = NULL,
         updated_at = EXCLUDED.updated_at`,
      [principalId, this.encodeEnvelope(envelope), secretKeyVersion, now],
    );
  }

  async findCredential(
    principalId: string,
  ): Promise<TotpCredentialRecord | null> {
    if (!this.isEnabled()) {
      const record = this.fallbackCredentials.get(principalId);
      return record ? { ...record } : null;
    }
    const result = await this.databaseService!.query<{
      principal_id: string;
      secret_ciphertext: Buffer;
      secret_key_version: string;
      confirmed_at: string | null;
      last_used_step: string | number | null;
    }>(
      `SELECT principal_id, secret_ciphertext, secret_key_version, confirmed_at, last_used_step
         FROM iam.identity_totp_credentials
        WHERE principal_id = $1`,
      [principalId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      principalId: row.principal_id,
      secretCiphertext: this.decodeEnvelope(row.secret_ciphertext),
      secretKeyVersion: row.secret_key_version,
      confirmedAt: row.confirmed_at,
      lastUsedStep:
        row.last_used_step === null ? null : Number(row.last_used_step),
    };
  }

  async confirmCredential(
    principalId: string,
    confirmedAtIso: string,
    step: number,
  ): Promise<void> {
    if (!this.isEnabled()) {
      const record = this.fallbackCredentials.get(principalId);
      if (record) {
        record.confirmedAt = confirmedAtIso;
        record.lastUsedStep = step;
      }
      return;
    }
    await this.databaseService!.query(
      `UPDATE iam.identity_totp_credentials
          SET confirmed_at = $2, last_used_step = $3, updated_at = $2
        WHERE principal_id = $1`,
      [principalId, confirmedAtIso, step],
    );
  }

  async updateLastUsedStep(principalId: string, step: number): Promise<void> {
    if (!this.isEnabled()) {
      const record = this.fallbackCredentials.get(principalId);
      if (record) {
        record.lastUsedStep = step;
      }
      return;
    }
    await this.databaseService!.query(
      `UPDATE iam.identity_totp_credentials
          SET last_used_step = $2, updated_at = now()
        WHERE principal_id = $1`,
      [principalId, step],
    );
  }

  /** Regenerating always invalidates every previously issued code (SA/SD
   * §7: a confirm() always replaces the full recovery-code set). */
  async replaceRecoveryCodes(
    principalId: string,
    codes: TotpRecoveryCodeInput[],
  ): Promise<void> {
    if (!this.isEnabled()) {
      const map = new Map<string, FallbackRecoveryCode>();
      for (const code of codes) {
        map.set(code.recoveryCodeId, { codeHash: code.codeHash, usedAt: null });
      }
      this.fallbackRecoveryCodes.set(principalId, map);
      return;
    }
    await this.databaseService!.withTransaction(async (client) => {
      await client.query(
        `DELETE FROM iam.identity_totp_recovery_codes WHERE principal_id = $1`,
        [principalId],
      );
      const now = new Date().toISOString();
      for (const code of codes) {
        await client.query(
          `INSERT INTO iam.identity_totp_recovery_codes
             (recovery_code_id, principal_id, code_hash, used_at, created_at)
           VALUES ($1, $2, $3, NULL, $4)`,
          [code.recoveryCodeId, principalId, code.codeHash, now],
        );
      }
    });
  }

  /**
   * Atomically consumes a single recovery code and -- only if that
   * succeeded -- deletes the TOTP credential and every remaining recovery
   * code, forcing a full re-enroll (SA/SD §7: "復原碼單次消耗後立即失效並
   * 強制重新註冊；...舊 secret 失效"). The UPDATE's `used_at IS NULL` guard
   * means two concurrent requests racing the same code can never both
   * succeed. Returns false (no mutation) when the code is unknown or was
   * already used.
   */
  async consumeRecoveryCodeAndInvalidate(
    principalId: string,
    codeHash: string,
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      const codes = this.fallbackRecoveryCodes.get(principalId);
      if (!codes) return false;
      let consumed = false;
      for (const entry of codes.values()) {
        if (entry.codeHash === codeHash && entry.usedAt === null) {
          entry.usedAt = new Date().toISOString();
          consumed = true;
          break;
        }
      }
      if (!consumed) return false;
      this.fallbackCredentials.delete(principalId);
      this.fallbackRecoveryCodes.delete(principalId);
      return true;
    }
    return this.databaseService!.withTransaction(async (client) => {
      const result = await client.query<{ recovery_code_id: string }>(
        `UPDATE iam.identity_totp_recovery_codes
            SET used_at = now()
          WHERE principal_id = $1 AND code_hash = $2 AND used_at IS NULL
          RETURNING recovery_code_id`,
        [principalId, codeHash],
      );
      if (result.rows.length === 0) return false;
      await client.query(
        `DELETE FROM iam.identity_totp_recovery_codes WHERE principal_id = $1`,
        [principalId],
      );
      await client.query(
        `DELETE FROM iam.identity_totp_credentials WHERE principal_id = $1`,
        [principalId],
      );
      return true;
    });
  }
}
