import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Duplex } from "node:stream";
import { Server as NetServer } from "node:net";
import { composeVoiceMediaProviders } from "../../../apps/voice-media-worker/src/server/provider-composition";
import { VoiceSessionComposer } from "../../../apps/voice-media-worker/src/server/session-composer";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { WebSocketServerChannel } from "../../../apps/voice-media-worker/src/server/websocket-channel";
import {
  TwmAsrNetworkAdapter,
  type TwmHttpResponse,
  type TwmHttpTransport,
  type TwmWebSocketEvent,
  type TwmWebSocketLike,
} from "../../../apps/voice-media-worker/src/providers/twm/twm-network-client";
import type { TwmAsrRouteProfile } from "../../../apps/voice-media-worker/src/providers/twm/twm-adapter";

// Deliberately non-replaying: an event before listener registration is lost,
// and neither sends nor inbound provider messages are possible after close.
class Socket implements TwmWebSocketLike {
  state = "connecting";
  closes = 0;
  deferClose = false;
  sent: Array<Uint8Array | string> = [];
  listeners = new Map<string, Array<(event: TwmWebSocketEvent) => void>>();
  addEventListener(type: string, listener: (event: TwmWebSocketEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: TwmWebSocketEvent = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  open() {
    if (this.state === "connecting") {
      this.state = "open";
      this.emit("open");
    }
  }
  message(body: unknown) {
    if (this.state === "open")
      this.emit("message", { data: JSON.stringify(body) });
  }
  send(bytes: Uint8Array | string) {
    if (this.state !== "open") throw new Error("not OPEN");
    this.sent.push(bytes);
  }
  close() {
    if (this.state !== "closed" && this.state !== "closing") {
      this.state = this.deferClose ? "closing" : "closed";
      this.closes++;
      if (!this.deferClose) this.emit("close");
    }
  }
}
const profile: TwmAsrRouteProfile = {
  modelName: "unit-model",
  audioType: "pcm_s16le",
  sampleRateHz: 16000,
  accountCapabilityVerified: false,
  timeouts: {
    minSilenceDurMs: 5,
    maxPacketLossDurSec: 1,
    noSpeechTimeoutMs: 20,
    idleTimeoutMs: 30,
    maxDurationMs: 100,
    eosDrainMs: 30,
  },
};
const response = (body: unknown): TwmHttpResponse => ({
  status: 200,
  json: async () => body,
  arrayBuffer: async () => new ArrayBuffer(0),
});
const cleanups: Array<() => Promise<void>> = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(NetServer.prototype, "listen").mockImplementation(() => {
    throw new Error("No listening sockets allowed");
  });
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fixture(stall?: "login" | "access", route = profile) {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sockets: Socket[] = [];
  let accessCalls = 0;
  const transport: TwmHttpTransport = async (_method, path) => {
    if (path === "/api/v1/login") {
      if (stall === "login") await blocked;
      return response({ token: "unit-token" });
    }
    accessCalls++;
    if (stall === "access") await blocked;
    return response({
      websocketUrl: "wss://unit.invalid/asr",
      ticket: `ticket-${accessCalls}`,
      expiresAt: "2099-01-01T00:00:00Z",
    });
  };
  const adapter = new TwmAsrNetworkAdapter(
    transport,
    () => {
      const socket = new Socket();
      sockets.push(socket);
      return socket;
    },
    { accountId: "unit", accountSecret: "unit" },
    route,
  );
  const outcomes: Array<{ done: boolean; error?: unknown }> = [];
  const work: Promise<void>[] = [];
  function chunk(sequence = 1) {
    const outcome: { done: boolean; error?: unknown } = { done: false };
    outcomes.push(outcome);
    work.push(
      adapter
        .transcribe({
          sessionId: "unit-session",
          audioChunk: new Uint8Array([sequence]),
          sequence,
        })
        .then(
          () => {
            outcome.done = true;
          },
          (error: unknown) => {
            outcome.done = true;
            outcome.error = error;
          },
        ),
    );
    return outcome;
  }
  cleanups.push(async () => {
    const closing = adapter.close();
    release();
    await vi.advanceTimersByTimeAsync(100);
    for (const socket of sockets) socket.close();
    await closing;
    await Promise.all(work);
  });
  async function open(ready = true) {
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(1);
    sockets[0]!.open();
    await vi.advanceTimersByTimeAsync(0);
    if (ready) sockets[0]!.message({ status: 180 });
    await vi.advanceTimersByTimeAsync(0);
    return sockets[0]!;
  }
  function result(socket: Socket, revision: number, final: number) {
    socket.message({
      providerSessionId: "unit-provider",
      segmentId: "unit-segment",
      revision,
      final,
      text: "unit",
      language: "cmn-TW",
    });
  }
  return { adapter, sockets, release, chunk, open, result, outcomes };
}

describe("ASR lifecycle acceptance with non-replaying external boundaries", () => {
  it("bounds ready-state input idle and releases every pending request", async () => {
    const f = fixture();
    const outcome = f.chunk();
    const socket = await f.open();
    await vi.advanceTimersByTimeAsync(29);
    expect(socket.state).toBe("open");
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toMatchObject({
      done: true,
      error: { code: "TWM_ASR_IDLE_TIMEOUT" },
    });
    expect(socket.closes).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    await expect(f.adapter.connect()).rejects.toMatchObject({
      code: "TWM_ASR_TERMINATED",
    });
  });

  it("refreshes idle on successfully sent audio, not elapsed connection age", async () => {
    const f = fixture();
    f.chunk();
    const socket = await f.open();
    await vi.advanceTimersByTimeAsync(20);
    const latest = f.chunk(2);
    await vi.advanceTimersByTimeAsync(29);
    expect(socket.state).toBe("open");
    await vi.advanceTimersByTimeAsync(1);
    expect(latest.error).toMatchObject({ code: "TWM_ASR_IDLE_TIMEOUT" });
    expect(f.outcomes.every((outcome) => outcome.done)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not refresh idle on provider status or transcript chatter", async () => {
    const f = fixture();
    f.chunk();
    const socket = await f.open();
    await vi.advanceTimersByTimeAsync(20);
    socket.message({ status: 180 });
    f.result(socket, 1, 0);
    await vi.advanceTimersByTimeAsync(10);
    expect(socket.closes).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("enforces absolute duration despite continuous audio and repeated readiness", async () => {
    const f = fixture();
    f.chunk();
    const socket = await f.open();
    for (let sequence = 2; sequence <= 5; sequence++) {
      await vi.advanceTimersByTimeAsync(20);
      f.chunk(sequence);
      socket.message({ status: 180 });
      await vi.advanceTimersByTimeAsync(0);
    }
    await vi.advanceTimersByTimeAsync(19);
    expect(socket.state).toBe("open");
    await vi.advanceTimersByTimeAsync(1);
    for (const outcome of f.outcomes)
      expect(outcome).toMatchObject({
        done: true,
        error: { code: "TWM_ASR_MAX_DURATION" },
      });
    expect(socket.closes).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts the absolute cap at socket open, even before readiness", async () => {
    const f = fixture(undefined, {
      ...profile,
      timeouts: { ...profile.timeouts, maxDurationMs: 10 },
    });
    const outcome = f.chunk();
    const socket = await f.open(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(outcome.error).toMatchObject({ code: "TWM_ASR_MAX_DURATION" });
    expect(socket.closes).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("EOS cancels input idle but cannot keep the provider socket forever", async () => {
    const f = fixture();
    const outcome = f.chunk();
    const socket = await f.open();
    f.adapter.endAudio();
    await vi.advanceTimersByTimeAsync(99);
    expect(socket.state).toBe("open");
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome.error).toMatchObject({ code: "TWM_ASR_MAX_DURATION" });
    expect(socket.closes).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("explicit close replaces runtime timers with the bounded FINAL drain", async () => {
    const f = fixture();
    f.chunk();
    const socket = await f.open();
    f.result(socket, 1, 0);
    await vi.advanceTimersByTimeAsync(20);
    const closing = f.adapter.close();
    await vi.advanceTimersByTimeAsync(15);
    expect(socket.state).toBe("open");
    f.result(socket, 2, 1);
    await closing;
    expect(socket.closes).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the abandoned connection's runtime timer on recoverable setup timeout", async () => {
    const f = fixture();
    const outcome = f.chunk();
    await f.open(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(outcome.error).toMatchObject({ code: "TWM_ASR_SETUP_TIMEOUT" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, -1, NaN, Infinity, 2_147_483_648])(
    "rejects invalid runtime timer value %s before network work",
    (value) => {
      for (const name of ["idleTimeoutMs", "maxDurationMs"] as const) {
        expect(() =>
          fixture(undefined, {
            ...profile,
            timeouts: { ...profile.timeouts, [name]: value },
          }),
        ).toThrow("positive timer-safe duration");
      }
    },
  );
  it.each(["before-close", "during-drain"] as const)(
    "waits for FINAL, not partial (%s)",
    async (order) => {
      const f = fixture();
      const observed: number[] = [];
      f.adapter.onResult((r) => observed.push(r.revision));
      f.chunk();
      const socket = await f.open();
      if (order === "before-close") {
        f.result(socket, 1, 0);
        await vi.advanceTimersByTimeAsync(0);
      }
      let closed = false;
      const closing = Promise.resolve(f.adapter.close()).then(() => {
        closed = true;
      });
      if (order === "during-drain") {
        await vi.advanceTimersByTimeAsync(5);
        f.result(socket, 1, 0);
      }
      await vi.advanceTimersByTimeAsync(5);
      expect(socket.state).toBe("open");
      expect(closed).toBe(false);
      f.result(socket, 2, 1);
      await vi.advanceTimersByTimeAsync(0);
      await closing;
      expect(observed).toEqual([1, 2]);
      expect(socket.closes).toBe(1);
    },
  );
  it.each(["login", "access"] as const)(
    "bounds %s setup and fences a late response after timeout",
    async (phase) => {
      const f = fixture(phase);
      const outcome = f.chunk();
      await vi.advanceTimersByTimeAsync(25);
      expect(outcome.done).toBe(true);
      expect(outcome.error).toBeDefined();
      f.release();
      await vi.advanceTimersByTimeAsync(0);
      expect(f.sockets).toHaveLength(0);
    },
  );
  it.each([false, true])(
    "fences old socket events during a fresh attempt (ready=%s)",
    async (ready) => {
      const f = fixture();
      f.chunk();
      const old = await f.open(false);
      old.deferClose = true;
      await vi.advanceTimersByTimeAsync(25);
      expect(old.state).toBe("closing");
      const next = f.chunk(2);
      await vi.advanceTimersByTimeAsync(0);
      const current = f.sockets[1]!;
      current.open();
      await vi.advanceTimersByTimeAsync(0);
      if (ready) current.message({ status: 180 });
      old.emit("open");
      old.emit("message", { data: JSON.stringify({ status: 180 }) });
      old.emit("message", {
        data: JSON.stringify({
          providerSessionId: "unit-provider",
          segmentId: "unit-segment",
          revision: 99,
          final: 1,
        }),
      });
      old.emit("error");
      old.state = "closed";
      old.emit("close");
      await vi.advanceTimersByTimeAsync(0);
      expect(next.done).toBe(false);
      expect(current.state).toBe("open");
      if (!ready) {
        expect(current.sent).toEqual([]);
        current.message({ status: 180 });
      }
      f.result(current, 1, 1);
      await vi.advanceTimersByTimeAsync(0);
      expect(next.done).toBe(true);
      expect(next.error).toBeUndefined();
      await f.adapter.close();
      expect(current.closes).toBe(1);
    },
  );
  it("bounds a handshake that never opens", async () => {
    const f = fixture();
    const outcome = f.chunk();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(25);
    expect(outcome.done).toBe(true);
    expect(outcome.error).toBeDefined();
    expect(f.sockets[0]!.state).toBe("closed");
  });
  it("shares repeated close completion and bounds a missing final", async () => {
    const f = fixture();
    f.chunk();
    const socket = await f.open();
    f.result(socket, 1, 0);
    await vi.advanceTimersByTimeAsync(0);
    const first = f.adapter.close();
    const retry = f.adapter.close();
    expect(retry).toBe(first);
    await vi.advanceTimersByTimeAsync(29);
    expect(socket.state).toBe("open");
    await vi.advanceTimersByTimeAsync(1);
    await first;
    expect(socket.closes).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds the open-to-ready wait and rejects all queued work", async () => {
    const f = fixture();
    f.chunk(1);
    f.chunk(2);
    f.chunk(3);
    const socket = await f.open(false);
    await vi.advanceTimersByTimeAsync(25);
    expect(f.outcomes.every((o) => o.done && o.error)).toBe(true);
    expect(socket.state).toBe("closed");
    expect(socket.sent.filter((item) => typeof item !== "string")).toHaveLength(
      0,
    );
  });
  it.each(["login", "access", "handshake", "ready-wait"] as const)(
    "bounds retained ingress during %s and fails the queue on overflow",
    async (phase) => {
      const f = fixture(
        phase === "login" || phase === "access" ? phase : undefined,
      );
      f.chunk(0);
      if (phase === "handshake") await vi.advanceTimersByTimeAsync(0);
      if (phase === "ready-wait") await f.open(false);
      for (let n = 1; n < 65; n++) f.chunk(n);
      await vi.advanceTimersByTimeAsync(0);
      expect(f.outcomes.every((o) => o.done && o.error)).toBe(true);
      f.release();
      await vi.advanceTimersByTimeAsync(0);
      if (phase === "login" || phase === "access")
        expect(f.sockets).toHaveLength(0);
      expect(f.sockets.every((socket) => socket.state === "closed")).toBe(true);
    },
  );
  it("settles provider errors occurring after open, not only handshake errors", async () => {
    const f = fixture();
    const outcome = f.chunk();
    const socket = await f.open();
    socket.emit("error");
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.done).toBe(true);
    expect(outcome.error).toBeDefined();
    expect(socket.state).toBe("closed");
  });
});

function composedFixture() {
  const sockets: Socket[] = [];
  vi.stubGlobal(
    "WebSocket",
    class extends Socket {
      constructor() {
        super();
        sockets.push(this);
      }
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) =>
      response(
        url.pathname === "/api/v1/login"
          ? { token: "unit" }
          : {
              websocketUrl: "wss://unit.invalid/asr",
              ticket: "configured-ticket",
              expiresAt: "2099-01-01T00:00:00Z",
            },
      ),
    ),
  );
  const composition = composeVoiceMediaProviders({
    env: {
      NODE_ENV: "test",
      VOICE_MEDIA_PROVIDER_NAME: "twm",
      TWM_ACCOUNT_ID: "unit",
      TWM_ACCOUNT_SECRET: "unit",
      TWM_API_BASE_URL: "https://unit.invalid",
      TWM_ASR_MODEL_NAME: "unit-model",
    },
  });
  const composer = new VoiceSessionComposer(composition.providerFactory);
  const server = new MediaWorkerServer({ sessionComposer: composer });
  const wire: Buffer[] = [];
  const peer = new Duplex({
    read() {},
    write(chunk, _encoding, done) {
      wire.push(Buffer.from(chunk));
      done();
    },
  });
  const channel = new WebSocketServerChannel(peer, { timeoutMs: 0 });
  server.admitSession("configured").channel = channel;
  composer.attach("configured", channel);
  cleanups.push(async () => {
    const stopping = server.stop();
    await vi.advanceTimersByTimeAsync(2100);
    await stopping;
    peer.destroy();
    expect(server.httpServer.address()).toBeNull();
  });
  return { composer, server, channel, sockets, wire };
}

describe("configured provider → composer → server cleanup, socket-free", () => {
  it.each(["shutdown", "peer-disconnect"] as const)(
    "preserves final-result processing during %s",
    async (mode) => {
      const f = composedFixture();
      const events: unknown[] = [];
      f.server.on("session.event", (event: unknown) => events.push(event));
      f.channel.emit("message", Buffer.from([1]), true);
      await vi.advanceTimersByTimeAsync(0);
      const socket = f.sockets[0]!;
      socket.open();
      await vi.advanceTimersByTimeAsync(0);
      socket.message({ status: 180 });
      socket.message({
        providerSessionId: "p",
        segmentId: "s",
        revision: 1,
        final: 0,
        text: "partial",
      });
      await vi.advanceTimersByTimeAsync(0);
      if (mode === "peer-disconnect") f.channel.close();
      let stopped = false;
      const stopping = f.server.stop().then(() => {
        stopped = true;
      });
      await vi.advanceTimersByTimeAsync(5);
      expect(stopped).toBe(false);
      expect(socket.state).toBe("open");
      if (mode === "shutdown") expect(f.channel.destroyed).toBe(false);
      socket.message({
        providerSessionId: "p",
        segmentId: "s",
        revision: 2,
        final: 1,
        text: "final",
      });
      await vi.advanceTimersByTimeAsync(0);
      await stopping;
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sessionId: "configured",
            event: expect.objectContaining({
              type: "asr.segment.final",
              payload: expect.objectContaining({ text: "final" }),
            }),
          }),
        ]),
      );
      if (mode === "shutdown")
        expect(Buffer.concat(f.wire).toString()).toContain("asr.segment.final");
      expect(socket.closes).toBe(1);
    },
  );
  it("retains an old epoch's pending drain when the same session ID is reused", async () => {
    const f = composedFixture();
    f.channel.emit("message", Buffer.from([1]), true);
    await vi.advanceTimersByTimeAsync(0);
    const old = f.sockets[0]!;
    old.open();
    await vi.advanceTimersByTimeAsync(0);
    old.message({ status: 180 });
    old.message({
      providerSessionId: "old",
      segmentId: "s",
      revision: 1,
      final: 0,
    });
    await vi.advanceTimersByTimeAsync(0);
    f.server.closeSession("configured");
    const peer = new Duplex({
      read() {},
      write(_data, _encoding, done) {
        done();
      },
    });
    const replacement = new WebSocketServerChannel(peer, { timeoutMs: 0 });
    f.server.admitSession("configured").channel = replacement;
    f.composer.attach("configured", replacement);
    let stopped = false;
    const stopping = f.server.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(5);
    expect(stopped).toBe(false);
    expect(old.state).toBe("open");
    old.message({
      providerSessionId: "old",
      segmentId: "s",
      revision: 2,
      final: 1,
    });
    await vi.advanceTimersByTimeAsync(0);
    await stopping;
    expect(old.closes).toBe(1);
    peer.destroy();
  });
  it("forwards AbortSignal into configured fetch and cancels a never-resolving login", async () => {
    const f = composedFixture();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: URL, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            signal = init.signal ?? undefined;
            signal?.addEventListener(
              "abort",
              () => reject(new Error("cancelled")),
              { once: true },
            );
          }),
      ),
    );
    f.channel.emit("message", Buffer.from([1]), true);
    await vi.advanceTimersByTimeAsync(0);
    expect(signal).toBeDefined();
    const stopping = f.server.stop();
    await vi.advanceTimersByTimeAsync(0);
    await stopping;
    expect(signal?.aborted).toBe(true);
    expect(f.sockets).toHaveLength(0);
  });
});
