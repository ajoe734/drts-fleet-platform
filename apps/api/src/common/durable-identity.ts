import { createHash } from "node:crypto";

/**
 * Generates a deterministic v4-compliant UUID string based on a namespace and key.
 * Used to ensure idempotent event IDs, audit IDs, outbox IDs, and delivery IDs.
 */
export function generateDeterministicUuid(
  namespace: string,
  key: string,
): string {
  const hash = createHash("sha256")
    .update(`${namespace}:${key}`)
    .digest("hex");
  const p1 = hash.slice(0, 8);
  const p2 = hash.slice(8, 12);
  const p3 = `4${hash.slice(13, 16)}`;
  const p4 = `a${hash.slice(17, 20)}`;
  const p5 = hash.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`.toLowerCase();
}
