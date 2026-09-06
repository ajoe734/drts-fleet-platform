import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditNotificationDeliveryService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.module";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";

describe("SR-MAIL-002 AuditNotificationModule delivery-service wiring", () => {
  const originalDirectory = process.env.NOTIFICATION_OUTBOX_DIRECTORY;
  const originalSmtpPort = process.env.MAILPIT_SMTP_PORT;
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "sr-mail-002-module-outbox-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
    if (originalDirectory === undefined) {
      delete process.env.NOTIFICATION_OUTBOX_DIRECTORY;
    } else {
      process.env.NOTIFICATION_OUTBOX_DIRECTORY = originalDirectory;
    }
    if (originalSmtpPort === undefined) {
      delete process.env.MAILPIT_SMTP_PORT;
    } else {
      process.env.MAILPIT_SMTP_PORT = originalSmtpPort;
    }
  });

  it("degrades to a disabled delivery service (no bootstrap crash) when the outbox directory is not configured", () => {
    delete process.env.NOTIFICATION_OUTBOX_DIRECTORY;

    expect(createAuditNotificationDeliveryService()).toBeNull();
  });

  it("wires a real durable NotificationDeliveryService once the outbox directory is configured", () => {
    process.env.NOTIFICATION_OUTBOX_DIRECTORY = directory;
    delete process.env.MAILPIT_SMTP_PORT;

    const service = createAuditNotificationDeliveryService();

    expect(service).toBeInstanceOf(NotificationDeliveryService);
    // No MAILPIT_SMTP_PORT configured: the transport stays unavailable rather
    // than silently defaulting to a guessed provider.
    expect(service!.availability()).toBe("unavailable");
  });

  it("attaches the SMTP transport when MAILPIT_SMTP_PORT is also configured", () => {
    process.env.NOTIFICATION_OUTBOX_DIRECTORY = directory;
    process.env.MAILPIT_SMTP_PORT = "1025";

    const service = createAuditNotificationDeliveryService();

    expect(service!.availability()).toBe("available");
  });
});
