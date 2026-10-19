import { EventEmitter, once } from "node:events";
import { Duplex, Readable } from "node:stream";
import { Server as NetServer } from "node:net";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { expect, it, vi } from "vitest";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { createVoiceSessionBindingResolver } from "../../../apps/voice-media-worker/src/server";
import { VoiceSessionRepository } from "../../../apps/api/src/modules/voice-booking/voice-session.repository";
import { VoiceSessionService } from "../../../apps/api/src/modules/voice-booking/voice-session.service";
import { FakeCallAuthority } from "../audit-voice-runtime-20261002/fake-call-authority";
import {
  RecordingContinuation,
  type RecordingContinuationSource,
  type RecordingContinuationJournal,
} from "../../../apps/voice-media-worker/src/recording/recording-continuation";
import { ObjectStoreRecorderObjectStore } from "../../../apps/voice-media-worker/src/recording/object-store-recorder";
import { ImmutableRecordingManifests } from "../../../apps/voice-media-worker/src/recording/immutable-manifest";
import { VoiceSessionComposer } from "../../../apps/voice-media-worker/src/server/session-composer";
import {
  SandboxSpeechToTextAdapter,
  SandboxTextToSpeechAdapter,
} from "../../../apps/voice-media-worker/src/media-provider";
import { VoiceApiClient } from "../../../apps/voice-media-worker/src/server/voice-api-client";
import { resolve } from "node:path";
import { sourceModuleLoader } from "./source-module-loader";
import { VoiceBookingRepository as CurrentRepository } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { VoiceBookingController } from "../../../apps/api/src/modules/voice-booking/voice-booking.controller";
import { FirstPartyVoiceMediaRecordingAdapter } from "../../../apps/api/src/modules/voice-booking/voice-media-recording.adapter";
import type { VoiceRecordingContinuationEvent } from "@drts/contracts";

const VoiceBookingRepository = process.env.VOICE_ORIGINAL_REF
  ? sourceModuleLoader({}, [
      "apps/api/src/modules/voice-booking/voice-booking.repository.ts",
    ])<{ VoiceBookingRepository: typeof CurrentRepository }>(
      resolve("apps/api/src/modules/voice-booking/voice-booking.repository.ts"),
    ).VoiceBookingRepository
  : CurrentRepository;
