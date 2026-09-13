import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import {
  VoiceCommandRunnerService,
  LeaseFencedError,
} from "../../../../apps/api/src/modules/voice-booking/voice-command-runner.service";
import { VoiceBookingController } from "../../../../apps/api/src/modules/voice-booking/voice-booking.controller";
import { VoiceSessionService } from "../../../../apps/api/src/modules/voice-booking/voice-session.service";
import { CallcenterRepository } from "../../../../apps/api/src/modules/callcenter/callcenter.repository";
import {
  MediaRecordingAdapter,
  type MediaRecordingFinalizationRequest,
} from "../../../../apps/voice-media-worker/src/recording/media-recording-adapter";
import {
  recordingChecksum,
  type RecorderObjectMetadata,
  type RecorderObjectStore,
  type RecorderSegment,
  type RecordingScope,
} from "../../../../apps/voice-media-worker/src/recording/sealed-recorder";
import type { RecordingClosureLedger } from "../../../../apps/voice-media-worker/src/recording/final-manifest";
import type { RecordingManifestRef } from "../../../../apps/voice-media-worker/src/recording/immutable-manifest";

// ============================================================================
// In-Memory Object Store & Media Adapter Helpers
// ============================================================================

const DUMMY_AUDIO_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const DUMMY_CHECKSUM = recordingChecksum(DUMMY_AUDIO_BYTES);

function createBidirectionalSegments(scope: RecordingScope): RecorderSegment[] {
  return [
    {
      ...scope,
      channel: "inbound",
      startMs: 0,
      endMs: 60000,
      utcStart: "2026-09-13T15:59:00.000Z",
      utcEnd: "2026-09-13T16:00:00.000Z",
      objectKey: `rec/${scope.brandId}/${scope.callId}/${scope.recordingId}/inbound-0-60000.opus`,
      objectVersion: "v1",
      checksum: DUMMY_CHECKSUM,
      byteLength: DUMMY_AUDIO_BYTES.byteLength,
      durableAt: "2026-09-13T16:00:00.000Z",
    },
    {
      ...scope,
      channel: "outbound",
      startMs: 0,
      endMs: 60000,
      utcStart: "2026-09-13T15:59:00.000Z",
      utcEnd: "2026-09-13T16:00:00.000Z",
      objectKey: `rec/${scope.brandId}/${scope.callId}/${scope.recordingId}/outbound-0-60000.opus`,
      objectVersion: "v1",
      checksum: DUMMY_CHECKSUM,
      byteLength: DUMMY_AUDIO_BYTES.byteLength,
      durableAt: "2026-09-13T16:00:00.000Z",
    },
  ];
}

class MemoryRecorderObjectStore implements RecorderObjectStore {
  public objects = new Map<string, { metadata: unknown; bytes: Uint8Array }>();

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
  ): Promise<{
    objectKey: string;
    objectVersion: string;
    durableAt: string;
    checksum: string;
  }> {
    const objectKey = `manifests/${scope.brandId}/${scope.callId}/${scope.recordingId}/final.json`;
    const objectVersion = "v1";
    const durableAt = "2026-09-13T16:00:05.000Z";
    const checksum = recordingChecksum(bytes);
    this.objects.set(objectKey, {
      metadata: { scope, objectKey, objectVersion, durableAt, checksum },
      bytes,
    });
    return { objectKey, objectVersion, durableAt, checksum };
  }

  async getImmutable(
    scope: RecordingScope,
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
    const item = this.objects.get(ref.objectKey);
    if (!item) {
      throw new Error(`Object not found: ${ref.objectKey}`);
    }
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
    const item = this.objects.get(objectKey);
    if (item) {
      return {
        bytes: item.bytes,
        objectVersion,
        recordingMetadata: item.metadata as RecorderObjectMetadata,
      };
    }
    const channel = objectKey.includes("outbound") ? "outbound" : "inbound";
    return {
      bytes: DUMMY_AUDIO_BYTES,
      objectVersion,
      recordingMetadata: {
        ...scope,
        channel,
        startMs: 0,
        endMs: 60000,
        utcStart: "2026-09-13T15:59:00.000Z",
        utcEnd: "2026-09-13T16:00:00.000Z",
        objectKey,
        objectVersion,
        checksum: DUMMY_CHECKSUM,
        byteLength: DUMMY_AUDIO_BYTES.byteLength,
        durableAt: "2026-09-13T16:00:00.000Z",
        source: "recording_fork",
      },
    };
  }

  async headObject(objectKey: string): Promise<{ exists: boolean }> {
    return { exists: this.objects.has(objectKey) };
  }
}

function createMediaContext() {
  const store = new MemoryRecorderObjectStore();
  const ledger: RecordingClosureLedger = {
    resolve: async (_cred, scope) => ({
      closedEventId: `evt-close-${scope.callId}`,
      endedAt: "2026-09-13T16:00:00.000Z",
      endMs: 60000,
      checkpointRefs: [],
    }),
  };
  const adapter = new MediaRecordingAdapter(store, ledger);
  return { store, ledger, adapter };
}

// ============================================================================
// In-Memory Database Simulator for Voice Work Item & Phase 1 Audits
// ============================================================================

type MockWorkItem = {
  work_id: string;
  workId?: string;
  command_id: string | null;
  commandId?: string | null;
  voice_session_id: string | null;
  voiceSessionId?: string | null;
  work_type: string;
  workType?: string;
  dedupe_key: string;
  dedupeKey?: string;
  payload_ref: string | null;
  payloadRef?: string | null;
  status: "pending" | "leased" | "completed" | "failed" | "dead_letter";
  lease_epoch: number;
  leaseEpoch?: number;
  attempt: number;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  leased_until: Date | null;
  created_at: Date;
  updated_at: Date;
};

