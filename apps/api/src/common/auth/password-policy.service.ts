import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";

export type PasswordPolicyRejectionReason =
  | "TOO_SHORT"
  | "TOO_LONG"
  | "COMMON_OR_BREACHED";

export interface PasswordPolicyContext {
  /**
   * Whether the principal already has a *confirmed* TOTP credential. SA/SD
   * §3 (docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md)
   * ties the minimum length to this, not to the role's eventual MFA
   * requirement: an unconfirmed/未完成註冊 TOTP secret does not count.
   */
  totpEnabled: boolean;
}

export type PasswordPolicyResult =
  | { valid: true }
  | { valid: false; reason: PasswordPolicyRejectionReason };

/**
 * Carries only a classification code, never the submitted password or any
 * account/principal identifier, so callers can surface it to the user
 * without that surfacing doubling as an account-status oracle.
 */
export class PasswordPolicyViolationError extends Error {
  public readonly code = "PASSWORD_POLICY_VIOLATION";
  public readonly reason: PasswordPolicyRejectionReason;

  constructor(reason: PasswordPolicyRejectionReason) {
    super("Password does not meet the policy requirements");
    this.name = "PasswordPolicyViolationError";
    this.reason = reason;
  }
}

// NIST SP 800-63B-4 (2026 revision) per SA/SD §3: single-factor minimum is
// higher; once TOTP is confirmed, the shorter minimum applies. No composition
// rules (no forced upper/lower/digit/symbol mix).
export const PASSWORD_MIN_LENGTH_SINGLE_FACTOR = 15;
export const PASSWORD_MIN_LENGTH_WITH_TOTP = 8;
// Upper bound is a hashing-cost DoS guard, not a security requirement.
export const PASSWORD_MAX_LENGTH = 128;

const DEFAULT_COMMON_PASSWORDS_PATH = join(
  __dirname,
  "data",
  "common-passwords.txt",
);

function loadCommonPasswords(path: string): Set<string> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to load the offline common/breached password list from ${path}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const entries = new Set<string>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    entries.add(trimmed.toLowerCase());
  }
  return entries;
}

function normalizeForListLookup(password: string): string {
  return password.trim().toLowerCase();
}

/**
 * Pure, offline password policy check (SA/SD §3). The list comparison reads
 * a file bundled with the service at construction time; it never performs
 * any network I/O (no k-anonymity / HaveIBeenPwned-style API calls), by
 * design, so the check keeps working in network-restricted deployments and
 * never sends user-entered passwords to a third party.
 */
@Injectable()
export class PasswordPolicyService {
  private readonly commonPasswords: Set<string>;

  constructor(commonPasswordsPath: string = DEFAULT_COMMON_PASSWORDS_PATH) {
    this.commonPasswords = loadCommonPasswords(commonPasswordsPath);
  }

  minLength(context: PasswordPolicyContext): number {
    return context.totpEnabled
      ? PASSWORD_MIN_LENGTH_WITH_TOTP
      : PASSWORD_MIN_LENGTH_SINGLE_FACTOR;
  }

  evaluate(
    password: string,
    context: PasswordPolicyContext,
  ): PasswordPolicyResult {
    const minLength = this.minLength(context);

    if (password.length < minLength) {
      return { valid: false, reason: "TOO_SHORT" };
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      return { valid: false, reason: "TOO_LONG" };
    }
    if (this.commonPasswords.has(normalizeForListLookup(password))) {
      return { valid: false, reason: "COMMON_OR_BREACHED" };
    }

    return { valid: true };
  }

  /** Same check as `evaluate`, thrown as `PasswordPolicyViolationError` for call sites that prefer exceptions. */
  assertValid(password: string, context: PasswordPolicyContext): void {
    const result = this.evaluate(password, context);
    if (!result.valid) {
      throw new PasswordPolicyViolationError(result.reason);
    }
  }
}
