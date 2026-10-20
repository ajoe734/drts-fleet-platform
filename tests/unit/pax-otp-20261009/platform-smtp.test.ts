import { describe, expect, it, vi } from "vitest";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { RemoteSmtpMailTransport } from "../../../apps/api/src/modules/notification-delivery/remote-smtp-mail.transport";

// Only the external SMTP library is replaced. Both production services execute.
describe("platform OTP through production remote SMTP adapter", () => {
  it("uses the configured sender, one recipient and Traditional Chinese content without exposing provider echoes", async () => {
    const smtp = { sendMail: vi.fn(), createTransport: vi.fn() };
    smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail });
    smtp.sendMail.mockResolvedValueOnce({
      response: "250 2.0.0 queued as code-123456",
      accepted: ["passenger@example.test"],
      rejected: [],
    });
    const transport = new RemoteSmtpMailTransport(
      {
        REMOTE_SMTP_HOST: "smtp.example.test",
        REMOTE_SMTP_PORT: "465",
        REMOTE_SMTP_USERNAME: "unit-user",
        REMOTE_SMTP_PASSWORD: "unit-password",
        REMOTE_SMTP_FROM_EMAIL: "verified-sender@example.test",
        REMOTE_SMTP_RECIPIENT_ALLOWLIST: "passenger@example.test",
        DRTS_ENV: "development",
      },
      smtp.createTransport as never,
    );
    expect(smtp.createTransport).toHaveBeenCalledOnce();
    const outbox = {
      transaction: vi.fn(async () => {
        throw new Error("platform code must not persist");
      }),
    };
    const delivery = new NotificationDeliveryService(outbox, transport);
    expect(
      await delivery.sendPlatformMail({
        recipientEmail: "passenger@example.test",
        fromEmail: "verified-sender@example.test",
        subject: "智行叫車驗證碼",
        body: "驗證碼：123456\n有效時間：5 分鐘。",
      }),
    ).toEqual({ status: "sent" });
    expect(smtp.sendMail).toHaveBeenCalledWith({
      from: "verified-sender@example.test",
      to: "passenger@example.test",
      envelope: {
        from: "verified-sender@example.test",
        to: ["passenger@example.test"],
      },
      subject: "智行叫車驗證碼",
      text: "驗證碼：123456\n有效時間：5 分鐘。",
      messageId: expect.stringMatching(/^<.*@notification.drts.invalid>$/),
    });
    expect(outbox.transaction).not.toHaveBeenCalled();
    expect(smtp.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: true,
        requireTLS: true,
        logger: false,
        debug: false,
        tls: expect.objectContaining({
          rejectUnauthorized: true,
          minVersion: "TLSv1.2",
        }),
      }),
    );
  });
});
