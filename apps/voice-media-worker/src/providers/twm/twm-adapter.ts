import type {
  VoiceAsrSegmentResult,
  VoiceAsrTranscribeRequest,
  VoiceSpeechToTextAdapter,
  VoiceTextToSpeechAdapter,
  VoiceTtsPlaybackHandle,
  VoiceTtsSynthesizeRequest,
} from "../../media-provider";

/** The independently configurable timers from SD §11.5; do not merge these. */
export interface TwmAsrTimeouts {
  minSilenceDurMs: number;
  maxPacketLossDurSec: number;
  noSpeechTimeoutMs: number;
  idleTimeoutMs: number;
  maxDurationMs: number;
  eosDrainMs: number;
}

export interface TwmAsrRouteProfile {
  modelName: string;
  audioType: "pcm_s16le" | "g711_ulaw";
  sampleRateHz: 8_000 | 16_000;
  timeouts: TwmAsrTimeouts;
  /** Account/model validation is a separate UV-EXEC-027/028 gate. */
  accountCapabilityVerified: boolean;
}

export interface TwmAccessInfoFixture {
  websocketUrl: string;
  ticket: string;
  expiresAt: string;
}

export interface TwmTranscriptFixture {
  providerSessionId: string;
  segmentId: string;
  revision: number;
  text: string;
  final: boolean;
  language: string;
}

export type TwmAsrDisconnectCode = 408 | 440 | 486;

function assertTimeouts(timeouts: TwmAsrTimeouts): void {
  for (const [name, value] of Object.entries(timeouts)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`TWM ASR ${name} must be a positive number.`);
    }
  }
}

/**
 * Document/fixture implementation of the TWM wire protocol.  It deliberately
 * has no credentials or network side effects, and is never production-capable.
 */
export class TwmAsrFixtureAdapter implements VoiceSpeechToTextAdapter {
  readonly providerName = "twm";
  readonly isProductionCapable = false as const;
  private transcriptIndex = 0;
  private readonly segments = new Map<string, TwmTranscriptFixture>();
  private readonly usedTickets = new Set<string>();
  private ready = false;
  private hasAccess = false;
  private diagnosticOnly = false;
  private utteranceId?: string;
  private drainUntil = 0;
  private eosSent = false;

  constructor(
    readonly profile: TwmAsrRouteProfile,
    private readonly fixtures: readonly TwmTranscriptFixture[],
  ) {
    assertTimeouts(profile.timeouts);
  }

  /** Models the login + one-time, URL-encoded ticket acquisition steps. */
  acquireAccess(now: string, access: TwmAccessInfoFixture): {
    authorization: "Bearer fixture-token";
    websocketUrlWithTicket: string;
  } {
    if (!Number.isFinite(Date.parse(now)) || !Number.isFinite(Date.parse(access.expiresAt)) || Date.parse(access.expiresAt) <= Date.parse(now)) {
      throw new Error("TWM access ticket is expired; acquire a fresh ticket before connecting.");
    }
    const url = new URL(access.websocketUrl);
    if (url.protocol !== "wss:" || !access.ticket || this.usedTickets.has(access.ticket)) {
      throw new Error("TWM requires a fresh single-use ticket and secure WebSocket URL.");
    }
    this.usedTickets.add(access.ticket);
    this.hasAccess = true;
    this.ready = false;
    url.searchParams.set("ticket", access.ticket);
    url.searchParams.set("modelName", this.profile.modelName);
    url.searchParams.set("type", this.profile.audioType);
    url.searchParams.set("rate", String(this.profile.sampleRateHz));
    url.searchParams.set("enableTransient", "1");
    url.searchParams.set("saveResult", "0");
    return { authorization: "Bearer fixture-token", websocketUrlWithTicket: url.toString() };
  }

  /** `180`, not `100`, is the fixture protocol's media-send readiness gate. */
  maySendAudio(providerStatus: number): boolean {
    this.ready = this.hasAccess && providerStatus === 180 && !this.eosSent;
    return this.ready;
  }

  async transcribe(request: VoiceAsrTranscribeRequest): Promise<VoiceAsrSegmentResult> {
    if (this.diagnosticOnly) throw new Error("Diagnostic replay is isolated from the dialogue stream.");
    this.sendAudio(request.audioChunk);
    return this.receiveResult();
  }

  sendAudio(chunk: Uint8Array): void {
    if (!this.ready || this.eosSent) throw new Error("TWM audio requires 180 ready and an open stream.");
    if (chunk.byteLength >= 384 * 1024) throw new Error("TWM frame must be smaller than 384 KB.");
  }

