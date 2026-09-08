import { describe, expect, it, vi } from "vitest";
import {
  SealedRecorder,
  assertBidirectionalCoverage,
  verifyRecordedObject,
  type RecorderIngress,
  type RecorderObjectStore,
  type RecorderSegment,
} from "../../apps/voice-media-worker/src/recording/sealed-recorder";

const scope = {
  brandId: "brand",
  callId: "call",
  recordingId: "rec",
  legId: "leg",
};
function fixture() {
  const objects = new Map<string, Uint8Array>();
  const store: RecorderObjectStore = {
    putImmutable: vi.fn(async (_scope, bytes) => {
      const key = `segment-${objects.size}`;
      objects.set(key, Uint8Array.from(bytes));
      return {
        objectKey: key,
        objectVersion: "v1",
        durableAt: "2026-09-08T00:00:10Z",
      };
    }),
    readVersion: vi.fn(async (_scope, key, version) => {
      const bytes = objects.get(key);
      if (!bytes) throw new Error("storage unavailable");
      return { bytes: Uint8Array.from(bytes), objectVersion: version };
    }),
  };
  const ingress: RecorderIngress = {
    authorize: vi.fn(async () => ({
      source: "recording_fork",
      channels: ["inbound", "outbound"],
    })),
  };
  const recorder = new SealedRecorder(ingress, store);
  const input = {
    ...scope,
    channel: "inbound" as const,
    startMs: 0,
    endMs: 1000,
    utcStart: "2026-09-08T00:00:00Z",
    utcEnd: "2026-09-08T00:00:01Z",
    bytes: new Uint8Array([1, 2, 3]),
  };
  return { objects, store, ingress, recorder, input };
}

describe("UV-EXEC-010 sealed recorder", () => {
  it("reads back the immutable version before returning a frozen sealed segment", async () => {
    const f = fixture();
    const segment = await f.recorder.seal("authenticated", f.input);
    expect(Object.isFrozen(segment)).toBe(true);
    expect(f.store.readVersion).toHaveBeenCalledWith(
      scope,
      segment.objectKey,
      "v1",
    );
    await expect(
      verifyRecordedObject(f.store, scope, segment),
    ).resolves.toBeUndefined();
  });

  it("snapshots bytes and metadata before asynchronous authentication", async () => {
    const f = fixture();
    const pending = f.recorder.seal("authenticated", f.input);
    f.input.bytes.fill(9);
    f.input.callId = "another-call";
    const segment = await pending;
    expect(segment.callId).toBe("call");
    expect(f.objects.get(segment.objectKey)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("does not infer an outbound recording from an inbound-only fork", async () => {
    const f = fixture();
    vi.mocked(f.ingress.authorize).mockResolvedValue({
      source: "recording_fork",
      channels: ["inbound"],
    });
    await expect(
      f.recorder.seal("authenticated", { ...f.input, channel: "outbound" }),
    ).rejects.toThrow("No authorized");
    expect(f.store.putImmutable).not.toHaveBeenCalled();
  });

  it("does not write after failed authentication", async () => {
    const f = fixture();
    vi.mocked(f.ingress.authorize).mockRejectedValue(new Error("unauthorized"));
    await expect(f.recorder.seal("invalid", f.input)).rejects.toThrow(
      "unauthorized",
    );
    expect(f.store.putImmutable).not.toHaveBeenCalled();
  });

  it.each(["unreadable", "checksum", "version"])(
    "rejects %s objects",
    async (failure) => {
      const f = fixture();
      if (failure === "unreadable")
        vi.mocked(f.store.readVersion).mockRejectedValue(
          new Error("secret storage URL"),
        );
      else
        vi.mocked(f.store.readVersion).mockResolvedValue({
          bytes: new Uint8Array(failure === "checksum" ? [9, 9, 9] : [1, 2, 3]),
          objectVersion: failure === "version" ? "v2" : "v1",
        });
      await expect(
        f.recorder.seal("authenticated", f.input),
      ).rejects.toMatchObject({ code: "VOICE_RECORDING_NOT_DURABLE" });
    },
  );

  it.each(["empty", "offset", "utc"])(
    "rejects invalid %s before storage",
    async (failure) => {
      const f = fixture();
      if (failure === "empty") f.input.bytes = new Uint8Array();
      if (failure === "offset") f.input.endMs = NaN;
      if (failure === "utc") f.input.utcEnd = "2026-09-08T00:00:02Z";
      await expect(f.recorder.seal("authenticated", f.input)).rejects.toThrow();
      expect(f.store.putImmutable).not.toHaveBeenCalled();
    },
  );

  it("requires both tracks and rejects gaps, overlap, and cross-call segments", async () => {
    const f = fixture();
    const inbound = await f.recorder.seal("authenticated", f.input);
    const outbound = await f.recorder.seal("authenticated", {
      ...f.input,
      channel: "outbound",
    });
    expect(() =>
      assertBidirectionalCoverage(scope, [outbound, inbound], 100, 900),
    ).not.toThrow();
    expect(() =>
      assertBidirectionalCoverage(scope, [inbound], 0, 1000),
    ).toThrow("Missing outbound");
    expect(() =>
      assertBidirectionalCoverage(scope, [inbound, outbound], 0, 2000),
    ).toThrow();
    expect(() =>
      assertBidirectionalCoverage(scope, [inbound, inbound, outbound], 0, 1000),
    ).toThrow();
    expect(() =>
      assertBidirectionalCoverage(
        scope,
        [{ ...inbound, callId: "other" }, outbound],
        0,
        1000,
      ),
    ).toThrow("scope mismatch");
    const later = (segment: RecorderSegment): RecorderSegment => ({
      ...segment,
      startMs: 1100,
      endMs: 2100,
      utcStart: "2026-09-08T00:00:01.100Z",
      utcEnd: "2026-09-08T00:00:02.100Z",
    });
    expect(() =>
      assertBidirectionalCoverage(
        scope,
        [inbound, outbound, later(inbound), later(outbound)],
        0,
        2100,
      ),
    ).toThrow("gap");
  });

  it("rejects separately continuous tracks with different UTC origins", async () => {
    const f = fixture();
    const inbound = await f.recorder.seal("authenticated", f.input);
    const outbound = await f.recorder.seal("authenticated", {
      ...f.input,
      channel: "outbound",
      utcStart: "2026-09-08T00:00:01Z",
      utcEnd: "2026-09-08T00:00:02Z",
    });
    expect(() =>
      assertBidirectionalCoverage(scope, [inbound, outbound], 0, 1000),
    ).toThrow("Discontinuous UTC mapping");
  });

  it("does not allow metadata mutation to bless corrupt asynchronous readback", async () => {
    const f = fixture();
    const segment = { ...await f.recorder.seal("authenticated", f.input) };
    let complete!: (value: { bytes: Uint8Array; objectVersion: string }) => void;
    vi.mocked(f.store.readVersion).mockImplementationOnce(
      () => new Promise((resolve) => { complete = resolve; }),
    );
    const pending = verifyRecordedObject(f.store, scope, segment);
    segment.objectVersion = "v2";
    complete({ bytes: new Uint8Array([1, 2, 3]), objectVersion: "v2" });
    await expect(pending).rejects.toThrow("Object version mismatch");
  });
});
