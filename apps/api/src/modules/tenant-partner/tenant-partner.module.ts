import { Module, forwardRef } from "@nestjs/common";

import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { DatabaseModule } from "../../common/db";
import { IdempotencyModule } from "../../common/idempotency";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { BillingSettlementModule } from "../billing-settlement/billing-settlement.module";
import { IdentityModule } from "../identity/identity.module";
import { FileMailOutbox } from "../notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import { createMailpitSmtpTransportFromEnv } from "../notification-delivery/smtp-mail.transport";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { BankCardInlineEligibilityAdapter } from "./bank-card-inline-eligibility.adapter";
import { PARTNER_ELIGIBILITY_ADAPTERS } from "./partner-eligibility-adapter.interface";
import { ReferenceTokenEligibilityAdapter } from "./reference-token-eligibility.adapter";
import { PartnerUserIdentityLinkRepository } from "./partner-user-identity-link.repository";
import { ReferralEmbedHandoffRepository } from "./referral-embed-handoff.repository";
import { ReferralChannelScaffoldService } from "./referral-channel.scaffold.service";
import { TenantPartnerController } from "./tenant-partner.controller";
import { TenantPartnerRepository } from "./tenant-partner.repository";
import { TenantInvitationDeliveryService } from "./tenant-invitation-delivery.service";
import {
  PARTNER_INGRESS_CREDENTIAL_SEEDS,
  resolvePartnerIngressCredentialsFromEnv,
  TenantPartnerService,
} from "./tenant-partner.service";
import { WebhookDispatchService } from "./webhook-dispatch.service";

/**
 * A missing NOTIFICATION_OUTBOX_DIRECTORY degrades tenant invitation email
 * to a disabled delivery service (TenantInvitationDeliveryService reports
 * "unavailable" and never fabricates a sent status) instead of failing
 * module bootstrap. Mirrors AuditNotificationModule's wiring of the same
 * shared SR-NOTIFY-001 core.
 */
export function createTenantInvitationNotificationDeliveryService(): NotificationDeliveryService | null {
  const directory = process.env.NOTIFICATION_OUTBOX_DIRECTORY?.trim();
  if (!directory) {
    return null;
  }
  return new NotificationDeliveryService(
    new FileMailOutbox(directory),
    createMailpitSmtpTransportFromEnv(process.env),
  );
}

@Module({
  imports: [
    DatabaseModule,
    IdempotencyModule,
    AuditNotificationModule,
    BillingSettlementModule,
    IdentityModule,
    forwardRef(() => OwnedMobilityModule),
  ],
  controllers: [TenantPartnerController],
  providers: [
    TenantPartnerService,
    JwtAuthService,
    TenantPartnerRepository,
    {
      provide: NotificationDeliveryService,
      useFactory: createTenantInvitationNotificationDeliveryService,
    },
    TenantInvitationDeliveryService,
    PartnerUserIdentityLinkRepository,
    ReferralEmbedHandoffRepository,
    ReferralChannelScaffoldService,
    WebhookDispatchService,
    BankCardInlineEligibilityAdapter,
    ReferenceTokenEligibilityAdapter,
    {
      provide: PARTNER_INGRESS_CREDENTIAL_SEEDS,
      useFactory: () => resolvePartnerIngressCredentialsFromEnv(),
    },
    {
      provide: PARTNER_ELIGIBILITY_ADAPTERS,
      useFactory: (
        bankCardInlineEligibilityAdapter: BankCardInlineEligibilityAdapter,
        referenceTokenEligibilityAdapter: ReferenceTokenEligibilityAdapter,
      ) => [bankCardInlineEligibilityAdapter, referenceTokenEligibilityAdapter],
      inject: [
        BankCardInlineEligibilityAdapter,
        ReferenceTokenEligibilityAdapter,
      ],
    },
  ],
  exports: [
    TenantPartnerService,
    TenantPartnerRepository,
    PartnerUserIdentityLinkRepository,
    ReferralEmbedHandoffRepository,
    ReferralChannelScaffoldService,
  ],
})
export class TenantPartnerModule {}
