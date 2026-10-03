import { describe, it, expect, afterEach } from "vitest";
import * as http from "node:http";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { MediaRecordingAdapter } from "../../../apps/voice-media-worker/src/recording/media-recording-adapter";
import { VOICE_MEDIA_INTERNAL_KEY_HEADER } from "../../../apps/voice-media-worker/src/server/internal-auth";
import {
  SealedRecorder,
  type RecorderIngress,
  type RecorderObjectMetadata,
  type RecorderObjectStore,
  type RecorderSegment,
  type RecordingScope,
} from "../../../apps/voice-media-worker/src/recording/sealed-recorder";
import type { RecordingClosureLedger } from "../../../apps/voice-media-worker/src/recording/final-manifest";
import { FakeCallAuthority } from "./fake-call-authority";

/**
 * Codex review round 1 (reopen, AUDIT-VOICE-RUNTIME-20261002) R1: the HTTP
 * `/recording/finalize` handler trusted the caller's own `scope`/`closure`/
 * `credential` body claims and let a forged closure seal a recording with
 * zero calls to the trusted ledger. These tests exercise the actual HTTP
 * listener, the actual MediaRecordingAdapter/SealedRecorder/
 * FinalRecordingManifests chain, and an in-memory RecorderObjectStore
 * (the only mocked boundary -- never the sealing logic itself).
 *
 * Round 7 repair: `MemoryRecorderObjectStore.readVersion` previously
 * fabricated matching bytes/metadata for ANY requested scope/key/version
 * that was never actually written, so every success-path test here was
 * exercising `verifyRecordedObject`'s checksum/version/metadata checks
 * against a boundary that could never fail them. Segments are now produced
 * exclusively by sealing real audio through the actual `SealedRecorder`
 * (the only mocked dependency is its external `RecorderIngress`), and the
 * store itself does strict key+version lookup with no fallback -- a missing
 * object or a wrong version is a genuine store-level failure, matching a
 * real immutable object store.
 */

const INTERNAL_KEY = "test-internal-key-finalize";
const RECORDED_AUDIO_BYTES = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]);
const RECORDING_FORK_CREDENTIAL = "test-recording-fork-credential";

class MemoryRecorderObjectStore implements RecorderObjectStore {
  private readonly objects = new Map<
    string,
    {
      version: string;
      bytes: Uint8Array;
      metadata: RecorderObjectMetadata | undefined;
    }
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
      version: objectVersion,
      bytes: Uint8Array.from(bytes),
      metadata: Object.freeze({
        ...metadata,
        objectKey,
        objectVersion,
        durableAt,
      }),
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
      version: objectVersion,
      bytes: Uint8Array.from(bytes),
      metadata: undefined,
    });
    return { objectKey, objectVersion, durableAt };
  }

  /** Strict key+version lookup against what was actually written -- no
   * fabricated fallback. A segment referencing an object that was never
   * durably stored, or the wrong version of one that was, must fail here
   * exactly as a real immutable object store would reject it. */
  async readVersion(
    _scope: RecordingScope,
    objectKey: string,
    objectVersion: string,
  ): Promise<{
    bytes: Uint8Array;
    objectVersion: string;
    recordingMetadata?: RecorderObjectMetadata;
  }> {
    const item = this.objects.get(objectKey);
    if (!item || item.version !== objectVersion) {
      throw new Error(
        `VOICE_RECORDING_OBJECT_NOT_FOUND: no stored object for '${objectKey}' at version '${objectVersion}'.`,
      );
    }
    return {
      bytes: Uint8Array.from(item.bytes),
      objectVersion: item.version,
      ...(item.metadata ? { recordingMetadata: item.metadata } : {}),
    };
  }

  async headObject(objectKey: string): Promise<{ exists: boolean }> {
    return { exists: this.objects.has(objectKey) };
  }
}

function makeRecorderIngress(): RecorderIngress {
  return {
    authorize: async () => ({
      source: "recording_fork",
      channels: ["inbound", "outbound"],
    }),
  };
}

