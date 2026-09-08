import { describe, expect, it, vi } from "vitest";

import {
  TWM_ASR_MAX_FRAME_BYTES,
  TwmAsrDiagnosticReplaySession,
  TwmAsrStreamSession,
  TwmSpeechToTextAdapter,
  TwmTextToSpeechAdapter,
  VoiceLanguageRouter,
  VoiceLanguageSelectionRejectedError,
  assertRealtimeEligible,
  classifyAsrTimingViolation,
  resolveModelForLanguageSelection,
  shouldOfferMultilingualLanguagePrompt,
  type TwmAsrServerMessage,
  type TwmAsrSocket,
  type TwmAsrTimingConfig,
  type TwmAsrTransport,
  type TwmTtsModelCatalogEntry,
  type TwmTtsTransport,
} from "../../apps/voice-media-worker/src";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const TIMING: TwmAsrTimingConfig = {
  minSilenceDurMs: 400,
  maxPacketLossDurSec: 5,
  noSpeechTimeoutSec: 0.2,
  idleTimeoutSec: 8,
  maxDurationSec: 30,
};

function createFakeAsrSocket() {
  const sentFrames: Uint8Array[] = [];
  let handler: ((message: TwmAsrServerMessage) => void) | null = null;
  let closeCount = 0;
  let eosCount = 0;
  const socket: TwmAsrSocket = {
    sendAudioFrame: (frame) => sentFrames.push(frame),
    sendEos: () => {
      eosCount += 1;
    },
    onMessage: (h) => {
      handler = h;
    },
    close: () => {
      closeCount += 1;
    },
  };
  return {
    socket,
    sentFrames,
    emit: (message: TwmAsrServerMessage) => handler?.(message),
    get closeCount() {
      return closeCount;
    },
    get eosCount() {
      return eosCount;
    },
  };
}

function createFakeAsrTransport() {
  let loginCount = 0;
  let accessInfoCount = 0;
  const connectCalls: Array<{ ticket: string; modelName: string }> = [];
  const sockets: Array<ReturnType<typeof createFakeAsrSocket>> = [];
  const transport: TwmAsrTransport = {
    login: async () => {
      loginCount += 1;
      return { token: `token-${loginCount}` };
    },
    fetchAccessInfo: async () => {
      accessInfoCount += 1;
      return {
        wsUrl: "wss://twm.example/stream",
        ticket: `ticket-${accessInfoCount}`,
        issuedAtMs: Date.now(),
        ttlMs: 30_000,
      };
    },
    connect: async (accessInfo, params) => {
      connectCalls.push({ ticket: accessInfo.ticket, modelName: params.modelName });
      const fake = createFakeAsrSocket();
      sockets.push(fake);
      return fake.socket;
    },
  };
  return {
    transport,
    sockets,
    connectCalls,
    get loginCount() {
      return loginCount;
    },
    get accessInfoCount() {
      return accessInfoCount;
    },
  };
}

function buildSession(modelName = "myVoca") {
  const fixture = createFakeAsrTransport();
  const session = new TwmAsrStreamSession({
    sessionId: "call-session-1",
    transport: fixture.transport,
    modelName,
    type: "streaming",
    rate: 16_000,
    timing: TIMING,
    drainTimeoutMs: 10,
  });
  return { fixture, session };
}

