import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { authenticator } from "otplib";

import { TotpCredentialRepository } from "./totp-credential.repository";
import { TotpSecretCipher } from "./totp-secret-cipher";

// RFC 6238 defaults (30s step, 6 digits); window=1 tolerates one step of
// clock drift in either direction, matching the "TOTP code 時間窗驗證" line
// in SA/SD §7. otplib's `authenticator` is a shared singleton and this is
// the only module in the repo that touches it, so setting these options
// once at import time is safe.
authenticator.options = { step: 30, digits: 6, window: 1 };

const TOTP_STEP_SECONDS = 30;
const TOTP_ISSUER = "DRTS";
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars (excludes 0/O/1/I); 256 % 32 === 0 so byte % 32 is unbiased.

export class TotpEnrollmentNotFoundError extends Error {
  constructor(message = "No pending TOTP enrollment for this principal.") {
    super(message);
    this.name = "TotpEnrollmentNotFoundError";
  }
}

export class TotpSecretAlreadyConfirmedError extends Error {
  constructor(
    message = "TOTP is already confirmed for this principal; re-enroll to replace it.",
  ) {
    super(message);
    this.name = "TotpSecretAlreadyConfirmedError";
  }
}

export class TotpInvalidCodeError extends Error {
  constructor(message = "Invalid TOTP code.") {
    super(message);
    this.name = "TotpInvalidCodeError";
  }
}

export class TotpCodeReplayedError extends Error {
  constructor(message = "TOTP code has already been used.") {
    super(message);
    this.name = "TotpCodeReplayedError";
  }
}

export class TotpSecretNotConfirmedError extends Error {
  constructor(
    message = "TOTP is not enrolled or not yet confirmed for this principal.",
  ) {
    super(message);
    this.name = "TotpSecretNotConfirmedError";
  }
}

export class TotpRecoveryCodeInvalidError extends Error {
  constructor(message = "Recovery code is invalid or already used.") {
    super(message);
    this.name = "TotpRecoveryCodeInvalidError";
  }
}

export interface TotpEnrollmentResult {
  /** otpauth://totp/... URI for the frontend to render as a QR code. */
  otpauthUri: string;
  /** Base32 secret, returned once for the "manual entry" fallback. Callers
   * must never log or persist this in plaintext. */
  secret: string;
}

export interface TotpConfirmationResult {
  /** Plaintext recovery codes, returned once. Only hashes are persisted. */
  recoveryCodes: string[];
}

function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

function generateRecoveryCode(): string {
  const length = 16;
  const bytes = randomBytes(length);
  let raw = "";
  for (let i = 0; i < length; i++) {
    raw += RECOVERY_CODE_ALPHABET[bytes[i] % RECOVERY_CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function currentStep(): number {
  return Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
}

/**
 * TOTP enrollment, login-time verification, and recovery-code consumption
 * (SA/SD docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md
 * §7). `TotpSecretCipher` is constructed fresh inside each method that needs
 * it (not constructor-injected) so this service -- and anything that depends
 * on it -- can still be registered as a normal Nest provider and bootstrap
 * without TOTP_ENCRYPTION_KEYS_JSON being set; the fail-closed check only
 * fires when an enroll/confirm/login call actually happens, mirroring how
 * PasswordHashingService is used via `new PasswordHashingService()` at the
 * point of use rather than through DI.
 */
@Injectable()
export class TotpService {
  constructor(private readonly repository: TotpCredentialRepository) {}

  async enroll(
    principalId: string,
    accountLabel: string,
  ): Promise<TotpEnrollmentResult> {
    const cipher = new TotpSecretCipher();
    const secret = authenticator.generateSecret();
    const envelope = cipher.encrypt(secret, principalId);
    await this.repository.upsertPendingSecret(
      principalId,
      envelope,
      cipher.currentKeyVersion,
    );
    const otpauthUri = authenticator.keyuri(accountLabel, TOTP_ISSUER, secret);
    return { otpauthUri, secret };
  }

  /**
   * Confirms a pending enrollment and -- only on success -- activates it and
   * issues a fresh set of recovery codes. An unconfirmed secret can never
   * reach this far being usable for login (see verifyLoginCode): confirm()
   * is the only path that sets confirmed_at.
   */
  async confirm(
    principalId: string,
    code: string,
  ): Promise<TotpConfirmationResult> {
    const credential = await this.repository.findCredential(principalId);
    if (!credential) {
      throw new TotpEnrollmentNotFoundError();
    }
    if (credential.confirmedAt) {
      throw new TotpSecretAlreadyConfirmedError();
    }

    const cipher = new TotpSecretCipher();
    const secret = cipher.decrypt(credential.secretCiphertext, principalId);
    const delta = authenticator.checkDelta(code, secret);
    if (delta === null) {
      throw new TotpInvalidCodeError("Invalid TOTP confirmation code.");
    }

    const matchedStep = currentStep() + delta;
    const confirmedAtIso = new Date().toISOString();
    await this.repository.confirmCredential(
      principalId,
      confirmedAtIso,
      matchedStep,
    );

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      generateRecoveryCode(),
    );
    await this.repository.replaceRecoveryCodes(
      principalId,
      recoveryCodes.map((recoveryCode) => ({
        recoveryCodeId: randomBytes(16).toString("hex"),
        codeHash: hashRecoveryCode(recoveryCode),
      })),
    );

    return { recoveryCodes };
  }

  /**
   * Verifies a 6-digit TOTP code at login time. Rejects an unconfirmed or
   * missing secret (SA/SD §7: "未確認的 secret 不能用於登入") and rejects
   * replay of an already-consumed time step, including the exact step just
   * consumed by a prior confirm()/verifyLoginCode() call.
   */
  async verifyLoginCode(principalId: string, code: string): Promise<void> {
    const credential = await this.repository.findCredential(principalId);
    if (!credential || !credential.confirmedAt) {
      throw new TotpSecretNotConfirmedError();
    }

    const cipher = new TotpSecretCipher();
    const secret = cipher.decrypt(credential.secretCiphertext, principalId);
    const delta = authenticator.checkDelta(code, secret);
    if (delta === null) {
      throw new TotpInvalidCodeError();
    }

    const matchedStep = currentStep() + delta;
    if (
      credential.lastUsedStep !== null &&
      matchedStep <= credential.lastUsedStep
    ) {
      throw new TotpCodeReplayedError();
    }

    await this.repository.updateLastUsedStep(principalId, matchedStep);
  }

  /**
   * Consumes a one-time recovery code. On success this always invalidates
   * the whole TOTP credential (old secret + every remaining recovery code),
   * forcing the caller to redirect the principal back through enroll().
   */
  async verifyRecoveryCode(principalId: string, code: string): Promise<void> {
    const consumed = await this.repository.consumeRecoveryCodeAndInvalidate(
      principalId,
      hashRecoveryCode(code),
    );
    if (!consumed) {
      throw new TotpRecoveryCodeInvalidError();
    }
  }
}
