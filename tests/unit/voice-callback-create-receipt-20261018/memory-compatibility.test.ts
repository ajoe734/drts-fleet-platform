import { describe, expect, it } from "vitest";
import { VoiceCallbackService } from "../../../apps/api/src/modules/voice-booking/voice-callback.service";

describe("callback receipt reader compatibility without PostgreSQL", () => {
  it("recovers the existing memory receipt and its cancelled task without recreating it", async () => {
    const service = new VoiceCallbackService();
    const original = await service.createCallback({
      voiceSessionId: "synthetic-session",
      resourceScopeId: "synthetic-scope",
      brandId: "synthetic-brand",
      callId: "synthetic-call",
      contactPhone: "synthetic-contact",
      consentRef: "explicit-synthetic-consent",
      reason: "Synthetic callback",
    });
    service.cancelCallback({
      taskId: original.task.taskId,
      expectedVersion: 1,
      reason: "Synthetic cancellation",
    });
    const recovered = await service.getReceiptByActionKeyForRead(
      original.receipt.actionKey,
    );
    expect(recovered.receipt).toEqual(original.receipt);
    expect(recovered.task).toMatchObject({
      taskId: original.task.taskId,
      status: "cancelled",
    });
    expect(
      await service.getReceiptByActionKeyForRead("synthetic-missing"),
    ).toEqual({ receipt: null, task: null });
  });
});
