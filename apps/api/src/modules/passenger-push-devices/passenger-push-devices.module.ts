import { Module, Global } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { FIRST_PARTY_PUSH_DEVICE_RESOLVER } from "./passenger-push-devices.port";
import { PassengerPushDevicesRepository } from "./passenger-push-devices.repository";
import { PassengerPushDevicesService } from "./passenger-push-devices.service";

/**
 * D4/D5 data layer and dormant provider registration only: no controller,
 * no HTTP route, no binding into multi-taxi.module.ts's existing
 * PASSENGER_PUSH_TRANSPORT/PASSENGER_PUSH_PORT wiring — that remains
 * PUSH-CHANNEL-ROUTER-20261006's job. `FIRST_PARTY_PUSH_DEVICE_RESOLVER` is
 * exported so that later task can inject it without this module needing to
 * know about multi-taxi.
 */
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    PassengerPushDevicesRepository,
    PassengerPushDevicesService,
    {
      provide: FIRST_PARTY_PUSH_DEVICE_RESOLVER,
      useExisting: PassengerPushDevicesService,
    },
  ],
  exports: [PassengerPushDevicesService, FIRST_PARTY_PUSH_DEVICE_RESOLVER],
})
export class PassengerPushDevicesModule {}
