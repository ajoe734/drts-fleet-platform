import { Module } from "@nestjs/common";

import { SafetyOperatorService } from "./safety-operator.service";

@Module({
  providers: [SafetyOperatorService],
  exports: [SafetyOperatorService],
})
export class SafetyOperatorModule {}
