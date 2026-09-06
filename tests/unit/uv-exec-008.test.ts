import { describe, expect, it } from "vitest";

import {
  createUnconfiguredVoiceCtiProvider,
  SandboxVoiceCtiProviderAdapter,
  signSandboxCtiRequest,
  SANDBOX_CTI_FIXTURES,
  SANDBOX_CTI_SIGNATURE_HEADER,
  VoiceCtiAdapter,
  type VoiceCtiCallStartedRawEvent,
  type VoiceCtiDtmfRawEvent,
  type VoiceCtiProviderAdapter,
} from "../../apps/api/src/modules/callcenter/voice-cti.adapter";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  createUnconfiguredSpeechToTextAdapter,
  createUnconfiguredTextToSpeechAdapter,
  SandboxSpeechToTextAdapter,
  SandboxTextToSpeechAdapter,
  VoiceMediaProviderError,
  VoiceMediaProviderRegistry,
} from "../../apps/voice-media-worker/src/media-provider";
import { VoiceMediaWorkerSession } from "../../apps/voice-media-worker/src/media-session";

function buildAdapter(options?: {
  productionMode?: boolean;
  productionFallbackProviderName?: string;
  extraProviders?: ConstructorParameters<typeof VoiceCtiAdapter>[0]["providers"];
}) {
  return new VoiceCtiAdapter({
    providers: [
      new SandboxVoiceCtiProviderAdapter(),
      ...(options?.extraProviders ?? []),
    ],
    productionMode: options?.productionMode ?? false,
    ...(options?.productionFallbackProviderName
      ? { productionFallbackProviderName: options.productionFallbackProviderName }
      : {}),
  });
}

