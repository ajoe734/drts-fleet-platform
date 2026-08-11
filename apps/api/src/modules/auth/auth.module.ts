import { Module } from "@nestjs/common";

import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { DatabaseModule } from "../../common/db/database.module";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";
import { IdentityModule } from "../identity/identity.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { AuthController } from "./auth.controller";
import { BreakGlassController } from "./break-glass.controller";
import { ConsumedOidcStateRepository } from "./consumed-oidc-state.repository";
import { DriverDeviceSessionService } from "./driver-device-session.service";
import { IAPSubjectAdapter } from "./iap-subject.adapter";
import { OidcPkceService } from "./oidc-pkce.service";
import { ServiceWorkloadIdentityAdapter } from "./service-workload-identity.adapter";

@Module({
  imports: [
    DatabaseModule,
    TenantPartnerModule,
    DriverProfileModule,
    RegulatoryRegistryModule,
    IdentityModule,
  ],
  controllers: [AuthController, BreakGlassController],
  providers: [
    JwtAuthService,
    DriverDeviceSessionService,
    IAPSubjectAdapter,
    ServiceWorkloadIdentityAdapter,
    OidcPkceService,
    ConsumedOidcStateRepository,
  ],
  exports: [
    JwtAuthService,
    DriverDeviceSessionService,
    IAPSubjectAdapter,
    ServiceWorkloadIdentityAdapter,
    OidcPkceService,
    ConsumedOidcStateRepository,
  ],
})
export class AuthModule {}
