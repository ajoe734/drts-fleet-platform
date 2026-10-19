import { EventEmitter } from "node:events";
import { expect, it } from "vitest";
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
import { VoiceBookingRepository } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { VoiceBookingController } from "../../../apps/api/src/modules/voice-booking/voice-booking.controller";
import { FirstPartyVoiceMediaRecordingAdapter } from "../../../apps/api/src/modules/voice-booking/voice-media-recording.adapter";
import type { VoiceRecordingContinuationEvent } from "@drts/contracts";

const scope = {
  brandId: "SIM-brand",
  callId: "call-1",
  recordingId: "recording-1",
  legId: "leg-1",
};
async function harness() {
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
    undefined,
    repository,
  );
  const client = new VoiceApiClient(
    {
      baseUrl: "https://firstparty.example.test",
      fetchImpl: async (raw, init) => {
        const session = String(raw).split("/sessions/")[1]!.split("/")[0]!;
        const result =
          init?.method === "POST"
            ? await controller.recordRecordingEvent(
                session,
                JSON.parse(String(init.body)),
              )
            : await controller.getRecordingEvents(session);
        return Response.json(result);
      },
    },
    { getToken: async () => "SIM-workload-identity" },
  );
  const journal: RecordingContinuationJournal = {
    append: async (session, event) =>
      (await client.appendRecordingEvent(session, event)).event,
    read: async (session, binding) =>
      (await client.getRecordingEvents(session)).events.filter(
        (event) => JSON.stringify(event.scope) === JSON.stringify(binding),
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
    work,
    fork,
    close,
    adapter,
    store,
    journal,
    source,
    composer,
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
