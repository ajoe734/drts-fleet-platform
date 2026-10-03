import { Module, forwardRef } from "@nestjs/common";

import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { GoogleWorkloadIdentityAdapter } from "../auth/google-workload-identity.adapter";
import { DatabaseModule, DatabaseService } from "../../common/db";
import { IdempotencyModule } from "../../common/idempotency";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { BillingSettlementModule } from "../billing-settlement/billing-settlement.module";
import { IdentityModule } from "../identity/identity.module";
import { createNotificationDeliveryServiceFromEnv } from "../notification-delivery/notification-delivery.factory";
import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { BankCardInlineEligibilityAdapter } from "./bank-card-inline-eligibility.adapter";
import { PARTNER_ELIGIBILITY_ADAPTERS } from "./partner-eligibility-adapter.interface";
import { ReferenceTokenEligibilityAdapter } from "./reference-token-eligibility.adapter";
import { PartnerEntryNotificationBindingController } from "./partner-entry-notification-binding.controller";
import { PartnerEntryNotificationBindingRepository } from "./partner-entry-notification-binding.repository";
import { PartnerEntryNotificationBindingService } from "./partner-entry-notification-binding.service";
import { PartnerNotificationDispatchFacade } from "./partner-notification-dispatch.facade";
import { PartnerUserIdentityLinkRepository } from "./partner-user-identity-link.repository";
import { PartnerNotificationNavigationRepository } from "./partner-notification-navigation.repository";
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

/** Optional storage stays disabled; partial SMTP configuration always fails. */
export function createTenantInvitationNotificationDeliveryService(
  databaseService?: DatabaseService,
): NotificationDeliveryService | null {
  return createNotificationDeliveryServiceFromEnv(process.env, databaseService);
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
  controllers: [
    TenantPartnerController,
    PartnerEntryNotificationBindingController,
  ],
  providers: [
    TenantPartnerService,
    JwtAuthService,
    GoogleWorkloadIdentityAdapter,
    TenantPartnerRepository,
    GoogleWorkloadIdentityAdapter,
    {
      provide: NotificationDeliveryService,
      useFactory: createTenantInvitationNotificationDeliveryService,
      inject: [DatabaseService],
    },
    TenantInvitationDeliveryService,
    PartnerUserIdentityLinkRepository,
    ReferralEmbedHandoffRepository,
    PartnerNotificationNavigationRepository,
    ReferralChannelScaffoldService,
    WebhookDispatchService,
    PartnerNotificationDispatchFacade,
    PartnerEntryNotificationBindingRepository,
    PartnerEntryNotificationBindingService,
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
    PartnerNotificationNavigationRepository,
    ReferralChannelScaffoldService,
    PartnerNotificationDispatchFacade,
  ],
})
export class TenantPartnerModule {}
