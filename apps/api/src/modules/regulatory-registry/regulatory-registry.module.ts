import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { OpsDispatchEventsModule } from "../../common/ops-dispatch-events.module";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";

import { ContractOperationalViewService } from "./contract-operational-view.service";
import { DriverHeartbeatController } from "./driver-heartbeat.controller";
import { OpsDriverTrackingController } from "./ops-driver-tracking.controller";
import { RegulatoryRegistryController } from "./regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "./regulatory-registry.repository";
import { RegulatoryRegistryService } from "./regulatory-registry.service";

@Module({
  imports: [
    DatabaseModule,
    OpsDispatchEventsModule,
    AuditNotificationModule,
    DriverProfileModule,
    forwardRef(() => TenantPartnerModule),
  ],
  controllers: [
    RegulatoryRegistryController,
    DriverHeartbeatController,
    OpsDriverTrackingController,
  ],
  providers: [
    RegulatoryRegistryService,
    RegulatoryRegistryRepository,
    ContractOperationalViewService,
  ],
  exports: [RegulatoryRegistryService, ContractOperationalViewService],
})
export class RegulatoryRegistryModule {}
