import { Module } from "@nestjs/common";

import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { DatabaseModule } from "../../common/db/database.module";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { AuthController } from "./auth.controller";
import { ConsumedOidcStateRepository } from "./consumed-oidc-state.repository";
import { DriverDeviceSessionService } from "./driver-device-session.service";
import { OidcPkceService } from "./oidc-pkce.service";

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
    DriverDeviceSessionService,
    OidcPkceService,
    ConsumedOidcStateRepository,
  ],
  exports: [
    JwtAuthService,
    DriverDeviceSessionService,
    OidcPkceService,
    ConsumedOidcStateRepository,
  ],
})
export class AuthModule {}

