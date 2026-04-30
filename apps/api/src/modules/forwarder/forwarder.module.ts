import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { FORWARDER_ADAPTERS } from "./forwarder-adapter.interface";
import { ForwarderController } from "./forwarder.controller";
import { ForwarderRepository } from "./forwarder.repository";
import { ForwarderService } from "./forwarder.service";
import { GrabTaiwanAdapter } from "./grab-taiwan.adapter";

@Module({
  imports: [
    DatabaseModule,
    RegulatoryRegistryModule,
    AuditNotificationModule,
    forwardRef(() => OwnedMobilityModule),
  ],
  controllers: [ForwarderController],
  providers: [
    ForwarderService,
    ForwarderRepository,
    GrabTaiwanAdapter,
    {
      provide: FORWARDER_ADAPTERS,
      useFactory: (grabTaiwanAdapter: GrabTaiwanAdapter) => [grabTaiwanAdapter],
      inject: [GrabTaiwanAdapter],
    },
  ],
  exports: [ForwarderService],
})
export class ForwarderModule {}
