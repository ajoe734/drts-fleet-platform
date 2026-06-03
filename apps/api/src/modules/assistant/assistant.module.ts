import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { AssistantController } from "./assistant.controller";
import { AssistantLlmGatewayService } from "./assistant-llm-gateway.service";
import { AssistantRepository } from "./assistant.repository";
import { AssistantService } from "./assistant.service";

@Module({
  imports: [DatabaseModule, KnowledgeModule],
  controllers: [AssistantController],
  providers: [
    AssistantLlmGatewayService,
    AssistantRepository,
    AssistantService,
  ],
})
export class AssistantModule {}
