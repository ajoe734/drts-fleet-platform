import type { RecordingObjectStore } from "./recording-object-store";

/**
 * Continuous bidirectional recorder ingest and sealed-segment production
 * (SD §8.1/§8.2: "連續錄音＋已封閉確認片段 checkpoint"). This is the
 * "可信 recorder" side of the model -- it never decides whether a checkpoint
 * gates a booking; it only produces immutable, append-only sealed segments
 * and reports them to the evidence service (`recording-ingest-client.ts`,
 * consumed by `apps/api`'s `VoiceEvidenceService`).
 *
 * Two roles are tracked per SD §8.2 "涵蓋雙向原始通話": `customer` (the
 * passenger leg) and `agent` (the AI voice-agent leg), matching the leg-role
 * vocabulary already used by the CTI adapter
 * (`apps/api/src/modules/callcenter/voice-cti.adapter.ts`'s
 * `VoiceCallLegRole`).
 */

export type RecordingChannelRole = "customer" | "agent";

export type RecordingTimingSource =
  | "provider"
  | "local_utterance"
  | "local_send"
  | "unknown";

export type RecordingTimingPrecision =
  | "exact"
  | "bounded"
  | "estimated"
  | "unknown";

export const DEFAULT_FRAME_DURATION_MS = 20;

export interface RecordingFrameInput {
  channel: RecordingChannelRole;
  bytes: Uint8Array;
  /** Media-clock offset (ms) since the recording started, monotonic per channel. */
  mediaOffsetMs: number;
  /** Duration of this audio frame in ms; defaults to DEFAULT_FRAME_DURATION_MS (20ms). */
  durationMs?: number;
  occurredAtUtc: string;
}

export interface ChannelCoverageInterval {
  startOffsetMs: number;
  endOffsetMs: number;
  startedAtUtc: string;
  endedAtUtc: string;
}

export interface SegmentChannelCoverage {
  channel: RecordingChannelRole;
  startOffsetMs: number;
  endOffsetMs: number;
  startedAtUtc: string;
  endedAtUtc: string;
  hasGaps: boolean;
  intervals: ChannelCoverageInterval[];
}

export interface SealedRecordingSegment {
  callId: string;
  recordingId: string;
  /** Monotonic, gap-detectable position of this segment within the recording. */
  segmentSequence: number;
  objectKey: string;
  objectVersion: number;
  checksum: string;
  byteSize: number;
  /** Channels that had at least one ingested frame within this segment. */
  channels: RecordingChannelRole[];
  startOffsetMs: number;
  endOffsetMs: number;
  startedAtUtc: string;
  endedAtUtc: string;
  /** When this segment became durable in the object store (SD §9.1 `durableAt`). */
  durableAt: string;
  timingSource: RecordingTimingSource;
  timingPrecision: RecordingTimingPrecision;
  /** Detailed per-channel coverage, intervals, and gap tracking (SD §8.2). */
  channelCoverage: SegmentChannelCoverage[];
}

export interface RecorderSessionOptions {
  callId: string;
  recordingId: string;
  objectStore: RecordingObjectStore;
  /** Injectable for deterministic tests; defaults to wall-clock. */
  now?: () => Date;
}

interface BufferedFrame {
  channel: RecordingChannelRole;
  bytes: Uint8Array;
  mediaOffsetMs: number;
  durationMs: number;
  occurredAtUtc: string;
}

const CHANNEL_ORDER: readonly RecordingChannelRole[] = ["customer", "agent"];

/**
 * Per-call recorder ingest harness. `sealSegment` is the only way buffered
 * frames become durable evidence; nothing here ever mutates an
 * already-sealed segment (SD §8.2: "後續片段不修改已封閉片段").
 */
export class CallRecorderSession {
  private readonly callId: string;
  private readonly recordingId: string;
  private readonly objectStore: RecordingObjectStore;
  private readonly now: () => Date;

  private buffer: BufferedFrame[] = [];
  private readonly sealedSegments: SealedRecordingSegment[] = [];
  private nextSequence = 1;
  /** The end offset of the most recently sealed segment; `null` before the first seal. */
  private lastEndOffsetMs: number | null = null;
  /** Promise chain serializing concurrent sealSegment calls to prevent buffer races. */
  private sealQueue: Promise<unknown> = Promise.resolve();

