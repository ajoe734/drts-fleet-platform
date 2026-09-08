import { describe, expect, it, vi } from "vitest";
import { VoiceEvidenceService } from "../../apps/api/src/modules/voice-booking/voice-evidence.service";
import { VoiceCheckpointRepository } from "../../apps/api/src/modules/voice-booking/voice-checkpoint.repository";
import type { VoiceBookingRepository } from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { ConfirmedRecordingManifests } from "../../apps/voice-media-worker/src/recording/confirmed-manifest";
import { FinalRecordingManifests } from "../../apps/voice-media-worker/src/recording/final-manifest";
import {
  assertConfirmationCoverage,
  type RecordedConfirmationReceipt,
} from "../../apps/voice-media-worker/src/recording/confirmation-coverage";
import { ImmutableRecordingManifests } from "../../apps/voice-media-worker/src/recording/immutable-manifest";
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

describe("UV-EXEC-010 confirmation audio coverage", () => {
  async function proofFixture(method: "speech" | "dtmf" = "speech") {
    const f = fixture();
    const segments = await Promise.all([
      f.recorder.seal("authenticated", f.input),
      f.recorder.seal("authenticated", { ...f.input, channel: "outbound" }),
    ]);
    const manifests = new ImmutableRecordingManifests(f.store);
    const ref = await manifests.seal({
      schemaVersion: 1,
      scope,
      segments,
      startMs: 0,
      endMs: 1000,
    });
    const manifest = await manifests.read(scope, ref);
    const binding = {
      scope,
      snapshotHash: "a".repeat(64),
      readbackPlaybackId: "playback",
      mediaEpoch: 1,
    };
    const timing = {
      timingSource: "provider" as const,
      timingPrecision: "bounded" as const,
    };
    const common = {
      eventId: "confirmation",
      readbackPlaybackId: binding.readbackPlaybackId,
      snapshotHash: binding.snapshotHash,
      mediaEpoch: 1,
      sequence: 11,
    };
    const receipt: RecordedConfirmationReceipt = {
      ...binding,
      disclosure: { ...timing, startMs: 0, endMs: 100 },
      corrections: [{ ...timing, startMs: 100, endMs: 200 }],
      readback: {
        ...timing,
        startMs: 200,
        endMs: 700,
        completedEventId: "complete",
        outcome: "completed",
        completionSource: "provider_playback",
        sequence: 10,
      },
      confirmation:
        method === "speech"
          ? {
              ...common,
              method,
              affirmation: { ...timing, startMs: 700, endMs: 900 },
            }
          : {
              ...common,
              method,
              digit: "1",
              expectedDigit: "1",
              timingSource: "provider",
              timingPrecision: "event_order",
            },
    };
    return { ...f, manifest, receipt, binding };
  }

  it.each(["speech", "dtmf"] as const)(
    "accepts recorded %s proof without inventing tone offsets",
    async (method) => {
      const f = await proofFixture(method);
      expect(() =>
        assertConfirmationCoverage(f.manifest, f.receipt, f.binding),
      ).not.toThrow();
      if (method === "dtmf")
        expect(f.receipt.confirmation).not.toHaveProperty("affirmation");
    },
  );

  it.each(["speech", "dtmf"] as const)(
    "API journals verified %s evidence and rejects subsequent object loss",
    async (method) => {
      const f = await proofFixture(method);
      const confirmed = new ConfirmedRecordingManifests(
        new ImmutableRecordingManifests(f.store),
        { resolve: async () => f.receipt },
      );
      const ref = await confirmed.seal("credential", f.manifest, f.binding);
      const journal = new VoiceCheckpointRepository();
      const append = vi
        .spyOn(journal, "appendVerified")
        .mockImplementation(async (input) => ({
          ...input,
          checkpointId: "checkpoint",
          verifiedAt: "2026-09-08T12:00:00Z",
        }));
      const lookup = vi.fn();
      const access = {
        resolve: vi.fn(async () => ({
          binding: f.binding,
          policyVersion: "policy-1",
        })),
      };
      const service = new VoiceEvidenceService(
        journal,
        {
          findRecordingCheckpointById: lookup,
        } as unknown as VoiceBookingRepository,
        access,
        confirmed,
      );
      const request = {
        callId: scope.callId,
        recordingId: scope.recordingId,
        manifestVersion: 1,
        manifest: ref,
      };
      const row = await service.checkpoint("credential", request);
      expect(row.manifestHash).toBe(ref.checksum);
      expect(row.coverage).toMatchObject({
        snapshotHash: f.binding.snapshotHash,
      });
      lookup.mockResolvedValue(row);
      expect(
        await service.requireCheckpoint(
          "credential",
          scope.callId,
          row.checkpointId,
        ),
      ).toEqual(row);
      await expect(
        service.requireCheckpoint("credential", "other-call", row.checkpointId),
      ).rejects.toThrow("unavailable");
      access.resolve.mockResolvedValueOnce({
        binding: { ...f.binding, snapshotHash: "b".repeat(64) },
        policyVersion: "policy-1",
      });
      await expect(
        service.requireCheckpoint("credential", scope.callId, row.checkpointId),
      ).rejects.toThrow("verification failed");
      f.objects.delete(f.manifest.segments[0]!.objectKey);
      await expect(
        service.requireCheckpoint("credential", scope.callId, row.checkpointId),
      ).rejects.toThrow("verification failed");
      await expect(service.checkpoint("credential", request)).rejects.toThrow(
        "verification failed",
      );
      expect(append).toHaveBeenCalledTimes(1);
      expect(row.manifestHash).toBe(ref.checksum);
    },
  );

  it("API fails closed without configured recorder authentication and storage", async () => {
    const journal = new VoiceCheckpointRepository();
    const append = vi.spyOn(journal, "appendVerified");
    const service = new VoiceEvidenceService(
      journal,
      {} as VoiceBookingRepository,
    );
    await expect(
      service.checkpoint("credential", {
        callId: scope.callId,
        recordingId: scope.recordingId,
        manifestVersion: 1,
        manifest: {
          objectKey: "claimed",
          objectVersion: "v1",
          checksum: "a".repeat(64),
          byteLength: 1,
          durableAt: "2026-09-08T12:00:00Z",
        },
      }),
    ).rejects.toThrow("verification failed");
    expect(append).not.toHaveBeenCalled();
  });

  it("API reader rejects a checksummed receipt that differs from the trusted ledger", async () => {
    const f = await proofFixture();
    const manifests = new ImmutableRecordingManifests(f.store);
    const ref = await manifests.seal({
      ...f.manifest,
      confirmationReceipt: f.receipt,
    });
    const confirmed = new ConfirmedRecordingManifests(manifests, {
      resolve: async () => ({
        ...f.receipt,
        confirmation: { ...f.receipt.confirmation, eventId: "different-event" },
      }),
    });
    await expect(
      confirmed.readTrusted("credential", f.binding, ref),
    ).rejects.toThrow("ledger mismatch");
  });

  it("finalizes full-call audio without replacing checkpoint proof on late failure", async () => {
    const f = await proofFixture();
    const manifests = new ImmutableRecordingManifests(f.store);
    const confirmed = new ConfirmedRecordingManifests(manifests, {
      resolve: async () => f.receipt,
    });
    const checkpoint = await confirmed.seal(
      "credential",
      f.manifest,
      f.binding,
    );
    const tail = await Promise.all(
      (["inbound", "outbound"] as const).map((channel) =>
        f.recorder.seal("credential", {
          ...f.input,
          channel,
          startMs: 1000,
          endMs: 2000,
          utcStart: "2026-09-08T00:00:01Z",
          utcEnd: "2026-09-08T00:00:02Z",
        }),
      ),
    );
    const final = new FinalRecordingManifests(manifests, {
      resolve: async () => ({
        closedEventId: "closed",
        endedAt: "2026-09-08T00:00:02Z",
        endMs: 2000,
        checkpointRefs: [checkpoint],
      }),
    });
    await expect(
      final.seal("credential", scope, f.manifest.segments),
    ).rejects.toThrow("closure coverage");
    const ref = await final.seal("credential", scope, [
      ...f.manifest.segments,
      ...tail,
    ]);
    expect((await final.read(scope, ref)).endMs).toBe(2000);
    expect((await final.read(scope, ref)).finalization?.checkpointRefs).toEqual(
      [checkpoint],
    );
    f.objects.delete(tail[0]!.objectKey);
    await expect(final.read(scope, ref)).rejects.toThrow("unreadable");
    expect((await confirmed.read(f.binding, checkpoint)).endMs).toBe(1000);
    const unclosed = new FinalRecordingManifests(manifests, {
      resolve: async () => null,
    });
    await expect(
      unclosed.seal("credential", scope, f.manifest.segments),
    ).rejects.toThrow("closure unavailable");
  });

  it.each(["speech", "dtmf"] as const)(
    "seals and retrieves %s receipt with its audio",
    async (method) => {
      const f = await proofFixture(method);
      const resolve = vi.fn(async () => f.receipt);
      const confirmed = new ConfirmedRecordingManifests(
        new ImmutableRecordingManifests(f.store),
        { resolve },
      );
      const ref = await confirmed.seal("credential", f.manifest, f.binding);
      expect(resolve).toHaveBeenCalledWith("credential", f.binding);
      const read = await confirmed.read(f.binding, ref);
      expect(read.confirmationReceipt).toEqual(f.receipt);
      expect(Object.isFrozen(read.confirmationReceipt?.readback)).toBe(true);
      expect(Object.isFrozen(read.confirmationReceipt?.confirmation)).toBe(
        true,
      );
      f.receipt.readback.outcome = "cleared";
      expect(
        (await confirmed.read(f.binding, ref)).confirmationReceipt?.readback
          .outcome,
      ).toBe("completed");
      await expect(
        confirmed.read({ ...f.binding, snapshotHash: "b".repeat(64) }, ref),
      ).rejects.toThrow("snapshot mismatch");
      f.objects.delete(f.manifest.segments[0]!.objectKey);
      await expect(confirmed.read(f.binding, ref)).rejects.toThrow(
        "unreadable",
      );
    },
  );

  it("snapshots coverage and binding before awaiting the trusted ledger", async () => {
    const f = await proofFixture();
    const input = {
      ...f.manifest,
      scope: { ...scope },
      segments: [...f.manifest.segments],
    };
    const binding = { ...f.binding, scope: { ...scope } };
    const confirmed = new ConfirmedRecordingManifests(
      new ImmutableRecordingManifests(f.store),
      { resolve: async () => f.receipt },
    );
    const pending = confirmed.seal("credential", input, binding);
    input.scope.callId = "other";
    input.segments.pop();
    binding.scope.callId = "other";
    binding.snapshotHash = "b".repeat(64);
    const ref = await pending;
    expect((await confirmed.read(f.binding, ref)).segments).toHaveLength(2);
  });

  it("rejects plain manifests and does not store without a trusted receipt", async () => {
    const f = await proofFixture();
    const manifests = new ImmutableRecordingManifests(f.store);
    const confirmed = new ConfirmedRecordingManifests(manifests, {
      resolve: async () => null,
    });
    const plain = await manifests.seal(f.manifest);
    await expect(confirmed.read(f.binding, plain)).rejects.toThrow(
      "Missing trusted",
    );
    vi.mocked(f.store.putImmutable).mockClear();
    await expect(
      confirmed.seal("credential", f.manifest, f.binding),
    ).rejects.toThrow("Missing trusted");
    expect(f.store.putImmutable).not.toHaveBeenCalled();
  });

  it("sanitizes ledger failure and does not persist evidence", async () => {
    const f = await proofFixture();
    const confirmed = new ConfirmedRecordingManifests(
      new ImmutableRecordingManifests(f.store),
      {
        resolve: async () => {
          throw new Error("secret credential");
        },
      },
    );
    vi.mocked(f.store.putImmutable).mockClear();
    await expect(
      confirmed.seal("credential", f.manifest, f.binding),
    ).rejects.toThrow("Trusted confirmation ledger unavailable");
    expect(f.store.putImmutable).not.toHaveBeenCalled();
  });

  it.each([
    "missing",
    "cleared",
    "unknown",
    "local_send",
    "scope",
    "snapshot",
    "playback",
    "epoch",
    "order",
    "missing_audio",
    "outside_manifest",
    "late_correction",
    "early_speech",
  ])("rejects %s evidence", async (failure) => {
    const f = await proofFixture();
    const { receipt, binding } = f;
    let manifest = f.manifest;
    if (failure === "cleared" || failure === "unknown")
      receipt.readback.outcome = failure;
    if (failure === "local_send")
      receipt.readback.completionSource = "local_send";
    if (failure === "scope") receipt.scope = { ...scope, legId: "other" };
    if (failure === "snapshot")
      receipt.confirmation.snapshotHash = "b".repeat(64);
    if (failure === "playback")
      receipt.confirmation.readbackPlaybackId = "other";
    if (failure === "epoch") receipt.confirmation.mediaEpoch = 2;
    if (failure === "order")
      receipt.confirmation.sequence = receipt.readback.sequence;
    if (failure === "missing_audio")
      manifest = {
        ...manifest,
        segments: manifest.segments.filter((s) => s.channel === "inbound"),
      };
    if (failure === "outside_manifest") manifest = { ...manifest, endMs: 800 };
    if (failure === "late_correction")
      receipt.corrections = [
        { ...receipt.disclosure, startMs: 400, endMs: 500 },
      ];
    if (failure === "early_speech" && receipt.confirmation.method === "speech")
      receipt.confirmation.affirmation.startMs = 600;
    expect(() =>
      assertConfirmationCoverage(
        manifest,
        failure === "missing" ? null : receipt,
        binding,
      ),
    ).toThrow();
  });

  it("rejects a digit that does not match its recorded prompt", async () => {
    const f = await proofFixture("dtmf");
    if (f.receipt.confirmation.method === "dtmf")
      f.receipt.confirmation.digit = "2";
    expect(() =>
      assertConfirmationCoverage(f.manifest, f.receipt, f.binding),
    ).toThrow("Untrusted DTMF");
  });

  it("does not claim exact timing from local utterance estimates", async () => {
    const f = await proofFixture();
    f.receipt.readback.timingSource = "local_utterance";
    f.receipt.readback.timingPrecision = "exact";
    expect(() =>
      assertConfirmationCoverage(f.manifest, f.receipt, f.binding),
    ).toThrow("timing precision");
    f.receipt.readback.timingPrecision = "bounded";
    expect(() =>
      assertConfirmationCoverage(f.manifest, f.receipt, f.binding),
    ).not.toThrow();
  });
});
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
    const segment = { ...(await f.recorder.seal("authenticated", f.input)) };
    let complete!: (value: {
      bytes: Uint8Array;
      objectVersion: string;
    }) => void;
    vi.mocked(f.store.readVersion).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = verifyRecordedObject(f.store, scope, segment);
    segment.objectVersion = "v2";
    complete({ bytes: new Uint8Array([1, 2, 3]), objectVersion: "v2" });
    await expect(pending).rejects.toThrow("Object version mismatch");
  });
});

