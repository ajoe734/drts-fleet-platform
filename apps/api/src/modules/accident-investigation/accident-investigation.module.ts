import { Module } from "@nestjs/common";

import { RocOperationsModule } from "../roc-operations/roc-operations.module";
import { AccidentInvestigationService } from "./accident-investigation.service";

@Module({
  imports: [RocOperationsModule],
  providers: [AccidentInvestigationService],
  exports: [AccidentInvestigationService],
})
export class AccidentInvestigationModule {}
