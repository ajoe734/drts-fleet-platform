import { Injectable, Optional } from "@nestjs/common";

import { DatabaseService } from "../db/database.service";

/**
 * Progressive account-dimension lockout state for `identity_password_credentials`
 * (SA/SD §4, docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md):
 * 5 failures locks 5 minutes, 10 locks 30 minutes, 15 locks 24 hours. Ordered
 * highest-threshold-first so the first match in `computeLockedUntil` wins.
 */
export const PASSWORD_LOGIN_LOCKOUT_THRESHOLDS = [
  { attempts: 15, lockMs: 24 * 60 * 60 * 1000 },
  { attempts: 10, lockMs: 30 * 60 * 1000 },
  { attempts: 5, lockMs: 5 * 60 * 1000 },
] as const;

export interface PasswordLoginLockoutState {
  failedAttempts: number;
  lockedUntil: string | null;
}

export interface RehashedPasswordCredential {
  hash: string;
  algo: string;
  pepperVersion: string;
}

const EMPTY_STATE: PasswordLoginLockoutState = {
  failedAttempts: 0,
  lockedUntil: null,
};

/**
 * Owns only the mutable lockout columns (`failed_attempts`, `locked_until`)
 * and opportunistic-rehash columns (`password_hash`, `password_algo`,
 * `pepper_version`) of `iam.identity_password_credentials`, via direct SQL
 * against the existing table rather than through `IdentityRepository`
 * (PWD-LOGIN-005's `write_scopes` do not include `identity.repository.ts`;
 * see the task handoff for why this stays a thin, table-scoped sibling
 * instead of a new repository method). `DatabaseService` is `@Global()`, so
 * no module wiring is required to inject it.
 */
@Injectable()
export class PasswordLoginLockoutService {
  private readonly fallbackState = new Map<string, PasswordLoginLockoutState>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled(): boolean {
    return this.databaseService?.isEnabled() ?? false;
  }

  isLocked(state: PasswordLoginLockoutState, now: Date = new Date()): boolean {
    return Boolean(
      state.lockedUntil && Date.parse(state.lockedUntil) > now.getTime(),
    );
  }

  private computeLockedUntil(
    failedAttempts: number,
    previousLockedUntil: string | null,
    now: Date,
  ): string | null {
    const threshold = PASSWORD_LOGIN_LOCKOUT_THRESHOLDS.find(
      (candidate) => failedAttempts >= candidate.attempts,
    );
    if (!threshold) {
      return previousLockedUntil;
    }
    return new Date(now.getTime() + threshold.lockMs).toISOString();
  }

  async getState(principalId: string): Promise<PasswordLoginLockoutState> {
    if (!this.isEnabled()) {
      return { ...(this.fallbackState.get(principalId) ?? EMPTY_STATE) };
    }
    const result = await this.databaseService!.query<{
      failed_attempts: number;
      locked_until: string | null;
    }>(
      `SELECT failed_attempts, locked_until
         FROM iam.identity_password_credentials
        WHERE principal_id = $1`,
      [principalId],
    );
    const row = result.rows[0];
    return row
      ? { failedAttempts: row.failed_attempts, lockedUntil: row.locked_until }
      : { ...EMPTY_STATE };
  }

  /** Atomic per-row increment; the threshold check reads the post-increment
   * count so concurrent failures from the same account can never under-lock. */
  async recordFailure(
    principalId: string,
    now: Date = new Date(),
  ): Promise<PasswordLoginLockoutState> {
    if (!this.isEnabled()) {
      const current = this.fallbackState.get(principalId) ?? EMPTY_STATE;
      const failedAttempts = current.failedAttempts + 1;
      const next: PasswordLoginLockoutState = {
        failedAttempts,
        lockedUntil: this.computeLockedUntil(
          failedAttempts,
          current.lockedUntil,
          now,
        ),
      };
      this.fallbackState.set(principalId, next);
      return { ...next };
    }

    const result = await this.databaseService!.query<{
      failed_attempts: number;
      locked_until: string | null;
    }>(
      `UPDATE iam.identity_password_credentials
          SET failed_attempts = failed_attempts + 1,
              locked_until = CASE
                WHEN failed_attempts + 1 >= 15 THEN $2::timestamptz + interval '24 hours'
                WHEN failed_attempts + 1 >= 10 THEN $2::timestamptz + interval '30 minutes'
                WHEN failed_attempts + 1 >= 5 THEN $2::timestamptz + interval '5 minutes'
                ELSE locked_until
              END,
              updated_at = $2::timestamptz
        WHERE principal_id = $1
        RETURNING failed_attempts, locked_until`,
      [principalId, now.toISOString()],
    );
    const row = result.rows[0];
    return row
      ? { failedAttempts: row.failed_attempts, lockedUntil: row.locked_until }
      : { ...EMPTY_STATE };
  }

  async recordSuccess(
    principalId: string,
    now: Date = new Date(),
  ): Promise<void> {
    if (!this.isEnabled()) {
      this.fallbackState.set(principalId, { ...EMPTY_STATE });
      return;
    }
    await this.databaseService!.query(
      `UPDATE iam.identity_password_credentials
          SET failed_attempts = 0, locked_until = NULL, updated_at = $2::timestamptz
        WHERE principal_id = $1`,
      [principalId, now.toISOString()],
    );
  }

  /** Opportunistic rehash (SA/SD §2): writes a freshly computed hash/pepper
   * version for a credential that `PasswordHashingService.verify` already
   * flagged `needsRehash`. Never touches the lockout columns above. */
  async updateCredentialHash(
    principalId: string,
    credential: RehashedPasswordCredential,
    now: Date = new Date(),
  ): Promise<void> {
    if (!this.isEnabled()) {
      // No-DB fallback mode has no independent credential store here:
      // `IdentityRepository`'s own fallback map is private, and the login
      // path only consults it for the hash/pepper the *next* verify needs
      // to match the credential used by the current attempt's failure/success
      // bookkeeping above. Opportunistic rehash is a storage optimization,
      // not a correctness requirement for the login decision itself, so
      // skipping the write in fallback/test mode is safe here.
      return;
    }
    await this.databaseService!.query(
      `UPDATE iam.identity_password_credentials
          SET password_hash = $2, password_algo = $3, pepper_version = $4, updated_at = $5::timestamptz
        WHERE principal_id = $1`,
      [
        principalId,
        credential.hash,
        credential.algo,
        credential.pepperVersion,
        now.toISOString(),
      ],
    );
  }
}
