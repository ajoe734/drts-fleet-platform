import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ComplaintModule } from "../complaint/complaint.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { AssistantGuardrailService } from "./assistant.guardrail.service";
import { AssistantController } from "./assistant.controller";
import { AssistantLlmGatewayService } from "./assistant-llm-gateway.service";
import { AssistantRepository } from "./assistant.repository";
import { AssistantService } from "./assistant.service";
import { AssistantReadToolRegistry } from "./tools/assistant-read-tool.registry";

@Module({
  imports: [
    DatabaseModule,
    OwnedMobilityModule,
    ComplaintModule,
    AuditNotificationModule,
  ],
  controllers: [AssistantController],
  providers: [
    AssistantGuardrailService,
    AssistantLlmGatewayService,
    AssistantReadToolRegistry,
    AssistantRepository,
    AssistantService,
  ],
  exports: [AssistantReadToolRegistry],
})
export class AssistantModule {}
