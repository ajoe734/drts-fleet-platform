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
import { PassengerOAuthController } from "./oauth/passenger-oauth.controller";
import { PassengerOAuthTransactionRepository } from "./oauth/oauth-transaction.repository";
import { PassengerOAuthService } from "./oauth/passenger-oauth.service";
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
import { PassengerBookingController } from "./booking/passenger-booking.controller";
import { PassengerBookingService } from "./booking/passenger-booking.service";
import { PassengerBookingRepository } from "./booking/passenger-booking.repository";

@Global()
@Module({
  imports: [DatabaseModule, GeoModule, ServiceAreaModule],
  controllers: [
    PassengerAccountController,
    PassengerOtpController,
    PassengerFareController,
    PassengerOAuthController,
    PassengerBookingController,
  ],
  providers: [
    PassengerJwtService,
    PassengerAccountRepository,
    PassengerAccountService,
    PassengerFareRepository,
    PassengerFareService,
    PassengerOAuthTransactionRepository,
    PassengerOAuthService,
    PassengerOtpRepository,
    PassengerOtpService,
    PassengerBookingRepository,
    PassengerBookingService,
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
    PassengerBookingService,
  ],
})
export class PassengerAppModule {}