  constructor(options: RecorderSessionOptions) {
    this.callId = options.callId;
    this.recordingId = options.recordingId;
    this.objectStore = options.objectStore;
    this.now = options.now ?? (() => new Date());
  }

  ingestFrame(frame: RecordingFrameInput): void {
    if (frame.bytes.byteLength === 0) {
      return;
    }
    const durationMs =
      frame.durationMs !== undefined && frame.durationMs >= 0
        ? frame.durationMs
        : DEFAULT_FRAME_DURATION_MS;

    this.buffer.push({
      channel: frame.channel,
      bytes: frame.bytes,
      mediaOffsetMs: frame.mediaOffsetMs,
      durationMs,
      occurredAtUtc: frame.occurredAtUtc,
    });
  }

  getSealedSegments(): readonly SealedRecordingSegment[] {
    return this.sealedSegments;
  }

  /**
   * Seals the currently buffered frames into one immutable object. Returns
   * `null` (and touches nothing) when there is no buffered audio -- an empty
   * bounded-flush tick must never mint a hollow segment.
   *
   * Continuity is reported honestly, not enforced by refusal: a caller that
   * restarts after losing buffered audio still gets a sealed segment for
   * what it *does* have, tagged so the evidence-service gate can see the
   * gap (SD §8.3: "commit 後後半段錄音失敗...保存已封閉證據"). The recorder
   * never silently pretends a gap did not happen by re-numbering offsets.
   */
  async sealSegment(
    timing: {
      timingSource: RecordingTimingSource;
      timingPrecision: RecordingTimingPrecision;
    } = { timingSource: "unknown", timingPrecision: "unknown" },
  ): Promise<SealedRecordingSegment | null> {
    const run = async () => this.doSealSegment(timing);
    const queued = this.sealQueue.then(run, run);
    this.sealQueue = queued.then(
      () => {},
      () => {},
    );
    return queued;
  }

