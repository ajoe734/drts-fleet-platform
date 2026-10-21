import { describe, expect, it, vi } from "vitest";
import { VoiceCommandRunnerService as CurrentRunner } from "../../../apps/api/src/modules/voice-booking/voice-command-runner.service";

/**
 * AUDIT-VOICE-APPLICATION-REGRESSION-20261018 review round 2 (F3): before
 * this fix, `completeWorkItemWithDomainState`'s finalize_recording branch
 * only checked that `manifestRef.objectKey` or `manifestRef.checksum` was
 * truthy, so a key-only/partial manifest (no object version, checksum,
 * byte-length coverage or verification timestamp) passed the guard, and
 * `recordingId` could fall back to an unrelated payload value or a
 * fabricated `rec-${callId}` with no connection to what was actually
 * finalized. It now requires the full `VoiceEvidenceService.
 * FinalizeRecordingResult` contract plus a `recordingId` that matches what
 * was actually requested (`scope.recordingId`), rejecting (never
 * completing the work item) when any piece is missing or mismatched.
 */
import { resolve } from "node:path";
import { sourceModuleLoader } from "./source-module-loader";
const VoiceCommandRunnerService = process.env.VOICE_ORIGINAL_REF
  ? sourceModuleLoader({}, [
      "apps/api/src/modules/voice-booking/voice-command-runner.service.ts",
    ])<{ VoiceCommandRunnerService: typeof CurrentRunner }>(
      resolve(
        "apps/api/src/modules/voice-booking/voice-command-runner.service.ts",
      ),
    ).VoiceCommandRunnerService
  : CurrentRunner;
const coverage = {
  startMs: 0,
  endMs: 1000,
  channels: ["inbound", "outbound"],
  closedEventId: "provider-close",
  endedAt: "2026-09-01T00:00:00.000Z",
};
function buildTx() {
  const query = vi.fn(async (sql: string) => {
    if (
      sql.includes("UPDATE voice.work_item") &&
      sql.includes("status = 'completed'")
    ) {
      return { rows: [{ work_id: "work-1" }], rowCount: 1 };
    }
    if (sql.includes("to_regclass")) {
      return { rows: [{ exists: false }], rowCount: 1 };
    }
    // No CRM/session/order rows configured -- those optional branches are
    // honestly skipped, isolating this test to the manifest guard itself.
    return { rows: [], rowCount: 0 };
  });
  return { query };
}

function runner() {
  return new VoiceCommandRunnerService({} as never, {} as never);
}

const record = {
  workId: "work-1",
  commandId: null,
  voiceSessionId: null,
  workType: "finalize_recording",
  dedupeKey: "finalize_recording:call:call-1",
  payloadRef: null,
  leaseEpoch: 1,
  attempt: 0,
};

const validManifestRef = {
  objectKey: "obj-1",
  objectVersion: "1",
  checksum: "a".repeat(64),
  byteLength: 2048,
  durableAt: new Date().toISOString(),
};

describe("VoiceCommandRunnerService.completeWorkItemWithDomainState finalize_recording manifest verification", () => {
  it("completes when the manifest is fully verified and recordingId matches what was requested", async () => {
    const { query } = buildTx();
    await expect(
      runner().completeWorkItemWithDomainState({ query } as never, record, {
        scope: {
          brandId: "default",
          callId: "call-1",
          recordingId: "rec-1",
          legId: "leg-1",
        },
        manifestRef: validManifestRef,
        recordingId: "rec-1",
        coverage,
        verifiedAt: new Date().toISOString(),
      }),
    ).resolves.not.toThrow();
  });

  it("rejects a key-only manifestRef missing objectVersion/byteLength/durableAt", async () => {
    const { query } = buildTx();
    await expect(
      runner().completeWorkItemWithDomainState({ query } as never, record, {
        scope: {
          brandId: "default",
          callId: "call-1",
          recordingId: "rec-1",
          legId: "leg-1",
        },
        manifestRef: { objectKey: "obj-1", checksum: "a".repeat(64) },
        recordingId: "rec-1",
        coverage,
        verifiedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/voice_recording_manifest_unverified/);
  });

  it("rejects a result with no recordingId", async () => {
    const { query } = buildTx();
    await expect(
      runner().completeWorkItemWithDomainState({ query } as never, record, {
        scope: {
          brandId: "default",
          callId: "call-1",
          recordingId: "rec-1",
          legId: "leg-1",
        },
        manifestRef: validManifestRef,
        coverage,
        verifiedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/voice_recording_manifest_unverified/);
  });

  it("rejects a result with no verifiedAt", async () => {
    const { query } = buildTx();
    await expect(
      runner().completeWorkItemWithDomainState({ query } as never, record, {
        scope: {
          brandId: "default",
          callId: "call-1",
          recordingId: "rec-1",
          legId: "leg-1",
        },
        manifestRef: validManifestRef,
        recordingId: "rec-1",
      }),
    ).rejects.toThrow(/voice_recording_manifest_unverified/);
  });

  it("rejects a recordingId that does not match the requested scope.recordingId", async () => {
    const { query } = buildTx();
    await expect(
      runner().completeWorkItemWithDomainState({ query } as never, record, {
        scope: {
          brandId: "default",
          callId: "call-1",
          recordingId: "rec-REQUESTED",
          legId: "leg-1",
        },
        manifestRef: validManifestRef,
        recordingId: "rec-DIFFERENT",
        coverage,
        verifiedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/voice_recording_manifest_unverified/);
  });
});

it.each([
  ["missing coverage", { coverage: undefined }],
  [
    "invalid checksum",
    { manifestRef: { ...validManifestRef, checksum: "not-a-checksum" } },
  ],
  [
    "missing immutable version",
    { manifestRef: { ...validManifestRef, objectVersion: " " } },
  ],
  [
    "nonfinite bytes",
    { manifestRef: { ...validManifestRef, byteLength: Infinity } },
  ],
  ["invalid verification time", { verifiedAt: "not-a-time" }],
  [
    "wrong original requested call",
    {
      scope: {
        brandId: "default",
        callId: "other-call",
        recordingId: "rec-1",
        legId: "leg-1",
      },
    },
  ],
])(
  "F3 custom-handler completion rejects %s before domain writes",
  async (_label, patch) => {
    const { query } = buildTx();
    const result = {
      scope: {
        brandId: "default",
        callId: "call-1",
        recordingId: "rec-1",
        legId: "leg-1",
      },
      recordingId: "rec-1",
      manifestRef: validManifestRef,
      coverage,
      verifiedAt: new Date().toISOString(),
      ...patch,
    };
    await expect(
      runner().completeWorkItemWithDomainState(
        { query } as never,
        {
          ...record,
          payloadRef: JSON.stringify({
            brandId: "default",
            callId: "call-1",
            recordingId: "rec-1",
            legId: "leg-1",
          }),
        },
        result,
      ),
    ).rejects.toThrow(/voice_recording_manifest_unverified/);
    expect(
      query.mock.calls.some(
        ([sql]) =>
          sql.includes("UPDATE crm.phase1_call_sessions") ||
          sql.includes("UPDATE ops.phase1_owned_orders"),
      ),
    ).toBe(false);
  },
);
