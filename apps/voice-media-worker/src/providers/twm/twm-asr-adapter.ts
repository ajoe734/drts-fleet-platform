import { VoiceMediaProviderError } from "../../media-provider";
import type {
  VoiceAsrSegmentResult,
  VoiceAsrTranscribeRequest,
  VoiceSpeechToTextAdapter,
} from "../../media-provider";

import type { TwmAsrSocket, TwmAsrTransport } from "./twm-transport";
import {
  TWM_ASR_MAX_FRAME_BYTES,
  isTwmAsrReconnectErrorCode,
  type TwmAsrConnectParams,
  type TwmAsrDrainReason,
  type TwmAsrSegmentMessage,
  type TwmAsrServerMessage,
  type TwmAsrTimingConfig,
} from "./twm-types";

/**
 * TWM Streaming ASR adapter (SD §11.1, §11.4, §11.5). This wraps the
 * documented ticket/ready/partial-final/EOS-drain/reconnect protocol behind
 * the shared `VoiceSpeechToTextAdapter` seam. It is never production-capable
 * on its own: a real transport (HTTP + WebSocket client bound to a verified
 * account) is UV-EXEC-027/028's job. Tests and non-production callers supply
 * a fixture `TwmAsrTransport`.
 */

export class TwmAsrReconnectRequiredError extends VoiceMediaProviderError {
  constructor(public readonly reconnectCode: string, message: string) {
    super("TWM_ASR_RECONNECT_REQUIRED", message, { reconnectCode });
    this.name = "TwmAsrReconnectRequiredError";
  }
}

// ---------------------------------------------------------------------------
// SD §11.5: separately-configured timing limits, classified independently
// rather than folded into one "silence timeout".
// ---------------------------------------------------------------------------

export interface TwmAsrTimingState {
  msSinceLastAudioPacket: number;
  msSinceLastSpeechActivity: number;
  msSinceSessionStart: number;
}

export type TwmAsrTimingViolation =
  | { kind: "packet_loss" }
  | { kind: "no_speech" }
  | { kind: "idle" }
  | { kind: "max_duration" }
  | null;

/**
 * Pure classifier so each SD §11.5 limit stays independently testable: a
 * long silent hold must trip `idle`/`no_speech`, never `packet_loss`, and a
 * dropped audio stream must trip `packet_loss` on its own timer.
 */
export function classifyAsrTimingViolation(
  state: TwmAsrTimingState,
  config: TwmAsrTimingConfig,
): TwmAsrTimingViolation {
  if (state.msSinceSessionStart >= config.maxDurationSec * 1_000) {
    return { kind: "max_duration" };
  }
  if (state.msSinceLastAudioPacket >= config.maxPacketLossDurSec * 1_000) {
    return { kind: "packet_loss" };
  }
  if (state.msSinceLastSpeechActivity >= config.idleTimeoutSec * 1_000) {
    return { kind: "idle" };
  }
  if (state.msSinceLastSpeechActivity >= config.noSpeechTimeoutSec * 1_000) {
    return { kind: "no_speech" };
  }
  return null;
}

function chunkFrame(bytes: Uint8Array, maxBytes: number): Uint8Array[] {
  if (bytes.length <= maxBytes) return [bytes];
  const frames: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += maxBytes) {
    frames.push(bytes.subarray(offset, offset + maxBytes));
  }
  return frames;
}

export interface TwmAsrTrackedSegment {
  revision: number;
  text: string;
  final: boolean;
  language: string;
}

type TrackedSegment = TwmAsrTrackedSegment;

export interface TwmAsrStreamSessionOptions {
  sessionId: string;
  transport: TwmAsrTransport;
  modelName: string;
  type: string;
  rate: number;
  /** SD §11.1 step 3: only pass `1` when the contract has been confirmed to allow provider retention. */
  saveResult?: 0 | 1;
  timing: TwmAsrTimingConfig;
  /** Window to keep collecting final results after EOS before returning (SD §11.1 step 6). */
  drainTimeoutMs?: number;
  maxFrameBytes?: number;
}

