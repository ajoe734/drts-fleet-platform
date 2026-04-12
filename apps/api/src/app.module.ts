import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";

import { HealthModule } from "./health/health.module";
import { BootstrapAuthGuard } from "./common/auth";
import { SnakeCaseExceptionFilter } from "./common/snake-case.exception-filter";
import { SnakeCaseInterceptor } from "./common/snake-case.interceptor";
import { AuditNotificationModule } from "./modules/audit-notification/audit-notification.module";
import { BillingSettlementModule } from "./modules/billing-settlement/billing-settlement.module";
import { CallcenterModule } from "./modules/callcenter/callcenter.module";
import { ComplaintModule } from "./modules/complaint/complaint.module";
import { DriverSettingsModule } from "./modules/driver-settings/driver-settings.module";
import { FeatureFlagsModule } from "./modules/feature-flags/feature-flags.module";
import { FoundationModule } from "./modules/foundation/foundation.module";
import { ForwarderModule } from "./modules/forwarder/forwarder.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { IncidentModule } from "./modules/incident/incident.module";
import { MaintenanceModule } from "./modules/maintenance/maintenance.module";
import { OwnedMobilityModule } from "./modules/owned-mobility/owned-mobility.module";
import { PlatformAdminModule } from "./modules/platform-admin/platform-admin.module";
import { ProductRuleModule } from "./modules/product-rule/product-rule.module";
import { RegulatoryRegistryModule } from "./modules/regulatory-registry/regulatory-registry.module";
import { ReportingFilingModule } from "./modules/reporting-filing/reporting-filing.module";
import { ShiftAttendanceModule } from "./modules/shift-attendance/shift-attendance.module";
import { TenantPartnerModule } from "./modules/tenant-partner/tenant-partner.module";

@Module({
  imports: [
    HealthModule,
    FoundationModule,
    IdentityModule,
    TenantPartnerModule,
    RegulatoryRegistryModule,
    ProductRuleModule,
    AuditNotificationModule,
    CallcenterModule,
    ComplaintModule,
    OwnedMobilityModule,
    PlatformAdminModule,
    BillingSettlementModule,
    ReportingFilingModule,
    ForwarderModule,
    FeatureFlagsModule,
    IncidentModule,
    MaintenanceModule,
    ShiftAttendanceModule,
    DriverSettingsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: BootstrapAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SnakeCaseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: SnakeCaseExceptionFilter,
    },
  ],
})
export class AppModule {}
