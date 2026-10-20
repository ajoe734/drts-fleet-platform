import { describe, expect, it, vi } from "vitest";
import { VoiceCommandRunnerService } from "../../../apps/api/src/modules/voice-booking/voice-command-runner.service";

/**
 * AUDIT-VOICE-APPLICATION-REGRESSION-20261018 (recording_finalization_continuation):
 * before this task, `handleFinalizeRecording` returned a fabricated
 * `handled: true`/`finalizedAt` result when no `VOICE_MEDIA_RECORDING_ADAPTER`
 * was configured (apps/api never provides one at all -- see
 * `voice-booking.module.ts`'s own providers list), which
 * `executeNextWorkItem` then fed straight into
 * `completeWorkItemWithDomainState`, marking the work item "completed" and
 * writing CRM "recording_bound"/voice.session "finalized" state with no
 * manifest/object/checksum ever verified. `handleFinalizeRecording` now
 * throws instead, so the item is left exactly where any other execution
 * failure already lands: retried (or `failed` after `maxAttempts`), never
 * falsely completed.
 */
function fixture() {
  const workItems = new Map<
    string,
    { status: string; attempt: number; lease_epoch: number; last_error: string | null }
  >([
    [
      "work-1",
      { status: "leased", attempt: 1, lease_epoch: 1, last_error: null },
    ],
  ]);
  const domainWrites: string[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("to_regclass")) {
      return { rows: [{ exists: false }], rowCount: 1 };
    }
    if (sql.includes("WITH candidate AS")) {
      return {
        rows: [
          {
            work_id: "work-1",
            command_id: null,
            voice_session_id: null,
            work_type: "finalize_recording",
            dedupe_key: "finalize_recording:call:call-no-adapter",
            payload_ref: null,
            lease_epoch: 1,
            attempt: 1,
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("UPDATE voice.work_item") && sql.includes("status = CASE")) {
      const item = workItems.get("work-1")!;
      const maxAttempts = (params as unknown[])[2] as number;
      item.status = item.attempt >= maxAttempts ? "failed" : "pending";
      item.last_error = (params as unknown[])[3] as string;
      return { rows: [], rowCount: 1 };
    }
    if (
      sql.includes("UPDATE crm.phase1_call_sessions") ||
      sql.includes("UPDATE voice.session") ||
      sql.includes("UPDATE ops.phase1_owned_orders") ||
      (sql.includes("UPDATE voice.work_item") && sql.includes("'completed'"))
    ) {
      domainWrites.push(sql);
      return { rows: [{ work_id: "work-1" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const repository = {
    withTransaction: async (fn: (tx: { query: typeof query }) => unknown) =>
      fn({ query }),
  };
  const runner = new VoiceCommandRunnerService({ repository } as never, {} as never);
  return { runner, query, workItems, domainWrites };
}

describe("VoiceCommandRunnerService.handleFinalizeRecording with no configured adapter", () => {
  it("leaves the work item retryable instead of fabricating a completed/finalized result", async () => {
    const { runner, workItems, domainWrites } = fixture();

    const result = await runner.runOnce({
      supportedTypes: ["finalize_recording"],
    });

    expect(result).toMatchObject({ success: false });
    expect((result as { error?: string }).error).toContain(
      "voice_recording_adapter_unavailable",
    );
    expect(workItems.get("work-1")!.status).not.toBe("completed");
    expect(domainWrites).toHaveLength(0);
  });
});