describe("UV-EXEC-011 TWM ASR streaming adapter (SD §11.1)", () => {
  it("separates each SD §11.5 timing limit instead of one generic silence timeout", () => {
    expect(
      classifyAsrTimingViolation(
        { msSinceLastAudioPacket: 6_000, msSinceLastSpeechActivity: 0, msSinceSessionStart: 0 },
        TIMING,
      ),
    ).toEqual({ kind: "packet_loss" });
    expect(
      classifyAsrTimingViolation(
        { msSinceLastAudioPacket: 0, msSinceLastSpeechActivity: 9_000, msSinceSessionStart: 0 },
        TIMING,
      ),
    ).toEqual({ kind: "idle" });
    expect(
      classifyAsrTimingViolation(
        { msSinceLastAudioPacket: 0, msSinceLastSpeechActivity: 300, msSinceSessionStart: 0 },
        TIMING,
      ),
    ).toEqual({ kind: "no_speech" });
    expect(
      classifyAsrTimingViolation(
        { msSinceLastAudioPacket: 0, msSinceLastSpeechActivity: 0, msSinceSessionStart: 31_000 },
        TIMING,
      ),
    ).toEqual({ kind: "max_duration" });
    expect(
      classifyAsrTimingViolation(
        { msSinceLastAudioPacket: 0, msSinceLastSpeechActivity: 0, msSinceSessionStart: 0 },
        TIMING,
      ),
    ).toBeNull();
  });

  it("buffers audio until status 180 (not 100) and only then sends queued frames", async () => {
    const { fixture, session } = buildSession();
    const pending = session.transcribeChunk(new Uint8Array([1, 2, 3]));
    await flush();
    const socket = fixture.sockets[0]!;
    expect(socket.sentFrames).toHaveLength(0);
    socket.emit({ type: "status", code: "100" });
    await flush();
    expect(socket.sentFrames).toHaveLength(0);
    socket.emit({ type: "status", code: "180" });
    await flush();
    expect(socket.sentFrames).toHaveLength(1);
    socket.emit({
      type: "segment",
      segmentId: "seg-1",
      revision: 1,
      text: "對，從這個入口上車。",
      final: true,
      language: "cmn-TW",
    });
    const result = await pending;
    expect(result).toMatchObject({ segmentId: "seg-1", final: true, revision: 1 });
  });

  it("never sends a frame over the documented 384 KB limit", async () => {
    const { fixture, session } = buildSession();
    const pending = session.transcribeChunk(new Uint8Array(TWM_ASR_MAX_FRAME_BYTES * 2 + 10));
    await flush();
    fixture.sockets[0]!.emit({ type: "status", code: "180" });
    await flush();
    for (const frame of fixture.sockets[0]!.sentFrames) {
      expect(frame.length).toBeLessThanOrEqual(TWM_ASR_MAX_FRAME_BYTES);
    }
    expect(fixture.sockets[0]!.sentFrames.length).toBeGreaterThanOrEqual(3);
    fixture.sockets[0]!.emit({
      type: "segment",
      segmentId: "seg-1",
      revision: 1,
      text: "...",
      final: false,
      language: "cmn-TW",
    });
    await pending;
  });

  it("freezes a segment at final=1 and ignores a later attempt to revise it", async () => {
    const { fixture, session } = buildSession();
    const firstCall = session.transcribeChunk(new Uint8Array([1]));
    await flush();
    fixture.sockets[0]!.emit({ type: "status", code: "180" });
    await flush();
    fixture.sockets[0]!.emit({
      type: "segment",
      segmentId: "seg-1",
      revision: 2,
      text: "final text",
      final: true,
      language: "cmn-TW",
    });
    await firstCall;
    expect(session.getSegmentSnapshot("seg-1")).toMatchObject({
      revision: 2,
      text: "final text",
      final: true,
    });

    const secondCall = session.transcribeChunk(new Uint8Array([2]));
    await flush();
    // A stale/late revision for the already-frozen segment must not overwrite it...
    fixture.sockets[0]!.emit({
      type: "segment",
      segmentId: "seg-1",
      revision: 3,
      text: "should not apply",
      final: false,
      language: "cmn-TW",
    });
    // ...so the caller still needs a genuinely new segment to unblock.
    fixture.sockets[0]!.emit({
      type: "segment",
      segmentId: "seg-2",
      revision: 1,
      text: "next segment",
      final: false,
      language: "cmn-TW",
    });
    const secondResult = await secondCall;
    expect(secondResult.segmentId).toBe("seg-2");
    expect(session.getSegmentSnapshot("seg-1")).toMatchObject({
      revision: 2,
      text: "final text",
    });
  });

  it("drains final results after EOS and tags a disconnect-forced drain so it cannot pass as confirmation", async () => {
    const { fixture, session } = buildSession();
    const call = session.transcribeChunk(new Uint8Array([1]));
    await flush();
    fixture.sockets[0]!.emit({ type: "status", code: "180" });
    await flush();
    fixture.sockets[0]!.emit({
      type: "segment",
      segmentId: "seg-1",
      revision: 1,
      text: "partial",
      final: false,
      language: "cmn-TW",
    });
    await call;

    const drainPromise = session.endAudio("audio_end");
    fixture.sockets[0]!.emit({
      type: "segment",
      segmentId: "seg-1",
      revision: 2,
      text: "final",
      final: true,
      language: "cmn-TW",
    });
    const drain = await drainPromise;
    expect(drain.reason).toBe("audio_end");
    expect(drain.finals).toEqual([
      { segmentId: "seg-1", revision: 2, text: "final", final: true, language: "cmn-TW" },
    ]);
    expect(fixture.sockets[0]!.eosCount).toBe(1);

    const disconnectDrain = await session.endAudio("disconnect");
    expect(disconnectDrain.reason).toBe("disconnect");
    // Nothing new arrived after the disconnect-forced EOS; a caller reading
    // `reason` cannot mistake this drain for a normal, confirmable end.
    expect(disconnectDrain.finals).toEqual([]);
  });

  it("reconnects with a freshly fetched ticket (never the expired one) on 408/440/486", async () => {
    const { fixture, session } = buildSession();
    const firstCall = session.transcribeChunk(new Uint8Array([1]));
    await flush();
    fixture.sockets[0]!.emit({ type: "status", code: "180" });
    await flush();
    fixture.sockets[0]!.emit({
      type: "segment",
      segmentId: "seg-1",
      revision: 1,
      text: "ok",
      final: true,
      language: "cmn-TW",
    });
    await firstCall;
    expect(fixture.accessInfoCount).toBe(1);

    const secondCall = session.transcribeChunk(new Uint8Array([2]));
    await flush();
    fixture.sockets[0]!.emit({ type: "error", code: "408", message: "streaming timeout" });
    await flush();
    expect(fixture.sockets[0]!.closeCount).toBe(1);
    // A new ticket must be fetched -- the old (possibly-expired) one is discarded.
    expect(fixture.accessInfoCount).toBe(2);
    expect(fixture.connectCalls[1]!.ticket).not.toBe(fixture.connectCalls[0]!.ticket);

    fixture.sockets[1]!.emit({ type: "status", code: "180" });
    await flush();
    expect(fixture.sockets[1]!.sentFrames).toHaveLength(1);
    fixture.sockets[1]!.emit({
      type: "segment",
      segmentId: "seg-2",
      revision: 1,
      text: "after reconnect",
      final: true,
      language: "cmn-TW",
    });
    const secondResult = await secondCall;
    expect(secondResult.segmentId).toBe("seg-2");
    // SD §11.4 `supportsResumeCursor=false/unverified`: the automatic resend
    // after a reconnect must never look like an ordinary confirmable final;
    // only the reconnect-triggered retry carries the flag.
    expect(secondResult.requiresReconfirmation).toBe(true);
  });

  it("recovers from a pre-ready reconnect-class error (486) instead of hanging ensureConnected forever", async () => {
    const { fixture, session } = buildSession();
    const pending = session.transcribeChunk(new Uint8Array([9]));
    await flush();
    expect(fixture.sockets).toHaveLength(1);
    // No status 180 was ever sent -- this error arrives while still pre-ready.
    fixture.sockets[0]!.emit({ type: "error", code: "486", message: "resource full" });
    await flush();
    expect(fixture.sockets[0]!.closeCount).toBe(1);
    // The pre-ready failure must trigger a reconnect with a fresh ticket,
    // never leave `transcribeChunk` unresolved.
    expect(fixture.sockets).toHaveLength(2);
    fixture.sockets[1]!.emit({ type: "status", code: "180" });
    await flush();
    expect(fixture.sockets[1]!.sentFrames).toHaveLength(1);
    fixture.sockets[1]!.emit({
      type: "segment",
      segmentId: "seg-after-pre-ready-486",
      revision: 1,
      text: "recovered",
      final: true,
      language: "cmn-TW",
    });
    const result = await pending;
    expect(result.segmentId).toBe("seg-after-pre-ready-486");
    expect(result.requiresReconfirmation).toBe(true);
  });

  it("fences a late message from a socket discarded by switchModel so it cannot resolve the new model's waiter", async () => {
    const { fixture, session } = buildSession("myVoca");
    const firstCall = session.transcribeChunk(new Uint8Array([1]));
    await flush();
    fixture.sockets[0]!.emit({ type: "status", code: "180" });
    await flush();
    fixture.sockets[0]!.emit({
      type: "segment",
      segmentId: "seg-1",
      revision: 1,
      text: "ok",
      final: true,
      language: "cmn-TW",
    });
    await firstCall;

    const switchPromise = session.switchModel("bronci-b3-model-hakka-20260518");
    await new Promise((resolve) => setTimeout(resolve, 30));
    const newSocket = fixture.sockets[fixture.sockets.length - 1]!;
    newSocket.emit({ type: "status", code: "180" });
    await switchPromise;

    const oldSocket = fixture.sockets[0]!;
    const nextCall = session.transcribeChunk(new Uint8Array([7]));
    await flush();
    // A late event from the discarded old-model socket must never resolve
    // the new model's waiter or seed its segment state.
    oldSocket.emit({
      type: "segment",
      segmentId: "stale-old-segment",
      revision: 1,
      text: "late-old",
      final: true,
      language: "cmn-TW",
    });
    await flush();
    expect(session.getSegmentSnapshot("stale-old-segment")).toBeNull();

    newSocket.emit({
      type: "segment",
      segmentId: "seg-new-model",
      revision: 1,
      text: "genuinely new",
      final: true,
      language: "cmn-TW",
    });
    const result = await nextCall;
    expect(result.segmentId).toBe("seg-new-model");
  });

  it("isolates diagnostic replay from the confirmation-producing stream", async () => {
    const { fixture, session } = buildSession();
    const replay = new TwmAsrDiagnosticReplaySession(session);
    const replayPromise = replay.replay("utterance-42", new Uint8Array([9, 9]));
    await flush();
    fixture.sockets[0]!.emit({ type: "status", code: "180" });
    await flush();
    fixture.sockets[0]!.emit({
      type: "segment",
      segmentId: "diag-1",
      revision: 1,
      text: "diagnostic text",
      final: true,
      language: "cmn-TW",
    });
    const result = await replayPromise;
    expect(result.isDiagnosticReplay).toBe(true);
    expect(result.utteranceId).toBe("utterance-42");
    expect(result.segments.map((s) => s.segmentId)).toContain("diag-1");
  });

  it("drains, invalidates uncommitted segments, and bumps the epoch on a model switch", async () => {
    const { fixture, session } = buildSession("myVoca");
    const firstCall = session.transcribeChunk(new Uint8Array([1]));
    await flush();
    fixture.sockets[0]!.emit({ type: "status", code: "180" });
    await flush();
    fixture.sockets[0]!.emit({
      type: "segment",
      segmentId: "seg-final",
      revision: 1,
      text: "committed",
      final: true,
      language: "cmn-TW",
    });
    await firstCall;
    const secondCall = session.transcribeChunk(new Uint8Array([2]));
    await flush();
    fixture.sockets[0]!.emit({
      type: "segment",
      segmentId: "seg-partial",
      revision: 1,
      text: "not yet committed",
      final: false,
      language: "cmn-TW",
    });
    await secondCall;
    expect(session.getAsrEpoch()).toBe(1);

    const switchPromise = session.switchModel("bronci-b3-model-hakka-20260518");
    // `switchModel` first drains (sends EOS, waits the real drainTimeoutMs)
    // before reconnecting; wait past that window before touching the new socket.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const newSocket = fixture.sockets[fixture.sockets.length - 1]!;
    newSocket.emit({ type: "status", code: "180" });
    const switchResult = await switchPromise;

    expect(switchResult.asrEpoch).toBe(2);
    expect(session.getModelName()).toBe("bronci-b3-model-hakka-20260518");
    expect(session.getSegmentSnapshot("seg-partial")).toBeNull();
    expect(session.getSegmentSnapshot("seg-final")).toMatchObject({ text: "committed" });
    expect(fixture.connectCalls.at(-1)).toMatchObject({
      modelName: "bronci-b3-model-hakka-20260518",
    });
  });

  it("wraps the session behind VoiceSpeechToTextAdapter and is never production-capable", async () => {
    const fixture = createFakeAsrTransport();
    const adapter = new TwmSpeechToTextAdapter({
      transport: fixture.transport,
      modelName: "myVoca",
      type: "streaming",
      rate: 16_000,
      timing: TIMING,
      drainTimeoutMs: 10,
    });
    expect(adapter.providerName).toBe("twm");
    expect(adapter.isProductionCapable).toBe(false);
    const call = adapter.transcribe({
      sessionId: "session-a",
      audioChunk: new Uint8Array([1]),
      sequence: 1,
    });
    await flush();
    fixture.sockets[0]!.emit({ type: "status", code: "180" });
    await flush();
    fixture.sockets[0]!.emit({
      type: "segment",
      segmentId: "seg-1",
      revision: 1,
      text: "via adapter",
      final: true,
      language: "cmn-TW",
    });
    const result = await call;
    expect(result.text).toBe("via adapter");
  });
});

