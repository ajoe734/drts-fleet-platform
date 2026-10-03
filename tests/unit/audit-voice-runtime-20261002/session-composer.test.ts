import { describe, it, expect } from "vitest";
import * as http from "node:http";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { VOICE_MEDIA_INTERNAL_KEY_HEADER } from "../../../apps/voice-media-worker/src/server/internal-auth";
import { VoiceSessionComposer } from "../../../apps/voice-media-worker/src/server/session-composer";
import type {
  VoiceAsrSegmentResult,
  VoiceAsrTranscribeRequest,
  VoiceSpeechToTextAdapter,
  VoiceTextToSpeechAdapter,
  VoiceTtsPlaybackHandle,
  VoiceTtsSynthesizeRequest,
} from "../../../apps/voice-media-worker/src/media-provider";
import { FakeCallAuthority } from "./fake-call-authority";

/**
 * Codex review round 3 (reopen, AUDIT-VOICE-RUNTIME-20261002) R4: nothing
 * in this worker ever consumed `session.message` -- a composed ASR/TTS
 * session never existed for an attached WebSocket. These tests exercise
 * the real `MediaWorkerServer` + `VoiceSessionComposer` + the real
 * `VoiceMediaWorkerSession` harness end to end over an actual HTTP/
 * WebSocket upgrade; only the ASR/TTS *speech engine* itself (the external
 * boundary this worker has no real vendor account for -- see
 * docs/04-uat/audit-voice-runtime-20261002.md) is a deterministic test
 * double, exactly like `SandboxSpeechToTextAdapter`/
 * `SandboxTextToSpeechAdapter` already are in production code.
 */

const INTERNAL_KEY = "test-internal-key-composer";

class DeterministicAsrAdapter implements VoiceSpeechToTextAdapter {
  readonly providerName = "test-double";
  readonly isProductionCapable = false as const;
  calls = 0;

  async transcribe(
    request: VoiceAsrTranscribeRequest,
  ): Promise<VoiceAsrSegmentResult> {
    this.calls += 1;
    return {
      segmentId: `seg-${this.calls}`,
      revision: 1,
      text: Buffer.from(request.audioChunk).toString("utf8"),
      final: true,
      language: "cmn-TW",
    };
  }
}

class DeterministicTtsAdapter implements VoiceTextToSpeechAdapter {
  readonly providerName = "test-double";
  readonly isProductionCapable = false as const;

  async synthesize(
    request: VoiceTtsSynthesizeRequest,
  ): Promise<VoiceTtsPlaybackHandle> {
    return {
      playbackId: `pb-${request.sessionId}-${request.generation}`,
      generation: request.generation,
      audioChunks: [new TextEncoder().encode(`audio:${request.text}`)],
    };
  }
}

async function startServer() {
  const callAuthority = new FakeCallAuthority();
  const asrAdapter = new DeterministicAsrAdapter();
  const ttsAdapter = new DeterministicTtsAdapter();
  const sessionComposer = new VoiceSessionComposer({
    createAdapters: () => ({ asrAdapter, ttsAdapter }),
  });
  const server = new MediaWorkerServer({
    port: 0,
    internalKey: INTERNAL_KEY,
    callAuthorityVerifier: callAuthority,
    sessionComposer,
  });
  const port = await server.start();
  return {
    server,
    port,
    callAuthority,
    asrAdapter,
    ttsAdapter,
    sessionComposer,
  };
}

function textFrame(payload: string): Buffer {
  const body = Buffer.from(payload, "utf8");
  const header = Buffer.from([0x81, body.length]);
  return Buffer.concat([header, body]);
}

function binaryFrame(payload: Buffer): Buffer {
  const header = Buffer.from([0x82, payload.length]);
  return Buffer.concat([header, payload]);
}

async function attach(
  port: number,
  callAuthority: FakeCallAuthority,
  sessionId: string,
): Promise<Socket> {
  const { token } = callAuthority.issue(sessionId);
  const sessionsRes = await fetch(`http://127.0.0.1:${port}/sessions`, {
    method: "POST",
    headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
    body: JSON.stringify({ callAuthorityToken: token }),
  });
  const { grant } = (await sessionsRes.json()) as {
    grant: { token: string };
  };
  return new Promise<Socket>((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: `/ws?sessionId=${sessionId}&grant=${grant.token}`,
      method: "GET",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version": "13",
        [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY,
      },
    });
    req.on("upgrade", (res, socket) => {
      if (res.statusCode !== 101) {
        reject(new Error(`attach failed: ${res.statusCode}`));
        return;
      }
      resolve(socket);
    });
    req.on("error", reject);
    req.end();
  });
}

