import { Module } from "@nestjs/common";

import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityEventsModule } from "../security-events/security-events.module";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { AuthController } from "./auth.controller";
import { DriverDeviceSessionService } from "./driver-device-session.service";
import { WorkforceIdentityService } from "./workforce-identity.service";

@Module({
  imports: [
    TenantPartnerModule,
    DriverProfileModule,
    RegulatoryRegistryModule,
    IdentityModule,
    SecurityEventsModule,
  ],
  controllers: [AuthController],
  providers: [
    JwtAuthService,
    DriverDeviceSessionService,
    WorkforceIdentityService,
  ],
  exports: [JwtAuthService, DriverDeviceSessionService, WorkforceIdentityService],
})
export class AuthModule {}
