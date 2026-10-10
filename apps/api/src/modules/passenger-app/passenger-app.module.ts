import { Global, Module } from "@nestjs/common";
import { DatabaseModule } from "../../common/db/database.module";
import { PassengerJwtService } from "../../common/auth/passenger-jwt.service";
import { PassengerAccountController } from "./account/passenger-account.controller";
import { PassengerAccountRepository } from "./account/passenger-account.repository";
import { PassengerAccountService } from "./account/passenger-account.service";
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
import { FacebookDataDeletionController } from "./oauth/facebook-data-deletion.controller";
import { FacebookDataDeletionService } from "./oauth/facebook-data-deletion.service";

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [
    PassengerAccountController,
    PassengerOtpController,
    PassengerOAuthController,
    FacebookDataDeletionController,
  ],
  providers: [
    PassengerJwtService,
    PassengerAccountRepository,
    PassengerAccountService,
    PassengerOAuthTransactionRepository,
    PassengerOAuthService,
    FacebookDataDeletionService,
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
  exports: [PassengerAccountService, PassengerJwtService],
})
export class PassengerAppModule {}
