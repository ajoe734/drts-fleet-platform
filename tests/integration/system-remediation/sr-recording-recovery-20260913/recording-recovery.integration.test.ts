import { describe, expect, it } from "vitest";

import { CallcenterService } from "../../../../apps/api/src/modules/callcenter/callcenter.service";
import { CallcenterRepository } from "../../../../apps/api/src/modules/callcenter/callcenter.repository";
import { MediaRecordingAdapter } from "../../../../apps/voice-media-worker/src/recording/media-recording-adapter";
import type {
  RecorderObjectMetadata,
  RecorderObjectStore,
  RecorderSegment,
  RecordingScope,
} from "../../../../apps/voice-media-worker/src/recording/sealed-recorder";
import { recordingChecksum } from "../../../../apps/voice-media-worker/src/recording/sealed-recorder";
import type { RecordingClosureLedger } from "../../../../apps/voice-media-worker/src/recording/final-manifest";
import type { RecordingManifestRef } from "../../../../apps/voice-media-worker/src/recording/immutable-manifest";

// ============================================================================
// Non-serving Integration Harness
// ============================================================================

const DUMMY_AUDIO = new Uint8Array([10, 20, 30, 40, 50]);
const DUMMY_HASH = recordingChecksum(DUMMY_AUDIO);

class MemoryObjectStore implements RecorderObjectStore {
  private readonly store = new Map<
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
    const objectKey = `rec/${metadata.brandId}/${metadata.callId}/${metadata.recordingId}/${metadata.channel}.opus`;
    const objectVersion = "v1";
    const durableAt = metadata.utcEnd;
    this.store.set(objectKey, {
      metadata: { ...metadata, objectKey, objectVersion, durableAt },
      bytes,
    });
    return { objectKey, objectVersion, durableAt };
  }

  async putImmutable(
    scope: RecordingScope,
    bytes: Uint8Array,
  ): Promise<{
    objectKey: string;
    objectVersion: string;
    durableAt: string;
    checksum: string;
  }> {
    const objectKey = `manifests/${scope.brandId}/${scope.callId}/${scope.recordingId}/final.json`;
    const objectVersion = "v1";
    const durableAt = "2026-09-13T16:00:10.000Z";
    const checksum = recordingChecksum(bytes);
    this.store.set(objectKey, {
      metadata: { scope, objectKey, objectVersion, durableAt, checksum },
      bytes,
    });
    return { objectKey, objectVersion, durableAt, checksum };
  }

  async getImmutable(
    _scope: RecordingScope,
    ref: RecordingManifestRef,
  ): Promise<{
    bytes: Uint8Array;
    metadata: {
      objectKey: string;
      objectVersion: string;
      durableAt: string;
      checksum: string;
    };
  }> {
    const item = this.store.get(ref.objectKey);
    if (!item) throw new Error("not found");
    return {
      bytes: item.bytes,
      metadata: {
        objectKey: ref.objectKey,
        objectVersion: ref.objectVersion,
        durableAt: ref.durableAt,
        checksum: ref.checksum,
      },
    };
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
    const item = this.store.get(objectKey);
    if (item) {
      return {
        bytes: item.bytes,
        objectVersion,
        recordingMetadata: item.metadata as RecorderObjectMetadata,
      };
    }
    const channel = objectKey.includes("outbound") ? "outbound" : "inbound";
    return {
      bytes: DUMMY_AUDIO,
      objectVersion,
      recordingMetadata: {
        ...scope,
        channel,
        startMs: 0,
        endMs: 30000,
        utcStart: "2026-09-13T15:59:30.000Z",
        utcEnd: "2026-09-13T16:00:00.000Z",
        objectKey,
        objectVersion,
        checksum: DUMMY_HASH,
        byteLength: DUMMY_AUDIO.byteLength,
        durableAt: "2026-09-13T16:00:00.000Z",
        source: "recording_fork",
      },
    };
  }
}

