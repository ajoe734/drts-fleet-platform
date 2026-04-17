import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { TenantPartnerController } from "./tenant-partner.controller";
import { TenantPartnerRepository } from "./tenant-partner.repository";
import { TenantPartnerService } from "./tenant-partner.service";
import { WebhookDispatchService } from "./webhook-dispatch.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [TenantPartnerController],
  providers: [
    TenantPartnerService,
    TenantPartnerRepository,
    WebhookDispatchService,
  ],
  exports: [TenantPartnerService],
})
export class TenantPartnerModule {}
