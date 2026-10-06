import { createHash } from "node:crypto";

import { MAX_PROOF_BYTES } from "./clamd-protocol";

export { MAX_PROOF_BYTES };

/**
 * Must stay in sync with the product's own allowlist in
 * `apps/api/src/modules/billing-settlement/s3-remittance-proof-storage.adapter.ts`
 * (`MIME_TYPES`). Duplicated for the same cross-workspace reason as
 * `clamd-protocol.ts`: this is the one allowlist a scanned proof may ever
 * carry, not a separate, independently invented one.
 */
export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export function isAllowedMime(contentType: string): boolean {
  return ALLOWED_MIME_TYPES.has(contentType);
}

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export function isValidSha256Hex(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value);
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
