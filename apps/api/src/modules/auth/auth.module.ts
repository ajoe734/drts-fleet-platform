import { Module } from "@nestjs/common";

import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { AuthController } from "./auth.controller";

@Module({
  controllers: [AuthController],
  providers: [JwtAuthService],
  exports: [JwtAuthService],
})
export class AuthModule {}
