import { Module } from "@nestjs/common";

import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";

@Module({
  imports: [FeatureFlagsModule],
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
