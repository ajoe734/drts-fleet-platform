import {
  pcmDurationMs,
  type PcmFormat,
  type TimingPrecision,
} from "./audio-codec";

export type VoiceOutputOwner = "ai" | "handoff" | "human" | "none";

export interface VoiceMediaAccess {
  principalId: string;
  /** Issued after verifying principal role, DB owner and call scope. */
  owner: Exclude<VoiceOutputOwner, "none">;
  scopeId: string;
  outputEpoch: number;
  /**
   * A per-playback-generation fence.  An output epoch identifies the owner;
   * this token also prevents a cancelled synthesis stream from starting a new
   * playback while that owner remains the same.
   */
  generation: number;
}

export interface VoiceMediaOutputSink {
  /** Must clear the CTI outbound buffer synchronously; it may throw on disconnect. */
  clear(): void;
  /** The sink must check the access fence again for every audio chunk. */
  write(chunk: Uint8Array, access: VoiceMediaAccess): void;
}

export interface VoiceSynthesisAborter {
  /** Best-effort only: local clear must never await this transport operation. */
  abort(): void | Promise<void>;
}

export interface VoicePlaybackTiming {
  playbackId: string;
  generation: number;
  outcome: "playing" | "completed" | "cleared" | "unknown";
  sentAudioMs: number;
  confirmedAudioMs: number | null;
  timingPrecision: TimingPrecision;
}

interface TrackedOutput extends VoicePlaybackTiming {
  access: VoiceMediaAccess;
  aborter?: VoiceSynthesisAborter;
}

export interface VoiceMediaOutputFenceOptions {
  sessionId: string;
  scopeId: string;
  sink: VoiceMediaOutputSink;
  maxBufferedAudioMs: number;
  initialOwner?: Exclude<VoiceOutputOwner, "none">;
  initialPrincipalId?: string;
}

/**
 * Local owner/generation fence. It has no API or DB dependency: barge-in and
 * handoff clear locally before their control event is eventually persisted.
 */
export class VoiceMediaOutputFence {
  private owner: VoiceOutputOwner;
  private principalId: string | null;
  private outputEpoch = 1;
  private generation = 1;
  private bufferedAudioMs = 0;
  private readonly playbacks = new Map<string, TrackedOutput>();

  constructor(private readonly options: VoiceMediaOutputFenceOptions) {
    if (options.maxBufferedAudioMs <= 0) {
      throw new Error("maxBufferedAudioMs must be positive.");
    }
    this.owner = options.initialOwner ?? "none";
    this.principalId = options.initialPrincipalId ?? null;
    if (this.owner !== "none" && !this.principalId) {
      throw new Error(
        "An initial output owner requires an initial principal id.",
      );
    }
  }

  getOutputEpoch(): number {
    return this.outputEpoch;
  }

  getGeneration(): number {
    return this.generation;
  }

  issueAccess(principalId: string): VoiceMediaAccess | null {
    if (this.owner === "none" || this.principalId !== principalId) return null;
    return {
      principalId,
      owner: this.owner,
      scopeId: this.options.scopeId,
      outputEpoch: this.outputEpoch,
      generation: this.generation,
    };
  }

  /** Barge-in: invalidate first, immediately issue CTI clear, then abort TTS elsewhere. */
  localClear(): {
    clearedPlaybackIds: string[];
    result: "cleared" | "unknown";
  } {
    const clearedPlaybackIds: string[] = [];
    this.generation += 1;
    for (const playback of this.playbacks.values()) {
      if (playback.outcome === "playing") {
        playback.outcome = "cleared";
        playback.timingPrecision = "unknown";
        clearedPlaybackIds.push(playback.playbackId);
        // Do not await an HTTP cancellation ACK. Attach a rejection handler so
        // a best-effort failure cannot become an unhandled rejection.
        try {
          const abortResult = playback.aborter?.abort();
          if (abortResult instanceof Promise)
            void abortResult.catch(() => undefined);
        } catch {
          // The playback outcome remains governed by the local CTI clear.
        }
      }
    }
    this.bufferedAudioMs = 0;
    try {
      this.options.sink.clear();
      return { clearedPlaybackIds, result: "cleared" };
    } catch {
      // CTI loss means the physical result is unknown, never "completed".
      for (const playbackId of clearedPlaybackIds) {
        const playback = this.playbacks.get(playbackId);
        if (playback) playback.outcome = "unknown";
      }
      return { clearedPlaybackIds, result: "unknown" };
    }
  }

