import { Injectable, Logger, Optional } from "@nestjs/common";

import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import type { DeliveryStatus } from "../notification-delivery/notification-delivery.types";

export type TenantInvitationDeliveryRequest = {
  invitationId: string;
  tenantId: string;
  recipientEmail: string;
  displayName: string;
  expiresAt: string;
  rawToken: string;
};

/** "sent" is the only status that reflects a real, acknowledged provider send. */
export type TenantInvitationDeliveryStatus = DeliveryStatus | "unavailable";

export type TenantInvitationDeliveryRecord = Omit<
  TenantInvitationDeliveryRequest,
  "rawToken"
> & {
  deliveryId: string;
  messageId: string | null;
  status: TenantInvitationDeliveryStatus;
  sentAt: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  retryable: boolean;
};

const DEFAULT_FROM_EMAIL = "tenant-invitations@notification.drts.invalid";
const SAFE_ERROR_CODE = /^[a-z][a-z0-9_]{0,99}$/i;

function toInvitationIdempotencyKey(invitationId: string): string {
  return `tenant-invitation:${invitationId}`;
}

function toSafeErrorCode(error: unknown): string {
  const code =
    error instanceof Error && SAFE_ERROR_CODE.test(error.message)
      ? error.message
      : null;
  return code ?? "tenant_invitation_delivery_error";
}

/** The raw token only ever reaches this body; it is never logged or persisted. */
function buildInvitationEmailBody(
  request: TenantInvitationDeliveryRequest,
): string {
  const acceptBaseUrl = process.env.TENANT_INVITATION_ACCEPT_URL_BASE?.trim();
  const link = acceptBaseUrl
    ? `${acceptBaseUrl}${acceptBaseUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(request.rawToken)}`
    : null;
  return [
    `Hello ${request.displayName},`,
    "",
    "You have been invited to join a DRTS tenant workspace.",
    link
      ? `Accept your invitation: ${link}`
      : `Invitation code: ${request.rawToken}`,
    `This invitation expires at ${request.expiresAt}.`,
  ].join("\n");
}

/**
 * Bridges tenant invitation email traffic to the shared durable
 * NotificationDeliveryService (SR-NOTIFY-001). A missing/unconfigured
 * delivery service degrades to an explicit "unavailable" record instead of
 * failing module bootstrap or fabricating a delivered outcome. Callers must
 * only treat a "sent" status as actually delivered.
 */
@Injectable()
export class TenantInvitationDeliveryService {
  private readonly logger = new Logger(TenantInvitationDeliveryService.name);
  private deliveries: TenantInvitationDeliveryRecord[] = [];

  constructor(
    @Optional()
    private readonly deliveryService: NotificationDeliveryService | null = null,
  ) {}

  async send(
    request: TenantInvitationDeliveryRequest,
  ): Promise<TenantInvitationDeliveryRecord> {
    const base = {
      invitationId: request.invitationId,
      tenantId: request.tenantId,
      recipientEmail: request.recipientEmail,
      displayName: request.displayName,
      expiresAt: request.expiresAt,
    };
    const record = await this.deliver(request, base);
    this.deliveries = [record, ...this.deliveries];
    return { ...record };
  }

  private async deliver(
    request: TenantInvitationDeliveryRequest,
    base: Omit<
      TenantInvitationDeliveryRecord,
      | "deliveryId"
      | "messageId"
      | "status"
      | "sentAt"
      | "providerMessageId"
      | "errorCode"
      | "retryable"
    >,
  ): Promise<TenantInvitationDeliveryRecord> {
    if (!this.deliveryService) {
      this.logger.warn(
        `Tenant invitation email is unavailable for invitation ${request.invitationId}; the notification outbox is not configured.`,
      );
      return {
        ...base,
        deliveryId: `unavailable-${toInvitationIdempotencyKey(request.invitationId)}`,
        messageId: null,
        status: "unavailable",
        sentAt: null,
        providerMessageId: null,
        errorCode: "notification_outbox_unavailable",
        retryable: true,
      };
    }

    try {
      const idempotencyKey = toInvitationIdempotencyKey(request.invitationId);
      const queued = await this.deliveryService.enqueue({
        tenantId: request.tenantId,
        idempotencyKey,
        recipientEmail: request.recipientEmail,
        fromEmail:
          process.env.NOTIFICATION_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL,
        subject: "You're invited to join your DRTS tenant workspace",
        body: buildInvitationEmailBody(request),
      });

      // An already "sent" receipt (a same-key retry) must never be re-dispatched.
      const receipt =
        queued.status === "sent"
          ? queued
          : ((await this.deliveryService.dispatch(
              request.tenantId,
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
        retryable:
          receipt.status === "sent" ? false : (lastAttempt?.retryable ?? true),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Tenant invitation email delivery failed for invitation ${request.invitationId}: ${detail}`,
      );
      return {
        ...base,
        deliveryId: `error-${toInvitationIdempotencyKey(request.invitationId)}`,
        messageId: null,
        status: "failed",
        sentAt: null,
        providerMessageId: null,
        errorCode: toSafeErrorCode(error),
        retryable: true,
      };
    }
  }

  listDeliveries() {
    return this.deliveries.map((delivery) => ({ ...delivery }));
  }
}
