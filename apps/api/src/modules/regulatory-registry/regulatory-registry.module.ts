import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule, DatabaseService } from "../../common/db";
import { OpsDispatchEventsModule } from "../../common/ops-dispatch-events.module";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";
import { DriverAcademyModule } from "../driver-academy/driver-academy.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { FileMailOutbox } from "../notification-delivery/file-mail-outbox";
import { PostgresMailOutbox } from "../notification-delivery/postgres-mail-outbox";
import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import { createMailpitSmtpTransportFromEnv } from "../notification-delivery/smtp-mail.transport";

import { ContractOperationalViewService } from "./contract-operational-view.service";
import { DriverHeartbeatController } from "./driver-heartbeat.controller";
import { OpsDriverTrackingController } from "./ops-driver-tracking.controller";
import { RegulatoryRegistryController } from "./regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "./regulatory-registry.repository";
import { RegulatoryRegistryService } from "./regulatory-registry.service";

export function createRegistryNotificationDeliveryService(
  databaseService: DatabaseService,
): NotificationDeliveryService | null {
  if (
    process.env.NOTIFICATION_OUTBOX_TYPE === "postgres" &&
    databaseService?.isEnabled?.()
  ) {
    return new NotificationDeliveryService(
      new PostgresMailOutbox(databaseService),
      createMailpitSmtpTransportFromEnv(process.env),
    );
  }
  const directory = process.env.NOTIFICATION_OUTBOX_DIRECTORY?.trim();
  if (directory) {
    return new NotificationDeliveryService(
      new FileMailOutbox(directory),
      createMailpitSmtpTransportFromEnv(process.env),
    );
  }
  return null;
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
