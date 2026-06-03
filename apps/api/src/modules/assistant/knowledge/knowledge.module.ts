import { Module } from "@nestjs/common";

import { KnowledgeSearchController } from "./knowledge-search.controller";
import { KnowledgeSearchService } from "./knowledge-search.service";

@Module({
  controllers: [KnowledgeSearchController],
  providers: [KnowledgeSearchService],
  exports: [KnowledgeSearchService],
})
export class KnowledgeModule {}