function buildTtsCatalog(): readonly TwmTtsModelCatalogEntry[] {
  return [
    {
      model: "configured-available-tts-model",
      languageCode: "cmn-TW",
      name: "configured-available-speaker",
      textTypes: ["common"],
      verified: true,
    },
    {
      model: "configured-available-tts-model",
      languageCode: "hak-TW",
      name: "unverified-hakka-speaker",
      textTypes: ["common"],
      verified: false,
    },
  ];
}

function createFakeTtsTransport() {
  const synthesizeCalls: Array<{ voice: { model: string; languageCode: string; name: string } }> = [];
  const abortFns: Array<ReturnType<typeof vi.fn>> = [];
  const transport: TwmTtsTransport = {
    login: async () => ({ token: "tts-token-1" }),
    fetchModels: async () => buildTtsCatalog(),
    synthesize: async (_token, params) => {
      synthesizeCalls.push({ voice: params.voice });
      const abort = vi.fn(async () => undefined);
      abortFns.push(abort);
      return {
        audioChunks: [new Uint8Array([1, 2, 3])],
        abort,
      };
    },
  };
  return { transport, synthesizeCalls, abortFns };
}

describe("UV-EXEC-011 TWM TTS adapter (SD §11.2, §11.4)", () => {
  it("refuses to open a language/voice that is not verified for this deployment", async () => {
    const fixture = createFakeTtsTransport();
    const adapter = new TwmTextToSpeechAdapter({
      transport: fixture.transport,
      languageVoiceMap: {
        "cmn-TW": {
          model: "configured-available-tts-model",
          languageCode: "cmn-TW",
          name: "configured-available-speaker",
        },
        "hak-TW": {
          model: "configured-available-tts-model",
          languageCode: "hak-TW",
          name: "unverified-hakka-speaker",
        },
      },
    });
    expect(adapter.providerName).toBe("twm");
    expect(adapter.isProductionCapable).toBe(false);

    await expect(
      adapter.synthesize({
        sessionId: "s1",
        text: "請確認上車地點",
        languageCode: "hak-TW",
        generation: 1,
      }),
    ).rejects.toMatchObject({ code: "VOICE_MEDIA_VOICE_UNVERIFIED" });

    await expect(
      adapter.synthesize({
        sessionId: "s1",
        text: "unmapped",
        languageCode: "nan-TW",
        generation: 1,
      }),
    ).rejects.toMatchObject({ code: "VOICE_MEDIA_LANGUAGE_NOT_CONFIGURED" });
  });

  it("synthesizes with the deployment's verified catalog voice, never a bare ASR model id", async () => {
    const fixture = createFakeTtsTransport();
    const adapter = new TwmTextToSpeechAdapter({
      transport: fixture.transport,
      languageVoiceMap: {
        "cmn-TW": {
          model: "configured-available-tts-model",
          languageCode: "cmn-TW",
          name: "configured-available-speaker",
        },
      },
    });
    const handle = await adapter.synthesize({
      sessionId: "s1",
      text: "請確認，從指定上車地點前往指定目的地，現在出發，對嗎？",
      languageCode: "cmn-TW",
      generation: 3,
    });
    expect(handle.generation).toBe(3);
    expect(handle.audioChunks).toHaveLength(1);
    expect(fixture.synthesizeCalls[0]!.voice).toMatchObject({
      model: "configured-available-tts-model",
      name: "configured-available-speaker",
    });
    expect(fixture.synthesizeCalls[0]!.voice.model).not.toBe("myVoca");
  });

  it("local-aborts without waiting for a provider cancellation ACK and never claims zero billing", async () => {
    const fixture = createFakeTtsTransport();
    const adapter = new TwmTextToSpeechAdapter({
      transport: fixture.transport,
      languageVoiceMap: {
        "cmn-TW": {
          model: "configured-available-tts-model",
          languageCode: "cmn-TW",
          name: "configured-available-speaker",
        },
      },
    });
    const handle = await adapter.synthesize({
      sessionId: "s1",
      text: "hello",
      languageCode: "cmn-TW",
      generation: 1,
    });
    expect(adapter.getCancellationRecord(handle.playbackId)).toBeNull();
    const aborter = adapter.createAborter(handle.playbackId);
    // The caller (VoiceMediaOutputFence) never awaits this per SD §11.4 -- it
    // must not throw synchronously either.
    void aborter.abort();
    await flush();
    expect(fixture.abortFns[0]).toHaveBeenCalledTimes(1);
    expect(adapter.getCancellationRecord(handle.playbackId)).toEqual({
      playbackId: handle.playbackId,
      playbackCancellation: "cleared",
      synthesisCancellation: "unconfirmed",
      billingOutcome: "unresolved",
    });
  });
});