describe("UV-EXEC-010 immutable manifest storage", () => {
  async function manifestFixture() {
    const f = fixture();
    const inbound = await f.recorder.seal("authenticated", f.input);
    const outbound = await f.recorder.seal("authenticated", {
      ...f.input,
      channel: "outbound",
    });
    const manifests = new ImmutableRecordingManifests(f.store);
    const input = {
      schemaVersion: 1 as const,
      scope: { ...scope },
      startMs: 0,
      endMs: 1000,
      segments: [inbound, outbound],
    };
    return { ...f, manifests, input };
  }

  it("retrieves an immutable manifest and rechecks its actual audio", async () => {
    const f = await manifestFixture();
    const ref = await f.manifests.seal(f.input);
    const read = await f.manifests.read(scope, ref);
    expect(read).toEqual(f.input);
    expect(Object.isFrozen(read)).toBe(true);
    expect(Object.isFrozen(read.scope)).toBe(true);
    expect(Object.isFrozen(read.segments)).toBe(true);
    expect(Object.isFrozen(read.segments[0])).toBe(true);
    f.objects.delete(f.input.segments[0]!.objectKey);
    await expect(f.manifests.read(scope, ref)).rejects.toThrow(
      "Recording object unreadable",
    );
  });

  it("snapshots the manifest before awaiting audio validation", async () => {
    const f = await manifestFixture();
    const pending = f.manifests.seal(f.input);
    f.input.scope.callId = "other";
    f.input.segments.pop();
    const ref = await pending;
    const read = await f.manifests.read(scope, ref);
    expect(read.scope.callId).toBe("call");
    expect(read.segments).toHaveLength(2);
  });

  it.each(["manifest", "audio", "scope", "version"])(
    "rejects %s tampering on retrieval",
    async (failure) => {
      const f = await manifestFixture();
      const ref = await f.manifests.seal(f.input);
      if (failure === "manifest")
        f.objects.set(ref.objectKey, new Uint8Array([1]));
      if (failure === "audio")
        f.objects.set(
          f.input.segments[0]!.objectKey,
          new Uint8Array([9, 9, 9]),
        );
      if (failure === "version")
        vi.mocked(f.store.readVersion).mockResolvedValueOnce({
          bytes: f.objects.get(ref.objectKey)!,
          objectVersion: "other",
        });
      await expect(
        f.manifests.read(
          failure === "scope" ? { ...scope, brandId: "other" } : scope,
          ref,
        ),
      ).rejects.toMatchObject({ code: "VOICE_RECORDING_NOT_DURABLE" });
    },
  );

  it("does not store a manifest with missing outbound coverage", async () => {
    const f = await manifestFixture();
    f.input.segments.pop();
    vi.mocked(f.store.putImmutable).mockClear();
    await expect(f.manifests.seal(f.input)).rejects.toThrow("Missing outbound");
    expect(f.store.putImmutable).not.toHaveBeenCalled();
  });
});
