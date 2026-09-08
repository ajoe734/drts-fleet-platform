/** Media codec and timing helpers (SD §11.2, §11.4). */

export type TimingPrecision = "measured" | "estimated" | "unknown";

export interface PcmFormat {
  sampleRateHz: number;
  channels: number;
}

/**
 * Decode G.711 μ-law bytes to signed 16-bit little-endian PCM samples.
 * Telephone μ-law bytes must never be passed to a PCM ASR input unchanged.
 */
export function muLawToPcm16(muLaw: Uint8Array): Int16Array {
  const pcm = new Int16Array(muLaw.length);
  for (let index = 0; index < muLaw.length; index += 1) {
    const value = ~(muLaw[index] ?? 0);
    let magnitude = ((value & 0x0f) << 3) + 0x84;
    magnitude <<= (value & 0x70) >> 4;
    pcm[index] = (value & 0x80) !== 0 ? 0x84 - magnitude : magnitude - 0x84;
  }
  return pcm;
}

/** Encode signed 16-bit PCM samples as G.711 μ-law bytes for an 8 kHz leg. */
export function pcm16ToMuLaw(pcm: Int16Array): Uint8Array {
  const encoded = new Uint8Array(pcm.length);
  for (let index = 0; index < pcm.length; index += 1) {
    let sample = pcm[index] ?? 0;
    const sign = sample < 0 ? 0x80 : 0;
    if (sample < 0) sample = -sample;
    sample = Math.min(sample, 32635) + 0x84;

    let exponent = 7;
    for (let mask = 0x4000; exponent > 0 && (sample & mask) === 0; mask >>= 1) {
      exponent -= 1;
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    encoded[index] = ~(sign | (exponent << 4) | mantissa) & 0xff;
  }
  return encoded;
}

export function pcmDurationMs(
  sampleCount: number,
  format: PcmFormat,
): number {
  if (format.sampleRateHz <= 0 || format.channels <= 0) {
    throw new Error("PCM format must have positive sample rate and channel count.");
  }
  return (sampleCount / format.channels / format.sampleRateHz) * 1_000;
}

export interface VoiceVadEchoAssessment {
  /** The frame is kept even when this is false; silence is not packet loss. */
  speechCandidate: boolean;
  /** A candidate matching the local output must not start a passenger turn. */
  likelyEcho: boolean;
  rms: number;
}

export interface VoiceVadEchoGateOptions {
  /** RMS amplitude required to flag a frame as candidate speech. */
  speechRmsThreshold: number;
  /** Optional echo detector fed by a separately captured output reference leg. */
  isLikelyEcho?: (samples: Int16Array) => boolean;
}

/**
 * VAD is only a turn signal. It deliberately does not discard silent input
 * frames, and echo suppression cannot establish the speaker's identity.
 */
export class VoiceVadEchoGate {
  constructor(private readonly options: VoiceVadEchoGateOptions) {}

  assessPcm16(samples: Int16Array): VoiceVadEchoAssessment {
    if (samples.length === 0) {
      return { speechCandidate: false, likelyEcho: false, rms: 0 };
    }
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const rms = Math.sqrt(energy / samples.length);
    const speechCandidate = rms >= this.options.speechRmsThreshold;
    return {
      speechCandidate,
      likelyEcho:
        speechCandidate && (this.options.isLikelyEcho?.(samples) ?? false),
      rms,
    };
  }
}
