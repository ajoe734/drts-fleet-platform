import { createHmac } from "node:crypto";

export const DEFAULT_CONTROLLED_DOWNLOAD_HOST = "https://downloads.drts.local";
export const DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES = 60;
export const DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID =
  "phase1-bootstrap-download-key-v1";
export const DEFAULT_CONTROLLED_DOWNLOAD_SECRET =
  "phase1-bootstrap-download-secret-v1";
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
  const ttlMinutes =
    command.ttlMinutes ?? DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES;
  const host = command.host ?? DEFAULT_CONTROLLED_DOWNLOAD_HOST;
  const keyId = command.keyId ?? DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID;
  const signingSecret =
    command.signingSecret ?? DEFAULT_CONTROLLED_DOWNLOAD_SECRET;
  const signatureVersion =
    command.signatureVersion ?? DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION;
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