describe("VoiceCtiAdapter (UV-EXEC-008 CTI boundary)", () => {
  it("rejects a webhook with an invalid signature", () => {
    const adapter = buildAdapter();
    const signed = signSandboxCtiRequest(SANDBOX_CTI_FIXTURES.callStarted);
    const tampered = {
      ...signed,
      headers: { ...signed.headers, [SANDBOX_CTI_SIGNATURE_HEADER]: "00".repeat(32) },
    };

    expect(() => adapter.ingestWebhookEvent("sandbox", tampered)).toThrow(
      ApiRequestError,
    );
    try {
      adapter.ingestWebhookEvent("sandbox", tampered);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).code).toBe("VOICE_CTI_SIGNATURE_INVALID");
    }
  });

  it("rejects a webhook whose timestamp is outside the replay window", () => {
    const adapter = buildAdapter();
    const staleTimestamp = Math.floor(Date.now() / 1000) - 10_000;
    const signed = signSandboxCtiRequest(
      SANDBOX_CTI_FIXTURES.callStarted,
      staleTimestamp,
    );

    try {
      adapter.ingestWebhookEvent("sandbox", signed);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).code).toBe("VOICE_CTI_SIGNATURE_EXPIRED");
    }
  });

  it("rejects an unknown provider name outside production mode", () => {
    const adapter = buildAdapter();
    const signed = signSandboxCtiRequest(SANDBOX_CTI_FIXTURES.callStarted);

    try {
      adapter.ingestWebhookEvent("unknown-provider", signed);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).code).toBe("VOICE_CTI_PROVIDER_UNKNOWN");
    }
  });

  it("accepts a validly signed call.started webhook and preserves the trusted destination", () => {
    const adapter = buildAdapter();
    const signed = signSandboxCtiRequest(SANDBOX_CTI_FIXTURES.callStarted);

    const result = adapter.ingestWebhookEvent("sandbox", signed);

    expect(result.deduped).toBe(false);
    expect(result.normalized.sequence).toBe(1);
    expect(result.normalized.providerName).toBe("sandbox");
    const event = result.normalized.event as VoiceCtiCallStartedRawEvent;
    expect(event.type).toBe("call.started");
    expect(event.destination).toEqual({
      providerAccountId: SANDBOX_CTI_FIXTURES.callStarted.providerAccountId,
      dnis: SANDBOX_CTI_FIXTURES.callStarted.dnis,
    });
    expect(result.callLeg?.role).toBe("customer");
    expect(result.callLeg?.endedAt).toBeNull();
  });

  it("dedupes a resent webhook by eventId without bumping the call sequence", () => {
    const adapter = buildAdapter();
    const signed = signSandboxCtiRequest(SANDBOX_CTI_FIXTURES.callStarted);

    const first = adapter.ingestWebhookEvent("sandbox", signed);
    const resend = adapter.ingestWebhookEvent(
      "sandbox",
      signSandboxCtiRequest(SANDBOX_CTI_FIXTURES.callStarted),
    );

    expect(first.deduped).toBe(false);
    expect(resend.deduped).toBe(true);
    expect(resend.normalized.sequence).toBe(first.normalized.sequence);
    expect(resend.normalized.eventId).toBe(first.normalized.eventId);
  });

  it("validates DTMF digits and rejects malformed ones", () => {
    const adapter = buildAdapter();
    adapter.ingestWebhookEvent(
      "sandbox",
      signSandboxCtiRequest(SANDBOX_CTI_FIXTURES.callStarted),
    );

    const result = adapter.ingestWebhookEvent(
      "sandbox",
      signSandboxCtiRequest(SANDBOX_CTI_FIXTURES.dtmf),
    );
    expect(result.deduped).toBe(false);
    const dtmfEvent = result.normalized.event as VoiceCtiDtmfRawEvent;
    expect(dtmfEvent.digit).toBe("1");

    const malformed = {
      ...SANDBOX_CTI_FIXTURES.dtmf,
      eventId: "sbx-evt-dtmf-bad",
      digit: "not-a-digit",
    };
    expect(() =>
      adapter.ingestWebhookEvent("sandbox", signSandboxCtiRequest(malformed)),
    ).toThrow(ApiRequestError);
  });

  it("preserves call-leg causal history across transfer and ended events, in sequence order", () => {
    const adapter = buildAdapter();
    const started = adapter.ingestWebhookEvent(
      "sandbox",
      signSandboxCtiRequest(SANDBOX_CTI_FIXTURES.callStarted),
    );
    const transferred = adapter.ingestWebhookEvent(
      "sandbox",
      signSandboxCtiRequest(SANDBOX_CTI_FIXTURES.transferRequested),
    );
    const ended = adapter.ingestWebhookEvent(
      "sandbox",
      signSandboxCtiRequest(SANDBOX_CTI_FIXTURES.callEnded),
    );

    expect(started.normalized.sequence).toBeLessThan(
      transferred.normalized.sequence,
    );
    expect(transferred.normalized.sequence).toBeLessThan(
      ended.normalized.sequence,
    );

    const legs = adapter.listCallLegs(SANDBOX_CTI_FIXTURES.callStarted.callId);
    const customerLeg = legs.find(
      (leg) => leg.callLegId === SANDBOX_CTI_FIXTURES.callStarted.callLegId,
    );
    const handoffLeg = legs.find(
      (leg) => leg.callLegId === SANDBOX_CTI_FIXTURES.transferRequested.toCallLegId,
    );

    expect(customerLeg?.endedAt).not.toBeNull();
    expect(customerLeg?.endReason).toBe("transferred");
    expect(handoffLeg?.role).toBe("handoff_target");
    expect(handoffLeg?.endedAt).toBe(SANDBOX_CTI_FIXTURES.callEnded.occurredAt);
    expect(handoffLeg?.endReason).toBe("transferred");
  });

  it("fails closed in production mode when no production-capable provider is configured", () => {
    const adapter = buildAdapter({
      productionMode: true,
      extraProviders: [createUnconfiguredVoiceCtiProvider("twm")],
    });
    const signed = signSandboxCtiRequest(SANDBOX_CTI_FIXTURES.callStarted);

    try {
      adapter.ingestWebhookEvent("twm", signed);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).code).toBe(
        "VOICE_CTI_PROVIDER_NOT_CONFIGURED",
      );
    }
  });

  it("never treats sandbox as production-capable even when explicitly requested in production mode", () => {
    const adapter = buildAdapter({ productionMode: true });
    const signed = signSandboxCtiRequest(SANDBOX_CTI_FIXTURES.callStarted);

    expect(() => adapter.ingestWebhookEvent("sandbox", signed)).toThrow(
      ApiRequestError,
    );
  });

  it("switches to a verified fallback provider in production mode when configured", async () => {
    const sandboxDelegate = new SandboxVoiceCtiProviderAdapter();
    const fallback: VoiceCtiProviderAdapter = {
      providerName: "verified-fallback",
      isProductionCapable: true,
      verifyAndDecode: (request) => sandboxDelegate.verifyAndDecode(request),
      requestTransfer: (command) => sandboxDelegate.requestTransfer(command),
    };
    const adapter = buildAdapter({
      productionMode: true,
      productionFallbackProviderName: "verified-fallback",
      extraProviders: [createUnconfiguredVoiceCtiProvider("twm"), fallback],
    });

    const transferResult = await adapter.requestTransfer("twm", {
      callId: SANDBOX_CTI_FIXTURES.callStarted.callId,
      fromCallLegId: SANDBOX_CTI_FIXTURES.callStarted.callLegId,
      targetKind: "human_queue",
      target: "ops-default-queue",
    });

    expect(transferResult.accepted).toBe(true);
  });
});

