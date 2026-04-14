import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { PlatformEarningsController } from "./platform-earnings.controller";
import { PlatformEarningsService } from "./platform-earnings.service";
import { PlatformEarningsRepository } from "./platform-earnings.repository";

@Module({
  imports: [DatabaseModule],
  controllers: [PlatformEarningsController],
  providers: [PlatformEarningsRepository, PlatformEarningsService],
  exports: [PlatformEarningsService],
})
export class PlatformEarningsModule {}
