import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { ReportingFilingModule } from "../reporting-filing/reporting-filing.module";
import { BankCardInlineEligibilityAdapter } from "./bank-card-inline-eligibility.adapter";
import { PARTNER_ELIGIBILITY_ADAPTERS } from "./partner-eligibility-adapter.interface";
import { ReferenceTokenEligibilityAdapter } from "./reference-token-eligibility.adapter";
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
    FeatureFlagsModule,
    forwardRef(() => OwnedMobilityModule),
    forwardRef(() => ReportingFilingModule),
  ],
  controllers: [TenantPartnerController],
  providers: [
    TenantPartnerService,
    TenantPartnerRepository,
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
  exports: [TenantPartnerService],
})
export class TenantPartnerModule {}
