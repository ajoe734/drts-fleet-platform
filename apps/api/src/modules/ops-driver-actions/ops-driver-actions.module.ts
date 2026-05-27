import { Module } from "@nestjs/common";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { BillingSettlementModule } from "../billing-settlement/billing-settlement.module";
import { ForwarderModule } from "../forwarder/forwarder.module";
import { PlatformPresenceModule } from "../platform-presence/platform-presence.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { OpsDriverActionsController } from "./ops-driver-actions.controller";

@Module({
  imports: [
    AuditNotificationModule,
    BillingSettlementModule,
    ForwarderModule,
    PlatformPresenceModule,
    RegulatoryRegistryModule,
  ],
  controllers: [OpsDriverActionsController],
})
export class OpsDriverActionsModule {}