/** Actually records both channels through `SealedRecorder.seal` -- the only
 * doubled dependency is the external `RecorderIngress`, never the sealing
 * logic, the checksum/metadata it writes, or the store's readback. */
async function sealBidirectionalSegments(
  store: RecorderObjectStore,
  scope: RecordingScope,
): Promise<RecorderSegment[]> {
  const recorder = new SealedRecorder(makeRecorderIngress(), store);
  const segments: RecorderSegment[] = [];
  for (const channel of ["inbound", "outbound"] as const) {
    segments.push(
      await recorder.seal(RECORDING_FORK_CREDENTIAL, {
        ...scope,
        channel,
        startMs: 0,
        endMs: 1000,
        utcStart: "2026-10-03T00:00:00.000Z",
        utcEnd: "2026-10-03T00:00:01.000Z",
        bytes: RECORDED_AUDIO_BYTES,
      }),
    );
  }
  return segments;
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
  const callAuthority = new FakeCallAuthority();
  const server = new MediaWorkerServer({
    port: 0,
    internalKey: INTERNAL_KEY,
    recordingAdapter: adapter,
    callAuthorityVerifier: callAuthority,
  });
  const port = await server.start();
  return { server, port, callAuthority };
}

async function admitAndAttach(
  port: number,
  sessionId: string,
  scope: RecordingScope | undefined,
  callAuthority: FakeCallAuthority,
): Promise<{ epoch: number }> {
  const { token: callAuthorityToken, claims } = callAuthority.issue(sessionId, {
    scope,
  });
  const sessionsRes = await fetch(`http://127.0.0.1:${port}/sessions`, {
    method: "POST",
    headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
    body: JSON.stringify({ callAuthorityToken }),
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
  return { epoch: claims.epoch };
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

/** Mints a *second*, independent token for the same session id/epoch a
 * prior `admitAndAttach` call already attached -- finalize re-verifies its
 * own presented token rather than reusing the admission grant. Defaults to
 * no recording scope -- callers that expect a successful seal must pass the
 * exact scope the session was admitted/attached with; the finalize-specific
 * token's own claimed scope must authorize that exact resource. */
function finalizeToken(
  callAuthority: FakeCallAuthority,
  sessionId: string,
  epoch: number,
  scope?: RecordingScope,
): string {
  return callAuthority.issue(sessionId, { epoch, scope }).token;
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

    // A caller can hold a validly-issued call-authority token for this
    // session id (e.g. a stale one from before the call ever actually
    // connected) without the session ever having attached -- the worker
    // must still deny, never fall back to the request body's segments.
    const { token: callAuthorityToken } =
      started.callAuthority.issue("never-admitted");
    const result = await postFinalize(started.port, {
      sessionId: "never-admitted",
      segments: [],
      callAuthorityToken,
    });

    expect(result.status).toBe(403);
    expect(result.body.code).toBe("VOICE_MEDIA_SESSION_SCOPE_UNKNOWN");
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

    const { epoch } = await admitAndAttach(
      started.port,
      "no-scope-session",
      undefined,
      started.callAuthority,
    );

    const result = await postFinalize(started.port, {
      sessionId: "no-scope-session",
      segments: [],
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "no-scope-session",
        epoch,
      ),
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
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch } = await admitAndAttach(
      started.port,
      "sess-forged-close",
      scope,
      started.callAuthority,
    );

    const result = await postFinalize(started.port, {
      sessionId: "sess-forged-close",
      segments: await sealBidirectionalSegments(store, scope),
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-forged-close",
        epoch,
        scope,
      ),
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
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch } = await admitAndAttach(
      started.port,
      "sess-valid-finalize",
      scope,
      started.callAuthority,
    );

    const result = await postFinalize(started.port, {
      sessionId: "sess-valid-finalize",
      segments: await sealBidirectionalSegments(store, scope),
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-valid-finalize",
        epoch,
        scope,
      ),
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
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch: epochA } = await admitAndAttach(
      started.port,
      "sess-cross-a",
      scopeA,
      started.callAuthority,
    );
    const { epoch: epochB } = await admitAndAttach(
      started.port,
      "sess-cross-b",
      scopeB,
      started.callAuthority,
    );

    // Target session A (whose authoritative scope is scopeA) but supply
    // scope B's real, durably-recorded segments and claim scope B in the
    // body. The server must resolve scope from session A regardless of the
    // body, and session A's actual recording has no coverage under scope
    // B's segments -- this must fail, not silently seal session B's
    // recording under session A's request.
    const result = await postFinalize(started.port, {
      sessionId: "sess-cross-a",
      segments: await sealBidirectionalSegments(store, scopeB),
      scope: scopeB,
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-cross-a",
        epochA,
        scopeA,
      ),
    });

    expect(result.status).not.toBe(200);
    expect(result.body).not.toMatchObject({ status: "sealed" });

    // Session B's own legitimate finalize is unaffected by the attempted
    // cross-session request above.
    const legitimate = await postFinalize(started.port, {
      sessionId: "sess-cross-b",
      segments: await sealBidirectionalSegments(store, scopeB),
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-cross-b",
        epochB,
        scopeB,
      ),
    });
    expect(legitimate.status).toBe(200);
    expect(legitimate.body.scope).toEqual(scopeB);
  });

  /**
   * Codex review round 3 (reopen, AUDIT-VOICE-RUNTIME-20261002) R2: finalize
   * must authorize itself, not merely trust that *some* scope is already
   * bound to the session id. A token belonging to an unrelated session, or
   * a revoked one, must be denied even though the real session-authoritative
   * scope exists and is otherwise sealable.
   */
  it("rejects finalization when the presented call-authority token belongs to a different session (cross-principal denial)", async () => {
    const scope: RecordingScope = {
      brandId: "brand-x",
      callId: "call-x",
      recordingId: "rec-x",
      legId: "leg-1",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    await admitAndAttach(
      started.port,
      "sess-finalize-x",
      scope,
      started.callAuthority,
    );
    const { token: unrelatedToken } =
      started.callAuthority.issue("some-other-session");

    const result = await postFinalize(started.port, {
      sessionId: "sess-finalize-x",
      segments: await sealBidirectionalSegments(store, scope),
      callAuthorityToken: unrelatedToken,
    });

    expect(result.status).toBe(403);
    expect(result.body.code).toBe(
      "VOICE_MEDIA_CALL_AUTHORITY_SESSION_MISMATCH",
    );
    expect(ledger.calls).toBe(0);
  });

  /**
   * Codex review round 5 R2 (remaining operation requirement, carried from
   * round 4): a token that resolves to the exact bound session/epoch/
   * principal/resource is not, by itself, evidence of permission to
   * *finalize* -- admission and finalize are separate capabilities, and
   * `verifySessionAuthority` must be told, and must itself enforce, which
   * operation the caller is attempting.
   */
  it("rejects finalization when the presented token resolves to the right session/epoch/resource but was only ever granted the 'admit' operation", async () => {
    const scope: RecordingScope = {
      brandId: "brand-op",
      callId: "call-op-admit-only",
      recordingId: "rec-op-admit-only",
      legId: "leg-1",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch } = await admitAndAttach(
      started.port,
      "sess-op-admit-only",
      scope,
      started.callAuthority,
    );
    // Same session/epoch/resource as the admission above, but this
    // finalize-time token was only ever granted 'admit'.
    const { token: admitOnlyToken } = started.callAuthority.issue(
      "sess-op-admit-only",
      { epoch, scope, allowedOperations: ["admit"] },
    );

    const result = await postFinalize(started.port, {
      sessionId: "sess-op-admit-only",
      segments: await sealBidirectionalSegments(store, scope),
      callAuthorityToken: admitOnlyToken,
    });

    expect(result.status).toBe(403);
    expect(result.body.code).toBe(
      "VOICE_MEDIA_CALL_AUTHORITY_OPERATION_NOT_PERMITTED",
    );
    expect(ledger.calls).toBe(0);
  });

  it("seals a valid finalization using a token granted only the 'finalize' operation (operation separation does not over-deny)", async () => {
    const scope: RecordingScope = {
      brandId: "brand-op",
      callId: "call-op-finalize-only",
      recordingId: "rec-op-finalize-only",
      legId: "leg-1",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch } = await admitAndAttach(
      started.port,
      "sess-op-finalize-only",
      scope,
      started.callAuthority,
    );
    const { token: finalizeOnlyToken } = started.callAuthority.issue(
      "sess-op-finalize-only",
      { epoch, scope, allowedOperations: ["finalize"] },
    );

    const result = await postFinalize(started.port, {
      sessionId: "sess-op-finalize-only",
      segments: await sealBidirectionalSegments(store, scope),
      callAuthorityToken: finalizeOnlyToken,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "sealed" });
    expect(ledger.calls).toBeGreaterThan(0);
  });

  it("rejects finalization once the presented call-authority token has been revoked", async () => {
    const scope: RecordingScope = {
      brandId: "brand-y",
      callId: "call-y",
      recordingId: "rec-y",
      legId: "leg-1",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch } = await admitAndAttach(
      started.port,
      "sess-finalize-revoked",
      scope,
      started.callAuthority,
    );
    const revokedToken = finalizeToken(
      started.callAuthority,
      "sess-finalize-revoked",
      epoch,
    );
    started.callAuthority.revoke(revokedToken);

    const result = await postFinalize(started.port, {
      sessionId: "sess-finalize-revoked",
      segments: await sealBidirectionalSegments(store, scope),
      callAuthorityToken: revokedToken,
    });

    expect(result.status).toBe(403);
    expect(result.body.code).toBe("VOICE_MEDIA_CALL_AUTHORITY_REVOKED");
    expect(ledger.calls).toBe(0);
  });

  /**
   * Repair-boundary case from the same R2 finding: `closeSession` followed
   * by reissuing the id for a *different* call must fence the old call's
   * authority before the new epoch is ever attached -- finalize using the
   * old scope must be denied, not silently allowed just because some scope
   * was once bound to this session id.
   */
  it("fences the old epoch's recording authority once a session id is reissued for a new call, even before the new grant is attached", async () => {
    const oldScope: RecordingScope = {
      brandId: "brand-B",
      callId: "call-B",
      recordingId: "rec-B",
      legId: "leg-B",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch: oldEpoch } = await admitAndAttach(
      started.port,
      "sess-reused-id",
      oldScope,
      started.callAuthority,
    );
    started.server.closeSession("sess-reused-id");

    // Reissue the same session id for an unrelated new call (brand-C/
    // call-C, a later epoch) without ever attaching it.
    const { token: newToken } = started.callAuthority.issue("sess-reused-id", {
      scope: {
        brandId: "brand-C",
        callId: "call-C",
        recordingId: "rec-C",
        legId: "leg-C",
      },
    });
    const newSessionRes = await fetch(
      `http://127.0.0.1:${started.port}/sessions`,
      {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ callAuthorityToken: newToken }),
      },
    );
    expect(newSessionRes.status).toBe(201);

    // Before the new epoch's grant is ever attached, a finalize attempt
    // using the *old* epoch's authority/scope must be denied.
    const staleResult = await postFinalize(started.port, {
      sessionId: "sess-reused-id",
      segments: await sealBidirectionalSegments(store, oldScope),
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-reused-id",
        oldEpoch,
      ),
    });

    expect(staleResult.status).not.toBe(200);
    expect(staleResult.body).not.toMatchObject({ status: "sealed" });
    expect(ledger.calls).toBe(0);
  });

  /**
   * Codex review round 4 (reopen, AUDIT-VOICE-RUNTIME-20261002) R2: a
   * finalize-specific token that resolves to the exact same
   * session/epoch/principal as the attached scope must still independently
   * authorize the recording *resource* -- resolving session/epoch/
   * principal alone was wrongly treated as sufficient, letting a token with
   * no recording scope (or a scope for a different brand/call/recording/
   * leg) seal the session's actual attached recording.
   */
  it("rejects finalization when the same-session/epoch/principal token carries no recording scope", async () => {
    const scope: RecordingScope = {
      brandId: "brand-A",
      callId: "call-A",
      recordingId: "recording-A",
      legId: "leg-A",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch } = await admitAndAttach(
      started.port,
      "sess-r2-no-scope-token",
      scope,
      started.callAuthority,
    );

    // Same session id, same epoch, same default principal -- but the
    // finalize token itself carries no recording scope at all.
    const result = await postFinalize(started.port, {
      sessionId: "sess-r2-no-scope-token",
      segments: await sealBidirectionalSegments(store, scope),
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-r2-no-scope-token",
        epoch,
      ),
    });

    expect(result.status).toBe(403);
    expect(result.body.code).toBe("VOICE_MEDIA_CALL_AUTHORITY_SCOPE_MISMATCH");
    expect(ledger.calls).toBe(0);
  });

  it("rejects finalization when the same-session/epoch/principal token carries a different brand/call/recording/leg", async () => {
    const scope: RecordingScope = {
      brandId: "brand-A",
      callId: "call-A",
      recordingId: "recording-A",
      legId: "leg-A",
    };
    const otherScope: RecordingScope = {
      brandId: "brand-B",
      callId: "call-B",
      recordingId: "recording-B",
      legId: "leg-B",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch } = await admitAndAttach(
      started.port,
      "sess-r2-cross-scope-token",
      scope,
      started.callAuthority,
    );

    const result = await postFinalize(started.port, {
      sessionId: "sess-r2-cross-scope-token",
      segments: await sealBidirectionalSegments(store, scope),
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-r2-cross-scope-token",
        epoch,
        otherScope,
      ),
    });

    expect(result.status).toBe(403);
    expect(result.body.code).toBe("VOICE_MEDIA_CALL_AUTHORITY_SCOPE_MISMATCH");
    expect(ledger.calls).toBe(0);
  });

  /**
   * Codex review round 4 R8: `release()` immediately after a successful
   * seal erased the scope/principal/epoch an authorized retry needs,
   * failing closed with VOICE_MEDIA_SESSION_SCOPE_UNKNOWN even though the
   * underlying manifest is durable and `sealFinalRecording` is documented
   * reentrant. A lost first HTTP response must be safely recoverable.
   */
  it("allows an identical authorized retry after a successful seal to reach the same reentrant result", async () => {
    const scope: RecordingScope = {
      brandId: "brand-retry",
      callId: "call-retry",
      recordingId: "rec-retry",
      legId: "leg-retry",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch } = await admitAndAttach(
      started.port,
      "sess-retry",
      scope,
      started.callAuthority,
    );
    const segments = await sealBidirectionalSegments(store, scope);

    const first = await postFinalize(started.port, {
      sessionId: "sess-retry",
      segments,
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-retry",
        epoch,
        scope,
      ),
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: "sealed" });

    const retry = await postFinalize(started.port, {
      sessionId: "sess-retry",
      segments,
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-retry",
        epoch,
        scope,
      ),
    });

    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ status: "sealed" });
    expect(retry.body.manifestRef).toEqual(first.body.manifestRef);
  });

  it("rejects a finalize retry presenting a now-superseded (lower) epoch after a session id is reissued", async () => {
    const scope: RecordingScope = {
      brandId: "brand-stale-retry",
      callId: "call-stale-retry",
      recordingId: "rec-stale-retry",
      legId: "leg-stale-retry",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch } = await admitAndAttach(
      started.port,
      "sess-stale-retry",
      scope,
      started.callAuthority,
    );
    const segments = await sealBidirectionalSegments(store, scope);

    const sealed = await postFinalize(started.port, {
      sessionId: "sess-stale-retry",
      segments,
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-stale-retry",
        epoch,
        scope,
      ),
    });
    expect(sealed.status).toBe(200);
    const ledgerCallsAfterSeal = ledger.calls;

    started.server.closeSession("sess-stale-retry");

    // Reissue the same session id for an unrelated new call at a higher
    // epoch -- the completed finalization for the old epoch must not keep
    // authorizing anything once a newer epoch supersedes it.
    const { token: newToken } = started.callAuthority.issue(
      "sess-stale-retry",
      {
        scope: {
          brandId: "brand-new",
          callId: "call-new",
          recordingId: "rec-new",
          legId: "leg-new",
        },
      },
    );
    const newSessionRes = await fetch(
      `http://127.0.0.1:${started.port}/sessions`,
      {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ callAuthorityToken: newToken }),
      },
    );
    expect(newSessionRes.status).toBe(201);

    const retryAfterReissue = await postFinalize(started.port, {
      sessionId: "sess-stale-retry",
      segments,
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-stale-retry",
        epoch,
        scope,
      ),
    });

    expect(retryAfterReissue.status).not.toBe(200);
    // No additional ledger consultation beyond the first, already-sealed
    // call -- the denial happens before the adapter is ever reached.
    expect(ledger.calls).toBe(ledgerCallsAfterSeal);
  });

  /**
   * Round 7 repair-boundary regression: with `MemoryRecorderObjectStore`
   * now doing strict key+version lookup (no fabricated fallback), a segment
   * that claims an object that was never actually durably stored must make
   * the whole finalization fail, not silently "verify" against invented
   * bytes.
   */
  it("rejects finalization when a segment references an object that was never durably stored", async () => {
    const scope: RecordingScope = {
      brandId: "brand-missing-object",
      callId: "call-missing-object",
      recordingId: "rec-missing-object",
      legId: "leg-1",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch } = await admitAndAttach(
      started.port,
      "sess-missing-object",
      scope,
      started.callAuthority,
    );

    // Genuinely sealed segments, then point one of them at an object key
    // that was never written through `putRecordingImmutable` -- the store
    // must reject the readback instead of fabricating matching bytes.
    const segments = await sealBidirectionalSegments(store, scope);
    const tampered = segments.map((segment, index) =>
      index === 0
        ? {
            ...segment,
            objectKey: `${segment.objectKey}-never-stored`,
          }
        : segment,
    );

    const result = await postFinalize(started.port, {
      sessionId: "sess-missing-object",
      segments: tampered,
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-missing-object",
        epoch,
        scope,
      ),
    });

    expect(result.status).not.toBe(200);
    expect(result.body).not.toMatchObject({ status: "sealed" });
  });

  it("rejects finalization when a segment claims a different stored object version", async () => {
    const scope: RecordingScope = {
      brandId: "brand-wrong-version",
      callId: "call-wrong-version",
      recordingId: "rec-wrong-version",
      legId: "leg-1",
    };
    const ledger = makeCountingLedger((resolvedScope) => ({
      closedEventId: `evt-${resolvedScope.callId}`,
      endedAt: "2026-10-03T00:00:01.000Z",
      endMs: 1000,
      checkpointRefs: [],
    }));
    const store = new MemoryRecorderObjectStore();
    const adapter = new MediaRecordingAdapter(store, ledger);
    const started = await startServer(adapter);
    server = started.server;

    const { epoch } = await admitAndAttach(
      started.port,
      "sess-wrong-version",
      scope,
      started.callAuthority,
    );

    const segments = await sealBidirectionalSegments(store, scope);
    const tampered = segments.map((segment, index) =>
      index === 0 ? { ...segment, objectVersion: "v2-never-stored" } : segment,
    );

    const result = await postFinalize(started.port, {
      sessionId: "sess-wrong-version",
      segments: tampered,
      callAuthorityToken: finalizeToken(
        started.callAuthority,
        "sess-wrong-version",
        epoch,
        scope,
      ),
    });

    expect(result.status).not.toBe(200);
    expect(result.body).not.toMatchObject({ status: "sealed" });
  });
});