/** Decodes the small, unmasked server->client WS messages this test
 * exchanges, one frame at a time -- tolerating consecutive frames arriving
 * coalesced in a single TCP `data` event (buffers the remainder for the
 * next `next()` call instead of discarding it). Not a general-purpose WS
 * client. */
function createFrameReader(socket: Socket): {
  next(): Promise<{ opcode: number; payload: Buffer }>;
} {
  let buffer = Buffer.alloc(0);
  const waiters: Array<() => void> = [];

  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    const waiter = waiters.shift();
    if (waiter) waiter();
  });

  function tryDecode(): { opcode: number; payload: Buffer } | undefined {
    if (buffer.length < 2) return undefined;
    const opcode = buffer[0]! & 0x0f;
    const b1 = buffer[1]!;
    const masked = (b1 & 0x80) !== 0;
    let length = b1 & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (buffer.length < 4) return undefined;
      length = buffer.readUInt16BE(2);
      offset = 4;
    }
    let maskKey: Buffer | undefined;
    if (masked) {
      if (buffer.length < offset + 4) return undefined;
      maskKey = buffer.subarray(offset, offset + 4);
      offset += 4;
    }
    if (buffer.length < offset + length) return undefined;
    let payload = buffer.subarray(offset, offset + length);
    if (maskKey) {
      const unmasked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) {
        unmasked[i] = payload[i]! ^ maskKey[i % 4]!;
      }
      payload = unmasked;
    }
    buffer = buffer.subarray(offset + length);
    return { opcode, payload };
  }

  return {
    next(): Promise<{ opcode: number; payload: Buffer }> {
      return new Promise((resolve) => {
        const attempt = () => {
          const frame = tryDecode();
          if (frame) {
            resolve(frame);
          } else {
            waiters.push(attempt);
          }
        };
        attempt();
      });
    },
  };
}

class TrackingAsrAdapter implements VoiceSpeechToTextAdapter {
  readonly providerName = "tracking";
  readonly isProductionCapable = false as const;
  endAudioCalls = 0;
  closeCalls = 0;

  async transcribe(): Promise<VoiceAsrSegmentResult> {
    return {
      segmentId: "seg",
      revision: 1,
      text: "",
      final: true,
      language: "cmn-TW",
    };
  }

  endAudio(): void {
    this.endAudioCalls += 1;
  }

  close(): void {
    this.closeCalls += 1;
  }
}

