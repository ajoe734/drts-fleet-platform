import { describe, it, expect, afterEach } from "vitest";
import * as http from "node:http";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { MediaRecordingAdapter } from "../../../apps/voice-media-worker/src/recording/media-recording-adapter";
import { VOICE_MEDIA_INTERNAL_KEY_HEADER } from "../../../apps/voice-media-worker/src/server/internal-auth";
import {
  recordingChecksum,
  type RecorderObjectMetadata,
  type RecorderObjectStore,
  type RecorderSegment,
  type RecordingScope,
} from "../../../apps/voice-media-worker/src/recording/sealed-recorder";
import type { RecordingClosureLedger } from "../../../apps/voice-media-worker/src/recording/final-manifest";

/**
 * Codex review round 1 (reopen, AUDIT-VOICE-RUNTIME-20261002) R1: the HTTP
 * `/recording/finalize` handler trusted the caller's own `scope`/`closure`/
 * `credential` body claims and let a forged closure seal a recording with
 * zero calls to the trusted ledger. These tests exercise the actual HTTP
 * listener, the actual MediaRecordingAdapter/SealedRecorder/
 * FinalRecordingManifests chain, and an in-memory RecorderObjectStore
 * (the only mocked boundary -- never the sealing logic itself).
 */

const INTERNAL_KEY = "test-internal-key-finalize";
const DUMMY_AUDIO_BYTES = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]);
const DUMMY_CHECKSUM = recordingChecksum(DUMMY_AUDIO_BYTES);

function bidirectionalSegments(scope: RecordingScope): RecorderSegment[] {
  return (["inbound", "outbound"] as const).map((channel) => ({
    ...scope,
    channel,
    startMs: 0,
    endMs: 1000,
    utcStart: "2026-10-03T00:00:00.000Z",
    utcEnd: "2026-10-03T00:00:01.000Z",
    objectKey: `rec/${scope.brandId}/${scope.callId}/${scope.recordingId}/${channel}-0-1000.opus`,
    objectVersion: "v1",
    checksum: DUMMY_CHECKSUM,
    byteLength: DUMMY_AUDIO_BYTES.byteLength,
    durableAt: "2026-10-03T00:00:01.000Z",
  }));
}

class MemoryRecorderObjectStore implements RecorderObjectStore {
  private readonly objects = new Map<
    string,
    { metadata: unknown; bytes: Uint8Array }
  >();

  async putRecordingImmutable(
    metadata: Omit<
      RecorderObjectMetadata,
      "objectKey" | "objectVersion" | "durableAt"
    >,
    bytes: Uint8Array,
  ): Promise<{ objectKey: string; objectVersion: string; durableAt: string }> {
    const objectKey = `rec/${metadata.brandId}/${metadata.callId}/${metadata.recordingId}/${metadata.channel}-${metadata.startMs}-${metadata.endMs}.opus`;
    const objectVersion = "v1";
    const durableAt = metadata.utcEnd;
    this.objects.set(objectKey, {
      metadata: { ...metadata, objectKey, objectVersion, durableAt },
      bytes,
    });
    return { objectKey, objectVersion, durableAt };
  }

  async putImmutable(
    scope: RecordingScope,
    bytes: Uint8Array,
  ): Promise<{ objectKey: string; objectVersion: string; durableAt: string }> {
    const objectKey = `manifests/${scope.brandId}/${scope.callId}/${scope.recordingId}/final.json`;
    const objectVersion = "v1";
    const durableAt = "2026-10-03T00:00:02.000Z";
    this.objects.set(objectKey, {
      metadata: { scope, objectKey, objectVersion, durableAt },
      bytes,
    });
    return { objectKey, objectVersion, durableAt };
  }

  async readVersion(
    scope: RecordingScope,
    objectKey: string,
    objectVersion: string,
  ): Promise<{
    bytes: Uint8Array;
    objectVersion: string;
    recordingMetadata?: RecorderObjectMetadata;
  }> {
    const item = this.objects.get(objectKey);
    if (item) {
      return {
        bytes: item.bytes,
        objectVersion,
        recordingMetadata: item.metadata as RecorderObjectMetadata,
      };
    }
    // Segments supplied directly to `sealFinalRecording` (as a real caller
    // would, referencing audio already durably written by the recorder
    // fork) were never separately persisted via `putRecordingImmutable` in
    // this test boundary. Mirror their declared metadata back so
    // `verifyRecordedObject`'s checksum/byteLength/metadata cross-check
    // still runs against real segment data, not a mocked pass-through.
    const channel = objectKey.includes("outbound") ? "outbound" : "inbound";
    return {
      bytes: DUMMY_AUDIO_BYTES,
      objectVersion,
      recordingMetadata: {
        ...scope,
        channel,
        startMs: 0,
        endMs: 1000,
        utcStart: "2026-10-03T00:00:00.000Z",
        utcEnd: "2026-10-03T00:00:01.000Z",
        objectKey,
        objectVersion,
        checksum: DUMMY_CHECKSUM,
        byteLength: DUMMY_AUDIO_BYTES.byteLength,
        durableAt: "2026-10-03T00:00:01.000Z",
        source: "recording_fork",
      },
    };
  }

