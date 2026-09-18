export type VoiceLanguage = "cmn-TW" | "nan-TW" | "hak-TW";
export type LanguageSelectionSource =
  | "line_default"
  | "customer_dtmf"
  | "customer_explicit"
  | "verified_detector";

export interface VoiceLanguageRoute {
  language: VoiceLanguage;
  asrModelName: string;
  ttsVoiceEnabled: boolean;
  asrCapabilityVerified: boolean;
  /** Human-checked recording/text variant, including the configured Hakka accent. */
  selectionPrompt: { assetId: string; verified: boolean };
  accent?: "sixian" | "hailu";
}

export interface LanguageSwitchResult {
  language: VoiceLanguage;
  asrModelName: string;
  source: LanguageSelectionSource;
  providerEpoch: number;
  drainOldStream: true;
  invalidateUncommittedConfirmation: true;
  preserveConfirmedDraft: true;
}

/**
 * Keeps the short multilingual/DTMF path available before any ASR guess. A
 * language is selectable only when both ASR route and TTS voice were verified.
 */
export class VoiceLanguageRouter {
  private providerEpoch = 1;
  private current: VoiceLanguage;

  constructor(
    private readonly routes: ReadonlyMap<VoiceLanguage, VoiceLanguageRoute>,
    lineDefault: VoiceLanguage,
  ) {
    this.assertEnabled(lineDefault);
    this.current = lineDefault;
  }

  getCurrentLanguage(): VoiceLanguage { return this.current; }
  getProviderEpoch(): number { return this.providerEpoch; }

  /** Playback these checked language variants before requiring any recognition. */
  selectionPrompts(): { language: VoiceLanguage; assetId: string }[] {
    return [...this.routes.values()].filter((route) => {
      try { this.assertEnabled(route.language); return true; } catch { return false; }
    }).map((route) => ({ language: route.language, assetId: route.selectionPrompt.assetId }));
  }

  /** Uncommitted proofs carry this epoch; old proofs fail after any model switch. */
  acceptsUncommittedConfirmation(providerEpoch: number): boolean {
    return providerEpoch === this.providerEpoch;
  }

  shortPrompt(): string {
    return "國語請按1，台語請按2，客語請按3。";
  }

  selectDtmf(digit: string): LanguageSwitchResult {
    const language = ({ "1": "cmn-TW", "2": "nan-TW", "3": "hak-TW" } as const)[digit as "1" | "2" | "3"];
    if (!language) throw new Error("Language DTMF must be 1, 2, or 3.");
    return this.switchTo(language, "customer_dtmf");
  }

  selectExplicit(language: VoiceLanguage): LanguageSwitchResult {
    return this.switchTo(language, "customer_explicit");
  }

  private switchTo(language: VoiceLanguage, source: LanguageSelectionSource): LanguageSwitchResult {
    this.assertEnabled(language);
    this.providerEpoch += 1;
    this.current = language;
    return { language, asrModelName: this.routes.get(language)!.asrModelName, source, providerEpoch: this.providerEpoch, drainOldStream: true, invalidateUncommittedConfirmation: true, preserveConfirmedDraft: true };
  }

  private assertEnabled(language: VoiceLanguage): void {
    const route = this.routes.get(language);
    if (!route?.asrModelName || !route.ttsVoiceEnabled || !route.asrCapabilityVerified ||
        !route.selectionPrompt?.verified || !route.selectionPrompt.assetId ||
        (language === "hak-TW" && !route.accent)) {
      throw new Error(`Language '${language}' is not enabled: ASR/TTS capability evidence is required.`);
    }
  }
}
