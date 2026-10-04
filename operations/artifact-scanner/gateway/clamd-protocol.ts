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
 * Only these two exact clamd replies are a definitive verdict. Everything
 * else -- size-limit `ERROR`, an out-of-date/unavailable engine, a
 * malformed or truncated reply -- must come back `null` so the caller can
 * never report `clean` or `infected` on anything but a real engine answer.
 */
export function parseInstreamReply(reply: string): ClamdVerdict | null {
  if (reply === "stream: OK") return "clean";
  if (/^stream: [^\r\n\0]+ FOUND$/.test(reply)) return "infected";
  return null;
}
