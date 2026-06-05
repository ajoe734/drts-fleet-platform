import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { VehicleEligibilityModule } from "../vehicle-eligibility/vehicle-eligibility.module";
import { FORWARDER_ADAPTERS } from "./forwarder-adapter.interface";
import { ForwarderController } from "./forwarder.controller";
import { ForwarderRepository } from "./forwarder.repository";
import { ForwarderService } from "./forwarder.service";
import { GrabTaiwanAdapter } from "./grab-taiwan.adapter";
import { SandboxAdapter } from "./sandbox.adapter";

@Module({
  imports: [
    DatabaseModule,
    RegulatoryRegistryModule,
    VehicleEligibilityModule,
    AuditNotificationModule,
    forwardRef(() => OwnedMobilityModule),
  ],
  controllers: [ForwarderController],
  providers: [
    ForwarderService,
    ForwarderRepository,
    GrabTaiwanAdapter,
    SandboxAdapter,
    {
      provide: FORWARDER_ADAPTERS,
      useFactory: (
        grabTaiwanAdapter: GrabTaiwanAdapter,
        sandboxAdapter: SandboxAdapter,
      ) => [grabTaiwanAdapter, sandboxAdapter],
      inject: [GrabTaiwanAdapter, SandboxAdapter],
    },
  ],
  exports: [ForwarderService],
})
export class ForwarderModule {}
