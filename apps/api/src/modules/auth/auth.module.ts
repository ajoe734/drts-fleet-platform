import { Module } from "@nestjs/common";

import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { AuthController } from "./auth.controller";

@Module({
  imports: [TenantPartnerModule],
  controllers: [AuthController],
  providers: [JwtAuthService],
  exports: [JwtAuthService],
})
export class AuthModule {}
