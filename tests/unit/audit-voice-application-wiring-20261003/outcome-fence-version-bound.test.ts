import { describe, expect, it, vi } from "vitest";
import { VoiceSessionRepository } from "../../../apps/api/src/modules/voice-booking/voice-session.repository";
import { VoiceSessionService } from "../../../apps/api/src/modules/voice-booking/voice-session.service";

// Real service, transaction wrapper, row mapper and repository SQL. Only DB
// I/O is doubled; this is NOT PostgreSQL locking/constraint acceptance.
function harness() {
  const id = "f0000000-0000-4000-8000-000000000081";
  const writes: number[] = [];
  const statements: string[] = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    const q = sql.replace(/\s+/g, " ").trim();
    statements.push(q);
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(q)) return { rows: [], rowCount: 0 };
    if (q.includes("SELECT") && q.includes("FROM voice.session")) {
      expect(q).toContain("FOR UPDATE");
      return { rows: [{
        voice_session_id: id, call_id: "fixture-call", provider_account_id: "fixture-provider",
        provider_call_id: "fixture-provider-call", resource_scope_id: "fixture-scope",
        line_binding_id: "fixture-line", route_profile_id: "fixture-route",
        route_profile_version: 1, dialog_state: "collecting", media_state: "active",
        control_owner: "ai", lease_epoch: 1, session_version: 5,
        commit_status: "none", recording_state: "capturing", confirmation_state: "absent",
        outcome: null, input_epoch: 3, pending_input: false, last_resolved_input_epoch: 3,
        last_applied_control_sequence: 2, dialogue_snapshot_fence_version: 0,
        created_at: "2026-10-03T00:00:00.000Z", updated_at: "2026-10-03T00:00:00.000Z",
      }], rowCount: 1 };
    }
    if (q.includes("SELECT") && q.includes("FROM voice.dialogue_snapshot")) {
      return { rows: [], rowCount: 0 };
    }
    if (q.startsWith("UPDATE voice.session") && q.includes("dialogue_snapshot_fence_version")) {
      writes.push(Number(values[1]));
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected database boundary: ${q}`);
  });
  const client = { query, release: vi.fn() };
  const database = { isEnabled: () => true, query, connect: async () => client };
  const repository = new VoiceSessionRepository(
    database as unknown as ConstructorParameters<typeof VoiceSessionRepository>[0],
  );
  return {
    service: new VoiceSessionService(repository), writes, statements, client,
    command: (version: number) => ({ voiceSessionId: id, expectedSessionVersion: version,
      inputEpoch: 3, mediaEpoch: 2, turnId: "fixture-turn" }),
  };
}

describe("snapshot outcome fence cannot void unissued future revisions", () => {
  it.each([6, 2_147_483_647])("rejects future version %i against locked session version5 without raising a fence", async (version) => {
    const h = harness();
    // Both values fit PostgreSQL integer: this is a missing domain bound,
    // not a pretend database acceptance of NaN/overflow/invalid SQL values.
    await expect(h.service.resolveDialogueSnapshotOutcome(h.command(version))).rejects.toBeDefined();
    expect(h.writes).toEqual([]);
    expect(h.statements).toContain("ROLLBACK");
    expect(h.statements).not.toContain("COMMIT");
    expect(h.client.release).toHaveBeenCalledOnce();
  });

  it("positive control: genuinely issued current version can be authoritatively fenced", async () => {
    const h = harness();
    await expect(h.service.resolveDialogueSnapshotOutcome(h.command(5))).resolves.toMatchObject({ accepted: false });
    expect(h.writes).toEqual([5]);
    expect(h.statements).toContain("COMMIT");
    expect(h.client.release).toHaveBeenCalledOnce();
  });
});
