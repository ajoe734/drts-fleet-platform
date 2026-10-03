import { Global, Module } from "@nestjs/common";

import {
  DOCUMENT_ARTIFACT_REBUILD_REGISTRY,
  DOCUMENT_ARTIFACT_STORE,
  DocumentArtifactRebuildRegistry,
  InMemoryDocumentArtifactStore,
} from "../../common/document-artifacts";
import { ControlledDownloadController } from "./controlled-download.controller";

/**
 * `@Global()` because `DOCUMENT_ARTIFACT_STORE` and
 * `DOCUMENT_ARTIFACT_REBUILD_REGISTRY` must resolve to the one singleton
 * pair app-wide: a producer module that forgets to import this module
 * would otherwise silently get its own disconnected
 * `InMemoryDocumentArtifactStore` default (every injection site falls back
 * to `new InMemoryDocumentArtifactStore()` for direct/unit construction),
 * invisible to `ControlledDownloadController`'s own store. Importing this
 * module explicitly (as `billing-settlement.module.ts` already does) still
 * works and is harmless; `@Global()` just means a producer is no longer
 * one missing import away from writing into a store nobody reads from.
 */
@Global()
@Module({
  controllers: [ControlledDownloadController],
  providers: [
    {
      provide: DOCUMENT_ARTIFACT_STORE,
      useClass: InMemoryDocumentArtifactStore,
    },
    DocumentArtifactRebuildRegistry,
    {
      provide: DOCUMENT_ARTIFACT_REBUILD_REGISTRY,
      useExisting: DocumentArtifactRebuildRegistry,
    },
  ],
  // Exported so a producer (tenant invoice, placard, driver-statement
  // report generation) that renders bytes can inject the same store
  // singleton to call `put(...)`, and can register a deterministic
  // rebuilder for its kind(s) so a sibling Cloud Run instance -- or this
  // same instance after a restart -- can still serve a verified, unexpired
  // link whose bytes never landed in its own local store.
  exports: [DOCUMENT_ARTIFACT_STORE, DOCUMENT_ARTIFACT_REBUILD_REGISTRY],
})
export class ControlledDownloadModule {}
