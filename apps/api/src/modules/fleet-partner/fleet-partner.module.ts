import { Module } from "@nestjs/common";

import { FleetPartnerController } from "./fleet-partner.controller";

@Module({
  controllers: [FleetPartnerController],
})
export class FleetPartnerModule {}
