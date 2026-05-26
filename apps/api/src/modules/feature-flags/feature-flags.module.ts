import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { FeatureFlagRepository } from "./feature-flag.repository";
import {
  FeatureFlagsController,
  OpsFeatureFlagsController,
} from "./feature-flags.controller";
import { FeatureFlagsService } from "./feature-flags.service";

@Module({
  imports: [DatabaseModule],
  controllers: [FeatureFlagsController, OpsFeatureFlagsController],
  providers: [FeatureFlagRepository, FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
