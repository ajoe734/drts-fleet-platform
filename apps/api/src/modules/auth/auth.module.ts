import { Module } from "@nestjs/common";

import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { AuthController } from "./auth.controller";
import { DriverDeviceSessionService } from "./driver-device-session.service";

@Module({
  imports: [TenantPartnerModule, DriverProfileModule],
  controllers: [AuthController],
  providers: [JwtAuthService, DriverDeviceSessionService],
  exports: [JwtAuthService, DriverDeviceSessionService],
})
export class AuthModule {}
