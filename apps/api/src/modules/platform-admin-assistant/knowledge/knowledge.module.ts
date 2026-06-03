import { Module } from "@nestjs/common";

import { PlatformAdminAssistantKnowledgeService } from "./knowledge-retrieval.service";

/**
 * Self-contained knowledge-retrieval module for the Platform Admin assistant.
 *
 * Exported so the top-level assistant module (PA-AI-BE-001) can import it and
 * wire the session/message flow on top, without this slice having to touch
 * `app.module.ts` or the assistant's controllers before BE-001 lands.
 *
 * The service is built via a factory because its constructor takes an optional
 * options object (thresholds) that is not a DI token.
 */
@Module({
  providers: [
    {
      provide: PlatformAdminAssistantKnowledgeService,
      useFactory: () => new PlatformAdminAssistantKnowledgeService(),
    },
  ],
  exports: [PlatformAdminAssistantKnowledgeService],
})
export class PlatformAdminAssistantKnowledgeModule {}
