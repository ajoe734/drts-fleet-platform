import { createHash } from "node:crypto";

/**
 * Deterministically serializes any JavaScript value to a canonical JSON string.
 *
 * Algorithm specifications:
 * 1. Object keys are sorted lexicographically by Unicode code point (Array.prototype.sort()).
 * 2. Nested objects and arrays are recursively canonicalized.
 * 3. Undefined values within objects are omitted.
 * 4. Date instances are serialized to their standard ISO 8601 string representation.
 * 5. Arrays maintain exact index order.
 * 6. Numbers, booleans, strings, and nulls follow standard JSON formatting without whitespace.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    const items = value.map((item) =>
      item === undefined ? "null" : canonicalizeJson(item),
    );
    return `[${items.join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();

    const pairs = sortedKeys.map(
      (key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`,
    );

    return `{${pairs.join(",")}}`;
  }

  return "";
}

/**
 * Computes a SHA-256 hex digest of the canonicalized JSON representation of a payload.
 *
 * @param payload - Arbitrary request body or parameter payload
 * @returns 64-character lowercase hexadecimal SHA-256 hash
 */
export function computePayloadHash(payload: unknown): string {
  const canonical = canonicalizeJson(payload);
  return createHash("sha256").update(canonical).digest("hex");
}
