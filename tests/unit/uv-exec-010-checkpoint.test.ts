import { describe, expect, it, vi } from "vitest";
import {
  VoiceCheckpointRepository,
  type VerifiedCheckpointAppend,
} from "../../apps/api/src/modules/voice-booking/voice-checkpoint.repository";
import type { VoiceQueryExecutor } from "../../apps/api/src/modules/voice-booking/voice-booking.repository";

const input = (): VerifiedCheckpointAppend => ({
  callId: "call",
  recordingId: "recording",
  manifestVersion: 1,
  manifest: { objectKey: "manifest", objectVersion: "immutable-1" },
  manifestHash: "a".repeat(64),
  coverage: { startMs: 0, endMs: 1000 },
  policyVersion: "policy-1",
});
const row = () => ({
  checkpoint_id: "checkpoint",
  call_id: "call",
  recording_id: "recording",
  manifest_version: 1,
  manifest: input().manifest,
  manifest_hash: input().manifestHash,
  coverage: input().coverage,
  policy_version: "policy-1",
  verified_at: "2026-09-08T12:00:00Z",
});

describe("UV-EXEC-010 append-only checkpoint writer", () => {
  it("requires durable storage even when the request looks valid", async () => {
    await expect(new VoiceCheckpointRepository().appendVerified(input()))
      .rejects.toThrow("database unavailable");
  });

  it("snapshots nested evidence before database I/O", async () => {
    const request = input();
    const query = vi.fn(async () => {
      request.manifest.objectVersion = "changed";
      request.coverage.endMs = 5000;
      return { rows: [row()] };
    });
    const result = await new VoiceCheckpointRepository().appendVerified(
      request, { query } as unknown as VoiceQueryExecutor,
    );
    const args = (query.mock.calls as unknown as [string, unknown[]][])[0]!;
    expect(JSON.parse(args[1][3] as string).objectVersion).toBe("immutable-1");
    expect(JSON.parse(args[1][5] as string).endMs).toBe(1000);
    expect(result.checkpointId).toBe("checkpoint");
  });

  it("returns the original identity and verification time on an exact retry", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row()] });
    const result = await new VoiceCheckpointRepository().appendVerified(
      input(), { query },
    );
    expect(result.checkpointId).toBe("checkpoint");
    expect(result.verifiedAt).toBe("2026-09-08T12:00:00.000Z");
    expect(query.mock.calls[1]![1]).toEqual(query.mock.calls[0]![1]);
    expect(query.mock.calls[1]![0]).toContain("manifest = $4::jsonb");
    expect(query.mock.calls[1]![0]).toContain("coverage = $6::jsonb");
    expect(query.mock.calls[1]![0]).toContain("policy_version = $7");
    expect(query.mock.calls.map(([sql]) => sql).join(" "))
      .not.toMatch(/\b(UPDATE|DELETE)\b/);
  });

  it("rejects a version collision without replacing established evidence", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(new VoiceCheckpointRepository().appendVerified(input(), { query }))
      .rejects.toThrow("version conflict");
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("does not acknowledge checkpoint success when storage fails", async () => {
    const query = vi.fn().mockRejectedValue(new Error("connection lost"));
    await expect(new VoiceCheckpointRepository().appendVerified(input(), { query }))
      .rejects.toThrow("connection lost");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { recordingId: "" },
    { manifestVersion: 0 },
    { manifestVersion: 2147483648 },
    { manifestHash: "unverified" },
    { policyVersion: "" },
    { manifest: null },
    { coverage: [] },
  ])("rejects invalid journal input before writing: %j", async (patch) => {
    const query = vi.fn();
    await expect(new VoiceCheckpointRepository().appendVerified(
      { ...input(), ...patch } as VerifiedCheckpointAppend, { query },
    )).rejects.toThrow("Invalid checkpoint");
    expect(query).not.toHaveBeenCalled();
  });
});
