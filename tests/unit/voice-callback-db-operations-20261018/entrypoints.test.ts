import { describe, expect, it } from "vitest";
import { VoiceCallbackService } from "../../../apps/api/src/modules/voice-booking/voice-callback.service";

describe("voice callback runtime entry points", () => {
  it("preserves the memory-only contact workflow and returns asynchronous terminal rejection", async () => {
    const service = new VoiceCallbackService();
    const { task } = await service.createCallback({
      voiceSessionId: "synthetic-callback-session",
      resourceScopeId: "synthetic-callback-scope",
      brandId: "synthetic-brand",
      callId: "synthetic-call",
      contactPhone: "+886900000203",
      consentRef: "explicit-synthetic-callback-consent",
      reason: "Synthetic callback request",
    });
    expect(await service.getTaskForRead(task.taskId)).toEqual(task);
    const claimed = await service.claimCallbackForWrite({
      taskId: task.taskId,
      operatorId: "synthetic-A",
      expectedVersion: 1,
    });
    const attempted = await service.recordAttemptForWrite({
      taskId: task.taskId,
      operatorId: "synthetic-A",
      expectedVersion: claimed.version,
      outcome: "answered",
      notes: "Synthetic contact observation",
      hangupConfirmed: true,
    });
    expect(await service.getTaskForRead(task.taskId)).toMatchObject({
      status: "in_progress",
      attemptCount: 1,
      lastOutcome: "answered",
    });
    expect(await service.getAttemptsForRead(task.taskId)).toEqual([
      attempted.attempt,
    ]);
    service.completeCallback({
      taskId: task.taskId,
      operatorId: "synthetic-A",
      expectedVersion: attempted.task.version,
    });
    await expect(
      service.claimCallbackForWrite({
        taskId: task.taskId,
        operatorId: "synthetic-B",
        expectedVersion: attempted.task.version + 1,
      }),
    ).rejects.toMatchObject({ code: "CALLBACK_TASK_TERMINAL" });
    expect(await service.getTaskForRead("unknown-synthetic-task")).toBeNull();
  });
});
