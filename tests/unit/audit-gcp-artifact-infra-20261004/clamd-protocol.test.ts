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

  it("treats clamd.conf's AlertExceedsMax FOUND reply as fail-closed infected, never clean", () => {
    // With AlertExceedsMax yes (clamd.conf), exceeding MaxFileSize/MaxScanSize/
    // MaxRecursion on compressed/embedded content makes clamd report this
    // exact signature name as FOUND instead of silently skipping to OK --
    // this must never be treated as indeterminate/clean (R1).
    expect(parseInstreamReply("stream: Heuristics.Limits.Exceeded FOUND")).toBe("infected");
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