describe("Voice media worker provider boundary (UV-EXEC-008)", () => {
  it("fails closed in production mode with no configured ASR/TTS provider", () => {
    const registry = new VoiceMediaProviderRegistry({
      asrProviders: [
        new SandboxSpeechToTextAdapter(),
        createUnconfiguredSpeechToTextAdapter("twm"),
      ],
      ttsProviders: [
        new SandboxTextToSpeechAdapter(),
        createUnconfiguredTextToSpeechAdapter("twm"),
      ],
      productionMode: true,
    });

    expect(() => registry.resolveAsr("twm")).toThrow(VoiceMediaProviderError);
    expect(() => registry.resolveAsr("sandbox")).toThrow(
      VoiceMediaProviderError,
    );
    expect(() => registry.resolveTts("twm")).toThrow(VoiceMediaProviderError);
  });

  it("allows sandbox outside production mode", () => {
    const registry = new VoiceMediaProviderRegistry({
      asrProviders: [new SandboxSpeechToTextAdapter()],
      ttsProviders: [new SandboxTextToSpeechAdapter()],
      productionMode: false,
    });

    expect(registry.resolveAsr("sandbox").providerName).toBe("sandbox");
    expect(registry.resolveTts("sandbox").providerName).toBe("sandbox");
  });
});

describe("VoiceMediaWorkerSession (contract for UV-EXEC-009/010/011)", () => {
  function buildSession() {
    const events: unknown[] = [];
    const session = new VoiceMediaWorkerSession({
      sessionId: "sess-001",
      asrAdapter: new SandboxSpeechToTextAdapter(),
      ttsAdapter: new SandboxTextToSpeechAdapter(),
      eventSink: (event) => events.push(event),
    });
    return { session, events };
  }

  it("emits asr.segment.final for the sandbox fixture transcript", async () => {
    const { session, events } = buildSession();
    const result = await session.transcribeChunk(
      new Uint8Array([1, 2, 3]),
      "2026-09-06T02:00:00.000Z",
    );

    expect(result.final).toBe(true);
    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe("asr.segment.final");
  });

  it("validates DTMF digits before emitting", () => {
    const { session, events } = buildSession();
    session.handleDtmf("5", "2026-09-06T02:00:01.000Z");
    expect(events).toHaveLength(1);

    expect(() =>
      session.handleDtmf("xx", "2026-09-06T02:00:02.000Z"),
    ).toThrow(VoiceMediaProviderError);
  });

  it("locally invalidates the active playback generation on barge-in (speech.started)", async () => {
    const { session, events } = buildSession();
    const handle = await session.startPlayback(
      "請確認上車地點",
      "cmn-TW",
      "2026-09-06T02:00:00.000Z",
    );

    const { clearedPlaybackIds } = session.handleSpeechStarted(
      "2026-09-06T02:00:01.000Z",
    );
    expect(clearedPlaybackIds).toEqual([handle.playbackId]);

    // A late completion mark for the already-cleared playback must not
    // "revive" it (SD §11.5 Twilio mark/clear reference).
    const completed = session.completePlayback(
      handle.playbackId,
      "2026-09-06T02:00:02.000Z",
    );
    expect(completed).toBe(false);
    expect(
      events.some(
        (event) => (event as { type: string }).type === "tts.playback.completed",
      ),
    ).toBe(false);
  });

  it("invalidates prior-generation playback when the media epoch advances (handoff)", async () => {
    const { session } = buildSession();
    const handle = await session.startPlayback(
      "請稍候，正在為您轉接",
      "cmn-TW",
      "2026-09-06T02:00:00.000Z",
    );

    const newEpoch = session.advanceMediaEpoch();
    expect(newEpoch).toBe(2);

    const completed = session.completePlayback(
      handle.playbackId,
      "2026-09-06T02:00:05.000Z",
    );
    expect(completed).toBe(false);
  });

  it("completes an active-generation playback exactly once", async () => {
    const { session, events } = buildSession();
    const handle = await session.startPlayback(
      "好的，已為您叫車",
      "cmn-TW",
      "2026-09-06T02:00:00.000Z",
    );

    const firstComplete = session.completePlayback(
      handle.playbackId,
      "2026-09-06T02:00:03.000Z",
    );
    const secondComplete = session.completePlayback(
      handle.playbackId,
      "2026-09-06T02:00:04.000Z",
    );

    expect(firstComplete).toBe(true);
    expect(secondComplete).toBe(false);
    expect(
      events.filter(
        (event) => (event as { type: string }).type === "tts.playback.completed",
      ),
    ).toHaveLength(1);
  });
});