  async headObject(objectKey: string): Promise<{ exists: boolean }> {
    return { exists: this.objects.has(objectKey) };
  }
}

function makeCountingLedger(
  resolveImpl: (
    scope: RecordingScope,
  ) => Awaited<ReturnType<RecordingClosureLedger["resolve"]>>,
): RecordingClosureLedger & { calls: number } {
  const ledger = {
    calls: 0,
    resolve: async (_credential: string, scope: RecordingScope) => {
      ledger.calls++;
      return resolveImpl(scope);
    },
  };
  return ledger;
}

async function startServer(adapter: MediaRecordingAdapter) {
  const server = new MediaWorkerServer({
    port: 0,
    internalKey: INTERNAL_KEY,
    recordingAdapter: adapter,
  });
  const port = await server.start();
  return { server, port };
}

async function admitAndAttach(
  port: number,
  sessionId: string,
  scope: RecordingScope,
): Promise<void> {
  const sessionsRes = await fetch(`http://127.0.0.1:${port}/sessions`, {
    method: "POST",
    headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
    body: JSON.stringify({ sessionId, scope }),
  });
  if (sessionsRes.status !== 201) {
    throw new Error(`admission failed: ${sessionsRes.status}`);
  }
  const { grant } = (await sessionsRes.json()) as {
    grant: { token: string };
  };

  await new Promise<void>((resolve, reject) => {
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
        socket.destroy();
        return;
      }
      socket.destroy();
      resolve();
    });
    req.on("response", (res) =>
      reject(new Error(`attach failed: ${res.statusCode}`)),
    );
    req.on("error", reject);
    req.end();
  });
}

