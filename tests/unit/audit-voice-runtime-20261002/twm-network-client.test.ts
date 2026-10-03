import { describe, it, expect, vi } from "vitest";
import {
  TwmAsrNetworkAdapter,
  TwmTtsNetworkAdapter,
  TwmNetworkError,
  type TwmHttpResponse,
  type TwmHttpTransport,
  type TwmWebSocketLike,
} from "../../../apps/voice-media-worker/src/providers/twm/twm-network-client";
import type {
  TwmAsrRouteProfile,
  TwmTtsVoiceProfile,
} from "../../../apps/voice-media-worker/src/providers/twm/twm-adapter";
import type { VoiceAsrSegmentResult } from "../../../apps/voice-media-worker/src/media-provider";

/**
 * Codex review round 1 (reopen, AUDIT-VOICE-RUNTIME-20261002) R4: the
 * evidence doc equated "cannot do live calls from this VM" with "cannot
 * implement/unit-verify composition." These tests exercise the real
 * TwmAsrNetworkAdapter/TwmTtsNetworkAdapter classes -- actual request
 * building, header/auth handling, response parsing, and the documented
 * protocol invariants (single-use ticket, 180 ready gate, EOS framing,
 * monotonic revisions) -- against a mocked HTTP/WebSocket transport. No
 * network call ever leaves the process.
 */

function jsonResponse(status: number, body: unknown): TwmHttpResponse {
  return {
    status,
    async json() {
      return body;
    },
    async arrayBuffer() {
      return new ArrayBuffer(0);
    },
  };
}

function audioResponse(status: number, bytes: Uint8Array): TwmHttpResponse {
  return {
    status,
    async json() {
      return undefined;
    },
    async arrayBuffer() {
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return buffer;
    },
  };
}

describe("AUDIT-VOICE-RUNTIME-20261002: TwmTtsNetworkAdapter (real request composition, mocked transport)", () => {
  const voices: TwmTtsVoiceProfile[] = [
    {
      model: "model-a",
      languageCode: "cmn-TW",
      name: "voice-a",
      textType: "plain",
      capabilityVerified: true,
    },
  ];

  it("logs in, then synthesizes with the documented path and a bearer token", async () => {
    const calls: Array<{
      method: string;
      path: string;
      headers?: Record<string, string>;
    }> = [];
    const transport: TwmHttpTransport = vi.fn(async (method, path, init) => {
      calls.push({ method, path, headers: init?.headers });
      if (path === "/api/v1/tts/login")
        return jsonResponse(200, { token: "tok-1" });
      if (path === "/api/v1/tts/synthesize") {
        return audioResponse(200, new Uint8Array([1, 2, 3]));
      }
      throw new Error(`unexpected path ${path}`);
    });

    const adapter = new TwmTtsNetworkAdapter(
      transport,
      { accountId: "acct", accountSecret: "secret" },
      voices,
    );

    const handle = await adapter.synthesize({
      sessionId: "s1",
      text: "hello",
      languageCode: "cmn-TW",
      generation: 1,
    });

    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/tts/login",
    });
    expect(calls[1]).toMatchObject({
      method: "POST",
      path: "/api/v1/tts/synthesize",
    });
    expect(calls[1]!.headers?.Authorization).toBe("Bearer tok-1");
    expect(handle.audioChunks[0]).toEqual(new Uint8Array([1, 2, 3]));
    expect(handle.generation).toBe(1);
  });

  it("rejects synthesis for a language with no verified voice, without any network call", async () => {
    const transport: TwmHttpTransport = vi.fn();
    const adapter = new TwmTtsNetworkAdapter(
      transport,
      { accountId: "acct", accountSecret: "secret" },
      voices,
    );

    await expect(
      adapter.synthesize({
        sessionId: "s1",
        text: "hello",
        languageCode: "nan-TW",
        generation: 1,
      }),
    ).rejects.toThrow(TwmNetworkError);
    expect(transport).not.toHaveBeenCalled();
  });

  it("re-logs in once and retries after a 401, then surfaces failure if the retry also fails", async () => {
    let loginCalls = 0;
    let synthCalls = 0;
    const transport: TwmHttpTransport = async (_method, path) => {
      if (path === "/api/v1/tts/login") {
        loginCalls++;
        return jsonResponse(200, { token: `tok-${loginCalls}` });
      }
      synthCalls++;
      return jsonResponse(synthCalls === 1 ? 401 : 500, {});
    };

    const adapter = new TwmTtsNetworkAdapter(
      transport,
      { accountId: "acct", accountSecret: "secret" },
      voices,
    );

    await expect(
      adapter.synthesize({
        sessionId: "s1",
        text: "hi",
        languageCode: "cmn-TW",
        generation: 1,
      }),
    ).rejects.toThrow(TwmNetworkError);
    expect(loginCalls).toBe(2);
    expect(synthCalls).toBe(2);
  });

  it("defaults isProductionCapable to false regardless of a successful synthesize", async () => {
    const transport: TwmHttpTransport = async (_method, path) => {
      if (path === "/api/v1/tts/login")
        return jsonResponse(200, { token: "tok" });
      return audioResponse(200, new Uint8Array([9]));
    };
    const adapter = new TwmTtsNetworkAdapter(
      transport,
      { accountId: "acct", accountSecret: "secret" },
      voices,
    );
    expect(adapter.isProductionCapable).toBe(false);
    await adapter.synthesize({
      sessionId: "s1",
      text: "hi",
      languageCode: "cmn-TW",
      generation: 1,
    });
    expect(adapter.isProductionCapable).toBe(false);
  });
});

