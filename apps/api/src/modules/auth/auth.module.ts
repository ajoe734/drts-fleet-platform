import { Module } from "@nestjs/common";

import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";
import { IdentityModule } from "../identity/identity.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { AuthController } from "./auth.controller";
import { DriverDeviceSessionService } from "./driver-device-session.service";
import { IAPSubjectAdapter } from "./iap-subject.adapter";
import { JwtSessionClaimsService } from "./jwt-session-claims.service";

@Module({
  imports: [
    TenantPartnerModule,
    DriverProfileModule,
    RegulatoryRegistryModule,
    IdentityModule,
  ],
  controllers: [AuthController],
  providers: [
    JwtAuthService,
    JwtSessionClaimsService,
    DriverDeviceSessionService,
    IAPSubjectAdapter,
  ],
  exports: [
    JwtAuthService,
    JwtSessionClaimsService,
    DriverDeviceSessionService,
    IAPSubjectAdapter,
  ],
})
export class AuthModule {}
