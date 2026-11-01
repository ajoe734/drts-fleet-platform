import { Global, Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { DatabaseService } from "../../common/db/database.service";
import { IdempotencyModule } from "../../common/idempotency";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { IdentityModule } from "../identity/identity.module";
import { MultiTaxiModule } from "../multi-taxi/multi-taxi.module";
import { createNotificationDeliveryServiceFromEnv } from "../notification-delivery/notification-delivery.factory";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { ReportingFilingModule } from "../reporting-filing/reporting-filing.module";
import { ReportingModule } from "../reporting/reporting.module";
import { AgencyAccessAuditService } from "./agency-access-audit.service";
import { AgencyAccessLogRepository } from "./agency-access-log.repository";
import { AgencyDirectoryRepository } from "./agency-directory.repository";
import { AgencyDirectoryService } from "./agency-directory.service";
import {
  AGENCY_INVITATION_MAIL_DELIVERY,
  AgencyInvitationDeliveryService,
} from "./agency-invitation-delivery.service";
import { AgencyPortalController } from "./agency-portal.controller";
import { AgencyPortalService } from "./agency-portal.service";
import { PlatformAdminAgenciesController } from "./platform-admin-agencies.controller";

/**
 * BUREAU-R13 regulatory agency read-only portal. Global so that the
 * request-path auth components (JwtAuthService durable-state check,
 * BootstrapAuthGuard denial logging) can resolve the agency directory and
 * access-audit services without changing the existing auth/identity modules.
 * It only imports existing authoritative modules; it adds no parallel
 * reader, aggregate or export subsystem.
 */
@Global()
@Module({
  imports: [
    DatabaseModule,
    IdempotencyModule,
    IdentityModule,
    AuditNotificationModule,
    MultiTaxiModule,
    ReportingModule,
    ReportingFilingModule,
    RegulatoryRegistryModule,
  ],
  controllers: [AgencyPortalController, PlatformAdminAgenciesController],
  providers: [
    AgencyDirectoryRepository,
    AgencyAccessLogRepository,
    AgencyAccessAuditService,
    AgencyDirectoryService,
    AgencyInvitationDeliveryService,
    AgencyPortalService,
    {
      provide: AGENCY_INVITATION_MAIL_DELIVERY,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        createNotificationDeliveryServiceFromEnv(process.env, database),
    },
  ],
  exports: [
    AgencyDirectoryRepository,
    AgencyAccessAuditService,
    AgencyDirectoryService,
  ],
})
export class AgencyAccessModule {}
