import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Logger, Module } from "@nestjs/common";

import { APPROVED_SOURCES } from "./approved-sources";
import { PlatformAdminAssistantKnowledgeService } from "./knowledge-retrieval.service";
import type { KnowledgeSourceDocument } from "./knowledge.types";

function loadApprovedKnowledgeDocuments(): KnowledgeSourceDocument[] {
  const logger = new Logger("PlatformAdminAssistantKnowledgeModule");

  return APPROVED_SOURCES.flatMap((source) => {
    try {
      return [
        {
          sourcePath: source.sourcePath,
          content: readFileSync(
            resolve(process.cwd(), source.sourcePath),
            "utf8",
          ),
        },
      ];
    } catch (error) {
      logger.warn(
        `Skipping approved knowledge source ${source.sourcePath}: ${
          error instanceof Error ? error.message : "read_failed"
        }`,
      );
      return [];
    }
  });
}

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
      useFactory: () => {
        const service = new PlatformAdminAssistantKnowledgeService();
        service.loadDocuments(loadApprovedKnowledgeDocuments());
        return service;
      },
    },
  ],
  exports: [PlatformAdminAssistantKnowledgeService],
})
export class PlatformAdminAssistantKnowledgeModule {}
