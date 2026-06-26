import { Module } from "@nestjs/common";

import { RocOperationsModule } from "../roc-operations/roc-operations.module";
import { AccidentInvestigationController } from "./accident-investigation.controller";
import { AccidentInvestigationService } from "./accident-investigation.service";

@Module({
  imports: [RocOperationsModule],
  controllers: [AccidentInvestigationController],
  providers: [AccidentInvestigationService],
  exports: [AccidentInvestigationService],
})
export class AccidentInvestigationModule {}