/**
 * One TWM ASR streaming session (SD §11.1). Owns the ticket lifecycle,
 * ready-gate, frame chunking, partial/final tracking, EOS drain, and
 * reconnect-with-a-fresh-ticket recovery for one call leg.
 */
export class TwmAsrStreamSession {
  private token: string | null = null;
  private socket: TwmAsrSocket | null = null;
  private ready = false;
  private readyWaiters: Array<() => void> = [];
  private readonly queuedFrames: Uint8Array[] = [];
  private readonly segments = new Map<string, TrackedSegment>();
  private segmentWaiters: Array<{
    resolve: (message: TwmAsrSegmentMessage) => void;
    reject: (error: unknown) => void;
  }> = [];
  private asrEpoch = 1;
  private modelName: string;
  private readonly maxFrameBytes: number;
  private readonly drainTimeoutMs: number;

  constructor(private readonly options: TwmAsrStreamSessionOptions) {
    this.modelName = options.modelName;
    this.maxFrameBytes = options.maxFrameBytes ?? TWM_ASR_MAX_FRAME_BYTES;
    this.drainTimeoutMs = options.drainTimeoutMs ?? 1_500;
  }

  getAsrEpoch(): number {
    return this.asrEpoch;
  }

  getModelName(): string {
    return this.modelName;
  }

  /** Introspection for tests/diagnostics; does not affect protocol state. */
  getSegmentSnapshot(segmentId: string): TwmAsrTrackedSegment | null {
    const segment = this.segments.get(segmentId);
    return segment ? { ...segment } : null;
  }

  /** SD §11.1 steps 1-4: login (if needed), fetch a fresh ticket, connect, and wait for `180`. */
  async ensureConnected(): Promise<void> {
    if (this.socket && this.ready) return;
    if (this.socket && !this.ready) {
      await this.waitUntilReady();
      return;
    }
    if (!this.token) {
      const login = await this.options.transport.login();
      this.token = login.token;
    }
    // SD §11.1 step 2: fetch the ticket immediately before connecting, never reused stale.
    const accessInfo = await this.options.transport.fetchAccessInfo(this.token);
    const params: TwmAsrConnectParams = {
      modelName: this.modelName,
      type: this.options.type,
      rate: this.options.rate,
      enableTransient: 1,
      saveResult: this.options.saveResult ?? 0,
    };
    const socket = await this.options.transport.connect(accessInfo, params);
    this.socket = socket;
    this.ready = false;
    socket.onMessage((message) => this.handleServerMessage(message));
    await this.waitUntilReady();
  }

