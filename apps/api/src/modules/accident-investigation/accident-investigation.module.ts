import { Module } from "@nestjs/common";

import { AccidentInvestigationService } from "./accident-investigation.service";

@Module({
  providers: [AccidentInvestigationService],
  exports: [AccidentInvestigationService],
})
export class AccidentInvestigationModule {}
