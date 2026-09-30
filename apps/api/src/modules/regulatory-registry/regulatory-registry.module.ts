import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule, DatabaseService } from "../../common/db";
import { OpsDispatchEventsModule } from "../../common/ops-dispatch-events.module";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";
import { DriverAcademyModule } from "../driver-academy/driver-academy.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { createNotificationDeliveryServiceFromEnv } from "../notification-delivery/notification-delivery.factory";
import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";

import { ContractOperationalViewService } from "./contract-operational-view.service";
import { DriverHeartbeatController } from "./driver-heartbeat.controller";
import { OpsDriverTrackingController } from "./ops-driver-tracking.controller";
import { RegulatoryRegistryController } from "./regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "./regulatory-registry.repository";
import { RegulatoryRegistryService } from "./regulatory-registry.service";

export function createRegistryNotificationDeliveryService(
  databaseService: DatabaseService,
): NotificationDeliveryService | null {
  return createNotificationDeliveryServiceFromEnv(process.env, databaseService);
}

@Module({
  imports: [
    DatabaseModule,
    OpsDispatchEventsModule,
    AuditNotificationModule,
    DriverProfileModule,
    forwardRef(() => TenantPartnerModule),
    forwardRef(() => DriverAcademyModule),
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
    {
      provide: NotificationDeliveryService,
      useFactory: createRegistryNotificationDeliveryService,
      inject: [DatabaseService],
    },
  ],
  exports: [RegulatoryRegistryService, ContractOperationalViewService],
})
export class RegulatoryRegistryModule {}
