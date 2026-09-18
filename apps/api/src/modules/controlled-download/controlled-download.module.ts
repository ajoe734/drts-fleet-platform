import { Module } from "@nestjs/common";

import {
  DOCUMENT_ARTIFACT_STORE,
  InMemoryDocumentArtifactStore,
} from "../../common/document-artifacts";
import { ControlledDownloadController } from "./controlled-download.controller";

@Module({
  controllers: [ControlledDownloadController],
  providers: [
    {
      provide: DOCUMENT_ARTIFACT_STORE,
      useClass: InMemoryDocumentArtifactStore,
    },
  ],
  // Exported so a future producer (tenant invoice, placard, report
  // generation) that imports this module can inject the same store
  // singleton and call `put(...)` once it actually renders bytes.
  exports: [DOCUMENT_ARTIFACT_STORE],
})
export class ControlledDownloadModule {}
