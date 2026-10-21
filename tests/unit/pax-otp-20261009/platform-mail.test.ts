import { describe, expect, it, vi } from "vitest";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import type {
  OutboxState,
  PlatformMail,
  ProviderAcknowledgement,
  OutgoingMailMessage,
} from "../../../apps/api/src/modules/notification-delivery/notification-delivery.types";

const mail: PlatformMail = {
  recipientEmail: "passenger@example.test",
  fromEmail: "sender@example.test",
  subject: "智行叫車驗證碼",
  body: "驗證碼：123456\n有效時間：5 分鐘。",
};
function fixture() {
  const state: OutboxState = { version: 1, deliveries: {} };
  const outbox = {
    transaction: async <T>(operation: (s: OutboxState) => T): Promise<T> =>
      operation(state),
  };
  vi.spyOn(outbox, "transaction");
  const transport = {
    provider: "stub",
    send: vi.fn(
      async (
        message: OutgoingMailMessage,
      ): Promise<ProviderAcknowledgement> => {
        void message;
        return {
          provider: "stub",
          response: "250 accepted",
          providerMessageId: "provider-id",
          acceptedAt: new Date().toISOString(),
        };
      },
    ),
  };
  return {
    state,
    outbox,
    transport,
    service: new NotificationDeliveryService(outbox, {
      ...transport,
      sendPlatform: transport.send,
    }),
  };
}
describe("platform mail addition through existing notification service", () => {
  it("keeps legacy tenant-only adapters available without enabling platform mail", async () => {
    const f = fixture();
    const tenantOnly = new NotificationDeliveryService(f.outbox, f.transport);
    expect(tenantOnly.availability()).toBe("available");
    expect(tenantOnly.platformAvailability()).toBe("unavailable");
    expect(await tenantOnly.sendPlatformMail(mail)).toEqual({
      status: "unavailable",
    });
    expect(f.transport.send).not.toHaveBeenCalled();
  });
  it("uses a null tenant on the existing transport, accepts provider acknowledgement and retains no secret", async () => {
    const f = fixture();
    const response = await f.service.sendPlatformMail(mail);
    expect(response).toEqual({ status: "sent" });
    expect(f.transport.send).toHaveBeenCalledWith({
      ...mail,
      tenantId: null,
      idempotencyKey: expect.any(String),
      deliveryId: expect.any(String),
      messageId: expect.stringMatching(/^<.*@notification.drts.invalid>$/),
    });
    expect(f.outbox.transaction).not.toHaveBeenCalled();
    expect(f.state.deliveries).toEqual({});
    expect(JSON.stringify(response)).not.toContain("123456");
    expect(JSON.stringify(response)).not.toContain("provider-id");
  });
  it("does not disclose echoed OTP codes in acknowledgement fields or thrown errors", async () => {
    const f = fixture();
    f.transport.send.mockResolvedValueOnce({
      provider: "stub",
      response: "250 code 123456",
      providerMessageId: "123456",
      acceptedAt: new Date().toISOString(),
    });
    expect(await f.service.sendPlatformMail(mail)).toEqual({ status: "sent" });
    f.transport.send.mockRejectedValueOnce(new Error("provider code 123456"));
    expect(await f.service.sendPlatformMail(mail)).toEqual({
      status: "failed",
    });
    expect(f.state.deliveries).toEqual({});
  });
  it.each([
    {
      provider: "wrong",
      response: "250 ok",
      providerMessageId: null,
      acceptedAt: new Date().toISOString(),
    },
    {
      provider: "stub",
      response: "",
      providerMessageId: null,
      acceptedAt: new Date().toISOString(),
    },
    {
      provider: "stub",
      response: "250 ok",
      providerMessageId: null,
      acceptedAt: "invalid",
    },
  ])("rejects malformed or unrelated acknowledgements: %j", async (ack) => {
    const f = fixture();
    f.transport.send.mockResolvedValueOnce(ack);
    expect(await f.service.sendPlatformMail(mail)).toEqual({
      status: "failed",
    });
  });
  it("returns unavailable without a transport and rejects header injection before sending", async () => {
    const f = fixture();
    expect(
      await new NotificationDeliveryService(f.outbox).sendPlatformMail(mail),
    ).toEqual({ status: "unavailable" });
    for (const invalid of [
      { ...mail, recipientEmail: "bad\r\nBcc: bad@example.test" },
      { ...mail, subject: "bad\nsubject" },
    ])
      expect(await f.service.sendPlatformMail(invalid)).toEqual({
        status: "failed",
      });
    expect(f.transport.send).not.toHaveBeenCalled();
  });
  it("preserves tenant-scoped validation, idempotency, authorization, persisted receipts and drain after platform sending", async () => {
    const f = fixture();
    await f.service.sendPlatformMail(mail);
    const input = {
      ...mail,
      tenantId: "tenant-unit",
      idempotencyKey: "unit-key",
      body: "Existing tenant mail",
    };
    const first = await f.service.enqueue(input);
    expect(await f.service.enqueue(input)).toEqual(first);
    expect(await f.service.get("tenant-other", first.deliveryId)).toBeNull();
    expect(
      await f.service.dispatch("tenant-other", first.deliveryId),
    ).toBeNull();
    await expect(
      f.service.enqueue({ ...input, tenantId: null as never }),
    ).rejects.toThrow("notification_invalid_identity");
    await expect(
      f.service.enqueue({ ...input, body: "changed" }),
    ).rejects.toThrow("notification_idempotency_conflict");
    const receipts = await f.service.drain();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      status: "sent",
      tenantId: "tenant-unit",
      attempts: [{ outcome: "sent" }],
    });
    expect(f.transport.send).toHaveBeenLastCalledWith({
      ...input,
      deliveryId: first.deliveryId,
      messageId: first.messageId,
    });
    expect(Object.keys(f.state.deliveries)).toEqual([first.deliveryId]);
    expect(JSON.stringify(receipts[0])).not.toContain("Existing tenant mail");
  });
});
