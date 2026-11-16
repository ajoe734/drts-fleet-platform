import { Inject, Injectable, Logger, Optional } from "@nestjs/common";

import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import type {
  DeliveryReceipt,
  DeliveryStatus,
} from "../notification-delivery/notification-delivery.types";

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
  /** True only when deliveryId is a real NotificationDeliveryService id retrievable
   * via the mail delivery readback endpoint; false for the synthetic
   * unavailable-/error- sentinel ids below, which never resolve to a stored record. */
  queryable: boolean;
  messageId: string | null;
  status: TenantInvitationDeliveryStatus;
  sentAt: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  retryable: boolean;
};

const DEFAULT_FROM_EMAIL = "tenant-invitations@notification.drts.invalid";
const SAFE_ERROR_CODE = /^[a-z][a-z0-9_]{0,99}$/i;

/** PWD-LOGIN-006 SA/SD §6: one shared password-reset delivery path across the
 * three password-login realms. Tenant realm keeps the durable, queryable
 * per-tenant outbox (enqueue+dispatch, same as invitation mail); agency and
 * partner realms are not tenants, so they go through the same
 * non-per-tenant `sendPlatformMail` path AgencyInvitationDeliveryService
 * already uses for agency invitations. */
export type PasswordResetDeliveryRealm = "tenant" | "agency" | "partner";

export type PasswordResetDeliveryRequest = {
  dedupeKey: string;
  realm: PasswordResetDeliveryRealm;
  tenantId: string | null;
  recipientEmail: string;
  expiresAt: string;
  rawToken: string;
};

export type PasswordResetCompletedDeliveryRequest = {
  dedupeKey: string;
  realm: PasswordResetDeliveryRealm;
  tenantId: string | null;
  recipientEmail: string;
};

export type PasswordResetDeliveryOutcome = {
  status: TenantInvitationDeliveryStatus;
};

const DEFAULT_PASSWORD_RESET_FROM_EMAIL =
  "password-reset@notification.drts.invalid";

/** The raw token only ever reaches this body; it is never logged or persisted. */
function buildPasswordResetEmailBody(
  request: PasswordResetDeliveryRequest,
): string {
  const resetBaseUrl = process.env.PASSWORD_RESET_URL_BASE?.trim();
  const link = resetBaseUrl
    ? `${resetBaseUrl}${resetBaseUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(request.rawToken)}`
    : null;
  return [
    "Hello,",
    "",
    "We received a request to reset the password for your DRTS account.",
    "If you did not request this, you can ignore this email.",
    link
      ? `Reset your password: ${link}`
      : `Password reset code: ${request.rawToken}`,
    `This link expires at ${request.expiresAt}.`,
  ].join("\n");
}

/** Never includes the new password or any other secret; this is a
 * notice-only email sent after the reset already completed (SA/SD §6). */
