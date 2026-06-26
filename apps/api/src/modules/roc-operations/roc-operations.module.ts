import { Module } from "@nestjs/common";

import { RocOperationsService } from "./roc-operations.service";

@Module({
  providers: [RocOperationsService],
  exports: [RocOperationsService],
})
export class RocOperationsModule {}
