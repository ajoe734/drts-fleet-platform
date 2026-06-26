import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { SandboxDispatchGateModule } from "../sandbox-dispatch-gate/sandbox-dispatch-gate.module";
import { RocOperationsController } from "./roc-operations.controller";
import { RocOperationsService } from "./roc-operations.service";

@Module({
  imports: [
    OwnedMobilityModule,
    SandboxDispatchGateModule,
    AuditNotificationModule,
  ],
  controllers: [RocOperationsController],
  providers: [RocOperationsService],
  exports: [RocOperationsService],
})
export class RocOperationsModule {}
