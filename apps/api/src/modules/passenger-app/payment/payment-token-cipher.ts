import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedPaymentToken {
  version: 1;
  keyId: string;
  nonce: string;
  ciphertext: string;
  tag: string;
}

function invalid(): never {
  // Never include the key, ciphertext, provider token, or crypto error cause.
  throw new Error(
    "Payment token encryption configuration or envelope is invalid.",
  );
}

function decode(value: unknown, size?: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    invalid();
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value || (size && decoded.length !== size))
    invalid();
  return decoded;
}

/** Secret Manager mounts PSP_TOKEN_ENCRYPTION_KEY_NAME as a secret value.
 * The value is a JSON key ring {activeKeyId, keys: {id: <base64 32 bytes>}}.
 * Retain old entries while rotating the active key so historical tokens can
 * still decrypt. No Secret Manager calls, implicit fallback keys or logging.
 */
export class PaymentTokenCipher {
  private readonly keys = new Map<string, Buffer>();
  private readonly activeKeyId: string;

  constructor(secretValue: string) {
    let ring: unknown;
    try {
      ring = JSON.parse(secretValue);
    } catch {
      invalid();
    }
    if (!ring || typeof ring !== "object" || Array.isArray(ring)) invalid();
    const { activeKeyId, keys } = ring as Record<string, unknown>;
    if (
      typeof activeKeyId !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(activeKeyId) ||
      !keys ||
      typeof keys !== "object" ||
      Array.isArray(keys)
    )
      invalid();
    for (const [id, value] of Object.entries(keys)) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) invalid();
      this.keys.set(id, decode(value, 32));
    }
    if (!this.keys.has(activeKeyId)) invalid();
    this.activeKeyId = activeKeyId;
  }

  encrypt(
    token: string,
    passengerId: string,
    methodId: string,
  ): EncryptedPaymentToken {
    try {
      if (typeof token !== "string" || !token || token.length > 4096) invalid();
      const nonce = randomBytes(12);
      const cipher = createCipheriv(
        "aes-256-gcm",
        this.keys.get(this.activeKeyId)!,
        nonce,
      );
      cipher.setAAD(this.aad(passengerId, methodId, this.activeKeyId));
      const ciphertext = Buffer.concat([
        cipher.update(token, "utf8"),
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
      // The binding caller must not receive raw crypto errors or their causes.
      invalid();
    }
  }

  decrypt(
    envelope: EncryptedPaymentToken,
    passengerId: string,
    methodId: string,
  ): string {
    try {
      if (!envelope || envelope.version !== 1) invalid();
      const key = this.keys.get(envelope.keyId);
      if (!key) invalid();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        decode(envelope.nonce, 12),
      );
      decipher.setAAD(this.aad(passengerId, methodId, envelope.keyId));
      decipher.setAuthTag(decode(envelope.tag, 16));
      const token = Buffer.concat([
        decipher.update(decode(envelope.ciphertext)),
        decipher.final(),
      ]).toString("utf8");
      if (!token || token.length > 4096) invalid();
      return token;
    } catch {
      invalid();
    }
  }

  private aad(passengerId: string, methodId: string, keyId: string): Buffer {
    if (!passengerId || !methodId) invalid();
    return Buffer.from(
      JSON.stringify(["passenger.psp_tokens", 1, keyId, passengerId, methodId]),
    );
  }
}
