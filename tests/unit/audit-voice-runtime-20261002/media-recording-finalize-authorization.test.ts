import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Server as NetServer } from "node:net";
import { Duplex, Readable } from "node:stream";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { MediaRecordingAdapter } from "../../../apps/voice-media-worker/src/recording/media-recording-adapter";
import { VOICE_MEDIA_INTERNAL_KEY_HEADER } from "../../../apps/voice-media-worker/src/server/internal-auth";
import {
  SealedRecorder,
  recordingChecksum,
  type RecorderObjectMetadata,
  type RecorderObjectStore,
  type RecordingScope,
} from "../../../apps/voice-media-worker/src/recording/sealed-recorder";
import { FakeCallAuthority } from "./fake-call-authority";

// Real request/upgrade listeners and recorder/manifest chain, without opening
// a listening socket. Only transport, issuer, ingress, ledger and store are
// boundary doubles. In particular readVersion NEVER invents absent objects.
const INTERNAL_KEY = "offline-finalize-key";
const scope: RecordingScope = {
  brandId: "unit-brand",
  callId: "unit-call",
  recordingId: "unit-recording",
  legId: "unit-leg",
};
const sameScope = (a: RecordingScope, b: RecordingScope) =>
  (["brandId", "callId", "recordingId", "legId"] as const).every(
    (key) => a[key] === b[key],
  );

type Stored = {
  scope: RecordingScope;
  bytes: Uint8Array;
  version: string;
  metadata?: RecorderObjectMetadata;
};
class StrictStore implements RecorderObjectStore {
  readonly objects = new Map<string, Stored>();
  async putRecordingImmutable(
    metadata: Omit<
      RecorderObjectMetadata,
      "objectKey" | "objectVersion" | "durableAt"
    >,
    bytes: Uint8Array,
  ) {
    const objectKey = `audio/${recordingChecksum(Buffer.from(JSON.stringify(metadata)))}`;
    if (this.objects.has(objectKey))
      throw new Error("immutable object already exists");
    const ref = { objectKey, objectVersion: "v1", durableAt: metadata.utcEnd };
    this.objects.set(objectKey, {
      scope: { ...metadata },
      bytes: Uint8Array.from(bytes),
      version: ref.objectVersion,
      metadata: Object.freeze({ ...metadata, ...ref }),
    });
    return ref;
  }
  async putImmutable(boundScope: RecordingScope, bytes: Uint8Array) {
    const objectKey = `manifest/${recordingChecksum(bytes)}`;
    const existing = this.objects.get(objectKey);
    if (existing && !sameScope(existing.scope, boundScope))
      throw new Error("scope conflict");
    if (!existing)
      this.objects.set(objectKey, {
        scope: { ...boundScope },
        bytes: Uint8Array.from(bytes),
        version: "v1",
      });
    return {
      objectKey,
      objectVersion: "v1",
      durableAt: "2026-10-03T00:00:02.000Z",
    };
  }
  async readVersion(boundScope: RecordingScope, key: string, version: string) {
    const item = this.objects.get(key);
    if (
      !item ||
      item.version !== version ||
      !sameScope(item.scope, boundScope)
    ) {
      throw new Error("missing object, version or scope");
    }
    return {
      bytes: Uint8Array.from(item.bytes),
      objectVersion: item.version,
      ...(item.metadata ? { recordingMetadata: item.metadata } : {}),
    };
  }
}

class MemorySocket extends Duplex {
  readonly writes: Buffer[] = [];
  _read() {}
  _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    this.writes.push(Buffer.from(chunk));
    callback();
  }
}
const cleanup: Array<() => Promise<void>> = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(NetServer.prototype, "listen").mockImplementation(() => {
    throw new Error("VM restriction: this suite must never listen");
  });
});
afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Response = { status: number; body: Record<string, unknown> };
function post(
  server: MediaWorkerServer,
  url: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const request = Object.assign(
    Readable.from([Buffer.from(JSON.stringify(body))]),
    {
      method: "POST",
      url,
      headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
    },
  );
  return new Promise((resolve) => {
    const response = {
      statusCode: 200,
      setHeader: () => undefined,
      end(text: string) {
        resolve({
          status: this.statusCode,
          body: JSON.parse(text) as Record<string, unknown>,
        });
      },
    };
    server.httpServer.emit("request", request, response);
  });
}