  private waitUntilReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve) => {
      this.readyWaiters.push(resolve);
    });
  }

  private handleServerMessage(message: TwmAsrServerMessage): void {
    if (message.type === "status") {
      if (message.code === "180") {
        this.ready = true;
        this.flushQueuedFrames();
        for (const resolve of this.readyWaiters.splice(0)) resolve();
      }
      // `100` is preparing-only; nothing to do yet.
      return;
    }
    if (message.type === "error") {
      if (isTwmAsrReconnectErrorCode(message.code)) {
        const error = new TwmAsrReconnectRequiredError(
          message.code,
          `TWM ASR requires reconnect (${message.code}): ${message.message}`,
        );
        for (const waiter of this.segmentWaiters.splice(0)) waiter.reject(error);
      }
      return;
    }
    // message.type === "segment": SD §11.1 step 5 -- a frozen (final) segment
    // must never be revised by a later, possibly-stale message.
    const existing = this.segments.get(message.segmentId);
    if (existing?.final) return;
    this.segments.set(message.segmentId, {
      revision: message.revision,
      text: message.text,
      final: message.final,
      language: message.language,
    });
    const waiter = this.segmentWaiters.shift();
    waiter?.resolve(message);
  }

  private flushQueuedFrames(): void {
    if (!this.socket) return;
    for (const frame of this.queuedFrames.splice(0)) {
      this.socket.sendAudioFrame(frame);
    }
  }

  private sendFramed(chunk: Uint8Array): void {
    const frames = chunkFrame(chunk, this.maxFrameBytes);
    if (this.ready && this.socket) {
      for (const frame of frames) this.socket.sendAudioFrame(frame);
    } else {
      this.queuedFrames.push(...frames);
    }
  }

  private waitForNextSegment(
    timeoutMs: number,
  ): Promise<TwmAsrSegmentMessage | null> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.segmentWaiters.findIndex((w) => w.resolve === onResolve);
        if (index >= 0) this.segmentWaiters.splice(index, 1);
        resolve(null);
      }, timeoutMs);
      const onResolve = (message: TwmAsrSegmentMessage) => {
        clearTimeout(timer);
        resolve(message);
      };
      const onReject = (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      };
      this.segmentWaiters.push({ resolve: onResolve, reject: onReject });
    });
  }

  /** SD §11.1 steps 4-5: send one audio chunk and await the next partial/final update. */
  async transcribeChunk(chunk: Uint8Array): Promise<VoiceAsrSegmentResult> {
    await this.ensureConnected();
    try {
      return await this.sendAndAwait(chunk);
    } catch (error) {
      if (error instanceof TwmAsrReconnectRequiredError) {
        await this.reconnect();
        return await this.sendAndAwait(chunk);
      }
      throw error;
    }
  }

  private async sendAndAwait(chunk: Uint8Array): Promise<VoiceAsrSegmentResult> {
    this.sendFramed(chunk);
    const timeoutMs = this.options.timing.noSpeechTimeoutSec * 1_000;
    const message = await this.waitForNextSegment(timeoutMs);
    if (!message) {
      throw new VoiceMediaProviderError(
        "TWM_ASR_NO_SPEECH_TIMEOUT",
        `No ASR segment update within noSpeechTimeoutSec=${this.options.timing.noSpeechTimeoutSec}s.`,
        { sessionId: this.options.sessionId },
      );
    }
    return {
      segmentId: message.segmentId,
      revision: message.revision,
      text: message.text,
      final: message.final,
      language: message.language,
    };
  }

  /**
   * SD §11.1 step 6: audio end sends text `EOS`, then a drain window collects
   * remaining final segments. `reason: "disconnect"` must never be read by a
   * caller as a passenger confirmation -- it is returned in the result so
   * the caller cannot silently conflate it with a normal audio-end drain.
   */
  async endAudio(
    reason: TwmAsrDrainReason = "audio_end",
  ): Promise<{ reason: TwmAsrDrainReason; finals: VoiceAsrSegmentResult[] }> {
    const beforeFinalIds = new Set(
      [...this.segments.entries()].filter(([, s]) => s.final).map(([id]) => id),
    );
    if (this.socket) {
      try {
        this.socket.sendEos();
      } catch {
        // A disconnected transport cannot send EOS; the drain window below
        // still applies so any already-in-flight finals are captured.
      }
    }
    await sleep(this.drainTimeoutMs);
    const finals: VoiceAsrSegmentResult[] = [];
    for (const [segmentId, segment] of this.segments) {
      if (segment.final && !beforeFinalIds.has(segmentId)) {
        finals.push({
          segmentId,
          revision: segment.revision,
          text: segment.text,
          final: true,
          language: segment.language,
        });
      }
    }
    return { reason, finals };
  }

  /**
   * SD §11.1 step 7: a timeout/resource-full error must reconnect with a
   * freshly-fetched ticket, never the expired one, while session-level
   * segment state (already-final segments) survives the reconnect.
   */
  async reconnect(): Promise<void> {
    this.closeSocket();
    this.token = null; // SD §11.1 step 1/2: re-login before fetching a new ticket.
    await this.ensureConnected();
  }

  private closeSocket(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Best-effort; the socket is being discarded regardless.
      }
    }
    this.socket = null;
    this.ready = false;
    this.queuedFrames.length = 0;
  }

  /**
   * SD §11.4 last paragraph: switching ASR model requires draining/EOS-ing
   * the old stream, invalidating any not-yet-final ("uncommitted") segment,
   * and opening the new model under a new epoch -- never carrying over a
   * prior unfrozen segment as if the new model produced it.
   */
  async switchModel(nextModelName: string): Promise<{ asrEpoch: number }> {
    await this.endAudio("audio_end").catch(() => undefined);
    for (const [segmentId, segment] of [...this.segments]) {
      if (!segment.final) this.segments.delete(segmentId);
    }
    this.closeSocket();
    this.token = null;
    this.modelName = nextModelName;
    this.asrEpoch += 1;
    await this.ensureConnected();
    return { asrEpoch: this.asrEpoch };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Diagnostic replay (SD §11.4): isolated from the confirmation-producing
// session above by construction -- it is a different class with a different
// result type, never fed into `TwmSpeechToTextAdapter`/`VoiceMediaWorkerSession`.
// ---------------------------------------------------------------------------

export interface TwmAsrDiagnosticReplayResult {
  isDiagnosticReplay: true;
  utteranceId: string;
  segments: VoiceAsrSegmentResult[];
}

export class TwmAsrDiagnosticReplaySession {
  constructor(private readonly session: TwmAsrStreamSession) {}

  /** Bounded, local-only re-transcription for text diagnostics; never produces passenger consent. */
  async replay(
    utteranceId: string,
    boundedAudio: Uint8Array,
  ): Promise<TwmAsrDiagnosticReplayResult> {
    await this.session.ensureConnected();
    const result = await this.session.transcribeChunk(boundedAudio);
    const drain = await this.session.endAudio("disconnect");
    return {
      isDiagnosticReplay: true,
      utteranceId,
      segments: [result, ...drain.finals],
    };
  }
}

// ---------------------------------------------------------------------------
// VoiceSpeechToTextAdapter integration
// ---------------------------------------------------------------------------

export interface TwmSpeechToTextAdapterOptions {
  transport: TwmAsrTransport;
  modelName: string;
  type: string;
  rate: number;
  timing: TwmAsrTimingConfig;
  saveResult?: 0 | 1;
  drainTimeoutMs?: number;
}

/**
 * SD acceptance: this adapter is never `isProductionCapable` -- account
 * verification and model/quota confirmation belong to UV-EXEC-027/028.
 */
export class TwmSpeechToTextAdapter implements VoiceSpeechToTextAdapter {
  readonly providerName = "twm";
  readonly isProductionCapable = false as const;

  private readonly sessions = new Map<string, TwmAsrStreamSession>();

  constructor(private readonly options: TwmSpeechToTextAdapterOptions) {}

  private getOrCreateSession(sessionId: string): TwmAsrStreamSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = new TwmAsrStreamSession({
        sessionId,
        transport: this.options.transport,
        modelName: this.options.modelName,
        type: this.options.type,
        rate: this.options.rate,
        timing: this.options.timing,
        ...(this.options.saveResult !== undefined
          ? { saveResult: this.options.saveResult }
          : {}),
        ...(this.options.drainTimeoutMs !== undefined
          ? { drainTimeoutMs: this.options.drainTimeoutMs }
          : {}),
      });
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  async transcribe(
    request: VoiceAsrTranscribeRequest,
  ): Promise<VoiceAsrSegmentResult> {
    const session = this.getOrCreateSession(request.sessionId);
    return session.transcribeChunk(request.audioChunk);
  }

  /** Exposed for orchestration code that needs EOS drain, reconnect, or model switch. */
  getSession(sessionId: string): TwmAsrStreamSession {
    return this.getOrCreateSession(sessionId);
  }

  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
