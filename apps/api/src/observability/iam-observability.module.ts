import { Module } from "@nestjs/common";
import { IamObservabilityService } from "./iam-observability.service";

@Module({
  providers: [IamObservabilityService],
  exports: [IamObservabilityService],
})
export class IamObservabilityModule {}