  private async doSealSegment(timing: {
    timingSource: RecordingTimingSource;
    timingPrecision: RecordingTimingPrecision;
  }): Promise<SealedRecordingSegment | null> {
    if (this.buffer.length === 0) {
      return null;
    }

    // Detach the sealing batch before awaiting the object store PUT.
    // Any frames arriving via ingestFrame during the await append to the
    // newly reset buffer and are preserved for subsequent seals.
    const batch = this.buffer;
    this.buffer = [];

    const framesByChannel = new Map<RecordingChannelRole, BufferedFrame[]>();
    for (const frame of batch) {
      const list = framesByChannel.get(frame.channel) ?? [];
      list.push(frame);
      framesByChannel.set(frame.channel, list);
    }

    const channels = CHANNEL_ORDER.filter((role) => framesByChannel.has(role));
    // Deterministic byte order: fixed channel order, then ingestion order
    // within a channel. This is the exact payload whose checksum is sealed.
    const orderedFrames = channels.flatMap(
      (role) => framesByChannel.get(role) ?? [],
    );
    const totalBytes = orderedFrames.reduce(
      (sum, frame) => sum + frame.bytes.byteLength,
      0,
    );
    const payload = new Uint8Array(totalBytes);
    let cursor = 0;
    for (const frame of orderedFrames) {
      payload.set(frame.bytes, cursor);
      cursor += frame.bytes.byteLength;
    }

    // SD §8.2: Track actual per-channel coverage windows, contiguous intervals, and gaps.
    const channelCoverage: SegmentChannelCoverage[] = channels.map((role) => {
      const channelFrames = framesByChannel.get(role) ?? [];
      const sorted = [...channelFrames].sort(
        (a, b) => a.mediaOffsetMs - b.mediaOffsetMs,
      );
      const intervals: ChannelCoverageInterval[] = [];
      let currentInterval: ChannelCoverageInterval | null = null;

      for (const frame of sorted) {
        const frameStart = frame.mediaOffsetMs;
        const frameEnd = frame.mediaOffsetMs + frame.durationMs;
        const frameStartUtc = frame.occurredAtUtc;
        const frameEndUtc = new Date(
          new Date(frame.occurredAtUtc).getTime() + frame.durationMs,
        ).toISOString();

        if (!currentInterval) {
          currentInterval = {
            startOffsetMs: frameStart,
            endOffsetMs: frameEnd,
            startedAtUtc: frameStartUtc,
            endedAtUtc: frameEndUtc,
          };
        } else if (frameStart <= currentInterval.endOffsetMs) {
          currentInterval.endOffsetMs = Math.max(
            currentInterval.endOffsetMs,
            frameEnd,
          );
          if (
            new Date(frameEndUtc).getTime() >
            new Date(currentInterval.endedAtUtc).getTime()
          ) {
            currentInterval.endedAtUtc = frameEndUtc;
          }
        } else {
          intervals.push(currentInterval);
          currentInterval = {
            startOffsetMs: frameStart,
            endOffsetMs: frameEnd,
            startedAtUtc: frameStartUtc,
            endedAtUtc: frameEndUtc,
          };
        }
      }

      if (currentInterval) {
        intervals.push(currentInterval);
      }

      const startOffsetMs = intervals[0]?.startOffsetMs ?? 0;
      const endOffsetMs = intervals[intervals.length - 1]?.endOffsetMs ?? 0;
      const startedAtUtc = intervals[0]?.startedAtUtc ?? batch[0]!.occurredAtUtc;
      const endedAtUtc =
        intervals[intervals.length - 1]?.endedAtUtc ?? batch[0]!.occurredAtUtc;
      const hasGaps = intervals.length > 1;

      return {
        channel: role,
        startOffsetMs,
        endOffsetMs,
        startedAtUtc,
        endedAtUtc,
        hasGaps,
        intervals,
      };
    });

    const startOffsetMs = Math.min(
      ...batch.map((frame) => frame.mediaOffsetMs),
    );
    const endOffsetMs = Math.max(
      ...batch.map((frame) => frame.mediaOffsetMs + frame.durationMs),
    );
    const startedAtUtc = batch.reduce(
      (earliest, frame) =>
        frame.occurredAtUtc < earliest ? frame.occurredAtUtc : earliest,
      batch[0]!.occurredAtUtc,
    );
    const endedAtUtc = batch.reduce((latest, frame) => {
      const frameEndUtc = new Date(
        new Date(frame.occurredAtUtc).getTime() + frame.durationMs,
      ).toISOString();
      return frameEndUtc > latest ? frameEndUtc : latest;
    }, batch[0]!.occurredAtUtc);

    const sequence = this.nextSequence;
    const objectKey = `${this.callId}/${this.recordingId}/segments/${String(
      sequence,
    ).padStart(6, "0")}`;

    let putResult: Awaited<ReturnType<RecordingObjectStore["putSealedObject"]>>;
    try {
      putResult = await this.objectStore.putSealedObject(
        objectKey,
        payload,
      );
    } catch (error) {
      // Restore the failed batch to the head of the buffer so no audio is lost.
      this.buffer = [...batch, ...this.buffer];
      throw error;
    }

    const segment: SealedRecordingSegment = {
      callId: this.callId,
      recordingId: this.recordingId,
      segmentSequence: sequence,
      objectKey: putResult.objectKey,
      objectVersion: putResult.objectVersion,
      checksum: putResult.checksum,
      byteSize: putResult.byteSize,
      channels,
      startOffsetMs,
      endOffsetMs,
      startedAtUtc,
      endedAtUtc,
      durableAt: this.now().toISOString(),
      timingSource: timing.timingSource,
      timingPrecision: timing.timingPrecision,
      channelCoverage,
    };

    this.sealedSegments.push(segment);
    this.nextSequence += 1;
    this.lastEndOffsetMs = endOffsetMs;

    return segment;
  }

  /** True when the just-sealed (or about-to-be-sealed) offset is contiguous with the prior seal. */
  hasContiguousCoverage(): boolean {
    if (this.sealedSegments.length <= 1) {
      return true;
    }
    for (let index = 1; index < this.sealedSegments.length; index += 1) {
      const previous = this.sealedSegments[index - 1]!;
      const current = this.sealedSegments[index]!;
      if (
        current.segmentSequence !== previous.segmentSequence + 1 ||
        current.startOffsetMs !== previous.endOffsetMs
      ) {
        return false;
      }
    }
    return true;
  }

  getLastSealedEndOffsetMs(): number | null {
    return this.lastEndOffsetMs;
  }
}
