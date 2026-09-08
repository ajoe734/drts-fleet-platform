import { describe, expect, it, vi } from "vitest";

import {
  TwmAsrFixtureAdapter,
  TwmTtsFixtureAdapter,
  VoiceLanguageRouter,
  type TwmAsrRouteProfile,
} from "../../apps/voice-media-worker/src";

const profile: TwmAsrRouteProfile = {
  modelName: "myVoca",
  audioType: "g711_ulaw",
  sampleRateHz: 8_000,
  accountCapabilityVerified: false,
  timeouts: { minSilenceDurMs: 650, maxPacketLossDurSec: 3, noSpeechTimeoutMs: 8_000, idleTimeoutMs: 18_000, maxDurationMs: 60_000, eosDrainMs: 1_200 },
};

describe("UV-EXEC-011 TWM fixture adapters and language routing", () => {
  it("uses a fresh URL-encoded ticket, gates audio on 180, preserves revisions, and drains EOS", async () => {
    const asr = new TwmAsrFixtureAdapter(profile, [
      { providerSessionId: "p", segmentId: "s", revision: 1, text: "台北", final: false, language: "cmn-TW" },
      { providerSessionId: "p", segmentId: "s", revision: 2, text: "台北車站", final: true, language: "cmn-TW" },
    ]);
    expect(asr.acquireAccess("2026-09-08T00:00:00Z", { websocketUrl: "wss://fixture/asr", ticket: "a b", expiresAt: "2026-09-08T00:00:30Z" }).websocketUrlWithTicket).toContain("ticket=a+b");
    expect(asr.maySendAudio(100)).toBe(false);
    expect(asr.maySendAudio(180)).toBe(true);
    expect((await asr.transcribe({ sessionId: "s", audioChunk: new Uint8Array(), sequence: 1 })).final).toBe(false);
    expect(await asr.transcribe({ sessionId: "s", audioChunk: new Uint8Array(), sequence: 2 })).toMatchObject({ revision: 2, final: true });
    expect(asr.endAudio()).toEqual({ frame: "EOS", drainWindowMs: 1_200, confirmationEligible: false });
  });

  it("separates timer categories and makes diagnostic disconnect replay incapable of confirmation", () => {
    const asr = new TwmAsrFixtureAdapter(profile, []);
    expect(new Set(Object.values(profile.timeouts)).size).toBe(6);
    expect(asr.reconnect(440, { diagnosticReplay: true, utteranceId: "u-1" })).toMatchObject({ requiresFreshTicket: true, diagnosticOnly: true, confirmationEligible: false, utteranceId: "u-1" });
  });

  it("does not enable an unverified TTS language and local stop does not claim provider cancellation or free billing", async () => {
    const tts = new TwmTtsFixtureAdapter([{ model: "tts-cmn", languageCode: "cmn-TW", name: "speaker", textType: "common", capabilityVerified: true }]);
    await expect(tts.synthesize({ sessionId: "s", text: "您好", languageCode: "hak-TW", generation: 1 })).rejects.toThrow("No verified");
    const playback = await tts.synthesize({ sessionId: "s", text: "您好", languageCode: "cmn-TW", generation: 1 });
    expect(tts.localStop(playback.playbackId)).toMatchObject({ playbackCancellation: "cleared_locally", synthesisCancellation: "abort_requested", providerCancellationAcknowledged: "unverified", billingOutcome: "unverified" });
  });

  it("offers DTMF language selection without requiring Mandarin ASR and invalidates only uncommitted confirmation on switch", () => {
    const routes = new Map([
      ["cmn-TW", { language: "cmn-TW" as const, asrModelName: "myVoca", ttsVoiceEnabled: true, asrCapabilityVerified: true, accent: "sixian" as const, selectionPrompt: { assetId: "checked-prompt", verified: true } }],
      ["hak-TW", { language: "hak-TW" as const, asrModelName: "bronci-b3-model-hakka-20260518", ttsVoiceEnabled: true, asrCapabilityVerified: true, accent: "sixian" as const, selectionPrompt: { assetId: "checked-prompt", verified: true } }],
      ["nan-TW", { language: "nan-TW" as const, asrModelName: "myVoca", ttsVoiceEnabled: false, asrCapabilityVerified: false, selectionPrompt: { assetId: "unchecked", verified: false } }],
    ]);
    const router = new VoiceLanguageRouter(routes, "cmn-TW");
    expect(router.shortPrompt()).toContain("客語請按3");
    expect(router.selectDtmf("3")).toMatchObject({ language: "hak-TW", source: "customer_dtmf", providerEpoch: 2, drainOldStream: true, invalidateUncommittedConfirmation: true, preserveConfirmedDraft: true });
    expect(() => router.selectDtmf("2")).toThrow("capability evidence");
  });
});
