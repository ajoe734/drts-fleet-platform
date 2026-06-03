import { Module } from "@nestjs/common";

import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeSearchService } from "./knowledge-search.service";

@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeSearchService],
  exports: [KnowledgeSearchService],
})
export class KnowledgeModule {}
