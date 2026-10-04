/**
 * clamd's documented INSTREAM wire protocol: a literal command followed by
 * length-prefixed chunks and a zero-length terminator, and the two exact
 * reply strings that count as a definitive verdict. This mirrors
 * `apps/api/src/modules/billing-settlement/clamd-remittance-proof-scanner.adapter.ts`
 * byte-for-byte (same chunk size, same regex) -- not a new invented
 * protocol -- duplicated here because this gateway lives outside the pnpm
 * workspace (`operations/` is not in `pnpm-workspace.yaml`) and ships as a
 * standalone zero-dependency Cloud Run image.
 */

export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const INSTREAM_CHUNK_BYTES = 64 * 1024;

export function encodeInstream(bytes: Buffer): Buffer {
  if (!bytes.length || bytes.length > MAX_PROOF_BYTES) {
    throw new Error("Invalid proof size for scan.");
  }
  const parts: Buffer[] = [Buffer.from("zINSTREAM\0")];
  for (let offset = 0; offset < bytes.length; offset += INSTREAM_CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, offset + INSTREAM_CHUNK_BYTES);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(chunk.length);
    parts.push(length, chunk);
  }
  parts.push(Buffer.alloc(4));
  return Buffer.concat(parts);
}

export type ClamdVerdict = "clean" | "infected";

/**
 * clamd.conf's AlertExceedsMax turns an exceeded MaxFileSize/MaxScanSize/
 * MaxFiles/MaxRecursion bound into a FOUND reply instead of a silent OK, but
 * that FOUND only proves scanning stopped partway through -- it is not a
 * real detection. The whole `Heuristics.Limits.Exceeded[.<Which>]` family
 * (R1) must come back indeterminate (null), never a fabricated "infected"
 * success, so the caller surfaces an error instead of a definitive verdict
 * for content that was never fully inspected.
 */
const LIMIT_EXCEEDED_SIGNATURE = "Heuristics.Limits.Exceeded";

function isLimitExceededSignature(signature: string): boolean {
  return (
    signature === LIMIT_EXCEEDED_SIGNATURE ||
    signature.startsWith(`${LIMIT_EXCEEDED_SIGNATURE}.`)
  );
}

/**
 * Only a real "clean" or a real detection is a definitive verdict. Everything
 * else -- size-limit `ERROR`, a partial scan that hit a resource limit, an
 * out-of-date/unavailable engine, a malformed or truncated reply -- must come
 * back `null` so the caller can never report `clean` or `infected` on
 * anything but a complete, real engine answer.
 */
export function parseInstreamReply(reply: string): ClamdVerdict | null {
  if (reply === "stream: OK") return "clean";
  const found = /^stream: ([^\r\n\0]+) FOUND$/.exec(reply);
  // The capturing group is mandatory ([^\r\n\0]+), so it is always defined
  // once `found` matches; the fallback only satisfies noUncheckedIndexedAccess.
  if (found && !isLimitExceededSignature(found[1] ?? "")) return "infected";
  return null;
}
