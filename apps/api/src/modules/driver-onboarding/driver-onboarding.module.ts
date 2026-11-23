import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../common/db";
import { AuthModule } from "../auth/auth.module";
import { DriverOnboardingDeliveryService } from "./driver-onboarding-delivery.service";
import { DriverOnboardingOutboxRepository } from "./driver-onboarding-outbox.repository";
import { DriverOnboardingScheduledController } from "./driver-onboarding-scheduled.controller";
import {
  createDriverOnboardingTransport,
  DRIVER_ONBOARDING_TRANSPORT,
} from "./driver-onboarding-transport";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [DriverOnboardingScheduledController],
  providers: [
    DriverOnboardingOutboxRepository,
    DriverOnboardingDeliveryService,
    {
      provide: DRIVER_ONBOARDING_TRANSPORT,
      useFactory: () => createDriverOnboardingTransport(process.env),
    },
  ],
  exports: [DriverOnboardingDeliveryService],
})
export class DriverOnboardingModule {}
