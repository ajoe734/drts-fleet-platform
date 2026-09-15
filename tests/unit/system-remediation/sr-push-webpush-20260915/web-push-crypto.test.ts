// SR-PUSH-WEBPUSH-20260915 -- VAPID signing + aes128gcm payload encryption
// contract.
//
// `apps/api/src/modules/multi-taxi/web-push-crypto.ts` implements RFC 8291
// (message encryption), RFC 8188 (aes128gcm content encoding) and RFC 8292
// (VAPID) directly against Node's `crypto` primitives, because the neutral
// `PassengerPushPort` shape (single endpoint + opaque deviceToken) does not
// fit Web Push's per-subscription endpoint + p256dh/auth keys.
//
// This suite verifies both algorithms independently of the production
// encoder: it implements the *receiver* side (a simulated browser holding
// the subscription's private key) from scratch and confirms it recovers the
// exact plaintext, and it verifies the VAPID JWT signature with Node's own
// `crypto.verify` rather than re-using any signing-side helper.
import { createECDH, createHmac, createDecipheriv, createPublicKey, randomBytes, verify as cryptoVerify } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildVapidAuthorizationHeader,
  encryptWebPushPayload,
  isValidUncompressedP256PublicKey,
  isValidWebPushAuthSecret,
  signVapidJwt,
  type WebPushVapidConfig,
} from "../../../../apps/api/src/modules/multi-taxi/web-push-crypto";

const WEBPUSH_INFO_PREFIX = Buffer.from("WebPush: info\0", "utf8");
const CEK_INFO = Buffer.from("Content-Encoding: aes128gcm\0", "utf8");
const NONCE_INFO = Buffer.from("Content-Encoding: nonce\0", "utf8");

function hmacSha256(key: Buffer, data: Buffer): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function hkdfExpandOneBlock(prk: Buffer, info: Buffer, length: number): Buffer {
  return hmacSha256(prk, Buffer.concat([info, Buffer.from([0x01])])).subarray(
    0,
    length,
  );
}

/**
 * Independent receiver-side implementation of RFC 8291 + RFC 8188 decoding,
 * written from the spec (not from the production encoder) so a passing test
 * proves interoperability rather than self-consistency of one file.
 */
