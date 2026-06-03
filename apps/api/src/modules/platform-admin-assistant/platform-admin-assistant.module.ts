import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { PlatformAdminModule } from "../platform-admin/platform-admin.module";
import { PlatformAdminAssistantController } from "./platform-admin-assistant.controller";
import { PlatformAdminAssistantOrchestratorBridgeService } from "./platform-admin-assistant.orchestrator-bridge";
import { MockPlatformAdminAssistantProvider } from "./platform-admin-assistant.provider";
import { PlatformAdminAssistantService } from "./platform-admin-assistant.service";
import { PLATFORM_ADMIN_ASSISTANT_PROVIDER } from "./platform-admin-assistant.types";

@Module({
  imports: [PlatformAdminModule, AuditNotificationModule],
  controllers: [PlatformAdminAssistantController],
  providers: [
    MockPlatformAdminAssistantProvider,
    {
      provide: PLATFORM_ADMIN_ASSISTANT_PROVIDER,
      useExisting: MockPlatformAdminAssistantProvider,
    },
    {
      provide: PlatformAdminAssistantOrchestratorBridgeService,
      useFactory: () => new PlatformAdminAssistantOrchestratorBridgeService(),
    },
    PlatformAdminAssistantService,
  ],
})
export class PlatformAdminAssistantModule {}