const scope = {
  brandId: "SIM-brand",
  callId: "call-1",
  recordingId: "recording-1",
  legId: "leg-1",
};
async function harness(directAttach = true) {
  const rows: VoiceRecordingContinuationEvent[] = [],
    work: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  const db = {
    isEnabled: () => true,
    connect: async () => ({ query: db.query, release() {} }),
    query: async (sql: string, args: readonly unknown[] = []) => {
      let result: Record<string, unknown>[] = [];
      if (sql.includes("FROM voice.session "))
        result = [
          {
            voice_session_id: "session-1",
            call_id: scope.callId,
            resource_scope_id: "scope",
            route_profile_version: 1,
            lease_epoch: 1,
            session_version: 1,
            created_at: now,
            updated_at: now,
          },
        ];
      else if (sql.includes("FROM voice.resource_scope"))
        result = [
          {
            scope_id: "scope",
            brand_id: scope.brandId,
            created_at: now,
            updated_at: now,
          },
        ];
      else if (sql.includes("INSERT INTO voice.recording_continuation_event")) {
        const event = JSON.parse(
          String(args[5]),
        ) as VoiceRecordingContinuationEvent;
        if (
          !rows.some(
            (row) =>
              row.scope.recordingId === event.scope.recordingId &&
              row.eventKey === event.eventKey,
          )
        ) {
          rows.push(event);
          result = [{ payload: event }];
        }
      } else if (sql.includes("FROM voice.recording_continuation_event"))
        result = rows
          .filter(
            (row) =>
              !sql.includes("event_key = $3") ||
              (row.scope.recordingId === args[1] && row.eventKey === args[2]),
          )
          .map((payload) => ({ payload }));
      else if (sql.includes("INSERT INTO voice.work_item")) {
        if (!work.some((row) => row.dedupe_key === args[1]))
          work.push({
            voice_session_id: args[0],
            dedupe_key: args[1],
            work_type: "finalize_recording",
            payload_ref: args[2],
          });
      } else if (sql.includes("FROM voice.work_item"))
        result = work.filter((row) => row.dedupe_key === args[0]);
      return { rows: result, rowCount: result.length };
    },
  };
  const repository = new VoiceBookingRepository(db as never);
  const controller = new VoiceBookingController(
    {} as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    new VoiceSessionService(new VoiceSessionRepository(db as never)),
    repository,
  );
  const client = new VoiceApiClient(
    {
      baseUrl: "https://firstparty.example.test",
      fetchImpl: async (raw, init) => {
        const sessionPath = String(raw).split("/sessions/")[1]!;
        const session = sessionPath.split("/")[0]!;
        const result =
          init?.method === "POST"
            ? await controller.recordRecordingEvent(
                session,
                JSON.parse(String(init.body)),
              )
            : sessionPath.includes("/recording-events")
              ? await controller.getRecordingEvents(session)
              : await controller.getSession(session);
        return Response.json(deepToSnakeCase(result));
      },
    },
    { getToken: async () => "SIM-workload-identity" },
  );
  const journal: RecordingContinuationJournal = {
    append: async (session, event) =>
      (await client.appendRecordingEvent(session, event)).event,
    read: async (session, binding) =>
      (await client.getRecordingEvents(session)).events.filter(
        (event) =>
          !binding || JSON.stringify(event.scope) === JSON.stringify(binding),
      ),
  };
  const objects = new Map<
    string,
    {
      body: Uint8Array;
      versionId: string;
      storedAt: string;
      metadata: Readonly<Record<string, string>>;
    }
  >();
  let puts = 0;
  const store = new ObjectStoreRecorderObjectStore({
    putObjectVersion: async (key, bytes, metadata) => {
      const versionId = String(++puts),
        storedAt = new Date().toISOString();
      objects.set(`${key}:${versionId}`, {
        body: Uint8Array.from(bytes),
        versionId,
        storedAt,
        metadata,
      });
      return { versionId, storedAt };
    },
    getObjectVersion: async (key, version) => {
      const value = objects.get(`${key}:${version}`);
      if (!value) throw Error("SIM external object missing");
      return value;
    },
  });
  let callbacks:
    | Parameters<RecordingContinuationSource["subscribe"]>[2]
    | undefined;
  let checkpointRefs: Parameters<
    RecordingContinuationSource["subscribe"]
  >[2] extends never
    ? never
    : import("../../../apps/voice-media-worker/src/recording/immutable-manifest").RecordingManifestRef[] =
    [];
  const endedAt = new Date(Date.now() - 1000).toISOString(),
    start = new Date(Date.parse(endedAt) - 1000).toISOString();
  const source: RecordingContinuationSource = {
    subscribe: (_session, _scope, handler) => {
      callbacks = handler;
      return { close() {} };
    },
    ingress: {
      authorize: async () => ({
        source: "recording_fork",
        channels: ["inbound", "outbound"],
      }),
    },
    closure: {
      resolve: async () => ({
        closedEventId: "SIM-provider-close-1",
        endedAt,
        endMs: 1000,
        checkpointRefs,
      }),
    },
  };
  let runtime = new RecordingContinuation(store, journal, source);
  const composer = new VoiceSessionComposer(
    {
      createAdapters: () => ({
        asrAdapter: new SandboxSpeechToTextAdapter(),
        ttsAdapter: new SandboxTextToSpeechAdapter(),
      }),
    },
    undefined,
    runtime,
  );
  const channel = Object.assign(new EventEmitter(), {
    sendText() {},
    sendBinary() {},
    close() {},
  });
  if (directAttach)
    composer.attach(
      "session-1",
      channel as never,
      {
        voiceSessionId: "session-1",
        resourceScopeId: "scope",
        routeProfileVersion: 1,
        leaseEpoch: 1,
        sessionVersion: 1,
      },
      scope,
    );
  const fork = async (channel: "inbound" | "outbound") =>
    callbacks!.fork({
      credential: "SIM-fork-authority",
      input: {
        ...scope,
        channel,
        startMs: 0,
        endMs: 1000,
        utcStart: start,
        utcEnd: endedAt,
        bytes: Uint8Array.from([1, 2, 3]),
      },
    });
  const close = () => callbacks!.closed("SIM-independent-close-authority");
  const adapter = new FirstPartyVoiceMediaRecordingAdapter(
    repository,
    {
      resolve: async () => ({
        sessionId: "session-1",
        callAuthorityToken: "SIM-finalize-authority",
      }),
    },
    {
      baseUrl: "https://worker.example.test",
      internalKey: "SIM-workload-key",
      fetchImpl: async () =>
        Response.json({
          status: "sealed",
          ...(await runtime.finalize("session-1", scope)),
        }),
    },
  );
  return {
    rows,
    repository,
    client,
    work,
    fork,
    close,
    adapter,
    store,
    journal,
    source,
    composer,
    createRuntime: () => new RecordingContinuation(store, journal, source),
    scope,
    checkpoint: async () => {
      const segments = rows
        .filter((e) => e.kind === "segment")
        .map(
          (e) =>
            e.payload as import("../../../apps/voice-media-worker/src/recording/sealed-recorder").RecorderSegment,
        );
      const ref = await new ImmutableRecordingManifests(store).seal({
        schemaVersion: 1,
        scope,
        startMs: 0,
        endMs: 1000,
        segments,
      });
      checkpointRefs = [ref];
      await callbacks!.checkpoint(ref);
    },
    restart: () => {
      runtime = new RecordingContinuation(store, journal, source);
    },
    puts: () => puts,
  };
}
it("F2/F3: actual composer fork -> sealed bytes/readback -> HTTP/controller/repository journal -> closure/work -> adapter -> immutable final manifest, with cold replay", async () => {
  const h = await harness();
  await h.fork("inbound");
  await h.fork("outbound");
  await h.checkpoint();
  await h.close();
  expect(h.rows.map((e) => e.kind)).toEqual([
    "segment",
    "segment",
    "checkpoint",
    "closure",
  ]);
  expect(h.work).toHaveLength(1);
  const first = await h.adapter.finalizeRecording({
    voiceSessionId: "session-1",
    scope,
  });
  expect(first.coverage).toMatchObject({
    startMs: 0,
    endMs: 1000,
    channels: ["inbound", "outbound"],
    closedEventId: "SIM-provider-close-1",
  });
  const count = h.puts();
  h.restart();
  expect(
    await h.adapter.finalizeRecording({ voiceSessionId: "session-1", scope }),
  ).toEqual(first);
  expect(h.puts()).toBe(count);
  await h.fork("inbound");
  expect(h.puts()).toBe(count); // same payload replay keeps the original object version
});