describe("UV-EXEC-011 language routing (SD §11.3, §11.4)", () => {
  it("never assumes a pure-Hakka caller from the line default or an unverified detector", () => {
    expect(() =>
      resolveModelForLanguageSelection({ languageCode: "hak-TW", source: "line_default" }),
    ).toThrow(VoiceLanguageSelectionRejectedError);
    expect(() =>
      resolveModelForLanguageSelection({
        languageCode: "cmn-TW",
        source: "verified_detector",
        detectorVerified: false,
      }),
    ).toThrow(VoiceLanguageSelectionRejectedError);
    expect(
      resolveModelForLanguageSelection({ languageCode: "cmn-TW", source: "line_default" }),
    ).toBe("myVoca");
    expect(
      resolveModelForLanguageSelection({ languageCode: "hak-TW", source: "customer_dtmf" }),
    ).toBe("bronci-b3-model-hakka-20260518");
  });

  it("offers the short multi-lingual prompt instead of silently switching models", () => {
    expect(
      shouldOfferMultilingualLanguagePrompt({
        source: "line_default",
        currentModelId: "myVoca",
        recognitionUnusable: true,
      }),
    ).toBe(true);
    expect(
      shouldOfferMultilingualLanguagePrompt({
        source: "customer_dtmf",
        currentModelId: "myVoca",
        recognitionUnusable: true,
      }),
    ).toBe(false);
  });

  it("never routes live traffic to an offline/eval-only model", () => {
    expect(() => assertRealtimeEligible("Taiwan-Tongues-ASR-CE")).toThrow();
    expect(assertRealtimeEligible("myVoca").modelId).toBe("myVoca");
  });

  it("VoiceLanguageRouter tracks source-tagged state and rejects a line-default Hakka guess", () => {
    expect(
      () => new VoiceLanguageRouter({ lineDefaultLanguageCode: "hak-TW" }),
    ).toThrow(VoiceLanguageSelectionRejectedError);

    const router = new VoiceLanguageRouter({
      lineDefaultLanguageCode: "cmn-TW",
      dtmfLanguageMap: { "2": "hak-TW" },
    });
    expect(router.getState()).toMatchObject({ modelId: "myVoca", source: "line_default" });

    const decision = router.selectByDtmf("2");
    expect(decision.modelChanged).toBe(true);
    expect(decision.state).toMatchObject({
      languageCode: "hak-TW",
      modelId: "bronci-b3-model-hakka-20260518",
      source: "customer_dtmf",
    });

    expect(() => router.selectByVerifiedDetector("cmn-TW")).toThrow(
      VoiceLanguageSelectionRejectedError,
    );
  });
});