describe("AUDIT-VOICE-RUNTIME-20261002: VoiceSessionComposer wires real ASR/TTS composition onto an attached session", () => {
  it("transcribes an inbound binary audio frame through the real session harness and emits the real ASR event back", async () => {
    const { server, port, callAuthority, asrAdapter } = await startServer();
    try {
      const socket = await attach(port, callAuthority, "sess-asr-1");
      const reader = createFrameReader(socket);
      socket.write(binaryFrame(Buffer.from("hello-audio")));

      const frame = await reader.next();
      expect(frame.opcode).toBe(0x01);
      const event = JSON.parse(frame.payload.toString("utf8")) as {
        type: string;
        payload: { text: string; final: boolean };
      };
      expect(event.type).toBe("asr.segment.final");
      expect(event.payload.text).toBe("hello-audio");
      expect(event.payload.final).toBe(true);
      expect(asrAdapter.calls).toBe(1);

      socket.destroy();
    } finally {
      await server.stop();
    }
  });

  it("synthesizes TTS from a control frame and writes the real adapter's audio back as a binary frame", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const socket = await attach(port, callAuthority, "sess-tts-1");
      const reader = createFrameReader(socket);
      socket.write(
        textFrame(
          JSON.stringify({
            type: "tts.synthesize",
            text: "歡迎搭車",
            languageCode: "cmn-TW",
          }),
        ),
      );

      // The composer sends the "tts.playback.started" event before the
      // synthesized audio frame -- read both.
      const started = await reader.next();
      expect(started.opcode).toBe(0x01);
      const startedEvent = JSON.parse(started.payload.toString("utf8")) as {
        type: string;
      };
      expect(startedEvent.type).toBe("tts.playback.started");

      const audio = await reader.next();
      expect(audio.opcode).toBe(0x02);
      expect(audio.payload.toString("utf8")).toBe("audio:歡迎搭車");

      socket.destroy();
    } finally {
      await server.stop();
    }
  });

  it("emits a real speech.started event for a speech.started control frame", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const socket = await attach(port, callAuthority, "sess-speech-1");
      const reader = createFrameReader(socket);
      socket.write(textFrame(JSON.stringify({ type: "speech.started" })));

      const frame = await reader.next();
      const event = JSON.parse(frame.payload.toString("utf8")) as {
        type: string;
      };
      expect(event.type).toBe("speech.started");

      socket.destroy();
    } finally {
      await server.stop();
    }
  });

  it("removes the composed session record once its channel emits close, instead of leaking it", () => {
    // Unit-level boundary for this specific cleanup path: the composer
    // only ever needs a channel's "message"/"close" events and its
    // sendText/sendBinary/destroyed surface (see `./session-composer`'s
    // `attach`), so a minimal double of exactly that shape is the real
    // external boundary here -- the end-to-end tests above already prove
    // this composer is wired to a genuine `WebSocketServerChannel` through
    // the real HTTP/WS upgrade.
    const asrAdapter = new DeterministicAsrAdapter();
    const ttsAdapter = new DeterministicTtsAdapter();
    const composer = new VoiceSessionComposer({
      createAdapters: () => ({ asrAdapter, ttsAdapter }),
    });
    const channel = new (class extends EventEmitter {
      destroyed = false;
      sendText(): void {}
      sendBinary(): void {}
    })() as unknown as import("../../../apps/voice-media-worker/src/server/websocket-channel").WebSocketServerChannel;

    composer.attach("sess-closed-1", channel);
    expect(composer.get("sess-closed-1")).toBeDefined();

    (channel as unknown as EventEmitter).emit("close", 1000, "Normal closure");

    expect(composer.get("sess-closed-1")).toBeUndefined();
  });

  /**
   * Codex review round 4 (reopen, AUDIT-VOICE-RUNTIME-20261002) R11:
   * closing a session only ever deleted the composer's own `Map` entry --
   * it never invoked the ASR adapter's `endAudio`/`close`. A provider
   * connection, its waiters, and any billing/session resource it holds
   * outlived the session's actual hangup/drain/idle closure.
   */
  it("invokes the ASR adapter's endAudio/close exactly once when the channel closes", () => {
    const asrAdapter = new TrackingAsrAdapter();
    const ttsAdapter = new DeterministicTtsAdapter();
    const composer = new VoiceSessionComposer({
      createAdapters: () => ({ asrAdapter, ttsAdapter }),
    });
    const channel = new (class extends EventEmitter {
      destroyed = false;
      sendText(): void {}
      sendBinary(): void {}
    })() as unknown as import("../../../apps/voice-media-worker/src/server/websocket-channel").WebSocketServerChannel;

    composer.attach("sess-cleanup-1", channel);
    (channel as unknown as EventEmitter).emit("close", 1000, "Normal closure");

    expect(asrAdapter.endAudioCalls).toBe(1);
    expect(asrAdapter.closeCalls).toBe(1);

    // A duplicate close (defensive: the channel's own close/cleanup is
    // documented single-emission, but this must stay safe regardless)
    // must not re-trigger cleanup for an already-removed session.
    (channel as unknown as EventEmitter).emit("close", 1000, "Normal closure");
    expect(asrAdapter.endAudioCalls).toBe(1);
    expect(asrAdapter.closeCalls).toBe(1);
  });

  /**
   * Codex review round 5 (reopen, AUDIT-VOICE-RUNTIME-20261002) R11
   * scenario (b): a real provider boundary enforcing native WebSocket send
   * semantics throws when `endAudio()` tries to send EOS on a socket still
   * CONNECTING. That exception must never escape `VoiceMediaWorkerSession.
   * closeAsr()` into the composer's close handler -- doing so skipped
   * `close()` entirely and left the composer's own session-map entry
   * leaked, since the `delete` after `closeAsr()` never ran. A plain
   * call-counting double (`TrackingAsrAdapter` above) cannot demonstrate
   * this: it has to actually throw.
   */
  it("still removes the session and still calls close() when the ASR adapter's endAudio throws", () => {
    class ThrowingOnEndAudioAdapter implements VoiceSpeechToTextAdapter {
      readonly providerName = "throwing";
      readonly isProductionCapable = false as const;
      closeCalls = 0;

      async transcribe(): Promise<VoiceAsrSegmentResult> {
        return {
          segmentId: "seg",
          revision: 1,
          text: "",
          final: true,
          language: "cmn-TW",
        };
      }

      endAudio(): void {
        throw new Error(
          "InvalidStateError: still in CONNECTING, cannot send EOS.",
        );
      }

      close(): void {
        this.closeCalls += 1;
      }
    }

    const asrAdapter = new ThrowingOnEndAudioAdapter();
    const ttsAdapter = new DeterministicTtsAdapter();
    const composer = new VoiceSessionComposer({
      createAdapters: () => ({ asrAdapter, ttsAdapter }),
    });
    const channel = new (class extends EventEmitter {
      destroyed = false;
      sendText(): void {}
      sendBinary(): void {}
    })() as unknown as import("../../../apps/voice-media-worker/src/server/websocket-channel").WebSocketServerChannel;

    composer.attach("sess-throwing-endaudio", channel);

    expect(() =>
      (channel as unknown as EventEmitter).emit(
        "close",
        1000,
        "Normal closure",
      ),
    ).not.toThrow();

    expect(composer.get("sess-throwing-endaudio")).toBeUndefined();
    expect(asrAdapter.closeCalls).toBe(1);
  });

  /**
   * Codex review round 6 (reopen, AUDIT-VOICE-RUNTIME-20261002) R11
   * scenario (d): `attach`'s close handler removed the session from the
   * composer's map and called `closeAsr()` -- but `closeAsr()` used to be
   * fire-and-forget, so nothing ever observed when that teardown actually
   * finished. `awaitPendingCloses()` is what lets an orderly shutdown
   * (`MediaWorkerServer.stop`/`drain`) wait for the real completion
   * instead of treating "removed from the map" as proof of it.
   */
  it("awaitPendingCloses only resolves once the ASR adapter's async close() has actually settled, even though the session is already gone from the map", async () => {
    let resolveClose: (() => void) | undefined;
    class AsyncClosingAsrAdapter implements VoiceSpeechToTextAdapter {
      readonly providerName = "async-closing";
      readonly isProductionCapable = false as const;
      closeStarted = false;
      closeSettled = false;

      async transcribe(): Promise<VoiceAsrSegmentResult> {
        return {
          segmentId: "seg",
          revision: 1,
          text: "",
          final: true,
          language: "cmn-TW",
        };
      }

      async close(): Promise<void> {
        this.closeStarted = true;
        await new Promise<void>((resolve) => {
          resolveClose = resolve;
        });
        this.closeSettled = true;
      }
    }

    const asrAdapter = new AsyncClosingAsrAdapter();
    const ttsAdapter = new DeterministicTtsAdapter();
    const composer = new VoiceSessionComposer({
      createAdapters: () => ({ asrAdapter, ttsAdapter }),
    });
    const channel = new (class extends EventEmitter {
      destroyed = false;
      sendText(): void {}
      sendBinary(): void {}
    })() as unknown as import("../../../apps/voice-media-worker/src/server/websocket-channel").WebSocketServerChannel;

    composer.attach("sess-async-close", channel);
    (channel as unknown as EventEmitter).emit("close", 1000, "Normal closure");

    // Removed from the map immediately -- this part of the contract is
    // unchanged.
    expect(composer.get("sess-async-close")).toBeUndefined();
    expect(asrAdapter.closeStarted).toBe(true);
    expect(asrAdapter.closeSettled).toBe(false);

    let awaited = false;
    const awaitPromise = composer.awaitPendingCloses().then(() => {
      awaited = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(awaited).toBe(false);
    expect(asrAdapter.closeSettled).toBe(false);

    resolveClose!();
    await awaitPromise;
    expect(awaited).toBe(true);
    expect(asrAdapter.closeSettled).toBe(true);
  });
});
