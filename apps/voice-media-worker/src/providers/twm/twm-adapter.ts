import type {
  VoiceAsrSegmentResult,
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
  private readonly finalRevisions = new Map<string, number>();
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
    if (Date.parse(access.expiresAt) <= Date.parse(now)) {
      throw new Error("TWM access ticket is expired; acquire a fresh ticket before connecting.");
    }
    const url = new URL(access.websocketUrl);
    url.searchParams.set("ticket", access.ticket);
    return { authorization: "Bearer fixture-token", websocketUrlWithTicket: url.toString() };
  }

  /** `180`, not `100`, is the fixture protocol's media-send readiness gate. */
  maySendAudio(providerStatus: number): boolean {
    return providerStatus === 180 && !this.eosSent;
  }

  async transcribe(): Promise<VoiceAsrSegmentResult> {
    if (this.eosSent) throw new Error("TWM ASR stream is draining after EOS; do not send more audio.");
    const fixture = this.fixtures[this.transcriptIndex++];
    if (!fixture) throw new Error("TWM ASR fixture has no remaining transcript event.");
    const previousFinal = this.finalRevisions.get(fixture.segmentId);
    if (previousFinal !== undefined && fixture.revision <= previousFinal) {
      throw new Error("A final TWM segment is immutable and cannot be revised.");
    }
    if (fixture.final) this.finalRevisions.set(fixture.segmentId, fixture.revision);
    return { ...fixture };
  }

  endAudio(): { frame: "EOS"; drainWindowMs: number; confirmationEligible: false } {
    this.eosSent = true;
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
    this.eosSent = false;
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
  textType: string;
  /** Must be observed from this account's models/voices matrix before routing. */
  capabilityVerified: boolean;
}

export interface TwmLocalStopResult {
  playbackId: string;
  playbackCancellation: "cleared_locally";
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

  constructor(readonly voices: readonly TwmTtsVoiceProfile[]) {}

  async synthesize(request: VoiceTtsSynthesizeRequest): Promise<VoiceTtsPlaybackHandle> {
    const voice = this.voices.find((candidate) => candidate.languageCode === request.languageCode);
    if (!voice || !voice.capabilityVerified) {
      throw new Error(`No verified TWM TTS voice is enabled for '${request.languageCode}'.`);
    }
    this.playbackCounter += 1;
    const playbackId = `twm-fixture-playback-${this.playbackCounter}`;
    this.active.add(playbackId);
    return { playbackId, generation: request.generation, audioChunks: [new Uint8Array([0, 0])] };
  }

  localStop(playbackId: string): TwmLocalStopResult | null {
    if (!this.active.delete(playbackId)) return null;
    return {
      playbackId,
      playbackCancellation: "cleared_locally",
      synthesisCancellation: "abort_requested",
      providerCancellationAcknowledged: "unverified",
      billingOutcome: "unverified",
    };
  }
}
