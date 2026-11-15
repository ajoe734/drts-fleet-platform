import { Inject, Injectable, Logger, Optional } from "@nestjs/common";

import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";

export const FLEET_INVITATION_MAIL_DELIVERY = Symbol(
  "FLEET_INVITATION_MAIL_DELIVERY",
);

export type FleetInvitationDeliveryRequest = {
  invitationId: string;
  fleetPartnerId: string;
  entrySlug: string;
  recipientEmail: string;
  expiresAt: string;
  rawToken: string;
};

/** "sent" is the only outcome that reflects an acknowledged provider send. */
export type FleetInvitationDeliveryOutcome = "sent" | "unavailable" | "failed";

export type FleetInvitationDeliveryRecord = Omit<
  FleetInvitationDeliveryRequest,
  "rawToken"
> & {
  status: FleetInvitationDeliveryOutcome;
  attemptedAt: string;
};

const DEFAULT_FROM_EMAIL = "fleet-invitations@notification.drts.invalid";

/** The raw token only ever reaches this body; it is never logged or stored. */
export function buildFleetInvitationEmailBody(
  request: FleetInvitationDeliveryRequest,
  acceptBaseUrl = process.env.FLEET_INVITATION_ACCEPT_URL_BASE?.trim(),
): string {
  const link = acceptBaseUrl
    ? `${acceptBaseUrl}${acceptBaseUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(request.rawToken)}`
    : null;
  return [
    "Hello,",
    "",
    "You have been invited to the DRTS Fleet partner portal.",
    link
      ? `Accept your invitation: ${link}`
      : `Invitation code: ${request.rawToken}`,
    `This invitation expires at ${request.expiresAt}.`,
  ].join("\n");
}

/**
 * FLEET-ONB-003 SA/SD §7: Fleet staff invitations are platform mail (Fleet
 * partner staff are not tenants), sent immediately and never retained in
 * the tenant outbox because the body carries the one-time token. Structure
 * mirrors AgencyInvitationDeliveryService: a missing transport is reported
 * as "unavailable", never as a fabricated delivery.
 */
@Injectable()
export class FleetInvitationDeliveryService {
  private readonly logger = new Logger(FleetInvitationDeliveryService.name);

  constructor(
    @Optional()
    @Inject(FLEET_INVITATION_MAIL_DELIVERY)
    private readonly deliveryService: NotificationDeliveryService | null = null,
  ) {}

  async send(
    request: FleetInvitationDeliveryRequest,
  ): Promise<FleetInvitationDeliveryRecord> {
    // The returned record never carries the raw token.
    const base = {
      invitationId: request.invitationId,
      fleetPartnerId: request.fleetPartnerId,
      entrySlug: request.entrySlug,
      recipientEmail: request.recipientEmail,
      expiresAt: request.expiresAt,
    };
    const attemptedAt = new Date().toISOString();
    if (!this.deliveryService) {
      this.logger.warn(
        `Fleet invitation email is unavailable for invitation ${request.invitationId}; no mail transport is configured.`,
      );
      return { ...base, status: "unavailable", attemptedAt };
    }
    try {
      const result = await this.deliveryService.sendPlatformMail({
        recipientEmail: request.recipientEmail,
        fromEmail:
          process.env.NOTIFICATION_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL,
        subject: "DRTS Fleet partner portal invitation",
        body: buildFleetInvitationEmailBody(request),
      });
      if (result.status !== "sent") {
        this.logger.warn(
          `Fleet invitation email for invitation ${request.invitationId} was not sent (${result.status}).`,
        );
      }
      return { ...base, status: result.status, attemptedAt };
    } catch {
      this.logger.warn(
        `Fleet invitation email delivery failed for invitation ${request.invitationId}.`,
      );
      return { ...base, status: "failed", attemptedAt };
    }
  }
}
