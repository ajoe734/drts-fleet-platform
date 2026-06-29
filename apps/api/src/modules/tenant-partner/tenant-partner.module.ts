import { Module, forwardRef } from "@nestjs/common";

import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { BillingSettlementModule } from "../billing-settlement/billing-settlement.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { BankCardInlineEligibilityAdapter } from "./bank-card-inline-eligibility.adapter";
import { PARTNER_ELIGIBILITY_ADAPTERS } from "./partner-eligibility-adapter.interface";
import { ReferenceTokenEligibilityAdapter } from "./reference-token-eligibility.adapter";
import { PartnerUserIdentityLinkRepository } from "./partner-user-identity-link.repository";
import { ReferralChannelScaffoldService } from "./referral-channel.scaffold.service";
import { TenantPartnerController } from "./tenant-partner.controller";
import { TenantPartnerRepository } from "./tenant-partner.repository";
import {
  PARTNER_INGRESS_CREDENTIAL_SEEDS,
  resolvePartnerIngressCredentialsFromEnv,
  TenantPartnerService,
} from "./tenant-partner.service";
import { WebhookDispatchService } from "./webhook-dispatch.service";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    forwardRef(() => BillingSettlementModule),
    forwardRef(() => OwnedMobilityModule),
  ],
  controllers: [TenantPartnerController],
  providers: [
    TenantPartnerService,
    JwtAuthService,
    TenantPartnerRepository,
    PartnerUserIdentityLinkRepository,
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
    ReferralChannelScaffoldService,
  ],
})
export class TenantPartnerModule {}
