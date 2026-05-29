import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";

import {
  BootstrapAuthGuard,
  FeatureGateGuard,
  InternalKeyMiddleware,
} from "./common/auth";
import { JwtAuthService } from "./common/auth/jwt-auth.service";
import { SnakeCaseExceptionFilter } from "./common/snake-case.exception-filter";
import { SnakeCaseInterceptor } from "./common/snake-case.interceptor";
import { BootstrapThrottlerGuard } from "./common/throttling/bootstrap-throttler.guard";
import { GLOBAL_RATE_LIMIT } from "./common/throttling/rate-limit.constants";
import { AuditNotificationModule } from "./modules/audit-notification/audit-notification.module";
import { BillingSettlementModule } from "./modules/billing-settlement/billing-settlement.module";
import { CallcenterModule } from "./modules/callcenter/callcenter.module";
import { ComplaintModule } from "./modules/complaint/complaint.module";
import { DriverProfileModule } from "./modules/driver-profile/driver-profile.module";
import { DriverSettingsModule } from "./modules/driver-settings/driver-settings.module";
import { FeatureFlagsModule } from "./modules/feature-flags/feature-flags.module";
import { FoundationModule } from "./modules/foundation/foundation.module";
import { ForwarderModule } from "./modules/forwarder/forwarder.module";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { IncidentModule } from "./modules/incident/incident.module";
import { MaintenanceModule } from "./modules/maintenance/maintenance.module";
import { OwnedMobilityModule } from "./modules/owned-mobility/owned-mobility.module";
import { OperationalObservabilityModule } from "./modules/operational-observability/operational-observability.module";
import { PlatformAdminModule } from "./modules/platform-admin/platform-admin.module";
import { PlatformPresenceModule } from "./modules/platform-presence/platform-presence.module";
import { PlatformEarningsModule } from "./modules/platform-earnings/platform-earnings.module";
import { ProductRuleModule } from "./modules/product-rule/product-rule.module";
import { RegulatoryRegistryModule } from "./modules/regulatory-registry/regulatory-registry.module";
import { ReportingFilingModule } from "./modules/reporting-filing/reporting-filing.module";
import { ShiftAttendanceModule } from "./modules/shift-attendance/shift-attendance.module";
import { TenantPartnerModule } from "./modules/tenant-partner/tenant-partner.module";
import { AuthModule } from "./modules/auth/auth.module";

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([...GLOBAL_RATE_LIMIT]),
    AuthModule,
    HealthModule,
    FoundationModule,
    IdentityModule,
    TenantPartnerModule,
    RegulatoryRegistryModule,
    ProductRuleModule,
    AuditNotificationModule,
    CallcenterModule,
    ComplaintModule,
    DriverProfileModule,
    OwnedMobilityModule,
    OperationalObservabilityModule,
    PlatformAdminModule,
    BillingSettlementModule,
    ReportingFilingModule,
    ForwarderModule,
    FeatureFlagsModule,
    IncidentModule,
    MaintenanceModule,
    ShiftAttendanceModule,
    DriverSettingsModule,
    PlatformPresenceModule,
    PlatformEarningsModule,
  ],
  providers: [
    JwtAuthService,
    {
      provide: APP_GUARD,
      useClass: BootstrapAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: BootstrapThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: FeatureGateGuard,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(InternalKeyMiddleware)
      .exclude(
        { path: "health", method: RequestMethod.ALL },
        { path: "api/health", method: RequestMethod.ALL },
      )
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
