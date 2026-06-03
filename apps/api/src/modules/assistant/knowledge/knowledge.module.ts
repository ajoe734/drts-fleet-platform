import { Module } from "@nestjs/common";

import { KnowledgeAnswerService } from "./knowledge-answer.service";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeSearchService } from "./knowledge-search.service";

@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeSearchService, KnowledgeAnswerService],
  exports: [KnowledgeSearchService, KnowledgeAnswerService],
})
export class KnowledgeModule {}
