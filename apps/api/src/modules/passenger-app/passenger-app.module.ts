import { Global, Module } from "@nestjs/common";
import { DatabaseModule } from "../../common/db/database.module";
import { PassengerJwtService } from "../../common/auth/passenger-jwt.service";
import { PassengerAccountController } from "./account/passenger-account.controller";
import { PassengerAccountRepository } from "./account/passenger-account.repository";
import { PassengerAccountService } from "./account/passenger-account.service";
import { PassengerOAuthController } from "./oauth/passenger-oauth.controller";
import { PassengerOAuthTransactionRepository } from "./oauth/oauth-transaction.repository";
import { PassengerOAuthService } from "./oauth/passenger-oauth.service";

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [PassengerAccountController, PassengerOAuthController],
  providers: [
    PassengerJwtService,
    PassengerAccountRepository,
    PassengerAccountService,
    PassengerOAuthTransactionRepository,
    PassengerOAuthService,
  ],
  exports: [PassengerAccountService, PassengerJwtService],
})
export class PassengerAppModule {}
