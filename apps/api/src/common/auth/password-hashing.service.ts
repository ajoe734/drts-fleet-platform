import { createHmac } from "node:crypto";
import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

export type PasswordAlgo = "argon2id";

export interface PasswordHashResult {
  hash: string;
  algo: PasswordAlgo;
  pepperVersion: string;
}

export interface StoredPasswordHash {
  hash: string;
  pepperVersion: string;
}

export interface PasswordVerifyResult {
  valid: boolean;
  needsRehash: boolean;
}

/**
 * Thrown when no usable password pepper is configured. Nest instantiates
 * providers at module bootstrap, so this constructor-time throw is what makes
 * the service fail-closed at service startup rather than on first use
 * (Stage 1.5 §15.2, SA/SD docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md).
 */
export class PasswordPepperNotConfiguredError extends Error {
  public readonly code = "PASSWORD_PEPPER_NOT_CONFIGURED";
  public readonly requiredEnv: readonly string[];

  constructor(message: string, requiredEnv: readonly string[]) {
    super(message);
    this.name = "PasswordPepperNotConfiguredError";
    this.requiredEnv = [...requiredEnv];
  }
}

const REQUIRED_PEPPER_ENV = [
  "PASSWORD_PEPPER_SECRETS_JSON",
  "PASSWORD_PEPPER_CURRENT_VERSION",
] as const;

// OWASP Password Storage Cheat Sheet Argon2id minimum baseline (see SA/SD §
// around "Argon2id 參數" for why this, rather than RFC 9106 §4, was chosen as
// the launch starting point pending real container memory measurement).
const ARGON2_PARAMS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

type EnvLike = Record<string, string | undefined>;

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePepperRing(env: EnvLike): Map<string, string> {
  const raw = normalize(env.PASSWORD_PEPPER_SECRETS_JSON);
  if (!raw) {
    return new Map();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new PasswordPepperNotConfiguredError(
      `PASSWORD_PEPPER_SECRETS_JSON must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      REQUIRED_PEPPER_ENV,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new PasswordPepperNotConfiguredError(
      "PASSWORD_PEPPER_SECRETS_JSON must be a JSON object mapping pepper_version to its secret value",
      REQUIRED_PEPPER_ENV,
    );
  }

  const ring = new Map<string, string>();
  for (const [version, secret] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (typeof secret !== "string" || secret.trim().length === 0) {
      throw new PasswordPepperNotConfiguredError(
        `PASSWORD_PEPPER_SECRETS_JSON entry for pepper_version "${version}" must be a non-empty string secret`,
        REQUIRED_PEPPER_ENV,
      );
    }
    ring.set(version, secret);
  }
  return ring;
}

@Injectable()
export class PasswordHashingService {
  private readonly pepperByVersion: Map<string, string>;
  private readonly currentVersion: string;

  constructor(env: EnvLike = process.env) {
    const ring = parsePepperRing(env);
    const currentVersion = normalize(env.PASSWORD_PEPPER_CURRENT_VERSION);

    if (ring.size === 0 || !currentVersion) {
      throw new PasswordPepperNotConfiguredError(
        "Password pepper is not configured: PASSWORD_PEPPER_SECRETS_JSON and " +
          "PASSWORD_PEPPER_CURRENT_VERSION must both be set before the password " +
          "hashing service can start (fail-closed, Stage 1.5 §15.2)",
        REQUIRED_PEPPER_ENV,
      );
    }

    if (!ring.has(currentVersion)) {
      throw new PasswordPepperNotConfiguredError(
        `PASSWORD_PEPPER_CURRENT_VERSION "${currentVersion}" has no matching entry in PASSWORD_PEPPER_SECRETS_JSON`,
        REQUIRED_PEPPER_ENV,
      );
    }

    this.pepperByVersion = ring;
    this.currentVersion = currentVersion;
  }

  /** Server pepper is combined with the password via HMAC-SHA256 before argon2id, per SA/SD. */
  private pepperedPassword(password: string, pepperSecret: string): Buffer {
    return createHmac("sha256", pepperSecret).update(password, "utf8").digest();
  }

  async hash(password: string): Promise<PasswordHashResult> {
    const pepperSecret = this.pepperByVersion.get(this.currentVersion);
    if (!pepperSecret) {
      throw new PasswordPepperNotConfiguredError(
        `Active pepper version "${this.currentVersion}" is no longer configured`,
        REQUIRED_PEPPER_ENV,
      );
    }

    const peppered = this.pepperedPassword(password, pepperSecret);
    const hash = await argon2.hash(peppered, ARGON2_PARAMS);
    return { hash, algo: "argon2id", pepperVersion: this.currentVersion };
  }

  async verify(
    password: string,
    stored: StoredPasswordHash,
  ): Promise<PasswordVerifyResult> {
    const pepperSecret = this.pepperByVersion.get(stored.pepperVersion);
    if (!pepperSecret) {
      // Unknown or retired pepper_version: never fall back to an unpeppered
      // or default comparison, fail closed instead.
      return { valid: false, needsRehash: false };
    }

    const peppered = this.pepperedPassword(password, pepperSecret);

    let valid: boolean;
    try {
      valid = await argon2.verify(stored.hash, peppered);
    } catch {
      valid = false;
    }

    if (!valid) {
      return { valid: false, needsRehash: false };
    }

    // Use argon2's own encoded-digest introspection rather than hand-rolling a
    // parser (Stage 1.5 §15.2: no bespoke crypto parsing, rely on the
    // maintained library).
    const needsRehash =
      stored.pepperVersion !== this.currentVersion ||
      argon2.needsRehash(stored.hash, ARGON2_PARAMS);

    return { valid: true, needsRehash };
  }
}