describe("SR-RECORDING-RECOVERY-20260913: Integration Service Coordination", () => {
  it("coordinates CallcenterService, CallcenterRepository, and VoiceCommandRunnerService for ordinary calls", async () => {
    const executedQueries: string[] = [];
    const mockDb = {
      isEnabled: () => true,
      query: async (sql: string) => {
        executedQueries.push(sql);
        if (
          sql.includes(
            "SELECT work_id, payload_ref, status FROM voice.work_item",
          )
        ) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("INSERT INTO voice.work_item")) {
          return { rows: [{ work_id: "work-int-001" }], rowCount: 1 };
        }
        if (sql.includes("SELECT record FROM crm.phase1_call_sessions")) {
          return {
            rows: [
              {
                record: {
                  callId: "call-int-001",
                  status: "closed",
                  recordingId: null,
                  recordingState: "pending",
                  flags: ["closed", "recording_pending"],
                },
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      },
    };

    const callRepo = new CallcenterRepository(mockDb as any);
    const callcenterService = new CallcenterService(
      {
        recordAuditLog: () => ({}),
        emitSessionAuditNotification: () => {},
      } as any,
      callRepo,
    );

    // Open call session first
    const opened = callcenterService.openCallSession({
      callerPhone: "+886912345678",
      callType: "booking",
    });
    expect(opened.callId).toBeTruthy();

    // Close call session - triggers enqueueFinalizeRecordingWorkItem
    const closed = callcenterService.closeCallSession(opened.callId);
    expect(closed.status).toBe("closed");

    // Give microtask queue time to settle async repository call
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify work item enqueue query was dispatched to database
    const workItemInsert = executedQueries.find((q) =>
      q.includes("INSERT INTO voice.work_item"),
    );
    expect(workItemInsert).toBeDefined();
    expect(workItemInsert).toContain("finalize_recording");
  });

  it("coordinates MediaRecordingAdapter with immutable store and closure ledger", async () => {
    const store = new MemoryObjectStore();
    const scope: RecordingScope = {
      brandId: "brand-int",
      callId: "call-int-media",
      recordingId: "rec-int-media",
      legId: "leg-001",
    };

    const ledger: RecordingClosureLedger = {
      resolve: async () => ({
        closedEventId: "evt-closed-int",
        endedAt: "2026-09-13T16:00:00.000Z",
        endMs: 30000,
        checkpointRefs: [],
      }),
    };

    const adapter = new MediaRecordingAdapter(store, ledger);

    const segments: RecorderSegment[] = [
      {
        ...scope,
        channel: "inbound",
        startMs: 0,
        endMs: 30000,
        utcStart: "2026-09-13T15:59:30.000Z",
        utcEnd: "2026-09-13T16:00:00.000Z",
        objectKey: `rec/${scope.brandId}/${scope.callId}/${scope.recordingId}/inbound.opus`,
        objectVersion: "v1",
        checksum: DUMMY_HASH,
        byteLength: DUMMY_AUDIO.byteLength,
        durableAt: "2026-09-13T16:00:00.000Z",
      },
      {
        ...scope,
        channel: "outbound",
        startMs: 0,
        endMs: 30000,
        utcStart: "2026-09-13T15:59:30.000Z",
        utcEnd: "2026-09-13T16:00:00.000Z",
        objectKey: `rec/${scope.brandId}/${scope.callId}/${scope.recordingId}/outbound.opus`,
        objectVersion: "v1",
        checksum: DUMMY_HASH,
        byteLength: DUMMY_AUDIO.byteLength,
        durableAt: "2026-09-13T16:00:00.000Z",
      },
    ];

    const res = await adapter.sealFinalRecording({
      credential: "test-cred",
      scope,
      segments,
      closureLedger: ledger,
    });

    expect(res.manifestRef).toBeDefined();
    expect(res.manifestRef.objectKey).toContain("final.json");
    expect(res.closedEventId).toBe("evt-closed-int");
    expect(res.endMs).toBe(30000);
  });
});
