import { Module } from "@nestjs/common";

import { LlmGatewayModule } from "../../common/llm-gateway";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { PlatformAdminModule } from "../platform-admin/platform-admin.module";
import { PlatformAdminAssistantAuditRecorder } from "./platform-admin-assistant.audit";
import { PlatformAdminAssistantController } from "./platform-admin-assistant.controller";
import { MockPlatformAdminAssistantProvider } from "./platform-admin-assistant.provider";
import { PlatformAdminAssistantService } from "./platform-admin-assistant.service";
import { PLATFORM_ADMIN_ASSISTANT_PROVIDER } from "./platform-admin-assistant.types";

@Module({
  imports: [PlatformAdminModule, AuditNotificationModule, LlmGatewayModule],
  controllers: [PlatformAdminAssistantController],
  providers: [
    MockPlatformAdminAssistantProvider,
    PlatformAdminAssistantAuditRecorder,
    {
      provide: PLATFORM_ADMIN_ASSISTANT_PROVIDER,
      useExisting: MockPlatformAdminAssistantProvider,
    },
    PlatformAdminAssistantService,
  ],
})
export class PlatformAdminAssistantModule {}
