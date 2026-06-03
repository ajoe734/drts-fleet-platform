import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { ForwarderModule } from "../forwarder/forwarder.module";
import { PlatformAdminModule } from "../platform-admin/platform-admin.module";
import { PlatformAdminAssistantController } from "./platform-admin-assistant.controller";
import { MockPlatformAdminAssistantProvider } from "./platform-admin-assistant.provider";
import { PlatformAdminAssistantReadToolService } from "./platform-admin-assistant-read-tools.service";
import { PlatformAdminAssistantService } from "./platform-admin-assistant.service";
import { PLATFORM_ADMIN_ASSISTANT_PROVIDER } from "./platform-admin-assistant.types";

@Module({
  imports: [
    PlatformAdminModule,
    AuditNotificationModule,
    FeatureFlagsModule,
    ForwarderModule,
  ],
  controllers: [PlatformAdminAssistantController],
  providers: [
    MockPlatformAdminAssistantProvider,
    {
      provide: PLATFORM_ADMIN_ASSISTANT_PROVIDER,
      useExisting: MockPlatformAdminAssistantProvider,
    },
    PlatformAdminAssistantReadToolService,
    PlatformAdminAssistantService,
  ],
})
export class PlatformAdminAssistantModule {}
