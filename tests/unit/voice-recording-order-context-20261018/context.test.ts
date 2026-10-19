import { describe, expect, it, vi } from "vitest";
import { VoiceSessionService } from "../../../apps/api/src/modules/voice-booking/voice-session.service";
import { VoiceCommandRunnerService } from "../../../apps/api/src/modules/voice-booking/voice-command-runner.service";

function fixture(appliedMediaEpoch = 0) {
  const session = {
    voiceSessionId: "original-session",
    callId: "original-call",
    resourceScopeId: "scope-is-not-the-brand",
    sessionVersion: 1,
    leaseEpoch: 1,
    lastAppliedControlSequence: 1,
    inputEpoch: 0,
    providerAccountId: "provider",
    dialogState: "confirming",
  };
  const context = {
    call_id: session.callId,
    brand_id: "actual-brand",
    bound_order_id: "original-order" as string | null,
  };
  const query = vi.fn<
    (
      sql: string,
      params?: unknown[],
    ) => Promise<{ rows: unknown[]; rowCount: number }>
  >(async (sql) => {
    if (sql.includes("SELECT s.call_id, scope.brand_id"))
      return { rows: [{ ...context }], rowCount: 1 };
    if (
      sql.includes("FROM voice.session s") &&
      sql.includes("LEFT JOIN voice.work_item")
    )
      return {
        rows: [
          {
            voice_session_id: session.voiceSessionId,
            call_id: session.callId,
            resource_scope_id: session.resourceScopeId,
            brand_id: context.brand_id,
            bound_order_id: context.bound_order_id,
          },
        ],
        rowCount: 1,
      };
    if (sql.includes("WITH candidate AS"))
      return {
        rows: [
          {
            work_id: "original-work",
            voice_session_id: session.voiceSessionId,
            work_type: "finalize_recording",
            dedupe_key: "finalize_recording:ai:original-session",
            lease_epoch: 1,
            attempt: 1,
            payload_ref: JSON.stringify({
              callId: "old-call",
              brandId: "old-wrong-brand",
              linkedOrderId: "unrelated-order",
            }),
          },
        ],
        rowCount: 1,
      };
    if (sql.includes("to_regclass"))
      return { rows: [{ exists: false }], rowCount: 1 };
    if (sql.includes("SELECT record FROM crm"))
      return { rows: [{ record: { callId: session.callId } }], rowCount: 1 };
    if (sql.includes("SELECT order_id FROM ops"))
      return { rows: [{ order_id: context.bound_order_id }], rowCount: 1 };
    return { rows: [{ work_id: "original-work" }], rowCount: 1 };
  });
  const repository = {
    isEnabled: () => true,
    findSessionById: async () => session,
    findAppliedMediaEpoch: async () => appliedMediaEpoch,
    casUpdateSessionControl: async (...args: [string, number, object]) => ({
      ...session,
      ...args[2],
      sessionVersion: 2,
    }),
    withTransaction: async (fn: (tx: { query: typeof query }) => unknown) =>
      fn({ query }),
  };
  const service = new VoiceSessionService(repository as never);
  const finalize = vi.fn<
    (params: { scope: { recordingId: string } }) => Promise<{
      recordingId: string;
      manifestRef: {
        objectKey: string;
        objectVersion: string;
        checksum: string;
        byteLength: number;
        durableAt: string;
      };
      verifiedAt: string;
    }>
  >(async (params) => ({
    // A trusted adapter finalizes and confirms the SAME recording it was
    // asked to -- the requested `scope.recordingId`, not an unrelated
    // identity (AUDIT-VOICE-APPLICATION-REGRESSION-20261018 review round 2
    // F3's scope/recordingId correlation requirement).
    recordingId: params.scope.recordingId,
    manifestRef: {
      objectKey: "simulation/manifest",
      objectVersion: "1",
      checksum: "simulation-checksum",
      byteLength: 4096,
      durableAt: new Date().toISOString(),
    },
    verifiedAt: new Date().toISOString(),
  }));
  const runner = new VoiceCommandRunnerService(
    { repository } as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    { finalizeRecording: finalize } as never,
  );
  return { session, context, query, service, runner, finalize };
}

describe("the original voice recording brand and order", () => {
  it.each([0, 7])(
    "retains applied media epoch%s when closing",
    async (epoch) => {
      const h = fixture(epoch);
      await h.service.closeSession(
        h.session.voiceSessionId,
        h.session.sessionVersion,
      );
      const event = h.query.mock.calls.find(([sql]) =>
        sql.includes("INSERT INTO voice.session_event"),
      );
      expect(event![1]![7]).toBe(epoch);
      expect(event![1]![4]).toBe(`session-close:${h.session.voiceSessionId}`);
    },
  );

  it("enqueues close work with the actual brand and the original bound order", async () => {
    const h = fixture();
    await h.service.closeSession(
      h.session.voiceSessionId,
      h.session.sessionVersion,
    );
    const call = h.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO voice.work_item"),
    );
    const payload = JSON.parse(String(call![1]![2]));
    expect(payload).toMatchObject({
      voiceSessionId: h.session.voiceSessionId,
      callId: h.session.callId,
      brandId: h.context.brand_id,
      linkedOrderId: h.context.bound_order_id,
    });
    expect(payload.brandId).not.toBe(h.session.resourceScopeId);
  });

  it("historical recovery retains the real brand and the same original order", async () => {
    const h = fixture();
    expect(await h.service.recoverPendingRecordingSessions()).toEqual({
      scanned: 1,
      enqueued: 1,
    });
    const call = h.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO voice.work_item"),
    );
    expect(JSON.parse(String(call![1]![2]))).toMatchObject({
      brandId: h.context.brand_id,
      linkedOrderId: "original-order",
    });
  });

  it("resolves old work from the current persisted session before invoking the recorder", async () => {
    const h = fixture();
    expect(
      await h.runner.runOnce({ supportedTypes: ["finalize_recording"] }),
    ).toMatchObject({ success: true });
    expect(h.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          brandId: "actual-brand",
          callId: "original-call",
          recordingId: "rec-original-call",
          legId: null,
        },
        linkedOrderId: "original-order",
      }),
    );
    const orderWrite = h.query.mock.calls.find(([sql]) =>
      sql.includes("UPDATE ops.phase1_owned_orders"),
    );
    expect(orderWrite![1]![0]).toBe("original-order");
  });

  it("links an order committed during external recording finalization at acknowledgement time", async () => {
    const h = fixture();
    h.context.bound_order_id = null;
    h.finalize.mockImplementationOnce(async (params) => {
      h.context.bound_order_id = "original-order";
      return {
        recordingId: params.scope.recordingId,
        manifestRef: {
          objectKey: "simulation/manifest",
          objectVersion: "1",
          checksum: "simulation-checksum",
          byteLength: 4096,
          durableAt: new Date().toISOString(),
        },
        verifiedAt: new Date().toISOString(),
      };
    });
    expect(
      await h.runner.runOnce({ supportedTypes: ["finalize_recording"] }),
    ).toMatchObject({ success: true });
    const orderWrite = h.query.mock.calls.find(([sql]) =>
      sql.includes("UPDATE ops.phase1_owned_orders"),
    );
    expect(orderWrite![1]![0]).toBe("original-order");
  });
});