function decryptWebPushPayload(
  encoded: Buffer,
  uaEcdh: ReturnType<typeof createECDH>,
  authSecret: Buffer,
): Buffer {
  // Header layout (RFC 8188 §2.1): salt(16) | rs(4, BE) | idlen(1) | keyid(idlen)
  const salt = encoded.subarray(0, 16);
  const idLen = encoded.readUInt8(20);
  const asPublicKey = encoded.subarray(21, 21 + idLen);
  const body = encoded.subarray(21 + idLen);
  const uaPublicKey = uaEcdh.getPublicKey();

  const ecdhSecret = uaEcdh.computeSecret(asPublicKey);
  const prkKey = hmacSha256(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([WEBPUSH_INFO_PREFIX, uaPublicKey, asPublicKey]);
  const ikm = hkdfExpandOneBlock(prkKey, keyInfo, 32);

  const prk = hmacSha256(salt, ikm);
  const cek = hkdfExpandOneBlock(prk, CEK_INFO, 16);
  const nonce = hkdfExpandOneBlock(prk, NONCE_INFO, 12);

  const tag = body.subarray(body.length - 16);
  const ciphertext = body.subarray(0, body.length - 16);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  // Strip the RFC 8188 single-record delimiter (0x02).
  return plaintext.subarray(0, plaintext.length - 1);
}

function makeSubscription() {
  const uaEcdh = createECDH("prime256v1");
  uaEcdh.generateKeys();
  const authSecret = randomBytes(16);
  return {
    uaEcdh,
    authSecret,
    keys: {
      p256dh: uaEcdh.getPublicKey().toString("base64url"),
      auth: authSecret.toString("base64url"),
    },
  };
}

function makeVapidConfig(): WebPushVapidConfig {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const publicKeyRaw = ecdh.getPublicKey();
  const privateKeyRaw = ecdh.getPrivateKey();
  // P-256 private scalars are usually, but not always, exactly 32 bytes —
  // pad on the left if Node returned a short-leading-zero encoding.
  const privateKey32 = Buffer.concat([
    Buffer.alloc(Math.max(0, 32 - privateKeyRaw.length)),
    privateKeyRaw,
  ]).subarray(-32);
  return {
    publicKey: publicKeyRaw.toString("base64url"),
    privateKey: privateKey32.toString("base64url"),
    subject: "mailto:ops@example.com",
  };
}

describe("SR-PUSH-WEBPUSH-20260915: aes128gcm payload encryption (RFC 8291 + RFC 8188)", () => {
  it("round-trips through an independently implemented receiver", () => {
    const subscription = makeSubscription();
    const plaintext = Buffer.from(
      JSON.stringify({ eventType: "driver_arrived", orderId: "order-1" }),
      "utf8",
    );

    const encoded = encryptWebPushPayload(plaintext, subscription.keys);
    const decrypted = decryptWebPushPayload(
      encoded,
      subscription.uaEcdh,
      subscription.authSecret,
    );

    expect(decrypted.toString("utf8")).toBe(plaintext.toString("utf8"));
  });

  it("produces a fresh salt and ephemeral key on every call (never reused)", () => {
    const subscription = makeSubscription();
    const plaintext = Buffer.from("{}", "utf8");

    const first = encryptWebPushPayload(plaintext, subscription.keys);
    const second = encryptWebPushPayload(plaintext, subscription.keys);

    expect(first.subarray(0, 16).equals(second.subarray(0, 16))).toBe(false);
    expect(first.subarray(21, 21 + 65).equals(second.subarray(21, 21 + 65))).toBe(
      false,
    );
  });

  it("rejects a malformed p256dh key instead of silently mis-encrypting", () => {
    const subscription = makeSubscription();
    expect(() =>
      encryptWebPushPayload(Buffer.from("{}"), {
        p256dh: "not-a-valid-key",
        auth: subscription.keys.auth,
      }),
    ).toThrow(/p256dh/);
  });

  it("rejects an auth secret that is not 16 bytes", () => {
    const subscription = makeSubscription();
    expect(() =>
      encryptWebPushPayload(Buffer.from("{}"), {
        p256dh: subscription.keys.p256dh,
        auth: Buffer.alloc(8).toString("base64url"),
      }),
    ).toThrow(/auth secret/);
  });
});

describe("SR-PUSH-WEBPUSH-20260915: VAPID JWT signing (RFC 8292)", () => {
  it("produces a JWT whose signature verifies against its own declared public key", () => {
    const config = makeVapidConfig();
    const jwt = signVapidJwt(config, "https://push.example.com");
    const [headerB64, payloadB64, signatureB64] = jwt.split(".");
    expect(headerB64).toBeDefined();
    expect(payloadB64).toBeDefined();
    expect(signatureB64).toBeDefined();

    const header = JSON.parse(
      Buffer.from(headerB64!, "base64url").toString("utf8"),
    );
    expect(header).toEqual({ typ: "JWT", alg: "ES256" });

    const claims = JSON.parse(
      Buffer.from(payloadB64!, "base64url").toString("utf8"),
    );
    expect(claims.aud).toBe("https://push.example.com");
    expect(claims.sub).toBe(config.subject);
    expect(typeof claims.exp).toBe("number");

    const publicKeyRaw = Buffer.from(config.publicKey, "base64url");
    const publicKey = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: publicKeyRaw.subarray(1, 33).toString("base64url"),
        y: publicKeyRaw.subarray(33, 65).toString("base64url"),
      },
      format: "jwk",
    });
    const verified = cryptoVerify(
      "sha256",
      Buffer.from(`${headerB64}.${payloadB64}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signatureB64!, "base64url"),
    );
    expect(verified).toBe(true);
  });

  it("builds an Authorization header carrying the JWT and the raw public key", () => {
    const config = makeVapidConfig();
    const header = buildVapidAuthorizationHeader(
      "https://push.example.com/subscription/abc",
      config,
    );
    expect(header).toMatch(/^vapid t=[^,]+, k=/);
    expect(header).toContain(`k=${config.publicKey}`);
  });

  it("scopes the JWT audience to the endpoint's origin, not its full path", () => {
    const config = makeVapidConfig();
    const header = buildVapidAuthorizationHeader(
      "https://push.example.com/subscription/abc?x=1",
      config,
    );
    const jwt = header.slice("vapid t=".length).split(",")[0]!;
    const claims = JSON.parse(
      Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8"),
    );
    expect(claims.aud).toBe("https://push.example.com");
  });
});

describe("SR-PUSH-WEBPUSH-20260915: key-shape validation helpers", () => {
  it("accepts a well-formed uncompressed P-256 public key", () => {
    const subscription = makeSubscription();
    expect(isValidUncompressedP256PublicKey(subscription.keys.p256dh)).toBe(
      true,
    );
  });

  it("rejects a compressed or truncated public key", () => {
    expect(isValidUncompressedP256PublicKey(Buffer.alloc(33).toString("base64url"))).toBe(
      false,
    );
    expect(isValidUncompressedP256PublicKey("not base64url at all!!")).toBe(
      false,
    );
  });

  it("accepts a 16-byte auth secret and rejects any other length", () => {
    expect(isValidWebPushAuthSecret(randomBytes(16).toString("base64url"))).toBe(
      true,
    );
    expect(isValidWebPushAuthSecret(randomBytes(12).toString("base64url"))).toBe(
      false,
    );
  });
});
