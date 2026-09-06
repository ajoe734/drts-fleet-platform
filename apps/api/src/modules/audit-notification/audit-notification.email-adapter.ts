import { Injectable, Logger, Optional } from "@nestjs/common";

import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";

import type { ApprovalNotificationTemplateKey } from "./templates/approval-notification.templates";

const DEFAULT_FROM_EMAIL = "notifications@notification.drts.invalid";
const SAFE_ERROR_CODE = /^[a-z][a-z0-9_]{0,99}$/i;

export type AuditNotificationEmailMessage = {
  tenantId: string;
  approvalRequestId: string;
  recipientUserId: string;
  recipientEmail: string;
  templateKey: ApprovalNotificationTemplateKey;
  subject: string;
  body: string;
  requestId?: string;
};

/** "sent" is the only status that reflects a real, acknowledged provider send. */
export type AuditNotificationEmailDeliveryStatus =
  | "sent"
  | "queued"
  | "failed"
  | "unavailable";

export type AuditNotificationEmailDeliveryRecord = Omit<
  AuditNotificationEmailMessage,
  "requestId"
> & {
  requestId?: string;
  deliveryId: string;
  messageId: string | null;
  status: AuditNotificationEmailDeliveryStatus;
  sentAt: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
};

function toApprovalNotificationIdempotencyKey(
  message: AuditNotificationEmailMessage,
) {
  return `approval-notification:${message.approvalRequestId}:${message.templateKey}:${message.recipientUserId}`;
}

function toSafeErrorCode(error: unknown): string {
  const code =
    error instanceof Error && SAFE_ERROR_CODE.test(error.message)
      ? error.message
      : null;
  return code ?? "audit_notification_email_adapter_error";
}

/**
 * Bridges approval-notification email traffic to the shared durable
 * NotificationDeliveryService (SR-NOTIFY-001). A missing/unconfigured
 * delivery service degrades to an explicit "unavailable" record instead of
 * failing module bootstrap or fabricating a delivered outcome.
 */
@Injectable()
export class AuditNotificationEmailAdapter {
  private readonly logger = new Logger(AuditNotificationEmailAdapter.name);

  private deliveries: AuditNotificationEmailDeliveryRecord[] = [];

  constructor(
    @Optional()
    private readonly deliveryService: NotificationDeliveryService | null = null,
  ) {}

  async send(
    message: AuditNotificationEmailMessage,
  ): Promise<AuditNotificationEmailDeliveryRecord> {
    const base = {
      tenantId: message.tenantId,
      approvalRequestId: message.approvalRequestId,
      recipientUserId: message.recipientUserId,
      recipientEmail: message.recipientEmail,
      templateKey: message.templateKey,
      subject: message.subject,
      body: message.body,
      ...(message.requestId ? { requestId: message.requestId } : {}),
    };

    const record = await this.deliver(message, base);
    this.deliveries = [record, ...this.deliveries];
    return { ...record };
  }

  private async deliver(
    message: AuditNotificationEmailMessage,
    base: Omit<
      AuditNotificationEmailDeliveryRecord,
      | "deliveryId"
      | "messageId"
      | "status"
      | "sentAt"
      | "providerMessageId"
      | "errorCode"
    >,
  ): Promise<AuditNotificationEmailDeliveryRecord> {
    if (!this.deliveryService) {
      this.logger.warn(
        `Approval notification email is unavailable for ${message.templateKey} approval request ${message.approvalRequestId}; the notification outbox is not configured.`,
      );
      return {
        ...base,
        deliveryId: `unavailable-${toApprovalNotificationIdempotencyKey(message)}`,
        messageId: null,
        status: "unavailable",
        sentAt: null,
        providerMessageId: null,
        errorCode: "notification_outbox_unavailable",
      };
    }

    try {
      const idempotencyKey = toApprovalNotificationIdempotencyKey(message);
      const queued = await this.deliveryService.enqueue({
        tenantId: message.tenantId,
        idempotencyKey,
        recipientEmail: message.recipientEmail,
        fromEmail:
          process.env.NOTIFICATION_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL,
        subject: message.subject,
        body: message.body,
      });

      // An already "sent" receipt (a same-key retry) must never be re-dispatched.
      const receipt =
        queued.status === "sent"
          ? queued
          : ((await this.deliveryService.dispatch(
              message.tenantId,
              queued.deliveryId,
            )) ?? queued);

      const lastAttempt = receipt.attempts.at(-1) ?? null;
      return {
        ...base,
        deliveryId: receipt.deliveryId,
        messageId: receipt.messageId,
        status: receipt.status,
        sentAt: receipt.sentAt,
        providerMessageId:
          lastAttempt?.acknowledgement?.providerMessageId ?? null,
        errorCode:
          receipt.status === "sent" ? null : (lastAttempt?.errorCode ?? null),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Approval notification email delivery failed for ${message.templateKey} approval request ${message.approvalRequestId}: ${detail}`,
      );
      return {
        ...base,
        deliveryId: `error-${toApprovalNotificationIdempotencyKey(message)}`,
        messageId: null,
        status: "failed",
        sentAt: null,
        providerMessageId: null,
        errorCode: toSafeErrorCode(error),
      };
    }
  }

  listDeliveries() {
    return this.deliveries.map((delivery) => ({ ...delivery }));
  }
}
