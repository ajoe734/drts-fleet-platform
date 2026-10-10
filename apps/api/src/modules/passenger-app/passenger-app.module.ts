import { Global, Module } from "@nestjs/common";
import { DatabaseModule } from "../../common/db/database.module";
import { PassengerJwtService } from "../../common/auth/passenger-jwt.service";
import { PassengerAccountController } from "./account/passenger-account.controller";
import { PassengerAccountRepository } from "./account/passenger-account.repository";
import { PassengerAccountService } from "./account/passenger-account.service";
import { GeoModule } from "../geo/geo.module";
import { ServiceAreaModule } from "../service-area/service-area.module";
import { PassengerFareController } from "./fare/passenger-fare.controller";
import { PassengerFareRepository } from "./fare/passenger-fare.repository";
import { PassengerFareService } from "./fare/passenger-fare.service";

import { DatabaseService } from "../../common/db/database.service";
import { createNotificationDeliveryServiceFromEnv } from "../notification-delivery/notification-delivery.factory";
import { PassengerOtpController } from "./otp/passenger-otp.controller";
import { PassengerOtpRepository } from "./otp/passenger-otp.repository";
import {
  OTP_MAIL_DELIVERY,
  OTP_OPTIONS,
  otpOptionsFromEnv,
  PassengerOtpService,
} from "./otp/passenger-otp.service";
import { SMS_PORT, UnconfiguredSmsPort } from "./otp/sms.port";

@Global()
@Module({
  imports: [DatabaseModule, GeoModule, ServiceAreaModule],
  controllers: [
    PassengerAccountController,
    PassengerOtpController,
    PassengerFareController,
  ],
  providers: [
    PassengerJwtService,
    PassengerAccountRepository,
    PassengerAccountService,
    PassengerFareRepository,
    PassengerFareService,
    PassengerOtpRepository,
    PassengerOtpService,
    { provide: SMS_PORT, useClass: UnconfiguredSmsPort },
    { provide: OTP_OPTIONS, useFactory: () => otpOptionsFromEnv(process.env) },
    {
      provide: OTP_MAIL_DELIVERY,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        createNotificationDeliveryServiceFromEnv(process.env, database),
    },
  ],
  exports: [
    PassengerAccountService,
    PassengerJwtService,
    PassengerFareRepository,
    PassengerFareService,
  ],
})
export class PassengerAppModule {}
