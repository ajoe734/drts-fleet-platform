import { Injectable, Logger } from "@nestjs/common";

export type TenantInvitationDeliveryRequest = {
  invitationId: string;
  tenantId: string;
  recipientEmail: string;
  displayName: string;
  expiresAt: string;
  rawToken: string;
};

type TenantInvitationDelivery = Omit<
  TenantInvitationDeliveryRequest,
  "rawToken"
> & {
  deliveryId: string;
  sentAt: string;
};

/**
 * Deliberately isolates the raw invitation proof from HTTP responses and logs.
 * A production mail transport can replace this provider without changing account logic.
 */
@Injectable()
export class TenantInvitationDeliveryService {
  private readonly logger = new Logger(TenantInvitationDeliveryService.name);
  private readonly deliveries: TenantInvitationDelivery[] = [];

  async send(request: TenantInvitationDeliveryRequest) {
    const delivery: TenantInvitationDelivery = {
      invitationId: request.invitationId,
      tenantId: request.tenantId,
      recipientEmail: request.recipientEmail,
      displayName: request.displayName,
      expiresAt: request.expiresAt,
      deliveryId: `tenant-invitation-${request.invitationId}`,
      sentAt: new Date().toISOString(),
    };

    this.deliveries.unshift(delivery);
    this.logger.log(
      `Queued tenant invitation ${delivery.deliveryId} for ${delivery.recipientEmail}`,
    );
    return { ...delivery };
  }

  listDeliveries() {
    return this.deliveries.map((delivery) => ({ ...delivery }));
  }
}
