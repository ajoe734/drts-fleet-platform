import { Module } from "@nestjs/common";

import { LlmGatewayModule } from "../../common/llm-gateway";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { ForwarderModule } from "../forwarder/forwarder.module";
import { PlatformAdminModule } from "../platform-admin/platform-admin.module";
import { PlatformAdminAssistantKnowledgeModule } from "./knowledge";
import { PlatformAdminAssistantAuditRecorder } from "./platform-admin-assistant.audit";
import { PlatformAdminAssistantController } from "./platform-admin-assistant.controller";
import { LlmGatewayPlatformAdminAssistantProvider } from "./platform-admin-assistant.provider";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { PlatformAdminAssistantReadToolService } from "./platform-admin-assistant-read-tools.service";
import { PlatformAdminAssistantOrchestratorBridgeService } from "./platform-admin-assistant.orchestrator-bridge";
import { PlatformAdminAssistantService } from "./platform-admin-assistant.service";
import { PLATFORM_ADMIN_ASSISTANT_PROVIDER } from "./platform-admin-assistant.types";

@Module({
  imports: [
    LlmGatewayModule,
    PlatformAdminModule,
    AuditNotificationModule,
    PlatformAdminAssistantKnowledgeModule,
    FeatureFlagsModule,
    ForwarderModule,
    TenantPartnerModule,
  ],
  controllers: [PlatformAdminAssistantController],
  providers: [
    LlmGatewayPlatformAdminAssistantProvider,
    PlatformAdminAssistantAuditRecorder,
    {
      provide: PLATFORM_ADMIN_ASSISTANT_PROVIDER,
      useExisting: LlmGatewayPlatformAdminAssistantProvider,
    },
    PlatformAdminAssistantReadToolService,
    {
      provide: PlatformAdminAssistantOrchestratorBridgeService,
      useFactory: () => new PlatformAdminAssistantOrchestratorBridgeService(),
    },
    PlatformAdminAssistantReadToolService,
    PlatformAdminAssistantService,
  ],
})
export class PlatformAdminAssistantModule {}
