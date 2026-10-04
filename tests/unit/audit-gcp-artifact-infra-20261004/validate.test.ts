import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ALLOWED_MIME_TYPES,
  MAX_PROOF_BYTES,
  isAllowedMime,
  isValidSha256Hex,
  sha256Hex,
} from "../../../operations/artifact-scanner/gateway/validate";

describe("isAllowedMime", () => {
  it("accepts exactly the product's remittance-proof MIME allowlist", () => {
    expect(ALLOWED_MIME_TYPES).toEqual(
      new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
    );
    for (const type of ALLOWED_MIME_TYPES) {
      expect(isAllowedMime(type)).toBe(true);
    }
  });

  it("rejects anything outside the allowlist, including near-miss and parameterized types", () => {
    for (const type of [
      "text/plain",
      "application/octet-stream",
      "image/gif",
      "application/pdf; charset=binary",
      "APPLICATION/PDF",
      "",
    ]) {
      expect(isAllowedMime(type)).toBe(false);
    }
  });
});

describe("isValidSha256Hex", () => {
  it("accepts exactly 64 lowercase hex characters", () => {
    expect(isValidSha256Hex("a".repeat(64))).toBe(true);
    expect(isValidSha256Hex(sha256Hex(Buffer.from("x")))).toBe(true);
  });

  it("rejects wrong length, uppercase, and non-hex content", () => {
    for (const value of [
      "a".repeat(63),
      "a".repeat(65),
      "A".repeat(64),
      "g".repeat(64),
      "",
      `${"a".repeat(64)}\n`,
    ]) {
      expect(isValidSha256Hex(value)).toBe(false);
    }
  });
});

describe("sha256Hex", () => {
  it("matches node:crypto's own digest for arbitrary bytes", () => {
    const bytes = Buffer.from("the quick brown fox");
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(sha256Hex(bytes)).toBe(expected);
  });

  it("produces different digests for different inputs and is stable for the same input", () => {
    const a = sha256Hex(Buffer.from("a"));
    const b = sha256Hex(Buffer.from("b"));
    expect(a).not.toBe(b);
    expect(sha256Hex(Buffer.from("a"))).toBe(a);
  });
});

describe("MAX_PROOF_BYTES", () => {
  it("is exactly 10 MiB, matching the documented bound", () => {
    expect(MAX_PROOF_BYTES).toBe(10 * 1024 * 1024);
  });
});