  /** Receive-side drain stays open after audio sending stops. Final is never consent. */
  receiveResult(now = Date.now()): TwmTranscriptFixture & {
    confirmationEligible: false; diagnosticOnly: boolean; utteranceId?: string;
  } {
    if (!this.hasAccess || (!this.ready && !this.eosSent) ||
        (this.eosSent && now >= this.drainUntil)) throw new Error("TWM result stream is closed or not ready.");
    const fixture = this.fixtures[this.transcriptIndex++];
    if (!fixture) throw new Error("TWM ASR fixture has no remaining transcript event.");
    const key = JSON.stringify([fixture.providerSessionId, fixture.segmentId]);
    const previous = this.segments.get(key);
    if (!Number.isInteger(fixture.revision) || fixture.revision < 0 ||
        previous?.final || (previous && fixture.revision <= previous.revision)) {
      throw new Error("TWM segment revision must increase; a final segment is immutable.");
    }
    this.segments.set(key, { ...fixture });
    return { ...fixture, confirmationEligible: false, diagnosticOnly: this.diagnosticOnly,
      ...(this.utteranceId ? { utteranceId: this.utteranceId } : {}) };
  }

  endAudio(now = Date.now()): { frame: "EOS"; drainWindowMs: number; confirmationEligible: false } {
    if (!this.eosSent) this.drainUntil = now + this.profile.timeouts.eosDrainMs;
    this.eosSent = true;
    this.ready = false;
    return {
      frame: "EOS",
      drainWindowMs: this.profile.timeouts.eosDrainMs,
      // EOS after hangup is transport closure, never passenger consent.
      confirmationEligible: false,
    };
  }

  reconnect(code: TwmAsrDisconnectCode, options: { diagnosticReplay?: boolean; utteranceId?: string } = {}): {
    requiresFreshTicket: true;
    diagnosticOnly: boolean;
    confirmationEligible: false;
    utteranceId?: string;
  } {
    if (![408, 440, 486].includes(code)) throw new Error("Unsupported TWM disconnect classification.");
    if (options.diagnosticReplay && !options.utteranceId) throw new Error("Diagnostic replay requires utteranceId.");
    this.eosSent = false;
    this.ready = false;
    this.hasAccess = false;
    this.diagnosticOnly = options.diagnosticReplay === true;
    this.utteranceId = options.utteranceId;
    return {
      requiresFreshTicket: true,
      diagnosticOnly: options.diagnosticReplay === true,
      confirmationEligible: false,
      ...(options.utteranceId ? { utteranceId: options.utteranceId } : {}),
    };
  }
}

export interface TwmTtsVoiceProfile {
  model: string;
  languageCode: "cmn-TW" | "nan-TW" | "hak-TW";
  name: string;
  accent?: "sixian" | "hailu";
  textType: string;
  /** Must be observed from this account's models/voices matrix before routing. */
  capabilityVerified: boolean;
}

export interface TwmLocalStopResult {
  playbackId: string;
  playbackCancellation: "cleared_locally" | "unknown";
  synthesisCancellation: "abort_requested";
  providerCancellationAcknowledged: "unverified";
  billingOutcome: "unverified";
}

/** Fixture TTS adapter. It never claims a provider cancel acknowledgement or zero billing. */
export class TwmTtsFixtureAdapter implements VoiceTextToSpeechAdapter {
  readonly providerName = "twm";
  readonly isProductionCapable = false as const;
  private playbackCounter = 0;
  private readonly active = new Set<string>();

  constructor(readonly voices: readonly TwmTtsVoiceProfile[], private readonly playbackControl?: {
    clear(playbackId: string): void;
    abort(playbackId: string): void | Promise<void>;
  }) {}

  buildSynthesisRequest(request: VoiceTtsSynthesizeRequest) {
    const voice = this.voices.find((candidate) => candidate.languageCode === request.languageCode && candidate.capabilityVerified);
    if (!voice || !voice.model || !voice.name || !voice.textType ||
        (voice.languageCode === "hak-TW" && !voice.accent)) {
      throw new Error(`No verified TWM TTS voice is enabled for '${request.languageCode}'.`);
    }
    return {
      input: { text: request.text, textType: voice.textType },
      voice: { model: voice.model, languageCode: voice.languageCode, name: voice.name },
      audioConfig: { speakingRate: 1.0 }, outputConfig: { streamMode: 1 },
    };
  }

  async synthesize(request: VoiceTtsSynthesizeRequest): Promise<VoiceTtsPlaybackHandle> {
    this.buildSynthesisRequest(request);
    this.playbackCounter += 1;
    const playbackId = `twm-fixture-playback-${this.playbackCounter}`;
    this.active.add(playbackId);
    return { playbackId, generation: request.generation, audioChunks: [new Uint8Array([0, 0])] };
  }

  localStop(playbackId: string): TwmLocalStopResult | null {
    if (!this.active.delete(playbackId)) return null;
    let playbackCancellation: TwmLocalStopResult["playbackCancellation"] = "cleared_locally";
    try { this.playbackControl?.clear(playbackId); } catch { playbackCancellation = "unknown"; }
    try { void Promise.resolve(this.playbackControl?.abort(playbackId)).catch(() => undefined); } catch { /* best effort */ }
    return {
      playbackId,
      playbackCancellation,
      synthesisCancellation: "abort_requested",
      providerCancellationAcknowledged: "unverified",
      billingOutcome: "unverified",
    };
  }
}
