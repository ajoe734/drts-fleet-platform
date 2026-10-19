import { describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import {
  createVoiceBookingResultDelivery,
  type VoiceBookingResultMessage,
} from "../../../apps/api/src/modules/voice-booking/voice-booking-result-delivery";
import { VoiceCommandRunnerService } from "../../../apps/api/src/modules/voice-booking/voice-command-runner.service";

function fixture(options?: {
  rejected?: boolean;
  pending?: boolean;
  missingOrder?: boolean;
  noProvider?: boolean;
  noAudit?: boolean;
}) {
  const queries: string[] = [];
  const receipt = {
    commandId: "committed-command",
    brandId: "committed-brand",
    callId: "original-call",
    status: options?.pending
      ? "pending"
      : options?.rejected
        ? "rejected"
        : "succeeded",
    orderId: options?.rejected ? null : "original-order",
    errorCode: options?.rejected ? "BOOKING_REQUIREMENTS_INVALID" : null,
  };
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    if (sql.includes("WITH candidate AS"))
      return {
        rowCount: 1,
        rows: [
          {
            work_id: "notification-work",
            command_id: receipt.commandId,
            voice_session_id: "original-session",
            work_type: "notify_booking_result",
            dedupe_key: "committed-command:notify_booking_result",
            payload_ref: "ignored-payload",
            lease_epoch: 1,
            attempt: 1,
          },
        ],
      };
    if (sql.includes("to_regclass"))
      return { rowCount: 1, rows: [{ exists: false }] };
    if (sql.includes("SELECT tenant_id"))
      return {
        rowCount: options?.missingOrder ? 0 : 1,
        rows: options?.missingOrder ? [] : [{ tenant_id: "original-tenant" }],
      };
    return { rowCount: 1, rows: [{ work_id: "notification-work" }] };
  });
  const append = vi
    .fn<(record: unknown) => Promise<void>>()
    .mockResolvedValue(undefined);
  const audits = new AuditNotificationService({
    isEnabled: () => true,
    append,
  } as never);
  const simulation = createVoiceBookingResultDelivery({
    VOICE_BOOKING_RESULT_DELIVERY: "simulation",
  })!;
  const deliver = vi.fn((message: VoiceBookingResultMessage) =>
    simulation.deliver(message),
  );
  const commands = {
    repository: {
      findReceiptById: async () => receipt,
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
      options?.noAudit ? undefined : audits,
      options?.noProvider ? null : { provider: simulation.provider, deliver },
    );
  return { runner, receipt, queries, append, deliver };
}

const completed = (queries: string[]) =>
  queries.some((sql) => sql.includes("SET status = 'completed'"));

describe("deliver the committed voice booking result", () => {
  it("uses the original command and order, with an explicit simulated delivery receipt", async () => {
    const h = fixture();
    const result = await h.runner().runOnce();
    expect(result).toMatchObject({
      success: true,
      result: {
        status: "simulated",
        commandId: h.receipt.commandId,
        orderId: h.receipt.orderId,
        provider: "simulation",
        providerMessageId: "simulation:committed-command:notify_booking_result",
      },
    });
    expect(h.deliver).toHaveBeenCalledWith({
      idempotencyKey: "committed-command:notify_booking_result",
      commandId: h.receipt.commandId,
      voiceSessionId: "original-session",
      brandId: h.receipt.brandId,
      callId: h.receipt.callId,
      orderId: h.receipt.orderId,
      bookingStatus: "succeeded",
      errorCode: null,
    });
    expect(h.append).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: h.receipt.orderId,
        requestId: h.receipt.commandId,
        tenantId: "original-tenant",
        newValuesSummary: expect.objectContaining({
          deliveryStatus: "simulated",
          simulated: true,
        }),
      }),
    );
    expect(completed(h.queries)).toBe(true);
  });

  it("waits for delivery and canonical persistence before acknowledging work", async () => {
    const h = fixture();
    let acknowledgeDelivery!: () => void;
    let acknowledgeAudit!: () => void;
    h.deliver.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        acknowledgeDelivery = r;
      });
      return { status: "simulated", providerMessageId: "simulation:ack" };
    });
    h.append.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          acknowledgeAudit = r;
        }),
    );
    const pending = h.runner().runOnce();
    await vi.waitFor(() => expect(h.deliver).toHaveBeenCalledOnce());
    expect(h.append).not.toHaveBeenCalled();
    expect(completed(h.queries)).toBe(false);
    acknowledgeDelivery();
    await vi.waitFor(() => expect(h.append).toHaveBeenCalledOnce());
    expect(completed(h.queries)).toBe(false);
    acknowledgeAudit();
    expect(await pending).toMatchObject({ success: true });
  });

  it("replays the same delivery key and audit identity after a lost queue acknowledgement", async () => {
    const h = fixture();
    const first = h.runner();
    first.completeWorkItemWithDomainState = async () => {
      throw new Error("queue ACK lost");
    };
    expect(await first.runOnce()).toMatchObject({ success: false });
    expect(await h.runner().runOnce()).toMatchObject({ success: true });
    expect(h.deliver.mock.calls[0]![0]).toEqual(h.deliver.mock.calls[1]![0]);
    const rows = h.append.mock.calls.map(
      ([record]) => record as { auditId: string },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.auditId).toBe(rows[1]!.auditId);
  });

  it("records a rejected booking result without inventing an order", async () => {
    const h = fixture({ rejected: true });
    expect(await h.runner().runOnce()).toMatchObject({
      success: true,
      result: { orderId: null, status: "simulated" },
    });
    expect(h.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingStatus: "rejected",
        errorCode: h.receipt.errorCode,
        orderId: null,
      }),
    );
    expect(h.append).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: "voice_command",
        resourceId: h.receipt.commandId,
      }),
    );
    expect(h.queries.some((sql) => sql.includes("SELECT tenant_id"))).toBe(
      false,
    );
  });

  it("retries an unavailable delivery instead of returning a false success", async () => {
    const h = fixture();
    h.deliver.mockRejectedValueOnce(new Error("provider unavailable"));
    expect(await h.runner().runOnce()).toMatchObject({
      success: false,
      error: "provider unavailable",
    });
    expect(h.append).not.toHaveBeenCalled();
    expect(completed(h.queries)).toBe(false);
  });

  it("retries canonical persistence failure after delivery using the same key", async () => {
    const h = fixture();
    h.append.mockRejectedValueOnce(new Error("audit unavailable"));
    expect(await h.runner().runOnce()).toMatchObject({ success: false });
    expect(completed(h.queries)).toBe(false);
    expect(await h.runner().runOnce()).toMatchObject({ success: true });
    expect(h.deliver.mock.calls[0]![0].idempotencyKey).toBe(
      h.deliver.mock.calls[1]![0].idempotencyKey,
    );
  });

  it.each([
    { noProvider: true },
    { noAudit: true },
    { pending: true },
    { missingOrder: true },
  ])("leaves unready work retryable: %o", async (options) => {
    const h = fixture(options);
    expect(await h.runner().runOnce()).toMatchObject({ success: false });
    expect(h.deliver).not.toHaveBeenCalled();
    expect(h.append).not.toHaveBeenCalled();
    expect(completed(h.queries)).toBe(false);
  });

  it("requires explicit selection of the review simulation", () => {
    expect(createVoiceBookingResultDelivery({})).toBeNull();
    expect(
      createVoiceBookingResultDelivery({
        VOICE_BOOKING_RESULT_DELIVERY: "missing-real-provider",
      }),
    ).toBeNull();
  });
});
