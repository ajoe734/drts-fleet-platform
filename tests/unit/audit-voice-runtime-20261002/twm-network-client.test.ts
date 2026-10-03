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

  /** A real WebSocket enforces native send semantics: `send()` throws
   * `InvalidStateError` outside the OPEN state, and `close()` on a
   * CONNECTING socket transitions it to CLOSING/CLOSED and fires `close`
   * (never `open`/`error`). `FakeSocket` above deliberately does not model
   * this ("merely appends bytes in all states") -- these R11/R12
   * regressions need a double that actually enforces it, the way Codex
   * review round 5 required. */
  class StatefulSocket implements TwmWebSocketLike {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 3;

    readyState: number = StatefulSocket.CONNECTING;
    readonly sent: Array<Uint8Array | string> = [];
    private readonly listeners: Record<string, Array<(event: any) => void>> =
      {};
    private readonly buffered: Record<string, unknown[]> = {};

    send(data: Uint8Array | string): void {
      if (this.readyState !== StatefulSocket.OPEN) {
        const err = new Error(
          `Cannot send: WebSocket is not OPEN (readyState=${this.readyState}).`,
        );
        err.name = "InvalidStateError";
        throw err;
      }
      this.sent.push(data);
    }

    open(): void {
      this.readyState = StatefulSocket.OPEN;
      this.fire("open", {});
    }

    close(): void {
      if (this.readyState === StatefulSocket.CLOSED) return;
      this.readyState = StatefulSocket.CLOSED;
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

  /**
   * Codex review round 5 (reopen, AUDIT-VOICE-RUNTIME-20261002) R11
   * scenario (a): `closeAsr()`/`close()` arriving while `connect()`'s login
   * HTTP call is still pending must fence the continuation -- the login
   * response finally arriving afterward must never go on to acquire
   * access-info or a provider socket for a session nobody is attached to
   * anymore.
   */
  it("(R11 scenario a) never acquires access-info or a provider socket once closed while login is still pending", async () => {
    let resolveLogin: (() => void) | undefined;
    const loginGate = new Promise<void>((resolve) => {
      resolveLogin = resolve;
    });
    let accessCalls = 0;
    const wsFactory = vi.fn(() => new StatefulSocket());
    const transport: TwmHttpTransport = async (_method, path) => {
      if (path === "/api/v1/login") {
        await loginGate;
        return jsonResponse(200, { token: "asr-tok" });
      }
      if (path === "/api/v1/streaming/transcript/access-info") {
        accessCalls += 1;
        return jsonResponse(200, {
          websocketUrl: "wss://twm.example/stream",
          ticket: "ticket-scenario-a",
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

    const transcribePromise = adapter.transcribe({
      sessionId: "sess",
      audioChunk: new Uint8Array([1]),
      sequence: 1,
    });
    // Let `transcribe()` actually enter `connect()` -> `login()` and start
    // awaiting the still-pending HTTP call.
    await Promise.resolve();
    await Promise.resolve();

    // Simulates `VoiceMediaWorkerSession.closeAsr()` firing on a channel
    // "close" (hangup) while that login call is still in flight.
    adapter.close();

    resolveLogin!();
    await expect(transcribePromise).rejects.toThrow(TwmNetworkError);

    expect(accessCalls).toBe(0);
    expect(wsFactory).not.toHaveBeenCalled();
  });

  /**
   * Codex review round 5 R11 scenario (b): closing while the provider
   * socket exists but is still CONNECTING (login/access-info already
   * resolved, `open` not yet fired) must not throw -- a real WebSocket
   * boundary throws `InvalidStateError` on `send()` outside OPEN, and that
   * exception used to escape before `close()` ever ran, leaking the
   * CONNECTING socket and (at the composer layer) the session-map entry.
   */
  it("(R11 scenario b) closes cleanly without throwing while the socket is still CONNECTING, never sending on a non-open socket", async () => {
    const socket = new StatefulSocket();
    let created = false;
    const wsFactory = (): StatefulSocket => {
      created = true;
      return socket;
    };
    const adapter = new TwmAsrNetworkAdapter(
      transportFor("ticket-scenario-b"),
      wsFactory,
      { accountId: "a", accountSecret: "s" },
      profile,
    );

    const connectPromise = adapter.connect();
    for (let i = 0; i < 20 && !created; i++) {
      await Promise.resolve();
    }
    expect(created).toBe(true);
    expect(socket.readyState).toBe(StatefulSocket.CONNECTING);

    // Must not throw even though the socket cannot accept a send yet.
    expect(() => adapter.close()).not.toThrow();

    expect(socket.sent).toEqual([]);
    expect(socket.readyState).toBe(StatefulSocket.CLOSED);
    await expect(connectPromise).rejects.toThrow(TwmNetworkError);
  });

  /**
   * Codex review round 5 R11 scenario (c): a ready stream with a pending
   * `transcribe()` result must not be abandoned the instant `close()` is
   * called -- the adapter must honor the profile's configured
   * `eosDrainMs` and let an in-flight final still be delivered.
   */
  it("(R11 scenario c) delivers a final result that arrives within the configured EOS-drain window after close()", async () => {
    vi.useFakeTimers();
    try {
      const socket = new StatefulSocket();
      const shortDrainProfile: TwmAsrRouteProfile = {
        ...profile,
        timeouts: { ...profile.timeouts, eosDrainMs: 30 },
      };
      const adapter = new TwmAsrNetworkAdapter(
        transportFor("ticket-scenario-c1"),
        () => socket,
        { accountId: "a", accountSecret: "s" },
        shortDrainProfile,
      );

      const promise = adapter.transcribe({
        sessionId: "sess",
        audioChunk: new Uint8Array([1]),
        sequence: 1,
      });
      socket.open();
      socket.fire("message", { data: JSON.stringify({ status: 180 }) });
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(socket.sent).toEqual([new Uint8Array([1])]);

      adapter.close();
      // A final scheduled 5ms after EOS, well within the 30ms drain window.
      setTimeout(() => {
        socket.fire("message", {
          data: JSON.stringify({
            providerSessionId: "p1",
            segmentId: "seg-1",
            revision: 1,
            text: "final text",
            final: 1,
            language: "cmn-TW",
          }),
        });
      }, 5);
      await vi.advanceTimersByTimeAsync(5);

      const result = await promise;
      expect(result).toMatchObject({ text: "final text", final: true });
      expect(socket.sent).toContain("EOS");
    } finally {
      vi.useRealTimers();
    }
  });

  it("(R11 scenario c, timeout) rejects a pending transcribe result once the configured EOS-drain window elapses with no final", async () => {
    vi.useFakeTimers();
    try {
      const socket = new StatefulSocket();
      const shortDrainProfile: TwmAsrRouteProfile = {
        ...profile,
        timeouts: { ...profile.timeouts, eosDrainMs: 30 },
      };
      const adapter = new TwmAsrNetworkAdapter(
        transportFor("ticket-scenario-c2"),
        () => socket,
        { accountId: "a", accountSecret: "s" },
        shortDrainProfile,
      );

      const promise = adapter.transcribe({
        sessionId: "sess",
        audioChunk: new Uint8Array([1]),
        sequence: 1,
      });
      socket.open();
      socket.fire("message", { data: JSON.stringify({ status: 180 }) });
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(0);
      }

      adapter.close();
      // Attach the rejection assertion before advancing the fake drain
      // timer, so Node never observes `promise` as unhandled in the gap
      // between the timer firing and this test resuming.
      const rejection = expect(promise).rejects.toThrow(TwmNetworkError);
      await vi.advanceTimersByTimeAsync(30);

      await rejection;
      expect(socket.readyState).toBe(StatefulSocket.CLOSED);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Codex review round 5 R12: `connect()` resolves on the socket's `open`
   * event, which documentedly lands in an earlier turn than the provider's
   * `180` send-ready status. Audio sent in that gap must be queued and
   * flushed in order the instant `180` arrives, never thrown away as
   * "not ready" and never dropped.
   */
  it("(R12) queues audio sent between open and 180, then flushes it in order with no errors and no loss", async () => {
    const socket = new StatefulSocket();
    const adapter = new TwmAsrNetworkAdapter(
      transportFor("ticket-r12"),
      () => socket,
      { accountId: "a", accountSecret: "s" },
      profile,
    );

    const first = adapter.transcribe({
      sessionId: "sess",
      audioChunk: new Uint8Array([1]),
      sequence: 1,
    });
    const second = adapter.transcribe({
      sessionId: "sess",
      audioChunk: new Uint8Array([2]),
      sequence: 2,
    });

    socket.open();
    // Let `connect()` resolve for both callers before 180 ever arrives --
    // the exact gap the finding describes.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    expect(socket.sent).toEqual([]);

    socket.fire("message", { data: JSON.stringify({ status: 180 }) });
    await Promise.resolve();
    expect(socket.sent).toEqual([new Uint8Array([1]), new Uint8Array([2])]);

    socket.fire("message", {
      data: JSON.stringify({
        providerSessionId: "p1",
        segmentId: "seg-1",
        revision: 1,
        text: "one",
        final: 1,
        language: "cmn-TW",
      }),
    });
    socket.fire("message", {
      data: JSON.stringify({
        providerSessionId: "p1",
        segmentId: "seg-2",
        revision: 1,
        text: "two",
        final: 1,
        language: "cmn-TW",
      }),
    });

    await expect(first).resolves.toMatchObject({ text: "one" });
    await expect(second).resolves.toMatchObject({ text: "two" });
  });

  /**
   * Codex review round 6 (reopen, AUDIT-VOICE-RUNTIME-20261002) R11
   * scenario (a): the round-5 drain used `this.waiters.length === 0` as
   * proof the recognition stream was finished. A partial result also
   * resolves (empties) that same per-chunk waiter queue, so the drain
   * ended -- and the socket closed -- the instant a partial arrived, even
   * though the segment it belongs to was still open and its final was
   * scheduled moments later.
   */
  it("(R11 round-6, scenario a) keeps the bounded drain open after close() even though an earlier partial already emptied the waiter queue", async () => {
    vi.useFakeTimers();
    try {
      const socket = new StatefulSocket();
      const shortDrainProfile: TwmAsrRouteProfile = {
        ...profile,
        timeouts: { ...profile.timeouts, eosDrainMs: 30 },
      };
      const adapter = new TwmAsrNetworkAdapter(
        transportFor("ticket-r6-scenario-a"),
        () => socket,
        { accountId: "a", accountSecret: "s" },
        shortDrainProfile,
      );
      const streamed: VoiceAsrSegmentResult[] = [];
      adapter.onResult((result) => streamed.push(result));

      const promise = adapter.transcribe({
        sessionId: "sess",
        audioChunk: new Uint8Array([1]),
        sequence: 1,
      });
      socket.open();
      socket.fire("message", { data: JSON.stringify({ status: 180 }) });
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(0);
      }

      // A partial resolves the single pending `transcribe()` waiter --
      // emptying `waiters` even though the segment is still open.
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
      const partialResult = await promise;
      expect(partialResult.final).toBe(false);

      adapter.close();
      // The final for the SAME segment is scheduled 5ms after close(),
      // well within the 30ms drain window. Under the old
      // `waiters.length === 0` short-circuit this never arrives: the
      // socket was already closed at close()-time.
      setTimeout(() => {
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
      }, 5);
      await vi.advanceTimersByTimeAsync(5);

      expect(streamed.map((r) => r.revision)).toEqual([1, 2]);
      expect(streamed[1]?.final).toBe(true);
      expect(streamed[1]?.text).toBe("final text");
      expect(socket.readyState).toBe(StatefulSocket.CLOSED);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Codex review round 6 R11 scenario (b): closing before any result at
   * all, then a partial arriving during the drain window, must not end
   * the drain early either -- the later final for that same segment must
   * still be delivered within the configured window.
   */
  it("(R11 round-6, scenario b) a partial arriving during the drain window does not end it early; the later final still arrives", async () => {
    vi.useFakeTimers();
    try {
      const socket = new StatefulSocket();
      const shortDrainProfile: TwmAsrRouteProfile = {
        ...profile,
        timeouts: { ...profile.timeouts, eosDrainMs: 30 },
      };
      const adapter = new TwmAsrNetworkAdapter(
        transportFor("ticket-r6-scenario-b"),
        () => socket,
        { accountId: "a", accountSecret: "s" },
        shortDrainProfile,
      );
      const streamed: VoiceAsrSegmentResult[] = [];
      adapter.onResult((result) => streamed.push(result));

      const promise = adapter.transcribe({
        sessionId: "sess",
        audioChunk: new Uint8Array([1]),
        sequence: 1,
      });
      socket.open();
      socket.fire("message", { data: JSON.stringify({ status: 180 }) });
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(socket.sent).toEqual([new Uint8Array([1])]);

      // Close before any recognition result has arrived at all.
      adapter.close();

      setTimeout(() => {
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
      }, 5);
      setTimeout(() => {
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
      }, 10);
      await vi.advanceTimersByTimeAsync(10);

      const result = await promise;
      expect(result).toMatchObject({ text: "partial", final: false });
      expect(streamed.map((r) => r.revision)).toEqual([1, 2]);
      expect(streamed[1]?.final).toBe(true);
      expect(socket.readyState).toBe(StatefulSocket.CLOSED);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Codex review round 6 R11 scenario (c): `close()` while `connect()` is
   * still awaiting a login HTTP call that never resolves must reject the
   * pending `transcribe()` promptly, from the close itself -- not only
   * once/if that unrelated upstream call eventually settles.
   */
  it("(R11 round-6, scenario c) rejects promptly on close() even though the pending login call never resolves", async () => {
    const loginGate = new Promise<never>(() => {
      // Deliberately never settles -- proves rejection comes from close(),
      // not from this upstream call finally resolving.
    });
    const wsFactory = vi.fn(() => new StatefulSocket());
    const transport: TwmHttpTransport = async (_method, path) => {
      if (path === "/api/v1/login") {
        return loginGate;
      }
      throw new Error(`unexpected path ${path}`);
    };
    const adapter = new TwmAsrNetworkAdapter(
      transport,
      wsFactory,
      { accountId: "a", accountSecret: "s" },
      profile,
    );

    const transcribePromise = adapter.transcribe({
      sessionId: "sess",
      audioChunk: new Uint8Array([1]),
      sequence: 1,
    });
    await Promise.resolve();
    await Promise.resolve();

    adapter.close();

    await expect(transcribePromise).rejects.toThrow(TwmNetworkError);
    expect(wsFactory).not.toHaveBeenCalled();
  });

  /**
   * Codex review round 6 R12: nothing in this adapter previously read
   * `noSpeechTimeoutMs`/`idleTimeoutMs`/`maxDurationMs` at all -- a
   * provider that opened a socket but never sent `180` left every queued
   * chunk pending forever and the socket open indefinitely. The setup
   * deadline (bound to `noSpeechTimeoutMs`) must fail closed instead.
   */
  it("(R12 round-6) fails closed and settles every queued chunk when the provider opens but never reaches 180 within the configured deadline", async () => {
    vi.useFakeTimers();
    try {
      const socket = new StatefulSocket();
      const shortSetupProfile: TwmAsrRouteProfile = {
        ...profile,
        timeouts: {
          ...profile.timeouts,
          noSpeechTimeoutMs: 20,
          idleTimeoutMs: 30,
          maxDurationMs: 50,
          eosDrainMs: 30,
        },
      };
      const adapter = new TwmAsrNetworkAdapter(
        transportFor("ticket-r6-setup-timeout"),
        () => socket,
        { accountId: "a", accountSecret: "s" },
        shortSetupProfile,
      );

      const settled = Array.from({ length: 65 }, (_, i) =>
        adapter
          .transcribe({
            sessionId: "sess",
            audioChunk: new Uint8Array([i]),
            sequence: i + 1,
          })
          .then(
            () => "resolved" as const,
            () => "rejected" as const,
          ),
      );

      socket.open();
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(0);
      }
      // 180 never arrives -- no audio was ever actually sent.
      expect(socket.sent).toEqual([]);

      await vi.advanceTimersByTimeAsync(20);

      const outcomes = await Promise.all(settled);
      expect(outcomes.every((outcome) => outcome === "rejected")).toBe(true);
      expect(socket.readyState).toBe(StatefulSocket.CLOSED);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Codex review round 6 R12 (stuck login/handshake, not merely stuck at
   * 180): the setup deadline must also bound the case where the socket is
   * never even constructed because login itself never resolves.
   */
  it("(R12 round-6) the setup deadline also rejects a transcribe() stuck in a login call that never resolves", async () => {
    vi.useFakeTimers();
    try {
      const neverResolvingTransport: TwmHttpTransport = () =>
        new Promise<never>(() => {
          // Never settles -- simulates a stuck login/handshake.
        });
      const wsFactory = vi.fn(() => new StatefulSocket());
      const shortSetupProfile: TwmAsrRouteProfile = {
        ...profile,
        timeouts: { ...profile.timeouts, noSpeechTimeoutMs: 20 },
      };
      const adapter = new TwmAsrNetworkAdapter(
        neverResolvingTransport,
        wsFactory,
        { accountId: "a", accountSecret: "s" },
        shortSetupProfile,
      );

      const promise = adapter.transcribe({
        sessionId: "sess",
        audioChunk: new Uint8Array([1]),
        sequence: 1,
      });
      // Attach the rejection assertion before advancing the fake setup-
      // deadline timer, so Node never observes `promise` as unhandled in
      // the gap between the timer firing and this test resuming (same
      // reasoning as the "(R11 scenario c, timeout)" case above).
      const rejection = expect(promise).rejects.toThrow(TwmNetworkError);

      await vi.advanceTimersByTimeAsync(20);

      await rejection;
      expect(wsFactory).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("(R12) rejects without hanging if the provider connection closes while audio is still queued and not yet ready", async () => {
    const socket = new StatefulSocket();
    const adapter = new TwmAsrNetworkAdapter(
      transportFor("ticket-r12-close"),
      () => socket,
      { accountId: "a", accountSecret: "s" },
      profile,
    );

    const promise = adapter.transcribe({
      sessionId: "sess",
      audioChunk: new Uint8Array([1]),
      sequence: 1,
    });
    socket.open();
    // Let `connect()`/`transcribe()` resolve and the chunk land in the
    // not-yet-ready queue; 180 never arrives before the connection drops.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    expect(socket.sent).toEqual([]);
    socket.close();

    await expect(promise).rejects.toThrow(TwmNetworkError);
    expect(socket.sent).toEqual([]);
  });
});
