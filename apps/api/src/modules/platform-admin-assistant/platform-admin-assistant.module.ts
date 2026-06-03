import { Module } from "@nestjs/common";

import { PlatformAdminAssistantController } from "./platform-admin-assistant.controller";
import { MockPlatformAdminAssistantProvider } from "./platform-admin-assistant.provider";
import { PlatformAdminAssistantService } from "./platform-admin-assistant.service";
import { PLATFORM_ADMIN_ASSISTANT_PROVIDER } from "./platform-admin-assistant.types";

@Module({
  controllers: [PlatformAdminAssistantController],
  providers: [
    MockPlatformAdminAssistantProvider,
    {
      provide: PLATFORM_ADMIN_ASSISTANT_PROVIDER,
      useExisting: MockPlatformAdminAssistantProvider,
    },
    PlatformAdminAssistantService,
  ],
})
export class PlatformAdminAssistantModule {}
