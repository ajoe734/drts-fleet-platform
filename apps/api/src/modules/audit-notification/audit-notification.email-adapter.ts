import { randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";

import type { ApprovalNotificationTemplateKey } from "./templates/approval-notification.templates";

export type AuditNotificationEmailMessage = {
  tenantId: string;
  recipientUserId: string;
  recipientEmail: string;
  templateKey: ApprovalNotificationTemplateKey;
  subject: string;
  body: string;
  requestId?: string;
};

export type AuditNotificationEmailDeliveryRecord =
  AuditNotificationEmailMessage & {
    deliveryId: string;
    sentAt: string;
  };

@Injectable()
export class AuditNotificationEmailAdapter {
  private readonly logger = new Logger(AuditNotificationEmailAdapter.name);

  private deliveries: AuditNotificationEmailDeliveryRecord[] = [];

  async send(message: AuditNotificationEmailMessage) {
    const delivery: AuditNotificationEmailDeliveryRecord = {
      ...message,
      deliveryId: `email-${randomUUID()}`,
      sentAt: new Date().toISOString(),
    };

    this.deliveries = [delivery, ...this.deliveries];
    this.logger.log(
      `Queued approval notification email ${delivery.deliveryId} to ${delivery.recipientEmail}`,
    );

    return { ...delivery };
  }

  listDeliveries() {
    return this.deliveries.map((delivery) => ({ ...delivery }));
  }
}