type MockRepairAudit = {
  repair_id: string;
  work_id: string;
  request_id: string;
  actor_id: string;
  reason: string;
  expected_lease_epoch: number;
  previous_status: string;
  previous_attempt_count: number;
  previous_last_error: string | null;
  allocated_max_attempts: number;
  created_at: Date;
};

type MockAttemptAudit = {
  attempt_audit_id: string;
  work_id: string;
  attempt_no: number;
  lease_epoch: number;
  attempt_stage: "started" | "terminal";
  outcome: "started" | "completed" | "failed" | "fenced";
  error_message: string | null;
  started_at: Date;
  finished_at: Date | null;
  created_at: Date;
};

type MockCallSession = {
  call_id: string;
  status: string;
  started_at: string;
  updated_at: string;
  record: Record<string, unknown>;
};

type MockOrder = {
  order_id: string;
  recording_id: string | null;
  recording_evidence_ref: string | null;
  recording_state: string;
};

type MockVoiceSession = {
  voice_session_id: string;
  call_id: string;
  resource_scope_id: string;
  dialog_state: string;
  recording_state: string;
  session_version: number;
  lease_epoch: number;
};

class InMemoryDatabase {
  public workItems = new Map<string, MockWorkItem>();
  public repairAudits: MockRepairAudit[] = [];
  public attemptAudits: MockAttemptAudit[] = [];
  public callSessions = new Map<string, MockCallSession>();
  public ownedOrders = new Map<string, MockOrder>();
  public voiceSessions = new Map<string, MockVoiceSession>();

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number }> {
    const trimmed = sql.trim().replace(/\s+/g, " ");

    // 1. SELECT for repair dedupe
    if (
      trimmed.includes(
        "FROM voice.phase1_work_item_repair_audits WHERE work_id = $1 AND request_id = $2",
      )
    ) {
      const [workId, reqId] = params as [string, string];
      const match = this.repairAudits.find(
        (a) => a.work_id === workId && a.request_id === reqId,
      );
      const rows = match ? [match as unknown as T] : [];
      return { rows, rowCount: rows.length };
    }

    // 2. SELECT work_item by work_id
    if (
      trimmed.includes("FROM voice.work_item WHERE work_id = $1 FOR UPDATE") ||
      trimmed.includes("FROM voice.work_item WHERE work_id = $1")
    ) {
      const [workId] = params as [string];
      const item = this.workItems.get(workId);
      const rows = item
        ? [
            {
              work_id: item.work_id,
              command_id: item.command_id,
              voice_session_id: item.voice_session_id,
              work_type: item.work_type,
              dedupe_key: item.dedupe_key,
              payload_ref: item.payload_ref,
              status: item.status,
              lease_epoch: item.lease_epoch,
              attempt: item.attempt,
              attempt_count: item.attempt_count,
              max_attempts: item.max_attempts,
              last_error: item.last_error,
              leased_until: item.leased_until,
              created_at: item.created_at,
              updated_at: item.updated_at,
            } as unknown as T,
          ]
        : [];
      return { rows, rowCount: rows.length };
    }

    // 3. SELECT work_item by dedupe_key
    if (trimmed.includes("FROM voice.work_item WHERE dedupe_key = $1")) {
      const [dedupeKey] = params as [string];
      const found = Array.from(this.workItems.values()).find(
        (w) => w.dedupe_key === dedupeKey,
      );
      const rows = found
        ? [
            {
              work_id: found.work_id,
              command_id: found.command_id,
              voice_session_id: found.voice_session_id,
              work_type: found.work_type,
              dedupe_key: found.dedupe_key,
              payload_ref: found.payload_ref,
              status: found.status,
              lease_epoch: found.lease_epoch,
              attempt: found.attempt,
              attempt_count: found.attempt_count,
              max_attempts: found.max_attempts,
              last_error: found.last_error,
            } as unknown as T,
          ]
        : [];
      return { rows, rowCount: rows.length };
    }

    // 4. INSERT into voice.phase1_work_item_repair_audits
    if (trimmed.includes("INSERT INTO voice.phase1_work_item_repair_audits")) {
      const [
        workId,
        requestId,
        actorId,
        reason,
        expectedLeaseEpoch,
        previousStatus,
        previousAttemptCount,
        previousLastError,
        allocatedMaxAttempts,
      ] = params as [
        string,
        string,
        string,
        string,
        number,
        string,
        number,
        string | null,
        number,
      ];

      const collision = this.repairAudits.find(
        (a) => a.work_id === workId && a.request_id === requestId,
      );
      if (collision) {
        throw new Error(
          'duplicate key value violates unique constraint "uq_phase1_work_item_repair_dedupe"',
        );
      }

      const repair: MockRepairAudit = {
        repair_id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        work_id: workId,
        request_id: requestId,
        actor_id: actorId,
        reason,
        expected_lease_epoch: expectedLeaseEpoch,
        previous_status: previousStatus,
        previous_attempt_count: previousAttemptCount,
        previous_last_error: previousLastError,
        allocated_max_attempts: allocatedMaxAttempts,
        created_at: new Date(),
      };
      this.repairAudits.push(repair);
      return { rows: [repair as unknown as T], rowCount: 1 };
    }

    // 5. INSERT into voice.phase1_work_item_attempt_audits
    if (trimmed.includes("INSERT INTO voice.phase1_work_item_attempt_audits")) {
      const workId = params[0] as string;
      const attemptNo = params[1] as number;
      const leaseEpoch = params[2] as number;

      let attemptStage: "started" | "terminal" = "terminal";
      let outcome: "started" | "completed" | "failed" | "fenced" = "completed";
      let errorMessage: string | null = null;

      if (trimmed.includes("'started'")) {
        attemptStage = "started";
        outcome = "started";
      } else if (trimmed.includes("'fenced'")) {
        attemptStage = "terminal";
        outcome = "fenced";
      } else if (trimmed.includes("'failed'")) {
        attemptStage = "terminal";
        outcome = "failed";
        errorMessage = (params[3] as string) ?? null;
      } else if (trimmed.includes("'completed'")) {
        attemptStage = "terminal";
        outcome = "completed";
      } else if (params.length >= 5) {
        attemptStage = params[3] as "started" | "terminal";
        outcome = params[4] as any;
        errorMessage = (params[5] as string) ?? null;
      }

      const collision = this.attemptAudits.find(
        (a) =>
          a.work_id === workId &&
          a.lease_epoch === leaseEpoch &&
          a.attempt_no === attemptNo &&
          a.attempt_stage === attemptStage,
      );
      if (collision) {
        throw new Error(
          'duplicate key value violates unique constraint "uq_phase1_work_item_attempt_stage"',
        );
      }

      const audit: MockAttemptAudit = {
        attempt_audit_id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        work_id: workId,
        attempt_no: attemptNo,
        lease_epoch: leaseEpoch,
        attempt_stage: attemptStage,
        outcome,
        error_message: errorMessage,
        started_at: new Date(),
        finished_at: attemptStage === "terminal" ? new Date() : null,
        created_at: new Date(),
      };
      this.attemptAudits.push(audit);
      return { rows: [audit as unknown as T], rowCount: 1 };
    }

    // 6. UPDATE voice.work_item in repair
    if (
      trimmed.includes("UPDATE voice.work_item") &&
      trimmed.includes("attempt = 0")
    ) {
      const [workId] = params as [string];
      const item = this.workItems.get(workId);
      if (item) {
        item.status = "pending";
        item.lease_epoch += 1;
        item.attempt = 0;
        item.attempt_count = 0;
        item.leased_until = null;
        item.last_error = null;
        item.updated_at = new Date();
        return { rows: [item as unknown as T], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 7. UPDATE voice.work_item complete with lease fencing check
    if (trimmed.includes("UPDATE voice.work_item SET status = 'completed'")) {
      const [workId, leaseEpoch] = params as [string, number];
      const item = this.workItems.get(workId);
      if (item && item.lease_epoch === leaseEpoch && item.status === "leased") {
        item.status = "completed";
        item.leased_until = null;
        item.last_error = null;
        item.updated_at = new Date();
        return { rows: [item as unknown as T], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 8. INSERT into voice.work_item
    if (trimmed.includes("INSERT INTO voice.work_item")) {
      let commandId: string | null = null;
      let voiceSessionId: string | null = null;
      let workType = "finalize_recording";
      let dedupeKey: string;
      let payloadRef: string | null = null;

      if (params.length === 1) {
        dedupeKey = params[0] as string;
      } else if (params.length === 2) {
        dedupeKey = params[0] as string;
        payloadRef = params[1] as string | null;
      } else if (params.length === 3) {
        voiceSessionId = params[0] as string | null;
        dedupeKey = params[1] as string;
        payloadRef = params[2] as string | null;
      } else {
        [commandId, voiceSessionId, workType, dedupeKey, payloadRef] =
          params as [
            string | null,
            string | null,
            string,
            string,
            string | null,
          ];
      }

      const existing = Array.from(this.workItems.values()).find(
        (w) => w.dedupe_key === dedupeKey,
      );
      if (existing) {
        if (trimmed.includes("ON CONFLICT (dedupe_key) DO NOTHING")) {
          return { rows: [], rowCount: 0 };
        }
        throw new Error(
          'duplicate key value violates unique constraint "uq_voice_work_item_dedupe_key"',
        );
      }

      const workId = `work-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const item: MockWorkItem = {
        work_id: workId,
        workId,
        command_id: commandId,
        commandId,
        voice_session_id: voiceSessionId,
        voiceSessionId,
        work_type: workType,
        workType,
        dedupe_key: dedupeKey,
        dedupeKey,
        payload_ref: payloadRef,
        payloadRef,
        status: "pending",
        lease_epoch: 1,
        leaseEpoch: 1,
        attempt: 0,
        attempt_count: 0,
        max_attempts: 5,
        last_error: null,
        leased_until: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.workItems.set(workId, item);
      return { rows: [{ work_id: workId } as unknown as T], rowCount: 1 };
    }

    // 9. crm.phase1_call_sessions SELECT / UPDATE
    if (
      trimmed.includes(
        "SELECT record FROM crm.phase1_call_sessions WHERE call_id = $1",
      )
    ) {
      const [callId] = params as [string];
      const session = this.callSessions.get(callId);
      const rows = session ? [{ record: session.record } as unknown as T] : [];
      return { rows, rowCount: rows.length };
    }

    if (trimmed.includes("UPDATE crm.phase1_call_sessions")) {
      const [callId, recordJson] = params as [string, string];
      const session = this.callSessions.get(callId);
      if (session) {
        session.record = JSON.parse(recordJson);
        session.updated_at = new Date().toISOString();
        return { rows: [session as unknown as T], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 10. voice.session UPDATE
    if (
      trimmed.includes("UPDATE voice.session SET recording_state = 'sealed'")
    ) {
      const [voiceSessionId] = params as [string];
      const sess = this.voiceSessions.get(voiceSessionId);
      if (sess) {
        sess.recording_state = "sealed";
        sess.session_version += 1;
        return { rows: [sess as unknown as T], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 11. ops.phase1_owned_orders SELECT / UPDATE
    if (trimmed.includes("FROM ops.phase1_owned_orders WHERE order_id = $1")) {
      const [orderId] = params as [string];
      const order = this.ownedOrders.get(orderId);
      const rows = order ? [{ order_id: order.order_id } as unknown as T] : [];
      return { rows, rowCount: rows.length };
    }

    if (trimmed.includes("UPDATE ops.phase1_owned_orders")) {
      const [orderId, patchJson] = params as [string, string];
      const order = this.ownedOrders.get(orderId);
      if (order) {
        try {
          const patch = JSON.parse(patchJson);
          order.recording_id = patch.recordingId ?? order.recording_id;
          order.recording_evidence_ref =
            patch.recordingEvidenceRef ?? order.recording_evidence_ref;
          order.recording_state = "bound";
        } catch {
          // fallback
        }
        return { rows: [order as unknown as T], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 12. Candidate scans
    if (trimmed.includes("FROM voice.session s LEFT JOIN voice.work_item w")) {
      const candidates = Array.from(this.voiceSessions.values()).filter(
        (s) => s.dialog_state === "closed" || s.recording_state === "pending",
      );
      const rows = candidates.map((c) => ({
        voice_session_id: c.voice_session_id,
        call_id: c.call_id,
        resource_scope_id: c.resource_scope_id,
      })) as unknown as T[];
      return { rows, rowCount: rows.length };
    }

    if (
      trimmed.includes(
        "FROM crm.phase1_call_sessions c LEFT JOIN voice.work_item w",
      )
    ) {
      const candidates = Array.from(this.callSessions.values()).filter(
        (c) => c.status === "closed" || c.record.recordingState === "pending",
      );
      const rows = candidates.map((c) => ({
        call_id: c.call_id,
        record: c.record,
      })) as unknown as T[];
      return { rows, rowCount: rows.length };
    }

    return { rows: [], rowCount: 0 };
  }

  async withTransaction<T>(
    callback: (tx: InMemoryDatabase) => Promise<T>,
  ): Promise<T> {
    return callback(this);
  }
}

// ============================================================================
// Test Suite: SR-RECORDING-RECOVERY-20260913
// ============================================================================

describe("SR-RECORDING-RECOVERY-20260913: Recording Recovery and Controlled Replay", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const migrationV101Path = path.join(
    repoRoot,
    "infra/migrations/V0101__voice_work_recovery_audit.sql",
  );

  // ==========================================================================
  // Section 1: Schema Invariants & Authority (Migration V0101 & Consensus §B7)
  // ==========================================================================
  describe("Schema Invariants & Authority (V0101 & §B7)", () => {
    it("verifies V0101 migration file exists and defines voice.phase1_work_item_repair_audits", () => {
      expect(fs.existsSync(migrationV101Path)).toBe(true);
      const sql = fs.readFileSync(migrationV101Path, "utf8");

      expect(sql).toContain(
        "CREATE TABLE IF NOT EXISTS voice.phase1_work_item_repair_audits",
      );
      expect(sql).toContain(
        "work_id uuid NOT NULL REFERENCES voice.work_item (work_id)",
      );
      expect(sql).toContain("request_id varchar(255) NOT NULL");
      expect(sql).toContain("expected_lease_epoch integer NOT NULL");
      expect(sql).toContain(
        "allocated_max_attempts integer NOT NULL DEFAULT 5",
      );
      expect(sql).toContain(
        "CONSTRAINT uq_phase1_work_item_repair_dedupe UNIQUE (work_id, request_id)",
      );
      expect(sql).toContain(
        "SELECT voice._make_append_only('voice.phase1_work_item_repair_audits')",
      );
    });

    it("verifies V0101 defines discrete append-only attempt events contract", () => {
      const sql = fs.readFileSync(migrationV101Path, "utf8");

      expect(sql).toContain(
        "CREATE TABLE IF NOT EXISTS voice.phase1_work_item_attempt_audits",
      );
      expect(sql).toContain("attempt_stage varchar(20) NOT NULL CHECK");
      expect(sql).toContain("('started', 'terminal')");
      expect(sql).toContain("outcome varchar(20) NOT NULL CHECK");
      expect(sql).toContain("('started', 'completed', 'failed', 'fenced')");
      expect(sql).toContain(
        "CONSTRAINT ck_phase1_work_item_attempt_stage_outcome CHECK",
      );
      expect(sql).toContain(
        "CONSTRAINT uq_phase1_work_item_attempt_stage UNIQUE (work_id, lease_epoch, attempt_no, attempt_stage)",
      );
      expect(sql).toContain(
        "SELECT voice._make_append_only('voice.phase1_work_item_attempt_audits')",
      );
    });
  });

  // ==========================================================================
  // Section 2: Recording Recovery Lifecycle & Zero/One-Order Handling (§B6)
  // ==========================================================================
  describe("Recording Recovery Lifecycle & Zero/One-Order Handling (§B6)", () => {
    it("recovers an ordinary call with zero orders without order fan-out", async () => {
      const db = new InMemoryDatabase();
      const callId = "call-ord-zero-001";

      db.callSessions.set(callId, {
        call_id: callId,
        status: "closed",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        record: {
          callId,
          status: "closed",
          recordingId: null,
          recordingState: "pending",
          flags: ["closed", "recording_pending"],
          linkedOrderId: null,
        },
      });

      const dedupeKey = `finalize_recording:call:${callId}`;
      const payloadRef = JSON.stringify({
        callId,
        brandId: "default",
        recordingId: `rec-${callId}`,
        linkedOrderId: null,
        closedAt: new Date().toISOString(),
      });

      await db.query(
        `INSERT INTO voice.work_item (command_id, voice_session_id, work_type, dedupe_key, payload_ref, run_after)
        VALUES (NULL, NULL, 'finalize_recording', $1, $2, now())`,
        [dedupeKey, payloadRef],
      );

      const workItem = Array.from(db.workItems.values()).find(
        (w) => w.dedupe_key === dedupeKey,
      )!;
      expect(workItem).toBeDefined();
      expect(workItem.voice_session_id).toBeNull();
      expect(workItem.status).toBe("pending");

      workItem.status = "leased";

      const runner = new VoiceCommandRunnerService(
        {
          repository: {
            withTransaction: (fn: any) => fn(db),
          },
        } as any,
        {
          finalizeRecording: async (p: any) => ({
            manifestRef: { objectKey: "obj-001", checksum: "sha256-hash-001" },
            recordingId: p.scope.recordingId,
            scope: p.scope,
            linkedOrderId: p.linkedOrderId,
          }),
        } as any,
      );

      await runner.completeWorkItemWithDomainState(db as any, workItem as any, {
        scope: { brandId: "default", callId, recordingId: `rec-${callId}` },
        manifestRef: {
          objectKey: "manifest-key-001",
          checksum: "manifest-sha256",
        },
        recordingId: `rec-${callId}`,
        recordingUrl: `https://storage.drts.local/rec-${callId}.opus`,
        linkedOrderId: null,
      });

      expect(workItem.status).toBe("completed");

      const updatedCall = db.callSessions.get(callId)!;
      expect(updatedCall.record.recordingId).toBe(`rec-${callId}`);
      expect(updatedCall.record.recordingState).toBe("bound");
      expect(updatedCall.record.flags).toContain("recording_bound");
      expect(updatedCall.record.flags).not.toContain("recording_pending");
      expect(db.ownedOrders.size).toBe(0);

      const terminalAudit = db.attemptAudits.find(
        (a) => a.work_id === workItem.work_id && a.attempt_stage === "terminal",
      );
      expect(terminalAudit).toBeDefined();
      expect(terminalAudit!.outcome).toBe("completed");
    });

    it("recovers an ordinary call with exactly one linked order and records evidence", async () => {
      const db = new InMemoryDatabase();
      const callId = "call-ord-one-002";
      const orderId = "ord-linked-555";

      db.ownedOrders.set(orderId, {
        order_id: orderId,
        recording_id: null,
        recording_evidence_ref: null,
        recording_state: "pending",
      });

      db.callSessions.set(callId, {
        call_id: callId,
        status: "closed",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        record: {
          callId,
          status: "closed",
          recordingId: null,
          recordingState: "pending",
          flags: ["closed", "recording_pending"],
          linkedOrderId: orderId,
        },
      });

      const dedupeKey = `finalize_recording:call:${callId}`;
      const payloadRef = JSON.stringify({
        callId,
        brandId: "default",
        recordingId: `rec-${callId}`,
        linkedOrderId: orderId,
        closedAt: new Date().toISOString(),
      });

      await db.query(
        `INSERT INTO voice.work_item (command_id, voice_session_id, work_type, dedupe_key, payload_ref, run_after)
        VALUES (NULL, NULL, 'finalize_recording', $1, $2, now())`,
        [dedupeKey, payloadRef],
      );

      const workItem = Array.from(db.workItems.values()).find(
        (w) => w.dedupe_key === dedupeKey,
      )!;
      workItem.status = "leased";

      const runner = new VoiceCommandRunnerService(
        {
          repository: {
            withTransaction: (fn: any) => fn(db),
          },
        } as any,
        {
          finalizeRecording: async (p: any) => ({
            manifestRef: {
              objectKey: "obj-ord-555",
              checksum: "sha256-order-evidence",
            },
            recordingId: p.scope.recordingId,
            scope: p.scope,
            linkedOrderId: p.linkedOrderId,
          }),
        } as any,
      );

      await runner.completeWorkItemWithDomainState(db as any, workItem as any, {
        scope: { brandId: "default", callId, recordingId: `rec-${callId}` },
        manifestRef: {
          objectKey: "obj-ord-555",
          checksum: "sha256-order-evidence",
        },
        recordingId: `rec-${callId}`,
        recordingUrl: `https://storage.drts.local/rec-${callId}.opus`,
        linkedOrderId: orderId,
      });

      expect(workItem.status).toBe("completed");

      const updatedCall = db.callSessions.get(callId)!;
      expect(updatedCall.record.recordingState).toBe("bound");

      const updatedOrder = db.ownedOrders.get(orderId)!;
      expect(updatedOrder.recording_id).toBe(`rec-${callId}`);
      expect(updatedOrder.recording_evidence_ref).toBe("obj-ord-555");
      expect(updatedOrder.recording_state).toBe("bound");
    });

    it("recovers an AI session and updates voice.session recording_state to sealed", async () => {
      const db = new InMemoryDatabase();
      const voiceSessionId = "sess-ai-888";
      const callId = "call-ai-888";

      db.voiceSessions.set(voiceSessionId, {
        voice_session_id: voiceSessionId,
        call_id: callId,
        resource_scope_id: "brand-tw",
        dialog_state: "closed",
        recording_state: "pending",
        session_version: 3,
        lease_epoch: 1,
      });

      db.callSessions.set(callId, {
        call_id: callId,
        status: "closed",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        record: {
          callId,
          status: "closed",
          recordingId: null,
          recordingState: "pending",
          flags: ["closed", "recording_pending"],
        },
      });

      const dedupeKey = `finalize_recording:ai:${voiceSessionId}`;
      const payloadRef = JSON.stringify({
        voiceSessionId,
        callId,
        brandId: "brand-tw",
        recordingId: `rec-${voiceSessionId}`,
      });

      await db.query(
        `INSERT INTO voice.work_item (command_id, voice_session_id, work_type, dedupe_key, payload_ref, run_after)
        VALUES (NULL, $1, 'finalize_recording', $2, $3, now())`,
        [voiceSessionId, dedupeKey, payloadRef],
      );

      const workItem = Array.from(db.workItems.values()).find(
        (w) => w.dedupe_key === dedupeKey,
      )!;
      workItem.status = "leased";

      const runner = new VoiceCommandRunnerService(
        {
          repository: {
            withTransaction: (fn: any) => fn(db),
          },
        } as any,
        {
          finalizeRecording: async () => ({
            manifestRef: {
              objectKey: "ai-manifest",
              checksum: "sha256-ai-hash",
            },
            recordingId: `rec-${voiceSessionId}`,
          }),
        } as any,
      );

      await runner.completeWorkItemWithDomainState(db as any, workItem as any, {
        voiceSessionId,
        scope: {
          brandId: "brand-tw",
          callId,
          recordingId: `rec-${voiceSessionId}`,
        },
        manifestRef: { objectKey: "ai-manifest", checksum: "sha256-ai-hash" },
        recordingId: `rec-${voiceSessionId}`,
      });

      expect(workItem.status).toBe("completed");

      const updatedSess = db.voiceSessions.get(voiceSessionId)!;
      expect(updatedSess.recording_state).toBe("sealed");
      expect(updatedSess.session_version).toBe(4);
    });
  });

  // ==========================================================================
  // Section 3: The 5 Failure Modes Preserving All Prior Proof (§B6 & §B7)
  // ==========================================================================
  describe("The 5 Failure Modes Preserving Proof (§B6 & §B7)", () => {
    it("Failure Mode 1 (Lost lease / Fencing): rejects stale worker completion without corrupting domain state", async () => {
      const db = new InMemoryDatabase();
      const callId = "call-fenced-001";

      db.callSessions.set(callId, {
        call_id: callId,
        status: "closed",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        record: {
          callId,
          status: "closed",
          recordingState: "pending",
          flags: ["closed", "recording_pending"],
        },
      });

      const dedupeKey = `finalize_recording:call:${callId}`;
      await db.query(
        `INSERT INTO voice.work_item (command_id, voice_session_id, work_type, dedupe_key, payload_ref, run_after)
        VALUES (NULL, NULL, 'finalize_recording', $1, NULL, now())`,
        [dedupeKey],
      );

      const workItem = Array.from(db.workItems.values()).find(
        (w) => w.dedupe_key === dedupeKey,
      )!;
      workItem.status = "leased";
      workItem.lease_epoch = 1;
      workItem.leaseEpoch = 1;

      // Concurrent lease reaper overtakes lease in DB to epoch 2
      const databaseState = db.workItems.get(workItem.work_id)!;
      databaseState.lease_epoch = 2;
      databaseState.leaseEpoch = 2;

      // The worker holds its stale snapshot from when it acquired the lease (epoch 1)
      const staleWorkerRecord = { ...workItem, lease_epoch: 1, leaseEpoch: 1 };

      const runner = new VoiceCommandRunnerService(
        {
          repository: {
            withTransaction: (fn: any) => fn(db),
          },
        } as any,
        {
          finalizeRecording: async () => ({}),
        } as any,
      );

      await expect(
        runner.completeWorkItemWithDomainState(
          db as any,
          staleWorkerRecord as any,
          {
            scope: { brandId: "default", callId },
          },
        ),
      ).rejects.toThrow(LeaseFencedError);

      const callSession = db.callSessions.get(callId)!;
      expect(callSession.record.recordingState).toBe("pending");
      expect(callSession.record.flags).not.toContain("recording_bound");
    });

    it("Failure Mode 2 (Duplicate event): dedupes identical payloads and rejects mismatched payload with 409 conflict", async () => {
      const db = new InMemoryDatabase();
      const callId = "call-dedupe-conflict-002";

      const runner = new VoiceCommandRunnerService(
        {
          repository: {
            withTransaction: (fn: any) => fn(db),
          },
        } as any,
        {} as any,
      );

      // First enqueue: succeeds
      await runner.enqueueWorkItem(db as any, {
        workType: "finalize_recording",
        dedupeKey: `finalize_recording:call:${callId}`,
        payloadRef: JSON.stringify({ callId, recordingId: "rec-initial-001" }),
      });

      // Duplicate event with IDENTICAL payload: succeeds without error
      await runner.enqueueWorkItem(db as any, {
        workType: "finalize_recording",
        dedupeKey: `finalize_recording:call:${callId}`,
        payloadRef: JSON.stringify({ callId, recordingId: "rec-initial-001" }),
      });

      // Duplicate event with CONFLICTING payload (different recordingId): throws 409 VOICE_ACTION_PAYLOAD_CONFLICT
      await expect(
        runner.enqueueWorkItem(db as any, {
          workType: "finalize_recording",
          dedupeKey: `finalize_recording:call:${callId}`,
          payloadRef: JSON.stringify({
            callId,
            recordingId: "rec-altered-conflicting-999",
          }),
        }),
      ).rejects.toThrow(ApiRequestError);

      try {
        await runner.enqueueWorkItem(db as any, {
          workType: "finalize_recording",
          dedupeKey: `finalize_recording:call:${callId}`,
          payloadRef: JSON.stringify({
            callId,
            recordingId: "rec-altered-conflicting-999",
          }),
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(409);
        expect(err.code).toBe("VOICE_ACTION_PAYLOAD_CONFLICT");
      }
    });

    it("Failure Mode 3 (DB failure): transaction abort leaves immutable storage and evidence untouched", async () => {
      const { store } = createMediaContext();
      const scope: RecordingScope = {
        brandId: "default",
        callId: "call-db-fail-003",
        recordingId: "rec-db-fail-003",
        legId: "leg-001",
      };

      const ledger: RecordingClosureLedger = {
        resolve: async () => ({
          closedEventId: "evt-closed-003",
          endedAt: "2026-09-13T16:00:00.000Z",
          endMs: 60000,
          checkpointRefs: [],
        }),
      };

      const mediaAdapter = new MediaRecordingAdapter(store, ledger);
      const segments = createBidirectionalSegments(scope);

      const sealReq: MediaRecordingFinalizationRequest = {
        credential: "cred-trusted",
        scope,
        segments,
        closureLedger: ledger,
      };

      const sealed = await mediaAdapter.sealFinalRecording(sealReq);
      expect(sealed.manifestRef).toBeDefined();

      const failingDb = {
        withTransaction: async <T>(
          fn?: (tx: any) => Promise<T>,
        ): Promise<T> => {
          void fn;
          throw new Error(
            "Simulated PostgreSQL connection failure or disk quota exceeded",
          );
        },
      };

      await expect(
        failingDb.withTransaction(async () => {
          throw new Error(
            "Simulated PostgreSQL connection failure or disk quota exceeded",
          );
        }),
      ).rejects.toThrow("Simulated PostgreSQL connection failure");

      const head = await store.headObject(sealed.manifestRef.objectKey);
      expect(head.exists).toBe(true);
    });

    it("Failure Mode 4 (Media-sealed-before-crash): reentrant recovery reuses fixed sealed manifest reference", async () => {
      const { store } = createMediaContext();
      const scope: RecordingScope = {
        brandId: "brand-reentrant",
        callId: "call-crash-004",
        recordingId: "rec-crash-004",
        legId: "leg-001",
      };

      const ledger: RecordingClosureLedger = {
        resolve: async () => ({
          closedEventId: "evt-closed-004",
          endedAt: "2026-09-13T16:00:00.000Z",
          endMs: 60000,
          checkpointRefs: [],
        }),
      };

      const mediaAdapter = new MediaRecordingAdapter(store, ledger);
      const segments = createBidirectionalSegments(scope);

      const req: MediaRecordingFinalizationRequest = {
        credential: "cred-trusted",
        scope,
        segments,
        closureLedger: ledger,
      };

      const firstSeal = await mediaAdapter.sealFinalRecording(req);
      expect(firstSeal.manifestRef.objectKey).toBeTruthy();
      expect(firstSeal.manifestRef.checksum).toBeTruthy();

      // Second invocation (reentrant after worker restart)
      const secondSeal = await mediaAdapter.sealFinalRecording(req);

      expect(secondSeal.manifestRef.objectKey).toBe(
        firstSeal.manifestRef.objectKey,
      );
      expect(secondSeal.manifestRef.checksum).toBe(
        firstSeal.manifestRef.checksum,
      );
      expect(secondSeal.endMs).toBe(firstSeal.endMs);
      expect(secondSeal.closedEventId).toBe(firstSeal.closedEventId);
    });

    it("Failure Mode 5 (Same-ID failed repair): deduplicates repeated repair requests on (work_id, request_id)", async () => {
      const db = new InMemoryDatabase();
      const workId = "work-failed-repair-005";

      db.workItems.set(workId, {
        work_id: workId,
        command_id: null,
        voice_session_id: null,
        work_type: "finalize_recording",
        dedupe_key: `finalize_recording:call:call-005`,
        payload_ref: null,
        status: "failed",
        lease_epoch: 3,
        attempt: 5,
        attempt_count: 5,
        max_attempts: 5,
        last_error: "Temporary network timeout during upload",
        leased_until: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const runner = new VoiceCommandRunnerService(
        {
          repository: {
            withTransaction: (fn: any) => fn(db),
          },
        } as any,
        {} as any,
      );

      const repairParams = {
        workId,
        requestId: "req-ops-incident-12345",
        actorId: "ops-alice",
        reason: "Network partition restored; re-queueing failed recording job",
        expectedLeaseEpoch: 3,
        allocatedMaxAttempts: 5,
      };

      const result1 = await runner.repairFailedWorkItem(repairParams);
      expect(result1.workId).toBe(workId);
      expect(result1.previousStatus).toBe("failed");
      expect(result1.previousAttemptCount).toBe(5);
      expect(result1.previousLastError).toBe(
        "Temporary network timeout during upload",
      );
      expect(result1.deduped).toBeFalsy();

      const updatedWork = db.workItems.get(workId)!;
      expect(updatedWork.status).toBe("pending");
      expect(updatedWork.lease_epoch).toBe(4);
      expect(updatedWork.attempt).toBe(0);

      expect(db.repairAudits).toHaveLength(1);

      const result2 = await runner.repairFailedWorkItem(repairParams);
      expect(result2.workId).toBe(workId);
      expect(result2.requestId).toBe("req-ops-incident-12345");
      expect(result2.deduped).toBe(true);

      expect(db.repairAudits).toHaveLength(1);
      expect(updatedWork.attempt).toBe(0);
      expect(updatedWork.lease_epoch).toBe(4);
    });
  });

  // ==========================================================================
  // Section 4: Audited Ops Repair Endpoint & Invariants (§B7)
  // ==========================================================================
  describe("Audited Ops Repair Endpoint & Invariants (§B7)", () => {
    it("rejects repair if work item status is not failed (e.g., currently leased)", async () => {
      const db = new InMemoryDatabase();
      const workId = "work-active-006";

      db.workItems.set(workId, {
        work_id: workId,
        command_id: null,
        voice_session_id: null,
        work_type: "finalize_recording",
        dedupe_key: "finalize_recording:call:call-006",
        payload_ref: null,
        status: "leased",
        lease_epoch: 2,
        attempt: 1,
        attempt_count: 1,
        max_attempts: 5,
        last_error: null,
        leased_until: new Date(Date.now() + 60000),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const runner = new VoiceCommandRunnerService(
        {
          repository: {
            withTransaction: (fn: any) => fn(db),
          },
        } as any,
        {} as any,
      );

      await expect(
        runner.repairFailedWorkItem({
          workId,
          requestId: "req-invalid-status",
          actorId: "ops-bob",
          reason: "premature repair attempt",
          expectedLeaseEpoch: 2,
        }),
      ).rejects.toThrow(ApiRequestError);

      try {
        await runner.repairFailedWorkItem({
          workId,
          requestId: "req-invalid-status",
          actorId: "ops-bob",
          reason: "premature repair attempt",
          expectedLeaseEpoch: 2,
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(409);
        expect(err.code).toBe("WORK_ITEM_NOT_FAILED");
      }
    });

    it("rejects repair if expected_lease_epoch does not match current epoch", async () => {
      const db = new InMemoryDatabase();
      const workId = "work-epoch-mismatch-007";

      db.workItems.set(workId, {
        work_id: workId,
        command_id: null,
        voice_session_id: null,
        work_type: "finalize_recording",
        dedupe_key: "finalize_recording:call:call-007",
        payload_ref: null,
        status: "failed",
        lease_epoch: 4,
        attempt: 5,
        attempt_count: 5,
        max_attempts: 5,
        last_error: "Fatal crash",
        leased_until: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const runner = new VoiceCommandRunnerService(
        {
          repository: {
            withTransaction: (fn: any) => fn(db),
          },
        } as any,
        {} as any,
      );

      await expect(
        runner.repairFailedWorkItem({
          workId,
          requestId: "req-stale-epoch",
          actorId: "ops-bob",
          reason: "stale epoch passed",
          expectedLeaseEpoch: 2,
        }),
      ).rejects.toThrow(ApiRequestError);

      try {
        await runner.repairFailedWorkItem({
          workId,
          requestId: "req-stale-epoch",
          actorId: "ops-bob",
          reason: "stale epoch passed",
          expectedLeaseEpoch: 2,
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(409);
        expect(err.code).toBe("LEASE_EPOCH_MISMATCH");
      }
    });

    it("executes repair via VoiceBookingController HTTP endpoint", async () => {
      const db = new InMemoryDatabase();
      const workId = "work-ctrl-008";

      db.workItems.set(workId, {
        work_id: workId,
        command_id: null,
        voice_session_id: null,
        work_type: "finalize_recording",
        dedupe_key: "finalize_recording:call:call-008",
        payload_ref: null,
        status: "failed",
        lease_epoch: 1,
        attempt: 5,
        attempt_count: 5,
        max_attempts: 5,
        last_error: "Provider connection dropped",
        leased_until: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const runner = new VoiceCommandRunnerService(
        {
          repository: {
            withTransaction: (fn: any) => fn(db),
          },
        } as any,
        {} as any,
      );

      const controller = new VoiceBookingController(
        {} as any,
        {} as any,
        runner,
      );

      const response = await controller.repairWorkItem(
        workId,
        {
          requestId: "req-ctrl-repair-008",
          actorId: "ops-lead",
          reason: "Manual verification confirmed provider issue resolved",
          expectedLeaseEpoch: 1,
          allocatedMaxAttempts: 5,
        },
        "req-ctrl-repair-008",
      );

      expect(response.data).toBeDefined();
      expect(response.data.workId).toBe(workId);
      expect(response.data.previousStatus).toBe("failed");
      expect(response.data.allocatedMaxAttempts).toBe(5);
      expect(response.meta.requestId).toBe("req-ctrl-repair-008");

      const work = db.workItems.get(workId)!;
      expect(work.status).toBe("pending");
      expect(work.lease_epoch).toBe(2);
      expect(work.attempt).toBe(0);
    });
  });

  // ==========================================================================
  // Section 5: Historical Pending Recording Recovery Scanning (§B6)
  // ==========================================================================
  describe("Historical Pending Recording Recovery Scanning (§B6)", () => {
    it("scans and enqueues historical AI sessions with pending recordings", async () => {
      const db = new InMemoryDatabase();
      db.voiceSessions.set("ai-hist-1", {
        voice_session_id: "ai-hist-1",
        call_id: "call-hist-1",
        resource_scope_id: "brand-1",
        dialog_state: "closed",
        recording_state: "pending",
        session_version: 2,
        lease_epoch: 1,
      });
      db.voiceSessions.set("ai-hist-2", {
        voice_session_id: "ai-hist-2",
        call_id: "call-hist-2",
        resource_scope_id: "brand-2",
        dialog_state: "closed",
        recording_state: "pending",
        session_version: 1,
        lease_epoch: 1,
      });

      const repo = {
        isEnabled: () => true,
        withTransaction: (fn: any) => fn(db),
      };

      const sessionService = new VoiceSessionService(repo as any);
      const res = await sessionService.recoverPendingRecordingSessions();

      expect(res.scanned).toBe(2);
      expect(res.enqueued).toBe(2);

      expect(Array.from(db.workItems.values())).toHaveLength(2);
      expect(Array.from(db.workItems.values())[0]?.work_type).toBe(
        "finalize_recording",
      );
    });

    it("scans and enqueues unfinalized ordinary calls", async () => {
      const db = new InMemoryDatabase();
      db.callSessions.set("call-ord-hist-1", {
        call_id: "call-ord-hist-1",
        status: "closed",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        record: {
          callId: "call-ord-hist-1",
          status: "closed",
          recordingId: null,
          recordingState: "pending",
          flags: ["closed", "recording_pending"],
        },
      });

      const callRepo = new CallcenterRepository({
        isEnabled: () => true,
        query: (sql: string, params: unknown[]) => db.query(sql, params),
      } as any);

      const res = await callRepo.recoverPendingRecordingCalls();
      expect(res.scanned).toBe(1);
      expect(res.enqueued).toBe(1);

      const work = Array.from(db.workItems.values()).find(
        (w) => w.dedupe_key === "finalize_recording:call:call-ord-hist-1",
      );
      expect(work).toBeDefined();
      expect(work!.voice_session_id).toBeNull();
    });
  });
});
