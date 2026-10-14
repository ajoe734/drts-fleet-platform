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
import { FacebookDataDeletionController } from "./oauth/facebook-data-deletion.controller";
import { FacebookDataDeletionService } from "./oauth/facebook-data-deletion.service";
import { PassengerBookingController } from "./booking/passenger-booking.controller";
import { PassengerBookingService } from "./booking/passenger-booking.service";
import { PassengerBookingRepository } from "./booking/passenger-booking.repository";
import { PassengerRideEventsGuard } from "./booking/passenger-ride-events.guard";
import { PassengerBookingSettingsController } from "./booking/passenger-booking-settings.controller";
import { MultiTaxiModule } from "../multi-taxi/multi-taxi.module";
import { ComplaintModule } from "../complaint/complaint.module";
import { PassengerComplaintController } from "./complaint/passenger-complaint.controller";
import { PassengerComplaintService } from "./complaint/passenger-complaint.service";
import { PassengerReceiptController } from "./receipt/passenger-receipt.controller";
import { PaymentMethodController } from "./payment/payment-method.controller";
import { PaymentMethodRepository } from "./payment/payment-method.repository";
import {
  PAYMENT_RUNTIME,
  PaymentMethodService,
} from "./payment/payment-method.service";
import { paymentRuntimeFromEnv } from "./payment/payment-runtime.config";
import { PaymentChargeRepository } from "./payment/payment-charge.repository";
import { PaymentChargeService } from "./payment/payment-charge.service";
import { PaymentChargeWorker } from "./payment/payment-charge.worker";
import { PaymentRefundController } from "./payment/payment-refund.controller";
import { PaymentRefundRepository } from "./payment/payment-refund.repository";
import { PaymentRefundService } from "./payment/payment-refund.service";
import { PAYMENT_CAPTURE_POLICY } from "./payment/payment-capture.policy";
import { paymentCapturePolicyFromEnv } from "./payment/payment-capture.config";
import type { PaymentRuntime } from "./payment/payment-runtime.config";
import { MultiTaxiRepository } from "../multi-taxi/multi-taxi.repository";
import {
  PAYMENT_RECOVERY_NOTICE_EXPIRY,
  PAYMENT_RECOVERY_NOTICE_OUTBOX,
  paymentRecoveryNoticeExpiryFromEnv,
} from "./payment/payment-recovery-notice.config";

@Global()
@Module({
  imports: [
    DatabaseModule,
    GeoModule,
    ServiceAreaModule,
    MultiTaxiModule,
    ComplaintModule,
  ],
  controllers: [
    PassengerAccountController,
    PassengerOtpController,
    PassengerFareController,
    PassengerOAuthController,
    FacebookDataDeletionController,
    PassengerBookingController,
    PassengerBookingSettingsController,
    PassengerComplaintController,
    PassengerReceiptController,
    PaymentMethodController,
    PaymentRefundController,
  ],
  providers: [
    PassengerJwtService,
    PassengerAccountRepository,
    PassengerAccountService,
    PassengerFareRepository,
    PassengerFareService,
    PassengerOAuthTransactionRepository,
    PassengerOAuthService,
    FacebookDataDeletionService,
    PassengerOtpRepository,
    PassengerOtpService,
    PassengerBookingRepository,
    PassengerBookingService,
    PassengerRideEventsGuard,
    PassengerComplaintService,
    PaymentMethodRepository,
    PaymentMethodService,
    PaymentChargeRepository,
    PaymentChargeService,
    PaymentChargeWorker,
    PaymentRefundRepository,
    PaymentRefundService,
    {
      provide: PAYMENT_RUNTIME,
      useFactory: () => paymentRuntimeFromEnv(process.env),
    },
    {
      provide: PAYMENT_CAPTURE_POLICY,
      inject: [PAYMENT_RUNTIME],
      useFactory: (runtime: PaymentRuntime) =>
        paymentCapturePolicyFromEnv(process.env, runtime),
    },
    {
      provide: PAYMENT_RECOVERY_NOTICE_EXPIRY,
      useFactory: () => paymentRecoveryNoticeExpiryFromEnv(process.env),
    },
    {
      provide: PAYMENT_RECOVERY_NOTICE_OUTBOX,
      inject: [DatabaseService],
      // A stateless production repository adapter. MultiTaxiModule exports its
      // service only; no foreign export or a second worker/claim is introduced.
      useFactory: (database: DatabaseService) =>
        new MultiTaxiRepository(database),
    },
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
    PaymentChargeService,
    PassengerAccountService,
    PassengerJwtService,
    PassengerFareRepository,
    PassengerFareService,
    PassengerBookingService,
  ],
})
export class PassengerAppModule {}
