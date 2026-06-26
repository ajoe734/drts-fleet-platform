import { Module } from "@nestjs/common";

import { SafetyOperatorModule } from "../safety-operator/safety-operator.module";
import { RocOperationsService } from "./roc-operations.service";

@Module({
  imports: [SafetyOperatorModule],
  providers: [RocOperationsService],
  exports: [RocOperationsService],
})
export class RocOperationsModule {}
