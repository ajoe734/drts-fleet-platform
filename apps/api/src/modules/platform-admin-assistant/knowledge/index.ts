export * from "./knowledge.types";
export {
  APPROVED_SOURCES,
  approvedSourcesByCategory,
  getApprovedSource,
  isApprovedSourcePath,
  normalizeSourcePath,
} from "./approved-sources";
export { indexDocument, indexDocuments } from "./knowledge-indexer";
export {
  detectInjectionSignals,
  neutralizeUntrustedContent,
  wrapUntrustedContent,
  type InjectionScan,
} from "./prompt-injection";
export {
  PlatformAdminAssistantKnowledgeService,
  type KnowledgeRetrievalOptions,
} from "./knowledge-retrieval.service";
export { PlatformAdminAssistantKnowledgeModule } from "./knowledge.module";
