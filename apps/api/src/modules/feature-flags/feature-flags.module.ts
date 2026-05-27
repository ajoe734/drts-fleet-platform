import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { FeatureFlagRepository } from "./feature-flag.repository";
import { FeatureFlagsController } from "./feature-flags.controller";
import { FeatureFlagsService } from "./feature-flags.service";
import { TenantFeatureFlagsController } from "./tenant-feature-flags.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [FeatureFlagsController, TenantFeatureFlagsController],
  providers: [FeatureFlagRepository, FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