async function postFinalize(port: number, body: Record<string, unknown>) {
  const res = await fetch(`http://127.0.0.1:${port}/recording/finalize`, {
    method: "POST",
    headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: json };
}

describe("AUDIT-VOICE-RUNTIME-20261002: /recording/finalize session-authoritative scope and closure", () => {
  let server: MediaWorkerServer | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  it("rejects finalization for a sessionId that was never attached, without calling the trusted ledger", async () => {
    const ledger = makeCountingLedger(() => null);
    const adapter = new MediaRecordingAdapter(
      new MemoryRecorderObjectStore(),
      ledger,
    );
    const started = await startServer(adapter);
    server = started.server;

    const result = await postFinalize(started.port, {
      sessionId: "never-admitted",
      segments: [],
    });

    expect(result.status).toBe(403);
    expect(ledger.calls).toBe(0);
  });

  it("rejects finalization for a session that was admitted with no recording scope, without calling the trusted ledger", async () => {
    const ledger = makeCountingLedger(() => null);
    const adapter = new MediaRecordingAdapter(
      new MemoryRecorderObjectStore(),
      ledger,
    );
    const started = await startServer(adapter);
    server = started.server;

    const sessionsRes = await fetch(
      `http://127.0.0.1:${started.port}/sessions`,
      {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ sessionId: "no-scope-session" }),
      },
    );
    const { grant } = (await sessionsRes.json()) as {
      grant: { token: string };
    };
    await new Promise<void>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port: started.port,
        path: `/ws?sessionId=no-scope-session&grant=${grant.token}`,
        method: "GET",
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
          "Sec-WebSocket-Version": "13",
          [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY,
        },
      });
      req.on("upgrade", (_res, socket) => {
        socket.destroy();
        resolve();
      });
      req.on("error", reject);
      req.end();
    });

    const result = await postFinalize(started.port, {
      sessionId: "no-scope-session",
      segments: [],
      // Attacker-supplied scope must be ignored entirely, not treated as a
      // fallback when the session itself has none bound.
      scope: {
        brandId: "forged",
        callId: "forged",
        recordingId: "forged",
        legId: "forged",
      },
    });

    expect(result.status).toBe(403);
    expect(ledger.calls).toBe(0);
  });

  it("does not seal a forged closure even with the correct internal key and an attached session: the trusted ledger's answer governs, not the request body", async () => {
    const scope: RecordingScope = {
      brandId: "brand-r1",
      callId: "call-r1-forged",
      recordingId: "rec-r1-forged",
      legId: "leg-1",
    };
    // Trusted ledger reports no real closure yet (call still active / not
    // actually ended) -- this is the state the forged request tries to
    // paper over.
    const ledger = makeCountingLedger(() => null);
    const adapter = new MediaRecordingAdapter(
      new MemoryRecorderObjectStore(),
      ledger,
    );
    const started = await startServer(adapter);
    server = started.server;

    await admitAndAttach(started.port, "sess-forged-close", scope);

    const result = await postFinalize(started.port, {
      sessionId: "sess-forged-close",
      segments: bidirectionalSegments(scope),
      credential: "forged-admin-credential",
      scope: { ...scope, recordingId: "a-different-recording" },
      closure: {
        closedEventId: "forged-close-event",
        endedAt: "2026-10-03T00:00:01.000Z",
        endMs: 1000,
        checkpointRefs: [],
      },
      closureLedger: {
        resolve: async () => ({
          closedEventId: "forged-close-event",
          endedAt: "2026-10-03T00:00:01.000Z",
          endMs: 1000,
          checkpointRefs: [],
        }),
      },
    });

    expect(result.status).not.toBe(200);
    expect(result.body).not.toMatchObject({ status: "sealed" });
    // The trusted ledger WAS consulted -- using the session-authoritative
    // scope, not the forged one -- and it is the one that said no.
    expect(ledger.calls).toBe(1);
  });

  it("seals a valid authorized finalization using the real sealing chain, ignoring any conflicting scope the caller supplies", async () => {
    const scope: RecordingScope = {
      brandId: "brand-r1",
      callId: "call-r1-valid",
      recordingId: "rec-r1-valid",
      legId: "leg-1",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const adapter = new MediaRecordingAdapter(
      new MemoryRecorderObjectStore(),
      ledger,
    );
    const started = await startServer(adapter);
    server = started.server;

    await admitAndAttach(started.port, "sess-valid-finalize", scope);

    const result = await postFinalize(started.port, {
      sessionId: "sess-valid-finalize",
      segments: bidirectionalSegments(scope),
      // Even a well-formed but different scope in the body must be ignored.
      scope: {
        brandId: "attacker-brand",
        callId: "attacker-call",
        recordingId: "attacker-recording",
        legId: "attacker-leg",
      },
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "sealed" });
    expect(result.body.scope).toEqual(scope);
    expect(ledger.calls).toBeGreaterThan(0);
  });

  it("rejects finalization where the request targets session A but carries session B's recording scope/segments (cross-session/cross-recording denial)", async () => {
    const scopeA: RecordingScope = {
      brandId: "brand-cross",
      callId: "call-cross-a",
      recordingId: "rec-cross-a",
      legId: "leg-1",
    };
    const scopeB: RecordingScope = {
      brandId: "brand-cross",
      callId: "call-cross-b",
      recordingId: "rec-cross-b",
      legId: "leg-1",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const adapter = new MediaRecordingAdapter(
      new MemoryRecorderObjectStore(),
      ledger,
    );
    const started = await startServer(adapter);
    server = started.server;

    await admitAndAttach(started.port, "sess-cross-a", scopeA);
    await admitAndAttach(started.port, "sess-cross-b", scopeB);

    // Target session A (whose authoritative scope is scopeA) but supply
    // scope B's segments and claim scope B in the body. The server must
    // resolve scope from session A regardless of the body, and session A's
    // actual recording has no coverage under scope B's segments -- this
    // must fail, not silently seal session B's recording under session A's
    // request.
    const result = await postFinalize(started.port, {
      sessionId: "sess-cross-a",
      segments: bidirectionalSegments(scopeB),
      scope: scopeB,
    });

    expect(result.status).not.toBe(200);
    expect(result.body).not.toMatchObject({ status: "sealed" });

    // Session B's own legitimate finalize is unaffected by the attempted
    // cross-session request above.
    const legitimate = await postFinalize(started.port, {
      sessionId: "sess-cross-b",
      segments: bidirectionalSegments(scopeB),
    });
    expect(legitimate.status).toBe(200);
    expect(legitimate.body.scope).toEqual(scopeB);
  });
});