function buildPasswordResetCompletedEmailBody(): string {
  return [
    "Hello,",
    "",
    "The password for your DRTS account was just reset.",
    "All of your existing sessions have been signed out for your security.",
    "If you did not make this change, contact your administrator immediately.",
  ].join("\n");
}

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
    @Inject(NotificationDeliveryService)
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
      | "queryable"
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
        queryable: false,
        messageId: null,
        status: "unavailable",
        sentAt: null,
        providerMessageId: null,
        errorCode: "notification_outbox_unavailable",
        retryable: true,
      };
    }

    let queued: DeliveryReceipt;
    try {
      const idempotencyKey = toInvitationIdempotencyKey(request.invitationId);
      queued = await this.deliveryService.enqueue({
        tenantId: request.tenantId,
        idempotencyKey,
        recipientEmail: request.recipientEmail,
        fromEmail:
          process.env.NOTIFICATION_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL,
        subject: "You're invited to join your DRTS tenant workspace",
        body: buildInvitationEmailBody(request),
      });
    } catch (error) {
      // Nothing was durably recorded; the synthetic id is correct here --
      // there is no outbox row for the readback endpoint to ever find.
      const errorCode = toSafeErrorCode(error);
      this.logger.warn(
        `Tenant invitation email delivery failed for invitation ${request.invitationId}: ${errorCode}`,
      );
      return {
        ...base,
        deliveryId: `error-${toInvitationIdempotencyKey(request.invitationId)}`,
        queryable: false,
        messageId: null,
        status: "failed",
        sentAt: null,
        providerMessageId: null,
        errorCode,
        retryable: true,
      };
    }

    try {
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
        queryable: true,
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
      // The enqueue above already created a durable, queryable outbox
      // record -- dispatch failing past that point must not discard it.
      // Report the real deliveryId and the last status enqueue committed
      // (never a guessed "sent"/provider acknowledgement) so ops can look
      // up whatever the outbox actually recorded via the mail-delivery
      // readback endpoint instead of losing track of a real delivery.
      const errorCode = toSafeErrorCode(error);
      this.logger.warn(
        `Tenant invitation email dispatch did not complete for invitation ${request.invitationId} (deliveryId ${queued.deliveryId}): ${errorCode}`,
      );
      return {
        ...base,
        deliveryId: queued.deliveryId,
        queryable: true,
        messageId: queued.messageId,
        status: queued.status,
        sentAt: queued.sentAt,
        providerMessageId: null,
        errorCode,
        retryable: true,
      };
    }
  }

  listDeliveries() {
    return this.deliveries.map((delivery) => ({ ...delivery }));
  }

  async sendPasswordReset(
    request: PasswordResetDeliveryRequest,
  ): Promise<PasswordResetDeliveryOutcome> {
    return this.deliverPasswordResetMail(
      request.realm,
      request.tenantId,
      request.recipientEmail,
      `password-reset:${request.dedupeKey}`,
      "Reset your DRTS password",
      buildPasswordResetEmailBody(request),
    );
  }

  async sendPasswordResetCompletedNotice(
    request: PasswordResetCompletedDeliveryRequest,
  ): Promise<PasswordResetDeliveryOutcome> {
    return this.deliverPasswordResetMail(
      request.realm,
      request.tenantId,
      request.recipientEmail,
      `password-reset-completed:${request.dedupeKey}`,
      "Your DRTS password was reset",
      buildPasswordResetCompletedEmailBody(),
    );
  }

  private async deliverPasswordResetMail(
    realm: PasswordResetDeliveryRealm,
    tenantId: string | null,
    recipientEmail: string,
    idempotencyKey: string,
    subject: string,
    body: string,
  ): Promise<PasswordResetDeliveryOutcome> {
    if (!this.deliveryService) {
      this.logger.warn(
        `Password-reset email (${idempotencyKey}) is unavailable; the notification outbox is not configured.`,
      );
      return { status: "unavailable" };
    }

    const fromEmail =
      process.env.NOTIFICATION_FROM_EMAIL?.trim() ||
      DEFAULT_PASSWORD_RESET_FROM_EMAIL;

    // Tenant realm keeps the durable, per-tenant, queryable outbox (same as
    // invitation mail); agency/partner have no tenant row to key a durable
    // outbox entry on, so they use the same immediate platform-mail path
    // agency invitations already rely on.
    if (realm === "tenant" && tenantId) {
      try {
        const queued = await this.deliveryService.enqueue({
          tenantId,
          idempotencyKey,
          recipientEmail,
          fromEmail,
          subject,
          body,
        });
        const receipt =
          queued.status === "sent"
            ? queued
            : ((await this.deliveryService.dispatch(
                tenantId,
                queued.deliveryId,
              )) ?? queued);
        return { status: receipt.status };
      } catch (error) {
        this.logger.warn(
          `Password-reset email (${idempotencyKey}) delivery failed: ${toSafeErrorCode(error)}`,
        );
        return { status: "failed" };
      }
    }

    try {
      const result = await this.deliveryService.sendPlatformMail({
        recipientEmail,
        fromEmail,
        subject,
        body,
      });
      return { status: result.status };
    } catch {
      this.logger.warn(
        `Password-reset email (${idempotencyKey}) platform-mail delivery failed.`,
      );
      return { status: "failed" };
    }
  }
}
