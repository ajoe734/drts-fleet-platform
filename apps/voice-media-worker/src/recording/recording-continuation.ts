import { isDeepStrictEqual } from "node:util";
import {
  voiceRecordingFinalizationSchema,
  voiceRecordingContinuationEventSchema,
  voiceRecordingAdmissionSchema,
  type VoiceRecordingAdmission,
  type VoiceRecordingContinuationEvent,
  type VoiceRecordingFinalization,
} from "@drts/contracts";
import {
  SealedRecorder,
  assertBidirectionalCoverage,
  verifyRecordedObject,
  type RecorderIngress,
  type RecorderObjectStore,
  type RecordingScope,
  type RecorderSegment,
  RecordingEvidenceError,
  recordingChecksum,
} from "./sealed-recorder";
import { MediaRecordingAdapter } from "./media-recording-adapter";
import type { RecordingClosureLedger } from "./final-manifest";
import type { RecordingManifestRef } from "./immutable-manifest";

export interface RecordingContinuationJournal {
  append(
    voiceSessionId: string,
    event: VoiceRecordingContinuationEvent,
  ): Promise<VoiceRecordingContinuationEvent>;
  read(
    voiceSessionId: string,
    scope?: RecordingScope,
  ): Promise<VoiceRecordingContinuationEvent[]>;
}
/** Upstream normalized fork/call-close provider. This is independent from the
 * ASR/TTS stream: no WebSocket close or playback completion is a call closure. */
