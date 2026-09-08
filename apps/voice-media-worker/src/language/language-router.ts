import {
  VOICE_ASR_BASELINE_MODEL_ID,
  VOICE_ASR_EXPLICIT_HAKKA_MODEL_ID,
  assertRealtimeEligible,
  isHakkaLanguageCode,
} from "./language-models";

/**
 * Language selection and model routing (SD §11.3, §11.4 last paragraph).
 * This module never talks to a provider; it only decides which ASR model a
 * session should be on, and tags *why* (source), so callers can enforce
 * "no silent Hakka inference" and "no reused unfrozen confirmation across a
 * model switch" without duplicating that policy at every call site.
 */

export const VOICE_LANGUAGE_SOURCES = [
  "line_default",
  "customer_dtmf",
  "customer_explicit",
  "verified_detector",
] as const;
export type VoiceLanguageSource = (typeof VOICE_LANGUAGE_SOURCES)[number];

export interface VoiceLanguageState {
  languageCode: string;
  modelId: string;
  source: VoiceLanguageSource;
}

export interface VoiceLanguageDecision {
  state: VoiceLanguageState;
  /** True when the caller must drive an ASR model switch (SD §11.4: EOS/drain old stream, new epoch). */
  modelChanged: boolean;
}

export class VoiceLanguageSelectionRejectedError extends Error {
  constructor(
    public readonly reason: string,
    public readonly languageCode: string,
    public readonly source: VoiceLanguageSource,
  ) {
    super(
      `Rejected language selection '${languageCode}' via '${source}': ${reason}`,
    );
    this.name = "VoiceLanguageSelectionRejectedError";
  }
}

export interface VoiceLanguageRouterOptions {
  lineDefaultLanguageCode: string;
  /**
   * SD §11.3: "未實測的 language detector 不當唯一入口". A detector-sourced
   * selection is refused unless the deployment has explicitly marked the
   * detector verified.
   */
  detectorVerified?: boolean;
  /** Deployment-configured short multi-lingual-prompt DTMF map, e.g. `{ "2": "hak-TW" }`. */
  dtmfLanguageMap?: Readonly<Record<string, string>>;
}

/**
 * SD §11.3/§11.4: resolves language+source into a model, refusing to let the
 * multilingual baseline stand in for Hakka and refusing an unverified
 * detector as a sole entry point. Pure decision function; no provider I/O.
 */
export function resolveModelForLanguageSelection(input: {
  languageCode: string;
  source: VoiceLanguageSource;
  detectorVerified?: boolean;
}): string {
  if (input.source === "verified_detector" && !input.detectorVerified) {
    throw new VoiceLanguageSelectionRejectedError(
      "language detector is not marked verified for this deployment",
      input.languageCode,
      input.source,
    );
  }
  if (isHakkaLanguageCode(input.languageCode)) {
    if (input.source === "line_default") {
      throw new VoiceLanguageSelectionRejectedError(
        "pure Hakka must not be assumed from a line default; require explicit customer selection",
        input.languageCode,
        input.source,
      );
    }
    assertRealtimeEligible(VOICE_ASR_EXPLICIT_HAKKA_MODEL_ID);
    return VOICE_ASR_EXPLICIT_HAKKA_MODEL_ID;
  }
  assertRealtimeEligible(VOICE_ASR_BASELINE_MODEL_ID);
  return VOICE_ASR_BASELINE_MODEL_ID;
}

/**
 * SD §11.3: "純客語可透過短多語提示/DTMF 選擇，不先假定國語 ASR 能聽懂". Call
 * this when the baseline model keeps failing to produce usable recognition
 * and Hakka has not yet been explicitly selected -- it signals "play the
 * short multi-lingual prompt + DTMF menu", not "switch model automatically".
 */
export function shouldOfferMultilingualLanguagePrompt(state: {
  source: VoiceLanguageSource;
  currentModelId: string;
  recognitionUnusable: boolean;
}): boolean {
  if (state.source === "customer_dtmf" || state.source === "customer_explicit") {
    return false;
  }
  return (
    state.currentModelId === VOICE_ASR_BASELINE_MODEL_ID &&
    state.recognitionUnusable
  );
}

export class VoiceLanguageRouter {
  private state: VoiceLanguageState;

  constructor(private readonly options: VoiceLanguageRouterOptions) {
    this.state = {
      languageCode: options.lineDefaultLanguageCode,
      modelId: resolveModelForLanguageSelection({
        languageCode: options.lineDefaultLanguageCode,
        source: "line_default",
      }),
      source: "line_default",
    };
  }

  getState(): VoiceLanguageState {
    return this.state;
  }

  /** SD §11.3: customer picked a language via the short multi-lingual DTMF menu. */
  selectByDtmf(digit: string): VoiceLanguageDecision {
    const languageCode = this.options.dtmfLanguageMap?.[digit];
    if (!languageCode) {
      throw new VoiceLanguageSelectionRejectedError(
        `no language is mapped to DTMF digit '${digit}'`,
        digit,
        "customer_dtmf",
      );
    }
    return this.applySelection(languageCode, "customer_dtmf");
  }

  /** Customer said which language to use in plain speech (e.g. "請用客語"). */
  selectByExplicitRequest(languageCode: string): VoiceLanguageDecision {
    return this.applySelection(languageCode, "customer_explicit");
  }

  /** Only accepted when `detectorVerified` is set; never the sole entry point per SD §11.3. */
  selectByVerifiedDetector(languageCode: string): VoiceLanguageDecision {
    return this.applySelection(languageCode, "verified_detector");
  }

  private applySelection(
    languageCode: string,
    source: VoiceLanguageSource,
  ): VoiceLanguageDecision {
    const modelId = resolveModelForLanguageSelection(
      this.options.detectorVerified === undefined
        ? { languageCode, source }
        : { languageCode, source, detectorVerified: this.options.detectorVerified },
    );
    const modelChanged =
      modelId !== this.state.modelId || languageCode !== this.state.languageCode;
    this.state = { languageCode, modelId, source };
    return { state: this.state, modelChanged };
  }
}
