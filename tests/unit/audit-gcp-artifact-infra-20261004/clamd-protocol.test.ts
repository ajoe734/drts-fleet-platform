import { describe, expect, it } from "vitest";

import {
  MAX_PROOF_BYTES,
  encodeInstream,
  parseInstreamReply,
} from "../../../operations/artifact-scanner/gateway/clamd-protocol";

describe("encodeInstream", () => {
  it("frames a small payload as a single chunk with the literal command and terminator", () => {
    const payload = Buffer.from("hello");
    const frame = encodeInstream(payload);

    expect(frame.subarray(0, 10).toString("utf8")).toBe("zINSTREAM\0");
    const chunkLength = frame.readUInt32BE(10);
    expect(chunkLength).toBe(payload.length);
    expect(frame.subarray(14, 14 + payload.length)).toEqual(payload);
    const terminator = frame.subarray(14 + payload.length);
    expect(terminator).toEqual(Buffer.alloc(4));
  });

  it("splits a payload larger than 64 KiB into multiple length-prefixed chunks", () => {
    const payload = Buffer.alloc(64 * 1024 + 10, 7);
    const frame = encodeInstream(payload);

    let offset = 10; // past "zINSTREAM\0"
    const firstChunkLength = frame.readUInt32BE(offset);
    expect(firstChunkLength).toBe(64 * 1024);
    offset += 4 + firstChunkLength;

    const secondChunkLength = frame.readUInt32BE(offset);
    expect(secondChunkLength).toBe(10);
    offset += 4 + secondChunkLength;

    const terminatorLength = frame.readUInt32BE(offset);
    expect(terminatorLength).toBe(0);
    expect(offset + 4).toBe(frame.length);
  });

  it("rejects an empty payload", () => {
    expect(() => encodeInstream(Buffer.alloc(0))).toThrow(/Invalid proof size/);
  });

  it("rejects a payload larger than the 10 MiB bound", () => {
    expect(() => encodeInstream(Buffer.alloc(MAX_PROOF_BYTES + 1))).toThrow(
      /Invalid proof size/,
    );
  });

  it("accepts a payload at exactly the bound", () => {
    const frame = encodeInstream(Buffer.alloc(MAX_PROOF_BYTES, 1));
    expect(frame.length).toBeGreaterThan(MAX_PROOF_BYTES);
  });
});

describe("parseInstreamReply", () => {
  it("treats the exact clean reply as a definitive clean verdict", () => {
    expect(parseInstreamReply("stream: OK")).toBe("clean");
  });

  it("treats a FOUND reply naming a signature as a definitive infected verdict", () => {
    expect(parseInstreamReply("stream: Win.Test.EICAR_HDB-1 FOUND")).toBe("infected");
    expect(parseInstreamReply("stream: Eicar-Signature FOUND")).toBe("infected");
  });

  it("treats clamd.conf's AlertExceedsMax Heuristics.Limits.Exceeded family as indeterminate, never a definitive verdict", () => {
    // With AlertExceedsMax yes (clamd.conf), exceeding MaxFileSize/MaxScanSize/
    // MaxFiles/MaxRecursion on compressed/embedded content makes clamd report
    // this signature family as FOUND instead of silently skipping to OK, but
    // that only proves the content was never fully scanned -- it is not a
    // real detection. R1 (round 2): this must come back null/indeterminate,
    // not a fabricated "infected" success; the handler then surfaces this as
    // a 502 scan_engine_indeterminate error rather than a 200 verdict.
    for (const reply of [
      "stream: Heuristics.Limits.Exceeded FOUND",
      "stream: Heuristics.Limits.Exceeded.MaxFileSize FOUND",
      "stream: Heuristics.Limits.Exceeded.MaxScanSize FOUND",
      "stream: Heuristics.Limits.Exceeded.MaxFiles FOUND",
      "stream: Heuristics.Limits.Exceeded.MaxRecursion FOUND",
    ]) {
      expect(parseInstreamReply(reply)).toBeNull();
    }
  });

  it("does not misclassify an unrelated signature that merely starts with the limit-exceeded prefix text", () => {
    // Guards the startsWith(`${LIMIT_EXCEEDED_SIGNATURE}.`) boundary: a
    // genuine detection name must not accidentally collide with the family
    // prefix match and get swallowed as indeterminate.
    expect(parseInstreamReply("stream: Heuristics.Limits.ExceededSomethingElse FOUND")).toBe(
      "infected",
    );
  });

  it("never returns a definitive verdict for an error, truncated or malformed reply", () => {
    for (const reply of [
      "stream: INSTREAM size limit exceeded. ERROR",
      "stream: ",
      "stream:OK",
      "stream: OK extra",
      "OK",
      "",
      "stream: FOUND",
      "stream: name FOUND ",
      "stream: name\0FOUND",
    ]) {
      expect(parseInstreamReply(reply)).toBeNull();
    }
  });
});