  /**
   * Clears old output before changing the epoch. A failed clear revokes the
   * owner and leaves handoff pending, rather than claiming audio isolation.
   */
  transfer(
    access: VoiceMediaAccess,
    nextOwner: Exclude<VoiceOutputOwner, "none">,
    nextPrincipalId: string,
  ): boolean {
    if (!this.isCurrentAccess(access)) return false;
    const clear = this.localClear();
    this.owner = "none";
    this.principalId = null;
    if (clear.result === "unknown") return false;
    this.outputEpoch += 1;
    this.owner = nextOwner;
    this.principalId = nextPrincipalId;
    return true;
  }

  writePcm16(
    access: VoiceMediaAccess,
    playbackId: string,
    chunk: Int16Array,
    format: PcmFormat,
  ): boolean {
    if (!this.isCurrentAccess(access)) return false;
    const durationMs = pcmDurationMs(chunk.length, format);
    if (this.bufferedAudioMs + durationMs > this.options.maxBufferedAudioMs) {
      return false;
    }
    let playback = this.playbacks.get(playbackId);
    if (!playback) {
      playback = {
        playbackId,
        generation: this.generation,
        outcome: "playing",
        sentAudioMs: 0,
        confirmedAudioMs: null,
        timingPrecision: "estimated",
        access,
      };
      this.playbacks.set(playbackId, playback);
    }
    if (
      playback.generation !== this.generation ||
      playback.outcome !== "playing"
    )
      return false;
    const bytes = new Uint8Array(
      chunk.buffer,
      chunk.byteOffset,
      chunk.byteLength,
    );
    try {
      // This is immediately preceded by an access check.  The concrete sink
      // receives the same token so an async/provider-facing implementation can
      // apply its own final fence before it sends the chunk.
      this.options.sink.write(bytes, access);
    } catch {
      // A disconnected CTI cannot establish whether this chunk played. Keep
      // that uncertainty explicit and do not account it as queued audio.
      playback.outcome = "unknown";
      playback.timingPrecision = "unknown";
      return false;
    }
    playback.sentAudioMs += durationMs;
    this.bufferedAudioMs += durationMs;
    return true;
  }

  registerSynthesisAborter(
    access: VoiceMediaAccess,
    playbackId: string,
    aborter: VoiceSynthesisAborter,
  ): boolean {
    if (!this.isCurrentAccess(access)) return false;
    const playback = this.playbacks.get(playbackId);
    if (
      !playback ||
      playback.access.outputEpoch !== access.outputEpoch ||
      playback.access.generation !== access.generation
    )
      return false;
    playback.aborter = aborter;
    return true;
  }

  /** Call only when the CTI reports buffer drain; never let local accounting grow forever. */
  noteBufferDrained(durationMs: number): void {
    this.bufferedAudioMs = Math.max(
      0,
      this.bufferedAudioMs - Math.max(0, durationMs),
    );
  }

  /** A clear may also return a provider mark. Only an un-cleared current generation completes. */
  markCompleted(playbackId: string, providerCursorMs?: number): boolean {
    const playback = this.playbacks.get(playbackId);
    if (
      !playback ||
      playback.outcome !== "playing" ||
      playback.generation !== this.generation
    )
      return false;
    playback.outcome = "completed";
    if (
      providerCursorMs === undefined ||
      !Number.isFinite(providerCursorMs) ||
      providerCursorMs < 0
    ) {
      playback.confirmedAudioMs = null;
      playback.timingPrecision = "unknown";
    } else {
      playback.confirmedAudioMs = providerCursorMs;
      playback.timingPrecision = "measured";
    }
    return true;
  }

  getPlaybackTiming(playbackId: string): VoicePlaybackTiming | null {
    const playback = this.playbacks.get(playbackId);
    if (!playback) return null;
    return {
      playbackId: playback.playbackId,
      generation: playback.generation,
      outcome: playback.outcome,
      sentAudioMs: playback.sentAudioMs,
      confirmedAudioMs: playback.confirmedAudioMs,
      timingPrecision: playback.timingPrecision,
    };
  }

  private isCurrentAccess(access: VoiceMediaAccess): boolean {
    return (
      access.scopeId === this.options.scopeId &&
      access.outputEpoch === this.outputEpoch &&
      access.generation === this.generation &&
      access.owner === this.owner &&
      access.principalId === this.principalId
    );
  }
}