export interface RecordingContinuationSource {
  subscribe(
    voiceSessionId: string,
    scope: RecordingScope,
    callbacks: {
      fork(event: {
        credential: string;
        input: Parameters<SealedRecorder["seal"]>[1];
      }): Promise<void>;
      checkpoint(ref: RecordingManifestRef): Promise<void>;
      closed(credential: string): Promise<void>;
    },
  ): { close(): void };
  ingress: RecorderIngress;
  closure: RecordingClosureLedger;
}
export class RecordingContinuation {
  private readonly recorder: SealedRecorder;
  constructor(
    private readonly store: RecorderObjectStore,
    private readonly journal: RecordingContinuationJournal,
    private readonly source: RecordingContinuationSource,
  ) {
    this.recorder = new SealedRecorder(source.ingress, store);
  }
  async recordAdmission(
    voiceSessionId: string,
    scope: RecordingScope,
    raw: VoiceRecordingAdmission,
    kind: "admission" | "attachment",
  ): Promise<void> {
    const payload = voiceRecordingAdmissionSchema.parse(raw);
    const event = voiceRecordingContinuationEventSchema.parse({
      kind,
      eventKey: `${kind}:${payload.epoch}`,
      scope: { ...scope },
      payload,
    });
    try {
      const saved = await this.journal.append(voiceSessionId, event);
      if (!isDeepStrictEqual(saved, event))
        throw new Error("voice_recording_admission_ack_mismatch");
    } catch (error) {
      // A rejected transport wait does not establish rollback. Only exact
      // authoritative readback of this same immutable event resolves ACK loss.
      const history = await this.journal.read(voiceSessionId);
      if (!history.some((e) => isDeepStrictEqual(e, event))) throw error;
    }
    const latest = await this.latestAdmission(voiceSessionId);
    if (
      !latest ||
      !isDeepStrictEqual(latest.payload, payload) ||
      !isDeepStrictEqual(latest.scope, scope)
    )
      throw new Error("voice_recording_admission_superseded");
    if (kind === "attachment")
      await this.readAttachedAdmission(voiceSessionId, scope);
  }
  private async latestAdmission(voiceSessionId: string) {
    return (await this.journal.read(voiceSessionId))
      .filter((e) => e.kind === "admission")
      .sort((a, b) => b.payload.epoch - a.payload.epoch)[0];
  }
  async readAttachedAdmission(
    voiceSessionId: string,
    scope: RecordingScope,
  ): Promise<VoiceRecordingAdmission> {
    const events = await this.journal.read(voiceSessionId);
    const latest = events
      .filter((e) => e.kind === "admission")
      .sort((a, b) => b.payload.epoch - a.payload.epoch)[0];
    if (
      !latest ||
      !isDeepStrictEqual(latest.scope, scope) ||
      !events.some(
        (e) =>
          e.kind === "attachment" &&
          isDeepStrictEqual(e.scope, scope) &&
          isDeepStrictEqual(e.payload, latest.payload),
      )
    )
      throw new Error("voice_recording_consumed_admission_unavailable");
    return voiceRecordingAdmissionSchema.parse(latest.payload);
  }
  attach(voiceSessionId: string, scope: RecordingScope) {
    scope = Object.freeze({ ...scope });
    return this.source.subscribe(voiceSessionId, scope, {
      fork: async ({ credential, input }) => {
        await this.recordFork(voiceSessionId, scope, credential, input);
      },
      checkpoint: async (ref) => {
        await this.recordCheckpoint(voiceSessionId, scope, ref);
      },
      closed: async (credential) => {
        await this.recordClosure(voiceSessionId, scope, credential);
      },
    });
  }
  async recordFork(
    voiceSessionId: string,
    scope: RecordingScope,
    credential: string,
    input: Parameters<SealedRecorder["seal"]>[1],
  ) {
    // Snapshot before the first async journal/authority operation, just as
    // SealedRecorder does before external object-store writes.
    scope = Object.freeze({ ...scope });
    input = { ...input, bytes: Uint8Array.from(input.bytes) };
    for (const key of ["brandId", "callId", "recordingId", "legId"] as const)
      if (scope[key] !== input[key])
        throw new RecordingEvidenceError("Recording fork scope mismatch");
    const eventKey = `segment:${input.channel}:${input.startMs}:${input.endMs}`;
    const previous = (await this.journal.read(voiceSessionId, scope)).find(
      (e) => e.eventKey === eventKey,
    );
    if (previous?.kind === "segment") {
      const grant = await this.source.ingress.authorize(credential, scope);
      if (
        grant.source !== "recording_fork" ||
        !grant.channels.includes(input.channel)
      )
        throw new RecordingEvidenceError(
          "No authorized recording fork for channel",
        );
      const recorded = previous.payload;
      if (
        recorded.checksum !== recordingChecksum(input.bytes) ||
        recorded.byteLength !== input.bytes.byteLength ||
        recorded.utcStart !== input.utcStart ||
        recorded.utcEnd !== input.utcEnd
      )
        throw new RecordingEvidenceError("Recording segment payload conflict");
      await verifyRecordedObject(this.store, scope, recorded);
      return recorded;
    }
    const segment = await this.recorder.seal(credential, input);
    const event = await this.journal.append(voiceSessionId, {
      kind: "segment",
      eventKey: `segment:${segment.channel}:${segment.startMs}:${segment.endMs}`,
      scope: { ...scope },
      payload: { ...segment },
    });
    if (!isDeepStrictEqual(event.payload, segment))
      throw new RecordingEvidenceError("Recording segment identity changed");
    return segment;
  }
  async recordCheckpoint(
    voiceSessionId: string,
    scope: RecordingScope,
    ref: RecordingManifestRef,
  ) {
    scope = Object.freeze({ ...scope });
    ref = Object.freeze({ ...ref });
    // Only a readable immutable manifest for this exact scope may join the
    // closure's checkpoint index. Confirmation proof remains a separate gate.
    // The immutable checkpoint reader is shared with final verification.
    const { ImmutableRecordingManifests } =
      await import("./immutable-manifest");
    await new ImmutableRecordingManifests(this.store).read(scope, ref);
    await this.journal.append(voiceSessionId, {
      kind: "checkpoint",
      eventKey: `checkpoint:${ref.objectKey}:${ref.objectVersion}`,
      scope: { ...scope },
      payload: { ...ref },
    });
  }
  async recordClosure(
    voiceSessionId: string,
    scope: RecordingScope,
    credential: string,
  ) {
    scope = Object.freeze({ ...scope });
    const resolved = await this.source.closure.resolve(credential, scope);
    const closure = resolved && structuredClone(resolved);
    if (!closure)
      throw new RecordingEvidenceError("Trusted call closure unavailable");
    const events = await this.journal.read(voiceSessionId, scope);
    const segments = events
      .filter((e) => e.kind === "segment")
      .map((e) => e.payload as RecorderSegment);
    assertBidirectionalCoverage(scope, segments, 0, closure.endMs);
    for (const segment of segments)
      await verifyRecordedObject(this.store, scope, segment);
    const checkpointRefs = events
      .filter((e) => e.kind === "checkpoint")
      .map((e) => e.payload as RecordingManifestRef);
    if (!isDeepStrictEqual(checkpointRefs, closure.checkpointRefs))
      throw new RecordingEvidenceError(
        "Trusted closure checkpoint index mismatch",
      );
    await this.journal.append(voiceSessionId, {
      kind: "closure",
      eventKey: "closure",
      scope: { ...scope },
      payload: { ...closure, checkpointRefs: [...checkpointRefs] },
    });
  }
  async finalize(
    voiceSessionId: string,
    scope: RecordingScope,
    authority?: VoiceRecordingAdmission,
  ): Promise<VoiceRecordingFinalization> {
    scope = Object.freeze({ ...scope });
    const assertAdmission = async () => {
      if (
        authority &&
        !isDeepStrictEqual(
          authority,
          await this.readAttachedAdmission(voiceSessionId, scope),
        )
      )
        throw new Error("voice_recording_admission_superseded");
    };
    await assertAdmission();
    const events = (await this.journal.read(voiceSessionId, scope)).map((e) =>
      voiceRecordingContinuationEventSchema.parse(e),
    );
    const closure = events.find((e) => e.kind === "closure");
    if (!closure || closure.kind !== "closure")
      throw new RecordingEvidenceError("Durable call closure unavailable");
    const adapter = new MediaRecordingAdapter(this.store, {
      resolve: async () => structuredClone(closure.payload),
    });
    const saved = events.find((e) => e.kind === "finalized");
    if (saved?.kind === "finalized") {
      await adapter.readFinalRecording(scope, saved.payload.manifestRef);
      await assertAdmission();
      return voiceRecordingFinalizationSchema.parse(saved.payload);
    }
    const segments = events
      .filter((e) => e.kind === "segment")
      .map((e) => e.payload as RecorderSegment);
    const result = await adapter.sealFinalRecording({ scope, segments });
    // seal() includes immutable manifest/audio readback. Re-read the final
    // version before persisting its fixed identity for response-loss recovery.
    const manifest = await adapter.readFinalRecording(
      scope,
      result.manifestRef,
    );
    const final = voiceRecordingFinalizationSchema.parse({
      scope,
      recordingId: scope.recordingId,
      manifestRef: result.manifestRef,
      coverage: {
        startMs: 0,
        endMs: manifest.endMs,
        channels: ["inbound", "outbound"],
        closedEventId: result.closedEventId,
        endedAt: result.endedAt,
      },
      verifiedAt: new Date().toISOString(),
    });
    try {
      await this.journal.append(voiceSessionId, {
        kind: "finalized",
        eventKey: "finalized",
        scope: { ...scope },
        payload: final,
        ...(authority ? { authority } : {}),
      });
    } catch (error) {
      const recovered = (await this.journal.read(voiceSessionId, scope)).find(
        (e) => e.kind === "finalized",
      );
      if (!recovered || recovered.kind !== "finalized") throw error;
      await adapter.readFinalRecording(scope, recovered.payload.manifestRef);
      await assertAdmission();
      return voiceRecordingFinalizationSchema.parse(recovered.payload);
    }
    return final;
  }
}
