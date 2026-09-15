import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign as cryptoSign,
} from "node:crypto";

/**
 * RFC 8291 (Web Push message encryption) + RFC 8188 (aes128gcm content
 * encoding) implemented directly against Node's `crypto` primitives, and
 * RFC 8292 (VAPID) JWT signing. This exists because the neutral
 * `PassengerPushPort` shape (single configured endpoint + opaque
 * `deviceToken`, generic bearer/api-key auth) does not fit Web Push: every
 * subscription carries its own endpoint and its own `p256dh`/`auth` keys,
 * and the payload must be encrypted per-subscription rather than handed to
 * the provider as plain JSON.
 */

export interface WebPushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface WebPushVapidConfig {
  /** base64url, 65-byte uncompressed P-256 point (0x04 || X || Y). */
  publicKey: string;
  /** base64url, 32-byte P-256 private scalar. */
  privateKey: string;
  /** Contact URI required by RFC 8292, e.g. "mailto:ops@example.com". */
  subject: string;
}

const WEBPUSH_INFO_PREFIX = Buffer.from("WebPush: info\0", "utf8");
const CEK_INFO = Buffer.from("Content-Encoding: aes128gcm\0", "utf8");
const NONCE_INFO = Buffer.from("Content-Encoding: nonce\0", "utf8");
const VAPID_TTL_SECONDS = 12 * 60 * 60;

function hmacSha256(key: Buffer, data: Buffer): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** HKDF-Expand truncated to one block; every derived value here is <=32 bytes. */
function hkdfExpandOneBlock(prk: Buffer, info: Buffer, length: number): Buffer {
  const block = hmacSha256(prk, Buffer.concat([info, Buffer.from([0x01])]));
  return block.subarray(0, length);
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/**
 * True only when the value decodes to a well-formed 65-byte uncompressed
 * P-256 public point. Used both to validate subscription keys and VAPID
 * config before ever attempting a send.
 */
export function isValidUncompressedP256PublicKey(value: string): boolean {
  try {
    const decoded = decodeBase64Url(value);
    return decoded.length === 65 && decoded[0] === 0x04;
  } catch {
    return false;
  }
}

export function isValidWebPushAuthSecret(value: string): boolean {
  try {
    return decodeBase64Url(value).length === 16;
  } catch {
    return false;
  }
}

/**
 * Encrypts `plaintext` for one Web Push subscription per RFC 8291 §3-4 and
 * returns the full aes128gcm-encoded body (RFC 8188 §2) ready to POST as-is
 * to the subscription's `endpoint` with `Content-Encoding: aes128gcm`.
 *
 * A fresh ephemeral ECDH keypair and a fresh random salt are generated for
 * every call: reusing either across messages to the same subscription would
 * break the encryption's security guarantees.
 */
export function encryptWebPushPayload(
  plaintext: Buffer,
  keys: WebPushSubscriptionKeys,
): Buffer {
  const uaPublicKey = decodeBase64Url(keys.p256dh);
  const authSecret = decodeBase64Url(keys.auth);
  if (uaPublicKey.length !== 65 || uaPublicKey[0] !== 0x04) {
    throw new Error("Invalid Web Push subscription p256dh key.");
  }
  if (authSecret.length !== 16) {
    throw new Error("Invalid Web Push subscription auth secret.");
  }

  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const asPublicKey = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublicKey);

  // RFC 8291 §3.3-3.4: derive the 32-byte content-encryption IKM from the
  // ECDH secret, keyed by the subscription's own auth secret.
  const prkKey = hmacSha256(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([WEBPUSH_INFO_PREFIX, uaPublicKey, asPublicKey]);
  const ikm = hkdfExpandOneBlock(prkKey, keyInfo, 32);

  // RFC 8188 §2: derive the per-record CEK/nonce from a fresh random salt.
  const salt = randomBytes(16);
  const prk = hmacSha256(salt, ikm);
  const contentEncryptionKey = hkdfExpandOneBlock(prk, CEK_INFO, 16);
  const nonce = hkdfExpandOneBlock(prk, NONCE_INFO, 12);

  // Single-record message: append the RFC 8188 "last record" delimiter (0x02).
  const recordPlaintext = Buffer.concat([plaintext, Buffer.from([0x02])]);
  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(recordPlaintext),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const body = Buffer.concat([ciphertext, authTag]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(body.length, 0);
  const header = Buffer.concat([
    salt,
    recordSize,
    Buffer.from([asPublicKey.length]),
    asPublicKey,
  ]);
  return Buffer.concat([header, body]);
}

function toJwk(config: WebPushVapidConfig) {
  const publicKeyRaw = decodeBase64Url(config.publicKey);
  const privateKeyRaw = decodeBase64Url(config.privateKey);
  if (publicKeyRaw.length !== 65 || publicKeyRaw[0] !== 0x04) {
    throw new Error("Invalid VAPID public key.");
  }
  if (privateKeyRaw.length !== 32) {
    throw new Error("Invalid VAPID private key.");
  }
  return {
    kty: "EC" as const,
    crv: "P-256" as const,
    x: publicKeyRaw.subarray(1, 33).toString("base64url"),
    y: publicKeyRaw.subarray(33, 65).toString("base64url"),
    d: privateKeyRaw.toString("base64url"),
  };
}

/** Signs a VAPID JWT (RFC 8292 §2) for `audience` (the push endpoint's origin). */
export function signVapidJwt(
  config: WebPushVapidConfig,
  audience: string,
  now: Date = new Date(),
): string {
  const privateKey = createPrivateKey({ key: toJwk(config), format: "jwk" });
  const header = Buffer.from(
    JSON.stringify({ typ: "JWT", alg: "ES256" }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(now.getTime() / 1000) + VAPID_TTL_SECONDS,
      sub: config.subject,
    }),
  ).toString("base64url");
  const signingInput = `${header}.${claims}`;
  // JWS ES256 requires the raw r||s (IEEE P1363) signature, not the DER
  // encoding `crypto.sign` produces by default for EC keys.
  const signature = cryptoSign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

/** Builds the `Authorization: vapid t=..., k=...` header value (RFC 8292 §4). */
export function buildVapidAuthorizationHeader(
  endpoint: string,
  config: WebPushVapidConfig,
): string {
  const audience = new URL(endpoint).origin;
  const jwt = signVapidJwt(config, audience);
  return `vapid t=${jwt}, k=${config.publicKey}`;
}
