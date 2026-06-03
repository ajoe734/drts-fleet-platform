import { Module } from "@nestjs/common";

import { LlmGatewayModule } from "../../common/llm-gateway";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { PlatformAdminModule } from "../platform-admin/platform-admin.module";
import { PlatformAdminAssistantController } from "./platform-admin-assistant.controller";
import { LlmGatewayPlatformAdminAssistantProvider } from "./platform-admin-assistant.provider";
import { PlatformAdminAssistantService } from "./platform-admin-assistant.service";
import { PLATFORM_ADMIN_ASSISTANT_PROVIDER } from "./platform-admin-assistant.types";

@Module({
  imports: [LlmGatewayModule, PlatformAdminModule, AuditNotificationModule],
  controllers: [PlatformAdminAssistantController],
  providers: [
    LlmGatewayPlatformAdminAssistantProvider,
    {
      provide: PLATFORM_ADMIN_ASSISTANT_PROVIDER,
      useExisting: LlmGatewayPlatformAdminAssistantProvider,
    },
    PlatformAdminAssistantService,
  ],
})
export class PlatformAdminAssistantModule {}
