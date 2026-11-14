import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

export interface EncryptedTotpSecret {
  version: 1;
  keyId: string;
  nonce: string;
  ciphertext: string;
  tag: string;
}

/**
 * Thrown when no usable TOTP envelope-encryption key ring is configured.
 * Mirrors PasswordPepperNotConfiguredError (password-hashing.service.ts):
 * this is a fail-closed signal raised when the cipher is actually
 * constructed for a real enroll/confirm/login call, not at Nest module
 * bootstrap (PasswordHashingService is deliberately not registered as a
 * DI provider for the same reason -- see tenant-partner.service.ts's
 * `new PasswordHashingService()` call sites).
 */
export class TotpEncryptionKeyNotConfiguredError extends Error {
  public readonly code = "TOTP_ENCRYPTION_KEY_NOT_CONFIGURED";

  constructor(message: string) {
    super(message);
    this.name = "TotpEncryptionKeyNotConfiguredError";
  }
}

type EnvLike = Record<string, string | undefined>;

function invalidConfig(detail: string): never {
  throw new TotpEncryptionKeyNotConfiguredError(
    `TOTP_ENCRYPTION_KEYS_JSON is invalid: ${detail}`,
  );
}

function decodeKey(value: unknown, keyId: string): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    invalidConfig(`key "${keyId}" must be a base64-encoded string`);
  }
  const decoded = Buffer.from(value as string, "base64");
  if (decoded.toString("base64") !== value || decoded.length !== 32) {
    invalidConfig(`key "${keyId}" must decode to exactly 32 bytes`);
  }
  return decoded;
}

function invalidEnvelope(): never {
  // Never surface the ciphertext, key material, or crypto error cause.
  throw new Error("TOTP secret envelope is invalid.");
}

function decode(value: unknown, size?: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    invalidEnvelope();
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.toString("base64") !== value ||
    (size !== undefined && decoded.length !== size)
  )
    invalidEnvelope();
  return decoded;
}

/**
 * Envelope-encrypts TOTP secrets before they are persisted to
 * iam.identity_totp_credentials.secret_ciphertext (SA/SD
 * docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md §7:
 * "不以明文或僅 base32 編碼存 DB"). Secret Manager mounts
 * TOTP_ENCRYPTION_KEYS_JSON as an env var holding a JSON key ring
 * {activeKeyId, keys: {id: <base64 32 bytes>}}; retired key ids stay in the
 * ring so existing ciphertexts keep decrypting across key rotation
 * (current/previous overlap, Stage 1.5 §15.2).
 */
@Injectable()
export class TotpSecretCipher {
  private readonly keys = new Map<string, Buffer>();
  private readonly activeKeyId: string;

  constructor(env: EnvLike = process.env) {
    const raw = env.TOTP_ENCRYPTION_KEYS_JSON?.trim();
    if (!raw) {
      invalidConfig("TOTP_ENCRYPTION_KEYS_JSON is not set");
    }

    let ring: unknown;
    try {
      ring = JSON.parse(raw);
    } catch (error) {
      invalidConfig(
        `must be valid JSON (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    if (!ring || typeof ring !== "object" || Array.isArray(ring)) {
      invalidConfig("must be a JSON object");
    }
    const { activeKeyId, keys } = ring as Record<string, unknown>;
    if (
      typeof activeKeyId !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(activeKeyId) ||
      !keys ||
      typeof keys !== "object" ||
      Array.isArray(keys)
    ) {
      invalidConfig("must have a string activeKeyId and a keys object");
    }
    for (const [id, value] of Object.entries(
      keys as Record<string, unknown>,
    )) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
        invalidConfig(`key id "${id}" has an invalid format`);
      }
      this.keys.set(id, decodeKey(value, id));
    }
    if (!this.keys.has(activeKeyId)) {
      invalidConfig(`activeKeyId "${activeKeyId}" has no matching key entry`);
    }
    this.activeKeyId = activeKeyId;
  }

  get currentKeyVersion(): string {
    return this.activeKeyId;
  }

  encrypt(secret: string, principalId: string): EncryptedTotpSecret {
    try {
      if (typeof secret !== "string" || !secret || secret.length > 256)
        invalidEnvelope();
      const nonce = randomBytes(12);
      const cipher = createCipheriv(
        "aes-256-gcm",
        this.keys.get(this.activeKeyId)!,
        nonce,
      );
      cipher.setAAD(this.aad(principalId, this.activeKeyId));
      const ciphertext = Buffer.concat([
        cipher.update(secret, "utf8"),
        cipher.final(),
      ]);
      return {
        version: 1,
        keyId: this.activeKeyId,
        nonce: nonce.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
      };
    } catch {
      invalidEnvelope();
    }
  }

  decrypt(envelope: EncryptedTotpSecret, principalId: string): string {
    try {
      if (!envelope || envelope.version !== 1) invalidEnvelope();
      const key = this.keys.get(envelope.keyId);
      if (!key) invalidEnvelope();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        decode(envelope.nonce, 12),
      );
      decipher.setAAD(this.aad(principalId, envelope.keyId));
      decipher.setAuthTag(decode(envelope.tag, 16));
      const secret = Buffer.concat([
        decipher.update(decode(envelope.ciphertext)),
        decipher.final(),
      ]).toString("utf8");
      if (!secret || secret.length > 256) invalidEnvelope();
      return secret;
    } catch {
      invalidEnvelope();
    }
  }

  private aad(principalId: string, keyId: string): Buffer {
    if (!principalId) invalidEnvelope();
    return Buffer.from(
      JSON.stringify(["iam.identity_totp_credentials", 1, keyId, principalId]),
    );
  }
}
