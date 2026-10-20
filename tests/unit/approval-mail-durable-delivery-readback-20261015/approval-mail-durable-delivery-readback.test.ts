import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IdentityContext } from "@drts/contracts";

import { AuditNotificationEmailAdapter } from "../../../apps/api/src/modules/audit-notification/audit-notification.email-adapter";
import {
  AuditNotificationService,
  type ApprovalNotificationRecipient,
} from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { ApprovalNotificationTemplateKey } from "../../../apps/api/src/modules/audit-notification/templates/approval-notification.templates";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { FileMailOutbox } from "../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import type {
  MailOutbox,
  MailTransport,
  OutboxState,
  ProviderAcknowledgement,
  TransportMessage,
} from "../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const TENANT_A = "tenant-approval-mail-readback-a";

function identity(overrides: Partial<IdentityContext> = {}): IdentityContext {
  return {
    authMode: "jwt_bearer",
    actorType: "tenant_admin",
    actorId: "actor-1",
    realm: "tenant",
    tenantId: TENANT_A,
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["tenant:read"],
    supportedExecutionModes: ["discussion_planning"],
    ...overrides,
  };
}

function acceptingTransport(): MailTransport {
  const ack: ProviderAcknowledgement = {
    provider: "controlled-test-receiver",
    response: "250 Accepted as controlled-receiver-approval-001",
    providerMessageId: "controlled-receiver-approval-001",
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

const recipient = (
  overrides: Partial<ApprovalNotificationRecipient> = {},
): ApprovalNotificationRecipient => ({
  userId: "user-approver-001",
  email: "approver@controlled-receiver.test",
  displayName: "Approver One",
  approvalNotificationOptOut: false,
  ...overrides,
});

function baseInput(
  templateKey: ApprovalNotificationTemplateKey,
  approvalRequestId: string,
) {
  return {
    templateKey,
    tenantId: TENANT_A,
    approvalRequestId,
    bookingId: "BK-001",
    orderId: "ORD-001",
    timeoutAt: "2026-09-07T00:00:00.000Z",
    recipients: [recipient()],
  };
}

function createTenantPartnerService(
  notificationDeliveryService: NotificationDeliveryService,
) {
  return new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    new IdentityRepository(),
    new IdentityRepository(),
    undefined,
    notificationDeliveryService,
  );
}

describe("APPROVAL-MAIL-DURABLE-DELIVERY-READBACK-20261015 approval-notification mail durable delivery readback", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(
      join(tmpdir(), "approval-mail-durable-delivery-readback-"),
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it(
    "preserves the real deliveryId through AuditNotificationService's per-recipient audit and the TenantPartnerService " +
      "mail receipt readback when a successful provider ACK cannot be persisted",
    async () => {
      // Wraps a real FileMailOutbox: transaction #1 (enqueue) and #2
      // (dispatch's claim) commit for real, then injects a single transient
      // failure on transaction #3 -- dispatch's post-send ack-persistence
      // commit, after the provider has already accepted the message. Before
      // the fix, AuditNotificationEmailAdapter's single try/catch collapsed
      // this into a synthetic `error-...` id that the readback endpoint can
      // never resolve, even though the outbox already holds a durable,
      // queryable record for the real send.
      let transactionCount = 0;
      const realOutbox = new FileMailOutbox(directory);
      const flakyOutbox: MailOutbox = {
        async transaction<T>(operation: (state: OutboxState) => T): Promise<T> {
          transactionCount += 1;
          if (transactionCount === 3) {
            throw new Error("notification_outbox_transient_failure");
          }
          return realOutbox.transaction(operation);
        },
      };
      const transport = acceptingTransport();
      const notificationDeliveryService = new NotificationDeliveryService(
        flakyOutbox,
        transport,
      );
      const adapter = new AuditNotificationEmailAdapter(
        notificationDeliveryService,
      );
      const auditService = new AuditNotificationService(undefined, adapter);
      const approvalRequestId = "approval-ack-persist-failure-001";

      const result = await auditService.dispatchApprovalNotification(
        baseInput("new_request", approvalRequestId),
      );

      expect(transactionCount).toBe(3);
      expect(transport.send).toHaveBeenCalledTimes(1);
      // The in-app side is unaffected and still records delivery.
      expect(result.deliveredToUserIds).toEqual(["user-approver-001"]);

      const auditLog = auditService
        .getAuditLogsSnapshot()
        .find((log) => log.resourceId === approvalRequestId);
      expect(auditLog).toBeDefined();
      const summary = auditLog!.newValuesSummary as Record<string, unknown>;
      const emailRecipients = (
        summary.email as { recipients: Array<Record<string, unknown>> }
      ).recipients;
      expect(emailRecipients).toHaveLength(1);
      const recorded = emailRecipients[0]!;

      // The defect: a synthetic, never-queryable id discarded the real one
      // and falsely claimed "failed" for an outcome the provider never
      // rejected (it was accepted; only persisting that fact failed).
      expect(recorded.status).not.toBe("sent");
      expect(recorded.status).not.toBe("failed");
      expect(recorded.deliveryId).toMatch(/^[0-9a-f-]{36}$/);
      expect(recorded.deliveryId).not.toMatch(/^error-/);

      // The real test: the deliveryId audited for this approval request
      // resolves through the production TenantPartnerService readback
      // endpoint, not just through the raw outbox.
      const tenantPartnerService = createTenantPartnerService(
        notificationDeliveryService,
      );
      const receipt = await tenantPartnerService.getMailDeliveryReceipt(
        TENANT_A,
        recorded.deliveryId as string,
        "req-read-after-ack-failure",
        identity(),
      );
      expect(receipt).not.toBeNull();
      expect(receipt!.status).toBe("queued");
      expect(receipt!.attempts).toHaveLength(1);
      expect(receipt!.attempts[0]!.outcome).toBe("started");
      expect(receipt!.attempts[0]!.acknowledgement).toBeNull();
    },
  );
});
