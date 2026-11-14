import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { generate, generateSecret } from "otplib";

import { TotpCredentialRepository } from "./totp-credential.repository";
import { TotpSecretCipher } from "./totp-secret-cipher";

// otplib >=13 replaced the v10-12 `authenticator` singleton class with a
// functional API (confirmed against the published v13.6.0 source,
// packages/otplib/src/index.ts: generateSecret/generateURI/generate/
// generateSync/verify/verifySync -- no `authenticator` export). The old
// `authenticator.checkDelta`/`authenticator.keyuri` calls this file used
// before do not exist without the separate @otplib/v12-adapter package,
// which is not a declared dependency. This file therefore:
//  - never imports `authenticator`;
//  - builds the otpauth:// URI by hand (RFC 6238 / Google Authenticator
//    format is a stable, simple string spec, independent of otplib's
//    internal API) instead of calling `generateURI`;
//  - implements its own window + anti-replay step matching by calling
//    `generate({ secret, epoch })` once per candidate step (`epoch` is in
//    seconds in v13, per packages/otplib/src/types.ts, unlike v10-12's
//    millisecond `authenticator.options.epoch`) rather than using v13's
//    own `verify`/`epochTolerance`, so the exact `{valid, delta}` result
//    shape of `verify` doesn't matter here.
const TOTP_STEP_SECONDS = 30;
const TOTP_WINDOW_STEPS = 1; // tolerates +/-1 step (~30s) of clock drift.
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

function buildOtpauthUri(
  accountLabel: string,
  issuer: string,
  secret: string,
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountLabel)}`;
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Checks `code` against every step in the [-TOTP_WINDOW_STEPS,
 * +TOTP_WINDOW_STEPS] window around now, each generated independently via
 * `generate({ secret, epoch })`. Returns the absolute step number the code
 * matched, or null if it matched none of them. This is the anti-replay
 * primitive: callers persist the returned step and reject any future code
 * whose matched step is <= the last one used.
 */
async function matchTotpStep(
  secret: string,
  code: string,
): Promise<number | null> {
  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return null;
  }
  const nowStep = currentStep();
  for (
    let offset = -TOTP_WINDOW_STEPS;
    offset <= TOTP_WINDOW_STEPS;
    offset++
  ) {
    const step = nowStep + offset;
    // otplib@13's `epoch` option is in seconds (confirmed against the
    // published v13.6.0 source, packages/otplib/src/types.ts), unlike the
    // v10-12 `authenticator.options.epoch`, which was milliseconds.
    const candidate = await generate({
      secret,
      epoch: step * TOTP_STEP_SECONDS,
    });
    if (constantTimeEquals(candidate, normalizedCode)) {
      return step;
    }
  }
  return null;
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
    const secret = generateSecret();
    const envelope = cipher.encrypt(secret, principalId);
    await this.repository.upsertPendingSecret(
      principalId,
      envelope,
      cipher.currentKeyVersion,
    );
    const otpauthUri = buildOtpauthUri(accountLabel, TOTP_ISSUER, secret);
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
    const matchedStep = await matchTotpStep(secret, code);
    if (matchedStep === null) {
      throw new TotpInvalidCodeError("Invalid TOTP confirmation code.");
    }

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
    const matchedStep = await matchTotpStep(secret, code);
    if (matchedStep === null) {
      throw new TotpInvalidCodeError();
    }

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
