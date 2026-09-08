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


function connect(asr: TwmAsrFixtureAdapter, ticket = "fixture-ticket") {
  asr.acquireAccess("2026-09-08T00:00:00Z", {
    websocketUrl: "wss://fixture/asr", ticket, expiresAt: "2026-09-08T00:00:30Z",
  });
  asr.maySendAudio(180);
}
const segment = (revision: number, final = false, providerSessionId = "p") => ({
  providerSessionId, segmentId: "s", revision, text: "測試", final, language: "cmn-TW",
});

describe("UV-EXEC-011 protocol regression evidence", () => {
  it("rejects invalid, expired and reused tickets and encodes model/media privacy settings", () => {
    const asr = new TwmAsrFixtureAdapter(profile, []);
    expect(asr.maySendAudio(180)).toBe(false);
    for (const expiresAt of ["invalid", "2026-09-08T00:00:00Z"]) {
      expect(() => asr.acquireAccess("2026-09-08T00:00:00Z", {
        websocketUrl: "wss://fixture/asr", ticket: "a", expiresAt,
      })).toThrow("expired");
    }
    const access = { websocketUrl: "wss://fixture/asr", ticket: "a& b?", expiresAt: "2026-09-08T00:00:30Z" };
    const url = new URL(asr.acquireAccess("2026-09-08T00:00:00Z", access).websocketUrlWithTicket);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      ticket: "a& b?", modelName: "myVoca", type: "g711_ulaw", rate: "8000", enableTransient: "1", saveResult: "0",
    });
    expect(() => asr.acquireAccess("2026-09-08T00:00:00Z", access)).toThrow("single-use");
    expect(() => asr.sendAudio(new Uint8Array(1))).toThrow("180");
    asr.maySendAudio(180);
    expect(() => asr.sendAudio(new Uint8Array(384 * 1024))).toThrow("384 KB");
    expect(() => asr.sendAudio(new Uint8Array(160))).not.toThrow();
  });

  it("receives the last final during EOS drain, never extends drain on duplicate EOS", async () => {
    const asr = new TwmAsrFixtureAdapter(profile, [segment(1, true), segment(1, true, "p2")]);
    connect(asr);
    asr.endAudio(1000);
    asr.endAudio(2000);
    expect(asr.receiveResult(2199)).toMatchObject({ final: true, confirmationEligible: false });
    expect(() => asr.receiveResult(2200)).toThrow("closed");
    await expect(asr.transcribe({ sessionId: "s", sequence: 1, audioChunk: new Uint8Array() })).rejects.toThrow("open stream");
  });

  it("scopes segments to provider session and rejects regressing or post-final revisions", () => {
    const asr = new TwmAsrFixtureAdapter(profile, [segment(2), segment(1), segment(3, true), segment(4, true), segment(1, true, "new-session")]);
    connect(asr);
    expect(asr.receiveResult().revision).toBe(2);
    expect(() => asr.receiveResult()).toThrow("revision");
    expect(asr.receiveResult().final).toBe(true);
    expect(() => asr.receiveResult()).toThrow("immutable");
    expect(asr.receiveResult().providerSessionId).toBe("new-session");
  });

  it.each([408, 440, 486] as const)("isolates replay after disconnect %s and requires a new ticket", async (code) => {
    const asr = new TwmAsrFixtureAdapter(profile, [segment(1, true)]);
    connect(asr);
    asr.reconnect(code, { diagnosticReplay: true, utteranceId: "original-utterance" });
    expect(asr.maySendAudio(180)).toBe(false);
    connect(asr, "new-ticket");
    await expect(asr.transcribe({ sessionId: "s", sequence: 1, audioChunk: new Uint8Array() })).rejects.toThrow("isolated");
    expect(asr.receiveResult()).toMatchObject({ diagnosticOnly: true, utteranceId: "original-utterance", confirmationEligible: false });
  });

  it.each(Object.keys(profile.timeouts))("validates independent timer %s", (timer) => {
    expect(() => new TwmAsrFixtureAdapter({ ...profile, timeouts: { ...profile.timeouts, [timer]: 0 } }, [])).toThrow(timer);
  });

  it("keeps provider voice fields distinct and clears before best-effort transport abort", async () => {
    const order: string[] = [];
    const tts = new TwmTtsFixtureAdapter([{ model: "fixture-tts-model", languageCode: "hak-TW", name: "fixture-sixian", accent: "sixian", textType: "common", capabilityVerified: true }], {
      clear: vi.fn(() => { order.push("clear"); }),
      abort: vi.fn(async () => { order.push("abort"); throw new Error("disconnected"); }),
    });
    const request = { sessionId: "s", text: "fixture text", languageCode: "hak-TW", generation: 2 };
    expect(tts.buildSynthesisRequest(request)).toEqual({ input: { text: "fixture text", textType: "common" }, voice: { model: "fixture-tts-model", languageCode: "hak-TW", name: "fixture-sixian" }, audioConfig: { speakingRate: 1 }, outputConfig: { streamMode: 1 } });
    const handle = await tts.synthesize(request);
    expect(tts.localStop(handle.playbackId)).toMatchObject({ providerCancellationAcknowledged: "unverified", billingOutcome: "unverified" });
    expect(order).toEqual(["clear", "abort"]);
    expect(tts.localStop(handle.playbackId)).toBeNull();
  });

  it("requires verified ASR, prompt and Hakka accent and fences old confirmation epochs", () => {
    const cmn = { language: "cmn-TW" as const, asrModelName: "myVoca", asrCapabilityVerified: true, ttsVoiceEnabled: true, selectionPrompt: { assetId: "fixture-cmn", verified: true } };
    const hak = { ...cmn, language: "hak-TW" as const, asrModelName: "bronci-b3-model-hakka-20260518", accent: "sixian" as const, selectionPrompt: { assetId: "fixture-hak-sixian", verified: true } };
    const router = new VoiceLanguageRouter(new Map([["cmn-TW", cmn], ["hak-TW", hak]]), "cmn-TW");
    const previous = router.getProviderEpoch();
    expect(router.selectionPrompts()).toContainEqual({ language: "hak-TW", assetId: "fixture-hak-sixian" });
    router.selectDtmf("3");
    expect(router.acceptsUncommittedConfirmation(previous)).toBe(false);
    expect(router.acceptsUncommittedConfirmation(router.getProviderEpoch())).toBe(true);
    for (const unverified of [{ ...hak, asrCapabilityVerified: false }, { ...hak, accent: undefined }, { ...hak, selectionPrompt: { assetId: "x", verified: false } }]) {
      expect(() => new VoiceLanguageRouter(new Map([["hak-TW", unverified]]), "hak-TW")).toThrow("capability evidence");
    }
  });
});