describe("AUDIT-VOICE-RUNTIME-20261002: TwmAsrNetworkAdapter (real session flow, mocked HTTP + WebSocket)", () => {
  const profile: TwmAsrRouteProfile = {
    modelName: "model-1",
    audioType: "pcm_s16le",
    sampleRateHz: 16_000,
    timeouts: {
      minSilenceDurMs: 500,
      maxPacketLossDurSec: 2,
      noSpeechTimeoutMs: 5000,
      idleTimeoutMs: 30000,
      maxDurationMs: 600000,
      eosDrainMs: 2000,
    },
    accountCapabilityVerified: false,
  };

  /** Buffers a fired event until a listener for its type is registered, then
   * replays it immediately on registration. This makes event ordering in
   * these tests independent of exactly how many microtask hops `connect()`
   * takes internally (login -> access-info -> handshake) before it attaches
   * its listeners -- the test can fire "open"/"message" immediately after
   * triggering the action instead of guessing an await count. */
  class FakeSocket implements TwmWebSocketLike {
    readonly sent: Array<Uint8Array | string> = [];
    closed = false;
    private readonly listeners: Record<string, Array<(event: any) => void>> =
      {};
    private readonly buffered: Record<string, unknown[]> = {};
    send(data: Uint8Array | string): void {
      this.sent.push(data);
    }
    close(): void {
      this.closed = true;
      this.fire("close", {});
    }
    addEventListener(type: string, listener: (event: any) => void): void {
      (this.listeners[type] ??= []).push(listener);
      const queued = this.buffered[type];
      if (queued?.length) {
        this.buffered[type] = [];
        for (const event of queued) listener(event);
      }
    }
    fire(type: string, event: unknown): void {
      const list = this.listeners[type];
      if (list?.length) {
        for (const listener of list) listener(event);
      } else {
        (this.buffered[type] ??= []).push(event);
      }
    }
  }

  function transportFor(
    accessTicket: string,
    expiresAt = "2099-01-01T00:00:00.000Z",
  ): TwmHttpTransport {
    return async (_method, path) => {
      if (path === "/api/v1/login")
        return jsonResponse(200, { token: "asr-tok" });
      if (path === "/api/v1/streaming/transcript/access-info") {
        return jsonResponse(200, {
          websocketUrl: "wss://twm.example/stream",
          ticket: accessTicket,
          expiresAt,
        });
      }
      throw new Error(`unexpected path ${path}`);
    };
  }

  it("connects via login + access-info, binds the single-use ticket, and only sends audio once a 180-ready message arrives", async () => {
    const socket = new FakeSocket();
    const adapter = new TwmAsrNetworkAdapter(
      transportFor("ticket-1"),
      () => socket,
      { accountId: "a", accountSecret: "s" },
      profile,
    );

    const transcribePromise = adapter.transcribe({
      sessionId: "sess",
      audioChunk: new Uint8Array([1, 2, 3]),
      sequence: 1,
    });

    socket.fire("open", {});
    socket.fire("message", { data: JSON.stringify({ status: 180 }) });
    socket.fire("message", {
      data: JSON.stringify({
        providerSessionId: "p1",
        segmentId: "seg-1",
        revision: 1,
        text: "hello",
        // SD §11.1 point 5: the real wire protocol encodes `final` as
        // numeric 0/1, never a JSON boolean.
        final: 1,
        language: "cmn-TW",
      }),
    });

    const result = await transcribePromise;
    expect(result).toMatchObject({
      segmentId: "seg-1",
      revision: 1,
      final: true,
    });
    expect(socket.sent).toEqual([new Uint8Array([1, 2, 3])]);
  });

  it("rejects a second connect that is handed the same ticket again (single-use ticket invariant)", async () => {
    // A real access-info call issues a fresh ticket each time; this
    // transport simulates a provider bug (or replay) that hands back the
    // same ticket on a second access-info call after the first connection
    // closed. The adapter must remember it already consumed that ticket.
    const transport = transportFor("ticket-reused");
    let socket = new FakeSocket();
    const adapter = new TwmAsrNetworkAdapter(
      transport,
      () => socket,
      { accountId: "a", accountSecret: "s" },
      profile,
    );

    const firstConnect = adapter.connect();
    socket.fire("open", {});
    await firstConnect;

    adapter.close();
    socket = new FakeSocket();

    await expect(adapter.connect()).rejects.toThrow(TwmNetworkError);
  });

  it("rejects an expired access ticket before ever constructing a socket", async () => {
    const wsFactory = vi.fn(() => new FakeSocket());
    const adapter = new TwmAsrNetworkAdapter(
      transportFor("ticket-x", "2000-01-01T00:00:00.000Z"),
      wsFactory,
      { accountId: "a", accountSecret: "s" },
      profile,
    );
    await expect(adapter.connect()).rejects.toThrow(TwmNetworkError);
    expect(wsFactory).not.toHaveBeenCalled();
  });

  it("rejects a frame at or above the 384 KB cap without sending it", async () => {
    const socket = new FakeSocket();
    const adapter = new TwmAsrNetworkAdapter(
      transportFor("ticket-cap"),
      () => socket,
      { accountId: "a", accountSecret: "s" },
      profile,
    );
    const oversized = new Uint8Array(384 * 1024);
    const promise = adapter.transcribe({
      sessionId: "sess",
      audioChunk: oversized,
      sequence: 1,
    });
    socket.fire("open", {});
    socket.fire("message", { data: JSON.stringify({ status: 180 }) });

    await expect(promise).rejects.toThrow(TwmNetworkError);
    expect(socket.sent.length).toBe(0);
  });

  it("drops an out-of-order or replayed revision instead of returning it", async () => {
    const socket = new FakeSocket();
    const adapter = new TwmAsrNetworkAdapter(
      transportFor("ticket-rev"),
      () => socket,
      { accountId: "a", accountSecret: "s" },
      profile,
    );
    const promise = adapter.transcribe({
      sessionId: "sess",
      audioChunk: new Uint8Array([1]),
      sequence: 1,
    });
    socket.fire("open", {});
    socket.fire("message", { data: JSON.stringify({ status: 180 }) });
    // The same revision arrives twice (provider retry/replay); the second,
    // duplicate-revision message must be dropped, not overwrite the first.
    socket.fire("message", {
      data: JSON.stringify({
        providerSessionId: "p1",
        segmentId: "seg-1",
        revision: 1,
        text: "partial",
        final: 0,
        language: "cmn-TW",
      }),
    });
    socket.fire("message", {
      data: JSON.stringify({
        providerSessionId: "p1",
        segmentId: "seg-1",
        revision: 1,
        text: "partial-replayed",
        final: 0,
        language: "cmn-TW",
      }),
    });

    const first = await promise;
    expect(first.revision).toBe(1);
    expect(first.text).toBe("partial");
  });

  /**
   * Codex review round 3 (reopen, AUDIT-VOICE-RUNTIME-20261002) R6:
   * `message.final === true` never matched the documented wire value (a
   * numeric `0`/`1`, SD §11.1 point 5), so every provider message was
   * treated as non-final -- both misreporting `final: false` to the caller
   * and leaving `finalizedSegments` empty, so a later revision for an
   * already-finalized segment was never rejected either.
   */
  it("treats numeric final=1 as finalized, and drops a later revision for that same segment", async () => {
    const socket = new FakeSocket();
    const adapter = new TwmAsrNetworkAdapter(
      transportFor("ticket-final"),
      () => socket,
      { accountId: "a", accountSecret: "s" },
      profile,
    );

    const firstPromise = adapter.transcribe({
      sessionId: "sess",
      audioChunk: new Uint8Array([1]),
      sequence: 1,
    });
    socket.fire("open", {});
    socket.fire("message", { data: JSON.stringify({ status: 180 }) });
    socket.fire("message", {
      data: JSON.stringify({
        providerSessionId: "p1",
        segmentId: "seg-final",
        revision: 1,
        text: "final text",
        final: 1,
        language: "cmn-TW",
      }),
    });
    const first = await firstPromise;
    expect(first.final).toBe(true);

    // The provider resends a "revision" for the same, now-finalized segment
    // (e.g. a duplicate delivery). It must be dropped, not delivered as a
    // change to the sealed text. Prove it by making the *next* transcribe
    // call -- for a genuinely different segment -- wait on the socket's
    // 180-ready gate again; if the stale revision had been buffered, it
    // would be returned here instead.
    socket.fire("message", {
      data: JSON.stringify({
        providerSessionId: "p1",
        segmentId: "seg-final",
        revision: 2,
        text: "mutated-after-final",
        final: 0,
        language: "cmn-TW",
      }),
    });

    const secondPromise = adapter.transcribe({
      sessionId: "sess",
      audioChunk: new Uint8Array([2]),
      sequence: 2,
    });
    socket.fire("message", {
      data: JSON.stringify({
        providerSessionId: "p1",
        segmentId: "seg-other",
        revision: 1,
        text: "a different segment",
        final: 0,
        language: "cmn-TW",
      }),
    });
    const second = await secondPromise;
    expect(second.segmentId).toBe("seg-other");
    expect(second.text).toBe("a different segment");
  });

  /**
   * Codex review round 4 (reopen, AUDIT-VOICE-RUNTIME-20261002) R9:
   * `connect()` checked `this.socket` before two awaited HTTP calls with no
   * in-flight guard. Concurrent first frames (normal when
   * `VoiceSessionComposer.handleMessage` fires per inbound WS message,
   * never serialized behind a previous chunk's transcription) each started
   * their own login/access-info/WebSocket, so the second overwrote
   * `this.socket`, leaking the first connection's ticket/stream.
   */
  it("serializes concurrent connect() calls into a single login/access-info/socket (no duplicate connections from concurrent audio frames)", async () => {
    let loginCalls = 0;
    let accessCalls = 0;
    const sockets: FakeSocket[] = [];
    const wsFactory = vi.fn(() => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    });
    const transport: TwmHttpTransport = async (_method, path) => {
      if (path === "/api/v1/login") {
        loginCalls++;
        return jsonResponse(200, { token: "asr-tok" });
      }
      if (path === "/api/v1/streaming/transcript/access-info") {
        accessCalls++;
        return jsonResponse(200, {
          websocketUrl: "wss://twm.example/stream",
          ticket: `ticket-${accessCalls}`,
          expiresAt: "2099-01-01T00:00:00.000Z",
        });
      }
      throw new Error(`unexpected path ${path}`);
    };
    const adapter = new TwmAsrNetworkAdapter(
      transport,
      wsFactory,
      { accountId: "a", accountSecret: "s" },
      profile,
    );

    // Two concurrent callers -- e.g. two audio frames arriving before the
    // first connection attempt resolves -- must share one in-flight
    // attempt instead of each independently racing login/access-info.
    const firstConnect = adapter.connect();
    const secondConnect = adapter.connect();

    for (let i = 0; i < 20 && sockets.length === 0; i++) {
      await Promise.resolve();
    }
    sockets[0]!.fire("open", {});

    await Promise.all([firstConnect, secondConnect]);

    expect(loginCalls).toBe(1);
    expect(accessCalls).toBe(1);
    expect(sockets.length).toBe(1);
  });

  /**
   * Codex review round 4 R10: `receiveResult()` only ever resolved the next
   * `transcribe()` call's promise or buffered a result until another
   * `transcribe()` call dequeued it -- a later accepted revision for a
   * segment (e.g. the final revision, arriving after the audio chunk it
   * belongs to was already sent) was never delivered if no further audio
   * chunk arrived to "poll" for it.
   */
  it("delivers a later revision for the same segment via onResult with no further audio chunk sent", async () => {
    const socket = new FakeSocket();
    const adapter = new TwmAsrNetworkAdapter(
      transportFor("ticket-r10"),
      () => socket,
      { accountId: "a", accountSecret: "s" },
      profile,
    );
    const streamed: VoiceAsrSegmentResult[] = [];
    adapter.onResult((result) => streamed.push(result));

    const promise = adapter.transcribe({
      sessionId: "sess",
      audioChunk: new Uint8Array([1]),
      sequence: 1,
    });
    socket.fire("open", {});
    socket.fire("message", { data: JSON.stringify({ status: 180 }) });
    socket.fire("message", {
      data: JSON.stringify({
        providerSessionId: "p1",
        segmentId: "seg-1",
        revision: 1,
        text: "partial",
        final: 0,
        language: "cmn-TW",
      }),
    });
    await promise;

    // The final revision for the SAME segment arrives later, with no
    // further audio ever sent (end of speech) -- it must still reach a
    // listener via the streaming channel.
    socket.fire("message", {
      data: JSON.stringify({
        providerSessionId: "p1",
        segmentId: "seg-1",
        revision: 2,
        text: "final text",
        final: 1,
        language: "cmn-TW",
      }),
    });

    expect(streamed.map((r) => r.revision)).toEqual([1, 2]);
    expect(streamed[0]?.final).toBe(false);
    expect(streamed[1]?.final).toBe(true);
    expect(streamed[1]?.text).toBe("final text");
  });

  it("sends the literal text EOS, not a JSON envelope, when audio ends", async () => {
    const socket = new FakeSocket();
    const adapter = new TwmAsrNetworkAdapter(
      transportFor("ticket-eos"),
      () => socket,
      { accountId: "a", accountSecret: "s" },
      profile,
    );
    const promise = adapter.transcribe({
      sessionId: "sess",
      audioChunk: new Uint8Array([1]),
      sequence: 1,
    });
    socket.fire("open", {});
    socket.fire("message", { data: JSON.stringify({ status: 180 }) });
    socket.fire("message", {
      data: JSON.stringify({
        providerSessionId: "p1",
        segmentId: "seg-1",
        revision: 1,
        text: "hi",
        final: 1,
        language: "cmn-TW",
      }),
    });
    await promise;

    adapter.endAudio();
    expect(socket.sent[socket.sent.length - 1]).toBe("EOS");
  });
});