async function fixture(
  options: {
    attach?: boolean;
    boundScope?: RecordingScope | null;
    closed?: boolean;
    verifier?: boolean;
  } = {},
) {
  const store = new StrictStore();
  const ingress = {
    authorize: vi.fn(async (credential: string, requested: RecordingScope) => {
      if (
        credential !== "unit-recorder-ingress" ||
        !sameScope(requested, scope)
      )
        throw new Error("unauthorized ingress");
      return {
        source: "recording_fork" as const,
        channels: ["inbound", "outbound"] as const,
      };
    }),
  };
  const recorder = new SealedRecorder(ingress, store);
  const segments = await Promise.all(
    (["inbound", "outbound"] as const).map((channel) =>
      recorder.seal("unit-recorder-ingress", {
        ...scope,
        channel,
        startMs: 0,
        endMs: 1000,
        utcStart: "2026-10-03T00:00:00.000Z",
        utcEnd: "2026-10-03T00:00:01.000Z",
        bytes: new Uint8Array(
          channel === "inbound" ? [1, 2, 3, 4] : [5, 6, 7, 8],
        ),
      }),
    ),
  );
  expect(ingress.authorize).toHaveBeenCalledTimes(2);
  expect(store.objects.size).toBe(2);
  const ledger = {
    resolve: vi.fn(async (_credential: string, requested: RecordingScope) => {
      expect(requested).toEqual(scope);
      return options.closed === false
        ? null
        : {
            closedEventId: "trusted-close",
            endedAt: "2026-10-03T00:00:01.000Z",
            endMs: 1000,
            checkpointRefs: [],
          };
    }),
  };
  const adapter = new MediaRecordingAdapter(store, ledger);
  const authority = new FakeCallAuthority();
  const server = new MediaWorkerServer({
    internalKey: INTERNAL_KEY,
    recordingAdapter: adapter,
    wsTimeoutMs: 0,
    ...(options.verifier === false ? {} : { callAuthorityVerifier: authority }),
  });
  const sockets: MemorySocket[] = [];
  const sessionId = "unit-session";
  cleanup.push(async () => {
    server.closeSession(sessionId);
    for (const socket of sockets) socket.destroy();
    await server.stop();
    expect(server.httpServer.address()).toBeNull();
    expect(server.running).toBe(false);
  });
  const admission = authority.issue(sessionId, {
    scope:
      options.boundScope === null ? undefined : (options.boundScope ?? scope),
  });
  if (options.attach !== false) {
    const response = await post(server, "/sessions", {
      callAuthorityToken: admission.token,
    });
    expect(response.status).toBe(201);
    const grant = response.body.grant as { token: string };
    const socket = new MemorySocket();
    sockets.push(socket);
    server.httpServer.emit(
      "upgrade",
      {
        method: "GET",
        url: `/ws?sessionId=${sessionId}&grant=${grant.token}`,
        headers: {
          [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY,
          upgrade: "websocket",
          connection: "Upgrade",
          "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
          "sec-websocket-version": "13",
        },
      },
      socket,
      Buffer.alloc(0),
    );
    expect(socket.writes[0]?.toString()).toContain("101 Switching Protocols");
  }
  const token = (overrides: Parameters<FakeCallAuthority["issue"]>[1] = {}) =>
    authority.issue(sessionId, {
      epoch: admission.claims.epoch,
      scope,
      allowedOperations: ["finalize"],
      ...overrides,
    }).token;
  const finalize = (overrides: Record<string, unknown> = {}) =>
    post(server, "/recording/finalize", {
      sessionId,
      segments,
      callAuthorityToken: token(),
      ...overrides,
    });
  return {
    server,
    store,
    adapter,
    ledger,
    authority,
    admission,
    sessionId,
    segments,
    token,
    finalize,
  };
}

describe("recording finalize authorization with recorder-persisted evidence", () => {
  it("seals actual bidirectional objects and retries the same immutable manifest, ignoring forged body scope", async () => {
    const f = await fixture();
    const first = await f.finalize({ scope: { ...scope, brandId: "forged" } });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: "sealed", scope });
    const retry = await f.finalize();
    expect(retry.status).toBe(200);
    expect(retry.body.manifestRef).toEqual(first.body.manifestRef);
    expect(f.store.objects.size).toBeGreaterThan(2);
    const inbound = f.segments[0]!;
    expect(
      (
        await f.store.readVersion(
          scope,
          inbound.objectKey,
          inbound.objectVersion,
        )
      ).bytes,
    ).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
  it("rejects never-attached and admitted-without-scope sessions before ledger lookup", async () => {
    for (const options of [{ attach: false }, { boundScope: null }]) {
      const f = await fixture(options);
      const result = await f.finalize();
      expect(result.status).toBe(403);
      expect(f.ledger.resolve).not.toHaveBeenCalled();
    }
  });
  it("consults only the trusted closure ledger, never body closure/credential claims", async () => {
    const f = await fixture({ closed: false });
    const result = await f.finalize({
      credential: "forged",
      scope: { ...scope, recordingId: "forged" },
      closure: {
        closedEventId: "forged",
        endMs: 1000,
        endedAt: "2026-10-03T00:00:01.000Z",
        checkpointRefs: [],
      },
      closureLedger: { closedEventId: "forged" },
    });
    expect(result.status).toBe(400);
    expect(f.ledger.resolve).toHaveBeenCalledTimes(1);
    expect(f.ledger.resolve.mock.calls[0]?.[0]).not.toBe("forged");
    expect(f.store.objects.size).toBe(2);
  });
  it("requires its own finalize token even when a session was authorized for admission", async () => {
    const f = await fixture();
    expect((await f.finalize({ callAuthorityToken: undefined })).status).toBe(
      401,
    );
    expect(
      (
        await f.finalize({
          callAuthorityToken: f.token({ allowedOperations: ["admit"] }),
        })
      ).body.code,
    ).toBe("VOICE_MEDIA_CALL_AUTHORITY_OPERATION_NOT_PERMITTED");
    expect(f.ledger.resolve).not.toHaveBeenCalled();
    expect((await f.finalize()).status).toBe(200);
  });
  it("denies finalize-only authority on admission", async () => {
    const f = await fixture({ attach: false });
    const response = await post(f.server, "/sessions", {
      callAuthorityToken: f.token(),
    });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe(
      "VOICE_MEDIA_CALL_AUTHORITY_OPERATION_NOT_PERMITTED",
    );
  });
  it.each(["brandId", "callId", "recordingId", "legId"] as const)(
    "independently denies token resource mismatch in %s",
    async (key) => {
      const f = await fixture();
      const result = await f.finalize({
        callAuthorityToken: f.token({ scope: { ...scope, [key]: "foreign" } }),
      });
      expect(result.status).toBe(403);
      expect(result.body.code).toBe(
        "VOICE_MEDIA_CALL_AUTHORITY_SCOPE_MISMATCH",
      );
      expect(f.ledger.resolve).not.toHaveBeenCalled();
    },
  );
  it("denies missing token scope, wrong session/principal/epoch, expired and revoked tokens", async () => {
    const f = await fixture();
    const revoked = f.token();
    f.authority.revoke(revoked);
    for (const token of [
      f.token({ scope: undefined }),
      f.token({ principalId: "foreign" }),
      f.token({ epoch: f.admission.claims.epoch + 1 }),
      f.token({ expiresAt: Date.now() - 1 }),
      revoked,
      f.authority.issue("other-session", {
        scope,
        epoch: f.admission.claims.epoch,
      }).token,
    ]) {
      expect((await f.finalize({ callAuthorityToken: token })).status).toBe(
        403,
      );
    }
    expect(f.ledger.resolve).not.toHaveBeenCalled();
  });
  it("rejects cross-session segments but leaves the real session recording sealable", async () => {
    const f = await fixture();
    expect(
      (
        await f.finalize({
          segments: f.segments.map((segment) => ({
            ...segment,
            callId: "foreign-call",
          })),
        })
      ).status,
    ).toBe(400);
    expect((await f.finalize()).status).toBe(200);
  });
  it.each([false, true])(
    "fences a superseded epoch before new attachment (previously sealed=%s)",
    async (sealed) => {
      const f = await fixture();
      if (sealed) expect((await f.finalize()).status).toBe(200);
      const calls = f.ledger.resolve.mock.calls.length;
      f.server.closeSession(f.sessionId);
      const next = f.authority.issue(f.sessionId, {
        scope: { ...scope, callId: "next-call" },
      });
      expect(
        (await post(f.server, "/sessions", { callAuthorityToken: next.token }))
          .status,
      ).toBe(201);
      expect((await f.finalize()).status).toBe(403);
      expect(f.ledger.resolve).toHaveBeenCalledTimes(calls);
    },
  );
  it("fails closed without an external call-authority verifier", async () => {
    const f = await fixture({ attach: false, verifier: false });
    expect(
      (
        await post(f.server, "/sessions", {
          callAuthorityToken: f.admission.token,
        })
      ).status,
    ).toBe(503);
    expect((await f.finalize()).status).toBe(503);
    expect(f.ledger.resolve).not.toHaveBeenCalled();
  });
  it.each(["missing", "version", "scope", "metadata", "bytes"] as const)(
    "denies %s object evidence rather than inventing readback",
    async (fault) => {
      const f = await fixture();
      const segment = f.segments[0]!;
      const object = f.store.objects.get(segment.objectKey)!;
      if (fault === "missing") f.store.objects.delete(segment.objectKey);
      if (fault === "version") object.version = "different-version";
      if (fault === "scope") object.scope = { ...scope, legId: "foreign" };
      if (fault === "metadata")
        object.metadata = { ...object.metadata!, endMs: 999 };
      if (fault === "bytes") object.bytes = new Uint8Array([99]);
      const result = await f.finalize();
      expect(result.status).toBe(400);
      expect(result.body.status).not.toBe("sealed");
      expect(
        [...f.store.objects.keys()].every((key) => key.startsWith("audio/")),
      ).toBe(true);
    },
  );
  it("the store itself rejects absent objects and caller-selected versions/scopes", async () => {
    const f = await fixture();
    const segment = f.segments[0]!;
    await expect(f.store.readVersion(scope, "absent", "v1")).rejects.toThrow();
    await expect(
      f.store.readVersion(scope, segment.objectKey, "absent-version"),
    ).rejects.toThrow();
    await expect(
      f.store.readVersion(
        { ...scope, brandId: "foreign" },
        segment.objectKey,
        "v1",
      ),
    ).rejects.toThrow();
  });
});
