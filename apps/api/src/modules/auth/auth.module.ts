import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { AuthController } from "./auth.controller";
import { DriverDeviceSessionRepository } from "./driver-device-session.repository";
import { DriverDeviceSessionService } from "./driver-device-session.service";

@Module({
  imports: [
    DatabaseModule,
    TenantPartnerModule,
    DriverProfileModule,
    RegulatoryRegistryModule,
  ],
  controllers: [AuthController],
  providers: [
    JwtAuthService,
    DriverDeviceSessionRepository,
    DriverDeviceSessionService,
  ],
  exports: [JwtAuthService, DriverDeviceSessionService],
})
export class AuthModule {}
