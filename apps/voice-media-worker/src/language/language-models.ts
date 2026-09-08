/**
 * ASR model catalog (SD §11.3). Purely a static reference: it does not
 * select a model by itself, and offline candidates are marked ineligible
 * for the live main flow so a router bug cannot silently route a passenger
 * turn to an evaluation-only model.
 */

export type VoiceAsrModelPurpose =
  | "baseline-multilingual"
  | "explicit-hakka"
  | "taigi-transcript"
  | "offline-eval-only";

export interface VoiceAsrModelProfile {
  modelId: string;
  purpose: VoiceAsrModelPurpose;
  /** SD §11.3: offline candidates are "用於評測、回查、品質分析，非即時主流程依賴". */
  realtimeEligible: boolean;
  note: string;
}

export const VOICE_ASR_MODEL_PROFILES: readonly VoiceAsrModelProfile[] = [
  {
    modelId: "myVoca",
    purpose: "baseline-multilingual",
    realtimeEligible: true,
    note: "第一輪可用的基準（國台英）；實際混講與電話音質需驗證。",
  },
  {
    modelId: "bronci-b3-model-hakka-20260518",
    purpose: "explicit-hakka",
    realtimeEligible: true,
    note: "明確偏好／語言選擇後使用；切換需結束舊 segment 並增加 provider epoch。",
  },
  {
    modelId: "bronci-b3-model-taigi-hanzi-20260504",
    purpose: "taigi-transcript",
    realtimeEligible: true,
    note: "台文逐字稿；不因台文輸出就省略地址標準化。",
  },
  {
    modelId: "bronci-e-model-taigi-20260301",
    purpose: "offline-eval-only",
    realtimeEligible: false,
    note: "離線國台英，用於評測、回查、品質分析。",
  },
  {
    modelId: "Taiwan-Tongues-ASR-CE",
    purpose: "offline-eval-only",
    realtimeEligible: false,
    note: "CE 在 FAQ 大小寫與商務清單不一致，需帳號模型清單核對。",
  },
  {
    modelId: "bronci-e-model-taigibun-20250814",
    purpose: "offline-eval-only",
    realtimeEligible: false,
    note: "離線其他候選。",
  },
] as const;

export const VOICE_ASR_BASELINE_MODEL_ID = "myVoca";
export const VOICE_ASR_EXPLICIT_HAKKA_MODEL_ID =
  "bronci-b3-model-hakka-20260518";

const PROFILES_BY_ID = new Map(
  VOICE_ASR_MODEL_PROFILES.map((profile) => [profile.modelId, profile]),
);

export function getVoiceAsrModelProfile(
  modelId: string,
): VoiceAsrModelProfile | undefined {
  return PROFILES_BY_ID.get(modelId);
}

export class VoiceAsrModelNotRealtimeEligibleError extends Error {
  constructor(public readonly modelId: string) {
    super(
      `ASR model '${modelId}' is offline-eval-only (SD §11.3) and cannot serve the live main flow.`,
    );
    this.name = "VoiceAsrModelNotRealtimeEligibleError";
  }
}

/** Guard against ever routing a live passenger turn to an evaluation-only model. */
export function assertRealtimeEligible(modelId: string): VoiceAsrModelProfile {
  const profile = getVoiceAsrModelProfile(modelId);
  if (!profile || !profile.realtimeEligible) {
    throw new VoiceAsrModelNotRealtimeEligibleError(modelId);
  }
  return profile;
}

/** SD §11.3/§11.4: Hakka-family language codes never resolve to the multilingual baseline model. */
export function isHakkaLanguageCode(languageCode: string): boolean {
  return /^hak(-|$)/i.test(languageCode);
}
