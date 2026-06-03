import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { ComplaintModule } from "../complaint/complaint.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { AssistantController } from "./assistant.controller";
import { AssistantLlmGatewayService } from "./assistant-llm-gateway.service";
import { AssistantRepository } from "./assistant.repository";
import { AssistantService } from "./assistant.service";
import { AssistantReadToolRegistry } from "./tools/assistant-read-tool.registry";

@Module({
  imports: [DatabaseModule, OwnedMobilityModule, ComplaintModule],
  controllers: [AssistantController],
  providers: [
    AssistantLlmGatewayService,
    AssistantReadToolRegistry,
    AssistantRepository,
    AssistantService,
  ],
  exports: [AssistantReadToolRegistry],
})
export class AssistantModule {}
