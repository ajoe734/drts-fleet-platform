import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuditNotificationEmailAdapter,
  type AuditNotificationEmailMessage,
} from "../../../../apps/api/src/modules/audit-notification/audit-notification.email-adapter";
import type { ApprovalNotificationTemplateKey } from "../../../../apps/api/src/modules/audit-notification/templates/approval-notification.templates";
import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import {
  DeliveryTransportError,
  type MailTransport,
  type ProviderAcknowledgement,
  type TransportMessage,
} from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";

// This is a controlled receiver (an injected test transport), not a live
// SMTP/network integration; SR-NOTIFY-001's own suite carries that evidence.
describe("SR-MAIL-002 approval-notification email delivery", () => {
  let directory: string;
  let clock: number;
  const now = () => new Date(clock);

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "sr-mail-002-outbox-"));
    clock = Date.parse("2026-09-06T08:00:00.000Z");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function acknowledgement(
    id = "controlled-receiver-message-001",
  ): ProviderAcknowledgement {
    return {
      provider: "controlled-test-receiver",
      response: `250 Accepted as ${id}`,
      providerMessageId: id,
      acceptedAt: now().toISOString(),
    };
  }

  function acceptingTransport() {
    return {
      provider: "controlled-test-receiver",
      send: vi.fn(async (message: TransportMessage) => {
        void message;
        return acknowledgement();
      }),
    };
  }

  function deliveryService(transport: MailTransport | null = null) {
    return new NotificationDeliveryService(
      new FileMailOutbox(directory),
      transport,
      {
        now,
        maxAttempts: 3,
        retryDelayMs: 1_000,
        leaseMs: 1_000,
      },
    );
  }

  function message(
    overrides: Partial<AuditNotificationEmailMessage> = {},
  ): AuditNotificationEmailMessage {
    return {
      tenantId: "tenant-controlled-001",
      approvalRequestId: "approval-req-001",
      recipientUserId: "user-approver-001",
      recipientEmail: "approver@controlled-receiver.test",
      templateKey: "new_request",
      subject: "Approval required",
      body: "Please review booking BK-001",
      ...overrides,
    };
  }

  const TEMPLATE_KEYS: ApprovalNotificationTemplateKey[] = [
    "new_request",
    "approaching_timeout",
    "escalated",
    "approved",
    "rejected",
  ];

  it.each(TEMPLATE_KEYS)(
    "delivers the %s event to the correct tenant and recipient via the controlled receiver",
    async (templateKey) => {
      const transport = acceptingTransport();
      const adapter = new AuditNotificationEmailAdapter(
        deliveryService(transport),
      );
      const input = message({
        templateKey,
        approvalRequestId: `approval-${templateKey}`,
      });

      const record = await adapter.send(input);

      expect(transport.send).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          tenantId: input.tenantId,
          recipientEmail: input.recipientEmail,
          subject: input.subject,
          body: input.body,
        }),
      );
      expect(record).toMatchObject({
        tenantId: input.tenantId,
        recipientUserId: input.recipientUserId,
        recipientEmail: input.recipientEmail,
        templateKey,
        status: "sent",
        providerMessageId: "controlled-receiver-message-001",
        errorCode: null,
      });
      expect(record.sentAt).toBe(now().toISOString());
      expect(record.messageId).toMatch(/@notification\.drts\.invalid>$/);
    },
  );

  it("does not resend an event that already succeeded (idempotent retry)", async () => {
    const transport = acceptingTransport();
    const service = deliveryService(transport);
    const input = message();

    const first = await new AuditNotificationEmailAdapter(service).send(input);
    const retry = await new AuditNotificationEmailAdapter(service).send(input);

    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(retry).toMatchObject({
      status: "sent",
      deliveryId: first.deliveryId,
    });
    expect(retry.sentAt).toBe(first.sentAt);
  });

  it("scopes idempotent delivery identity to the tenant", async () => {
    const transport = acceptingTransport();
    const adapter = new AuditNotificationEmailAdapter(
      deliveryService(transport),
    );
    const tenantA = await adapter.send(message({ tenantId: "tenant-a" }));
    const tenantB = await adapter.send(message({ tenantId: "tenant-b" }));

    expect(tenantA.deliveryId).not.toBe(tenantB.deliveryId);
    expect(transport.send).toHaveBeenCalledTimes(2);
  });

  it("records a failed (never sent) status when the transport is unconfigured", async () => {
    const service = deliveryService(null);
    expect(service.availability()).toBe("unavailable");
    const adapter = new AuditNotificationEmailAdapter(service);

    const record = await adapter.send(message());

    expect(record.status).toBe("failed");
    expect(record.sentAt).toBeNull();
    expect(record.errorCode).toMatch(/unavailable/);
  });

  it("records an explicit unavailable status without touching storage when no delivery service is wired", async () => {
    const adapter = new AuditNotificationEmailAdapter(null);

    const record = await adapter.send(message());

    expect(record).toMatchObject({
      status: "unavailable",
      sentAt: null,
      messageId: null,
      errorCode: "notification_outbox_unavailable",
    });
  });

  it("surfaces a permanent provider rejection as failed and stops retrying", async () => {
    const transport = {
      provider: "controlled-test-receiver",
      send: vi.fn(async () => {
        throw new DeliveryTransportError("recipient_rejected", false);
      }),
    };
    const adapter = new AuditNotificationEmailAdapter(
      deliveryService(transport),
    );

    const record = await adapter.send(message());

    expect(record).toMatchObject({
      status: "failed",
      sentAt: null,
      errorCode: "recipient_rejected",
    });
  });

  it("never crashes the caller on an invalid recipient address and reports a bounded error code", async () => {
    const transport = acceptingTransport();
    const adapter = new AuditNotificationEmailAdapter(
      deliveryService(transport),
    );

    const record = await adapter.send(
      message({ recipientEmail: "not-a-valid-email" }),
    );

    expect(record.status).toBe("failed");
    expect(record.sentAt).toBeNull();
    expect(record.errorCode).toMatch(/^[a-z][a-z0-9_]{0,99}$/i);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("keeps arbitrary exception content out of the returned delivery record on failure", async () => {
    const service = deliveryService(acceptingTransport());
    const input = message();
    vi.spyOn(service, "enqueue").mockRejectedValueOnce(
      new Error(`storage exploded while writing ${input.body}`),
    );
    const adapter = new AuditNotificationEmailAdapter(service);

    const record = await adapter.send(input);

    expect(record.status).toBe("failed");
    expect(record.sentAt).toBeNull();
    expect(record.errorCode).toBe("audit_notification_email_adapter_error");
  });

  it("lists deliveries most-recent first without exposing mutation of internal state", async () => {
    const transport = acceptingTransport();
    const adapter = new AuditNotificationEmailAdapter(
      deliveryService(transport),
    );
    await adapter.send(message({ approvalRequestId: "approval-list-1" }));
    await adapter.send(message({ approvalRequestId: "approval-list-2" }));

    const listed = adapter.listDeliveries();
    expect(listed).toHaveLength(2);
    expect(listed[0]?.approvalRequestId).toBe("approval-list-2");
    listed[0]!.status = "unavailable";
    expect(adapter.listDeliveries()[0]?.status).toBe("sent");
  });
});
