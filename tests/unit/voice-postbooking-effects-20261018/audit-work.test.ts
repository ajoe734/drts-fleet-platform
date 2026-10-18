import { describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { VoiceCommandRunnerService } from "../../../apps/api/src/modules/voice-booking/voice-command-runner.service";

function work(options?: {
  missingIntent?: boolean;
  rejected?: boolean;
  noPublisher?: boolean;
}) {
  const queries: string[] = [];
  const intent = {
    order_id: "original-booking-order",
    tenant_id: null,
    record: {
      action: "voice.booking.created",
      actorType: "voice_agent",
      actorId: "original-voice-actor",
      brandId: "original-brand",
      resourceScopeId: "original-resource-scope",
      snapshotHash: "committed-snapshot-hash",
    },
  };
  const append = vi
    .fn<(record: unknown) => Promise<void>>()
    .mockResolvedValue(undefined);
  const audits = new AuditNotificationService({
    isEnabled: () => true,
    append,
  } as never);
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    if (sql.includes("WITH candidate AS"))
      return {
        rowCount: 1,
        rows: [
          {
            work_id: "audit-work",
            command_id: "original-command",
            voice_session_id: "original-session",
            work_type: "publish_booking_audit",
            dedupe_key: "original-command:publish_booking_audit",
            payload_ref: "untrusted-irrelevant-payload",
            lease_epoch: 1,
            attempt: 1,
          },
        ],
      };
    if (sql.includes("to_regclass"))
      return { rowCount: 1, rows: [{ exists: false }] };
    if (sql.includes("FROM voice.booking_audit_intent"))
      return {
        rowCount: options?.missingIntent ? 0 : 1,
        rows: options?.missingIntent ? [] : [intent],
      };
    return { rowCount: 1, rows: [{ work_id: "audit-work" }] };
  });
  const receipt = {
    commandId: "original-command",
    orderId: intent.order_id,
    status: options?.rejected ? "rejected" : "succeeded",
  };
  const commands = {
    repository: {
      findReceiptById: vi.fn(async () => receipt),
      withTransaction: async (fn: (tx: { query: typeof query }) => unknown) =>
        fn({ query }),
    },
  };
  const runner = () =>
    new VoiceCommandRunnerService(
      commands as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      options?.noPublisher ? undefined : audits,
    );
  return { runner, queries, append, receipt, intent, commands };
}

const completed = (queries: string[]) =>
  queries.some((sql) => sql.includes("SET status = 'completed'"));

describe("publish the original committed voice booking audit", () => {
  it("publishes the immutable intent into the original canonical audit sink", async () => {
    const h = work();
    const result = await h.runner().runOnce();
    expect(result).toMatchObject({
      success: true,
      result: {
        status: "published",
        commandId: h.receipt.commandId,
        orderId: h.receipt.orderId,
      },
    });
    expect(h.append).toHaveBeenCalledOnce();
    expect(h.append).toHaveBeenCalledWith(
      expect.objectContaining({
        auditId: (result!.result as { auditId: string }).auditId,
        moduleName: "voice_booking",
        resourceId: h.receipt.orderId,
        requestId: h.receipt.commandId,
        newValuesSummary: expect.objectContaining(h.intent.record),
      }),
    );
    expect(completed(h.queries)).toBe(true);
  });

  it("waits for the canonical persistence acknowledgement before completing work", async () => {
    const h = work();
    let resolve!: () => void;
    h.append.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const pending = h.runner().runOnce();
    await vi.waitFor(() => expect(h.append).toHaveBeenCalledOnce());
    expect(completed(h.queries)).toBe(false);
    resolve();
    expect(await pending).toMatchObject({ success: true });
    expect(completed(h.queries)).toBe(true);
  });

  it("reuses the original audit identity after a lost queue acknowledgement", async () => {
    const h = work();
    const first = h.runner();
    first.completeWorkItemWithDomainState = async () => {
      throw new Error("injected queue ACK loss");
    };
    expect(await first.runOnce()).toMatchObject({ success: false });
    const second = await h.runner().runOnce();
    expect(second).toMatchObject({ success: true });
    const records = h.append.mock.calls.map(([r]) => r as { auditId: string });
    expect(records).toHaveLength(2);
    expect(records[0]!.auditId).toBe(records[1]!.auditId);
    // This unit proves stable sink identity; real PostgreSQL deduplication is
    // exercised separately rather than emulated as durable storage here.
  });

  it("leaves work retryable when the audit sink fails", async () => {
    const h = work();
    h.append.mockRejectedValueOnce(
      new Error("injected canonical audit outage"),
    );
    expect(await h.runner().runOnce()).toMatchObject({
      success: false,
      error: "injected canonical audit outage",
    });
    expect(completed(h.queries)).toBe(false);
  });

  it("does not publish when the original immutable intent is missing", async () => {
    const h = work({ missingIntent: true });
    expect(await h.runner().runOnce()).toMatchObject({
      success: false,
      error: "Committed booking audit intent unavailable",
    });
    expect(h.append).not.toHaveBeenCalled();
    expect(completed(h.queries)).toBe(false);
  });

  it.each([{ rejected: true }, { noPublisher: true }])(
    "does not complete unavailable publishing: %o",
    async (options) => {
      const h = work(options);
      expect(await h.runner().runOnce()).toMatchObject({ success: false });
      expect(h.append).not.toHaveBeenCalled();
      expect(completed(h.queries)).toBe(false);
    },
  );
});
