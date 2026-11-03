import { Inject, Injectable, Logger, Optional } from "@nestjs/common";

import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";

export const AGENCY_INVITATION_MAIL_DELIVERY = Symbol(
  "AGENCY_INVITATION_MAIL_DELIVERY",
);

export type AgencyInvitationDeliveryRequest = {
  invitationId: string;
  agencyId: string;
  agencyDisplayName: string;
  recipientEmail: string;
  expiresAt: string;
  accessValidTo: string;
  rawToken: string;
};

/** "sent" is the only outcome that reflects an acknowledged provider send. */
export type AgencyInvitationDeliveryOutcome = "sent" | "unavailable" | "failed";

export type AgencyInvitationDeliveryRecord = Omit<
  AgencyInvitationDeliveryRequest,
  "rawToken"
> & {
  status: AgencyInvitationDeliveryOutcome;
  attemptedAt: string;
};

const DEFAULT_FROM_EMAIL = "agency-invitations@notification.drts.invalid";

/** The raw token only ever reaches this body; it is never logged or stored. */
export function buildAgencyInvitationEmailBody(
  request: AgencyInvitationDeliveryRequest,
  acceptBaseUrl = process.env.AGENCY_INVITATION_ACCEPT_URL_BASE?.trim(),
): string {
  const link = acceptBaseUrl
    ? `${acceptBaseUrl}${acceptBaseUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(request.rawToken)}`
    : null;
  return [
    "Hello,",
    "",
    `You have been invited to the DRTS read-only regulatory portal for ${request.agencyDisplayName}.`,
    link
      ? `Accept your invitation: ${link}`
      : `Invitation code: ${request.rawToken}`,
    `This invitation expires at ${request.expiresAt}.`,
    `Your access period ends at ${request.accessValidTo}.`,
  ].join("\n");
}

/**
 * Agency invitations are platform mail (agencies are not tenants), sent
 * immediately and never retained in the tenant outbox because the body
 * carries the one-time token. Structure follows
 * TenantInvitationDeliveryService: a missing transport is reported as
 * "unavailable", never as a fabricated delivery.
 */
@Injectable()
export class AgencyInvitationDeliveryService {
  private readonly logger = new Logger(AgencyInvitationDeliveryService.name);

  constructor(
    @Optional()
    @Inject(AGENCY_INVITATION_MAIL_DELIVERY)
    private readonly deliveryService: NotificationDeliveryService | null = null,
  ) {}

  async send(
    request: AgencyInvitationDeliveryRequest,
  ): Promise<AgencyInvitationDeliveryRecord> {
    // The returned record never carries the raw token.
    const base = {
      invitationId: request.invitationId,
      agencyId: request.agencyId,
      agencyDisplayName: request.agencyDisplayName,
      recipientEmail: request.recipientEmail,
      expiresAt: request.expiresAt,
      accessValidTo: request.accessValidTo,
    };
    const attemptedAt = new Date().toISOString();
    if (!this.deliveryService) {
      this.logger.warn(
        `Agency invitation email is unavailable for invitation ${request.invitationId}; no mail transport is configured.`,
      );
      return { ...base, status: "unavailable", attemptedAt };
    }
    try {
      const result = await this.deliveryService.sendPlatformMail({
        recipientEmail: request.recipientEmail,
        fromEmail:
          process.env.NOTIFICATION_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL,
        subject: "DRTS regulatory portal invitation",
        body: buildAgencyInvitationEmailBody(request),
      });
      if (result.status !== "sent") {
        this.logger.warn(
          `Agency invitation email for invitation ${request.invitationId} was not sent (${result.status}).`,
        );
      }
      return { ...base, status: result.status, attemptedAt };
    } catch {
      this.logger.warn(
        `Agency invitation email delivery failed for invitation ${request.invitationId}.`,
      );
      return { ...base, status: "failed", attemptedAt };
    }
  }
}
