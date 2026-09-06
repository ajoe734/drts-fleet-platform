import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditNotificationEmailAdapter } from "../../../../apps/api/src/modules/audit-notification/audit-notification.email-adapter";
import {
  AuditNotificationService,
  type ApprovalNotificationRecipient,
} from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { ApprovalNotificationTemplateKey } from "../../../../apps/api/src/modules/audit-notification/templates/approval-notification.templates";
import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import {
  DeliveryTransportError,
  type MailTransport,
  type ProviderAcknowledgement,
  type TransportMessage,
} from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";

describe("SR-MAIL-002 AuditNotificationService.dispatchApprovalNotification", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "sr-mail-002-service-outbox-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function acceptingTransport() {
    const ack: ProviderAcknowledgement = {
      provider: "controlled-test-receiver",
      response: "250 Accepted as controlled-receiver-001",
      providerMessageId: "controlled-receiver-001",
      acceptedAt: new Date().toISOString(),
    };
    return {
      provider: "controlled-test-receiver",
      send: vi.fn(async (message: TransportMessage) => {
        void message;
        return ack;
      }),
    };
  }

  function serviceWithTransport(transport: MailTransport | null) {
    const delivery = new NotificationDeliveryService(
      new FileMailOutbox(directory),
      transport,
    );
    const adapter = new AuditNotificationEmailAdapter(delivery);
    return new AuditNotificationService(undefined, adapter);
  }

  const recipient = (
    overrides: Partial<ApprovalNotificationRecipient> = {},
  ): ApprovalNotificationRecipient => ({
    userId: "user-approver-001",
    email: "approver@controlled-receiver.test",
    displayName: "Approver One",
    approvalNotificationOptOut: false,
    ...overrides,
  });

  const optedOut = recipient({
    userId: "user-approver-002",
    email: "opted-out@controlled-receiver.test",
    approvalNotificationOptOut: true,
  });

  function baseInput(
    templateKey: ApprovalNotificationTemplateKey,
    approvalRequestId: string,
  ) {
    return {
      templateKey,
      tenantId: "tenant-controlled-001",
      approvalRequestId,
      bookingId: "BK-001",
      orderId: "ORD-001",
      timeoutAt: "2026-09-07T00:00:00.000Z",
      recipients: [recipient(), optedOut],
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
    "dispatches the %s event to the correct tenant/recipient and records real email delivery separately from in-app",
    async (templateKey) => {
      const transport = acceptingTransport();
      const service = serviceWithTransport(transport);
      const approvalRequestId = `approval-${templateKey}`;

      const result = await service.dispatchApprovalNotification(
        baseInput(templateKey, approvalRequestId),
      );

      expect(result.deduplicated).toBe(false);
      expect(result.deliveredToUserIds).toEqual(["user-approver-001"]);
      expect(result.skippedUserIds).toEqual(["user-approver-002"]);
      expect(transport.send).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          tenantId: "tenant-controlled-001",
          recipientEmail: "approver@controlled-receiver.test",
        }),
      );

      expect(
        service
          .listNotifications()
          .some(
            (notification) =>
              notification.tenantId === "tenant-controlled-001" &&
              notification.recipientUserId === "user-approver-001" &&
              notification.channel === "tenant_approval",
          ),
      ).toBe(true);

      const auditLog = service
        .getAuditLogsSnapshot()
        .find(
          (log) =>
            log.actionName === `approval_notification.${templateKey}` &&
            log.resourceId === approvalRequestId,
        );
      expect(auditLog).toBeDefined();
      const summary = auditLog!.newValuesSummary as Record<string, unknown>;
      expect(summary.inApp).toEqual({ delivered: 1 });
      expect(summary.email).toMatchObject({
        attempted: 1,
        sent: 1,
        failed: 0,
        unavailable: 0,
      });
      expect(
        (summary.email as { recipients: Array<Record<string, unknown>> })
          .recipients,
      ).toEqual([
        expect.objectContaining({
          userId: "user-approver-001",
          status: "sent",
          errorCode: null,
        }),
      ]);
    },
  );

  it("deduplicates a repeated event and never re-sends the email", async () => {
    const transport = acceptingTransport();
    const service = serviceWithTransport(transport);
    const input = baseInput("new_request", "approval-dedup-001");

    const first = await service.dispatchApprovalNotification(input);
    const second = await service.dispatchApprovalNotification(input);

    expect(first.deduplicated).toBe(false);
    expect(second).toEqual({
      deduplicated: true,
      deliveredToUserIds: [],
      skippedUserIds: [],
    });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it("does not write an audit record claiming delivery when the transport is unconfigured", async () => {
    const service = serviceWithTransport(null);
    const approvalRequestId = "approval-unconfigured-001";

    const result = await service.dispatchApprovalNotification(
      baseInput("new_request", approvalRequestId),
    );

    expect(result.deliveredToUserIds).toEqual(["user-approver-001"]);
    const auditLog = service
      .getAuditLogsSnapshot()
      .find((log) => log.resourceId === approvalRequestId);
    const summary = auditLog!.newValuesSummary as Record<string, unknown>;
    expect(summary.email).toMatchObject({ attempted: 1, sent: 0, failed: 1 });
    expect(
      (summary.email as { recipients: Array<Record<string, unknown>> })
        .recipients[0],
    ).toMatchObject({ status: "failed" });
  });

  it("does not write an audit record claiming delivery when the provider permanently fails", async () => {
    const transport = {
      provider: "controlled-test-receiver",
      send: vi.fn(async () => {
        throw new DeliveryTransportError("recipient_rejected", false);
      }),
    };
    const service = serviceWithTransport(transport);
    const approvalRequestId = "approval-failed-001";

    await service.dispatchApprovalNotification(
      baseInput("new_request", approvalRequestId),
    );

    const auditLog = service
      .getAuditLogsSnapshot()
      .find((log) => log.resourceId === approvalRequestId);
    const summary = auditLog!.newValuesSummary as Record<string, unknown>;
    expect(summary.email).toMatchObject({ sent: 0, failed: 1 });
  });

  it("records an unavailable (not delivered) status when no delivery service is wired at all", async () => {
    const service = new AuditNotificationService(
      undefined,
      new AuditNotificationEmailAdapter(null),
    );
    const approvalRequestId = "approval-no-adapter-001";

    await service.dispatchApprovalNotification(
      baseInput("new_request", approvalRequestId),
    );

    const auditLog = service
      .getAuditLogsSnapshot()
      .find((log) => log.resourceId === approvalRequestId);
    const summary = auditLog!.newValuesSummary as Record<string, unknown>;
    expect(summary.email).toMatchObject({
      attempted: 1,
      sent: 0,
      unavailable: 1,
    });
  });
});