it.each([
  "normal",
  "lost_admission_ack",
  "lost_attachment_ack",
  "lost_finalized_ack",
  "pending_only",
  "refused_admission",
  "refused_attachment",
  "unknown_attachment_unresolved",
  "attachment_ack_barrier",
  "newer_pending",
  "newer_same_scope",
  "racing_finalization",
])(
  "F2 actual consumed admission/byte journal/fresh worker HTTP: %s",
  async (mode) => {
    const listen = vi
      .spyOn(NetServer.prototype, "listen")
      .mockImplementation(() => {
        throw new Error("VM restriction: never listen");
      });
    const h = await harness(false);
    const originalAppend = h.journal.append.bind(h.journal);
    const originalRead = h.journal.read.bind(h.journal);
    let lostAck = false;
    let rejected = false,
      unresolvedRead = false;
    h.journal.read = async (...args) => {
      if (unresolvedRead) throw new Error("SIM canonical readback unavailable");
      return originalRead(...args);
    };
    h.journal.append = async (session, event) => {
      if (
        !rejected &&
        ((mode === "refused_admission" && event.kind === "admission") ||
          (mode === "refused_attachment" && event.kind === "attachment"))
      ) {
        rejected = true;
        throw new Error("SIM journal rejected before commit");
      }
      const saved = await originalAppend(session, event);
      if (
        mode === "unknown_attachment_unresolved" &&
        event.kind === "attachment"
      ) {
        unresolvedRead = true;
        throw new Error("SIM committed attachment ACK lost");
      }
      if (!lostAck && mode === `lost_${event.kind}_ack`) {
        lostAck = true;
        throw new Error("SIM committed journal response lost");
      }
      return saved;
    };
    const authority = new FakeCallAuthority(); // Only the external issuer is SIM.
    const admission = authority.issue("session-1", {
      scope,
      allowedOperations: ["admit"],
    });
    const finalToken = authority.issue("session-1", {
      scope,
      epoch: admission.claims.epoch,
      allowedOperations: ["finalize"],
    }).token;
    const warm = new MediaWorkerServer({
      internalKey: "SIM-workload-key",
      callAuthorityVerifier: authority,
      sessionComposer: h.composer,
      recordingContinuation: h.createRuntime(),
      sessionBindingResolver: createVoiceSessionBindingResolver(h.client),
      wsTimeoutMs: 0,
    });
    let active = warm;
    let cold: MediaWorkerServer | undefined;
    class MemorySocket extends Duplex {
      readonly writes: Buffer[] = [];
      _read() {}
      _write(
        _chunk: Buffer,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
      ) {
        this.writes.push(Buffer.from(_chunk));
        callback();
      }
    }
    const socket = new MemorySocket();
    const post = async (
      server: MediaWorkerServer,
      url: string,
      body: unknown,
    ) =>
      new Promise<{ status: number; body: Record<string, unknown> }>(
        (resolve) => {
          const request = Object.assign(
            Readable.from([Buffer.from(JSON.stringify(body))]),
            {
              method: "POST",
              url,
              headers: { "x-drts-internal-key": "SIM-workload-key" },
            },
          );
          const response = {
            statusCode: 200,
            setHeader() {},
            end(raw: string) {
              resolve({ status: this.statusCode, body: JSON.parse(raw) });
            },
          };
          server.httpServer.emit("request", request, response);
        },
      );
    try {
      const admitted = await post(warm, "/sessions", {
        callAuthorityToken: admission.token,
      });
      if (mode === "refused_admission") {
        expect(admitted.status).toBe(409);
        expect(h.rows).toHaveLength(0);
        expect(warm.sessionCount).toBe(0);
        expect(h.composer.get("session-1")).toBeUndefined();
        const retry = authority.issue("session-1", {
          scope,
          epoch: admission.claims.epoch + 1,
          allowedOperations: ["admit"],
        });
        expect(
          (await post(warm, "/sessions", { callAuthorityToken: retry.token }))
            .status,
        ).toBe(201);
        return;
      }
      expect(admitted.status, JSON.stringify(admitted.body)).toBe(201);
      expect(h.rows.map((e) => e.kind)).toEqual(["admission"]);
      if (mode === "pending_only") {
        const result = await post(warm, "/recording/finalize", {
          sessionId: "session-1",
          callAuthorityToken: finalToken,
          attachment: { ...admission.claims },
          scope,
        });
        expect(result.status).toBe(403);
        expect(h.rows.map((e) => e.kind)).toEqual(["admission"]);
        expect(h.composer.get("session-1")).toBeUndefined();
        expect(h.puts()).toBe(0);
        return;
      }
      let releaseAttachment: (() => void) | undefined;
      let startedAttachment: (() => void) | undefined;
      const attachmentStarted = new Promise<void>((resolve) => {
        startedAttachment = resolve;
      });
      if (mode === "attachment_ack_barrier") {
        const append = h.journal.append.bind(h.journal);
        h.journal.append = async (session, event) => {
          if (event.kind === "attachment") {
            startedAttachment!();
            await new Promise<void>((resolve) => {
              releaseAttachment = resolve;
            });
          }
          return append(session, event);
        };
      }
      const connected = once(warm, "session.connected");
      const refused =
        mode === "refused_attachment" ||
        mode === "unknown_attachment_unresolved"
          ? once(socket, "close")
          : undefined;
      warm.httpServer.emit(
        "upgrade",
        {
          method: "GET",
          url: `/ws?sessionId=session-1&grant=${(admitted.body.grant as { token: string }).token}`,
          headers: {
            "x-drts-internal-key": "SIM-workload-key",
            "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
          },
        },
        socket,
        Buffer.alloc(0),
      );
      if (refused) {
        await refused;
        expect(Buffer.concat(socket.writes).toString()).toContain(
          "403 Forbidden",
        );
        expect(Buffer.concat(socket.writes).toString()).not.toContain(
          "101 Switching Protocols",
        );
        expect(h.rows.map((e) => e.kind)).toEqual(
          mode === "unknown_attachment_unresolved"
            ? ["admission", "attachment"]
            : ["admission"],
        );
        expect(h.composer.get("session-1")).toBeUndefined();
        expect(h.puts()).toBe(0);
        expect(
          (
            await post(warm, "/recording/finalize", {
              sessionId: "session-1",
              callAuthorityToken: finalToken,
            })
          ).status,
        ).toBe(403);
        if (mode === "unknown_attachment_unresolved") {
          unresolvedRead = false;
          expect(
            (
              await post(warm, "/recording/finalize", {
                sessionId: "session-1",
                callAuthorityToken: finalToken,
              })
            ).status,
          ).toBe(400); // exact attachment later recovered; no closure/bytes may be invented
          expect(h.rows.some((e) => e.kind === "finalized")).toBe(false);
          expect(h.puts()).toBe(0);
        } else {
          const retry = authority.issue("session-1", {
            scope,
            epoch: admission.claims.epoch + 1,
            allowedOperations: ["admit"],
          });
          expect(
            (await post(warm, "/sessions", { callAuthorityToken: retry.token }))
              .status,
          ).toBe(201);
          expect(
            (
              await post(warm, "/recording/finalize", {
                sessionId: "session-1",
                callAuthorityToken: finalToken,
              })
            ).status,
          ).toBe(403);
        }
        return;
      }
      if (mode === "attachment_ack_barrier") {
        await attachmentStarted;
        expect(socket.writes).toHaveLength(0);
        expect(h.composer.get("session-1")).toBeUndefined();
        expect(h.rows.map((e) => e.kind)).toEqual(["admission"]);
        expect(
          (
            await post(warm, "/recording/finalize", {
              sessionId: "session-1",
              callAuthorityToken: finalToken,
            })
          ).status,
        ).toBe(403);
        releaseAttachment!();
      }
      await connected;
      expect(h.rows.map((e) => e.kind)).toEqual(["admission", "attachment"]);
      expect(h.rows[1]!.payload).toEqual(h.rows[0]!.payload);
      await h.fork("inbound");
      await h.fork("outbound");
      await h.checkpoint();
      await h.close();
      const adapter = new FirstPartyVoiceMediaRecordingAdapter(
        h.repository,
        {
          resolve: async () => ({
            sessionId: "session-1",
            callAuthorityToken: finalToken,
          }),
        },
        {
          baseUrl: "https://worker.example.test",
          internalKey: "SIM-workload-key",
          fetchImpl: async (raw, init) => {
            const response = await post(
              active,
              new URL(String(raw)).pathname,
              JSON.parse(String(init?.body)),
            );
            return Response.json(response.body, { status: response.status });
          },
        },
      );
      if (mode === "racing_finalization") {
        const put = h.store.putImmutable.bind(h.store);
        let release: (() => void) | undefined,
          entered: (() => void) | undefined;
        const putting = new Promise<void>((resolve) => {
          entered = resolve;
        });
        h.store.putImmutable = async (...args) => {
          entered!();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return put(...args);
        };
        const finishing = adapter.finalizeRecording({
          voiceSessionId: "session-1",
          scope,
        });
        await putting;
        warm.closeSession("session-1");
        const next = authority.issue("session-1", {
          scope,
          epoch: admission.claims.epoch + 1,
          allowedOperations: ["admit"],
        });
        expect(
          (await post(warm, "/sessions", { callAuthorityToken: next.token }))
            .status,
        ).toBe(201);
        release!();
        await expect(finishing).rejects.toThrow(
          "voice_recording_worker_unavailable",
        );
        expect(h.rows.some((e) => e.kind === "finalized")).toBe(false);
        expect(h.rows.filter((e) => e.kind === "admission")).toHaveLength(2);
        return;
      }
      const first = await adapter.finalizeRecording({
        voiceSessionId: "session-1",
        scope,
      });
      const objectCount = h.puts();
      warm.closeSession("session-1");
      socket.destroy();
      if (mode === "newer_pending" || mode === "newer_same_scope") {
        const prior = [...h.rows];
        const next = authority.issue("session-1", {
          scope:
            mode === "newer_pending"
              ? { ...scope, recordingId: "SIM-next-recording" }
              : scope,
          epoch: admission.claims.epoch + 1,
          allowedOperations: ["admit"],
        });
        expect(
          (await post(warm, "/sessions", { callAuthorityToken: next.token }))
            .status,
        ).toBe(201);
        await expect(
          h.repository.appendRecordingContinuation(
            "session-1",
            prior.find((e) => e.kind === "attachment"),
          ),
        ).rejects.toThrow("current_admission");
        await expect(
          h.repository.appendRecordingContinuation(
            "session-1",
            prior.find((e) => e.kind === "admission"),
          ),
        ).rejects.toThrow("stale_or_conflicting");
        const read = h.journal.read.bind(h.journal);
        h.journal.read = async (_session, requested) =>
          prior.filter(
            (e) =>
              !requested ||
              JSON.stringify(e.scope) === JSON.stringify(requested),
          );
        expect(
          (
            await post(warm, "/recording/finalize", {
              sessionId: "session-1",
              callAuthorityToken: finalToken,
            })
          ).status,
        ).toBe(403); // newer RAM pending survives stale journal read
        h.journal.read = read;
        cold = new MediaWorkerServer({
          internalKey: "SIM-workload-key",
          callAuthorityVerifier: authority,
          recordingContinuation: h.createRuntime(),
        });
        expect(
          (
            await post(cold, "/recording/finalize", {
              sessionId: "session-1",
              callAuthorityToken: finalToken,
            })
          ).status,
        ).toBe(403);
        expect(h.puts()).toBe(objectCount);
        expect(h.work).toHaveLength(1);
        return;
      }
      await warm.stop();
      cold = new MediaWorkerServer({
        internalKey: "SIM-workload-key",
        callAuthorityVerifier: authority,
        recordingContinuation: h.createRuntime(),
      });
      active = cold;
      if (mode === "normal") {
        const foreign = [
          authority.issue("session-1", {
            scope,
            epoch: admission.claims.epoch + 1,
            allowedOperations: ["finalize"],
          }).token,
          authority.issue("session-1", {
            scope,
            epoch: admission.claims.epoch,
            principalId: "SIM-foreign-principal",
            allowedOperations: ["finalize"],
          }).token,
          authority.issue("session-1", {
            epoch: admission.claims.epoch,
            allowedOperations: ["finalize"],
          }).token,
          authority.issue("session-1", {
            scope,
            epoch: admission.claims.epoch,
            allowedOperations: ["admit"],
          }).token,
          ...(["brandId", "callId", "recordingId", "legId"] as const).map(
            (key) =>
              authority.issue("session-1", {
                scope: { ...scope, [key]: "SIM-foreign" },
                epoch: admission.claims.epoch,
                allowedOperations: ["finalize"],
              }).token,
          ),
        ];
        const revoked = authority.issue("session-1", {
          scope,
          epoch: admission.claims.epoch,
          allowedOperations: ["finalize"],
        }).token;
        authority.revoke(revoked);
        foreign.push(revoked);
        for (const token of foreign)
          expect(
            (
              await post(cold, "/recording/finalize", {
                sessionId: "session-1",
                callAuthorityToken: token,
              })
            ).status,
          ).toBe(403);
        expect(h.puts()).toBe(objectCount);
        const forgedBody = await post(cold, "/recording/finalize", {
          sessionId: "session-1",
          callAuthorityToken: finalToken,
          scope: { ...scope, brandId: "forged" },
          admission: { principalId: "forged", epoch: 999 },
        });
        expect(forgedBody.status).toBe(200);
        expect(forgedBody.body.manifestRef).toEqual(first.manifestRef);
      }
      await expect(
        adapter.finalizeRecording({ voiceSessionId: "session-1", scope }),
      ).resolves.toEqual(first);
      expect(h.puts()).toBe(objectCount);
      expect(h.work).toHaveLength(1);
      if (mode.startsWith("lost_")) expect(lostAck).toBe(true);
      expect(warm.httpServer.address()).toBeNull();
      expect(cold.httpServer.address()).toBeNull();
    } finally {
      warm.closeSession("session-1");
      socket.destroy();
      await warm.stop();
      await cold?.stop();
      listen.mockRestore();
    }
  },
);
it("F2: missing outbound coverage cannot journal a closure or enqueue finalization; changed same-key payload is rejected", async () => {
  const h = await harness();
  await h.fork("inbound");
  await expect(h.close()).rejects.toThrow(/outbound/);
  expect(h.work).toHaveLength(0);
  const original = h.rows[0]!;
  await expect(
    h.journal.append("session-1", {
      ...original,
      payload: { ...original.payload, checksum: "a".repeat(64) },
    } as VoiceRecordingContinuationEvent),
  ).rejects.toThrow(/payload_conflict/);
  expect(h.rows).toHaveLength(1);
});

it("F2: recorder closure joins the original close work with compatible payload and rejects a changed recording identity", async () => {
  const h = await harness();
  h.work.push({
    voice_session_id: "session-1",
    dedupe_key: "finalize_recording:ai:session-1",
    work_type: "finalize_recording",
    payload_ref: JSON.stringify({
      voiceSessionId: "session-1",
      brandId: scope.brandId,
      callId: scope.callId,
      recordingId: null,
      closedAt: new Date().toISOString(),
    }),
  });
  await h.fork("inbound");
  await h.fork("outbound");
  await h.checkpoint();
  await h.close();
  expect(h.work).toHaveLength(1);
  expect(h.work[0]!.dedupe_key).toBe("finalize_recording:ai:session-1");
  const closure = h.rows.find((e) => e.kind === "closure")!;
  h.work[0]!.payload_ref = JSON.stringify({
    voiceSessionId: "session-1",
    ...scope,
  });
  await expect(
    h.journal.append("session-1", {
      ...closure,
      scope: { ...scope, recordingId: "other-recording" },
    }),
  ).rejects.toThrow(/work_payload_conflict|identity/);
});
