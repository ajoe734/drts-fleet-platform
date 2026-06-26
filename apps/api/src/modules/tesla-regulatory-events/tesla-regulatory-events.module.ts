import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { TeslaRegulatoryEventsController } from "./tesla-regulatory-events.controller";
import { TeslaRegulatoryMockAdapter } from "./tesla-regulatory-mock.adapter";
import { TeslaRegulatorySandboxAdapter } from "./tesla-regulatory-sandbox.adapter";
import { TESLA_REGULATORY_EVENT_PROVIDER } from "./tesla-regulatory-events.ports";
import { TeslaRegulatoryEventsRepository } from "./tesla-regulatory-events.repository";
import { TeslaRegulatoryEventsService } from "./tesla-regulatory-events.service";

@Module({
  imports: [DatabaseModule],
  controllers: [TeslaRegulatoryEventsController],
  providers: [
    TeslaRegulatoryEventsRepository,
    TeslaRegulatoryEventsService,
    TeslaRegulatoryMockAdapter,
    TeslaRegulatorySandboxAdapter,
    {
      provide: TESLA_REGULATORY_EVENT_PROVIDER,
      useFactory: (
        mockAdapter: TeslaRegulatoryMockAdapter,
        sandboxAdapter: TeslaRegulatorySandboxAdapter,
      ) => {
        const adapter = (
          process.env.TESLA_REGULATORY_ADAPTER ?? "mock"
        ).trim().toLowerCase();
        return adapter === "sandbox" ? sandboxAdapter : mockAdapter;
      },
      inject: [TeslaRegulatoryMockAdapter, TeslaRegulatorySandboxAdapter],
    },
  ],
  exports: [TeslaRegulatoryEventsService],
})
export class TeslaRegulatoryEventsModule {}
