import { createHmac, timingSafeEqual } from "node:crypto";

import { resolveControlledDownloadPolicy } from "./sensitive-data-policy";

/**
 * Where a controlled-download link points when nothing overrides it.
 *
 * This was `https://downloads.drts.local`, a host that does not resolve, with no
 * route serving the path. Five modules handed callers a signed link to it and
 * two consoles rendered that link for a person to click; following it failed at
 * DNS, which reads as a network fault rather than as "this file was never
 * produced".
 *
 * A relative prefix keeps the link on the API's own origin in every
 * environment, where `ControlledDownloadController` answers it. Set
 * `CONTROLLED_DOWNLOAD_HOST` to an absolute origin once artifacts are served
 * from somewhere else.
 */
export const DEFAULT_CONTROLLED_DOWNLOAD_HOST = "/downloads";
export const DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES = 15;
export const DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID =
  "phase1-controlled-download-key-v1";
export const DEFAULT_CONTROLLED_DOWNLOAD_SECRET = "";
export const DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION = 1;

export interface ControlledDownloadMetadata {
  kind: string;
  subjectId: string;
  manifestHash: string;
  host: string;
  keyId: string;
  signedAt: string;
  expiresAt: string;
  ttlMinutes: number;
  signatureVersion: number;
  signature: string;
  downloadUrl: string;
  immutable: true;
}

export interface CreateControlledDownloadMetadataCommand {
  kind: string;
  subjectId: string;
  manifestHash: string;
  createdAt?: string;
  host?: string;
  ttlMinutes?: number;
  keyId?: string;
  signingSecret?: string;
  signatureVersion?: number;
}

export function createControlledDownloadMetadata(
  command: CreateControlledDownloadMetadataCommand,
): ControlledDownloadMetadata {
  const signedAt = command.createdAt ?? new Date().toISOString();
  const policy = resolveControlledDownloadPolicy(command, {
    host: DEFAULT_CONTROLLED_DOWNLOAD_HOST,
    keyId: DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
    signingSecret: DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
    ttlMinutes: DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES,
    signatureVersion: DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION,
  });
  const ttlMinutes = policy.ttlMinutes;
  const host = policy.host;
  const keyId = policy.keyId;
  const signingSecret = policy.signingSecret;
  const signatureVersion = policy.signatureVersion;
  const expiresAt = computeExpiryTimestamp(signedAt, ttlMinutes);
  const canonicalPayload = stableSerialize({
    kind: command.kind,
    subjectId: command.subjectId,
    manifestHash: command.manifestHash,
    signedAt,
    expiresAt,
    keyId,
    signatureVersion,
  });
  const signature = createHmac("sha256", signingSecret)
    .update(canonicalPayload)
    .digest("hex");

  return {
    kind: command.kind,
    subjectId: command.subjectId,
    manifestHash: command.manifestHash,
    host,
    keyId,
    signedAt,
    expiresAt,
    ttlMinutes,
    signatureVersion,
    signature,
    downloadUrl: buildControlledDownloadUrl({
      host,
      kind: command.kind,
      subjectId: command.subjectId,
      manifestHash: command.manifestHash,
      signedAt,
      expiresAt,
      keyId,
      signature,
      signatureVersion,
    }),
    immutable: true,
  };
}

export function computeExpiryTimestamp(
  signedAt: string,
  ttlMinutes: number,
): string {
  const signedAtEpoch = new Date(signedAt).getTime();
  return new Date(signedAtEpoch + ttlMinutes * 60 * 1000).toISOString();
}

function buildControlledDownloadUrl(input: {
  host: string;
  kind: string;
  subjectId: string;
  manifestHash: string;
  signedAt: string;
  expiresAt: string;
  keyId: string;
  signature: string;
  signatureVersion: number;
}) {
  const searchParams = new URLSearchParams({
    signed_at: input.signedAt,
    expires_at: input.expiresAt,
    key_id: input.keyId,
    // The signature covers `manifestHash`. Without it in the link, the link
    // could not be verified from itself -- every controlled download the
    // platform issued was unverifiable for exactly this reason. Publishing the
    // hash gives nothing away that the API response beside it does not already
    // carry, and forging a signature still requires the secret.
    manifest_hash: input.manifestHash,
    sig: input.signature,
    sig_v: String(input.signatureVersion),
  });

  return `${input.host}/${encodeURIComponent(input.kind)}/${encodeURIComponent(
    input.subjectId,
  )}?${searchParams.toString()}`;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => {
        const nestedValue = (value as Record<string, unknown>)[key];
        return `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`;
      })
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface ControlledDownloadClaims {
  kind: string;
  subjectId: string;
  manifestHash: string;
  signedAt: string;
  expiresAt: string;
  keyId: string;
  signatureVersion: number;
  signature: string;
}

export type ControlledDownloadVerification =
  | { ok: true }
  | { ok: false; reason: "signature_invalid" | "key_unknown" };

/**
 * Recomputes the signature over the claims a link carries and compares it to
 * the one the link presents.
 *
 * Expiry is not checked here. A caller should verify the signature first and
 * only then look at `expiresAt`: telling an unsigned or forged link that it is
 * merely "expired" would answer a question it has not earned.
 */
export function verifyControlledDownloadSignature(
  claims: ControlledDownloadClaims,
  overrides: { keyId?: string; signingSecret?: string } = {},
): ControlledDownloadVerification {
  const policy = resolveControlledDownloadPolicy(overrides, {
    host: DEFAULT_CONTROLLED_DOWNLOAD_HOST,
    keyId: DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
    signingSecret: DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
    ttlMinutes: DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES,
    signatureVersion: DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION,
  });

  // A link signed under a key this deployment does not hold cannot be checked,
  // and must not be treated as valid for want of a comparison.
  if (claims.keyId !== policy.keyId) {
    return { ok: false, reason: "key_unknown" };
  }

  const expected = createHmac("sha256", policy.signingSecret)
    .update(
      stableSerialize({
        kind: claims.kind,
        subjectId: claims.subjectId,
        manifestHash: claims.manifestHash,
        signedAt: claims.signedAt,
        expiresAt: claims.expiresAt,
        keyId: claims.keyId,
        signatureVersion: claims.signatureVersion,
      }),
    )
    .digest();

  let presented: Buffer;
  try {
    presented = Buffer.from(claims.signature, "hex");
  } catch {
    return { ok: false, reason: "signature_invalid" };
  }
  // `timingSafeEqual` throws on a length mismatch, and comparing lengths first
  // is not a leak: the digest length is fixed and public.
  if (presented.length !== expected.length) {
    return { ok: false, reason: "signature_invalid" };
  }
  return timingSafeEqual(presented, expected)
    ? { ok: true }
    : { ok: false, reason: "signature_invalid" };
}
