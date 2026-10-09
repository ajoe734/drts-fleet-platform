import { Global, Module } from "@nestjs/common";
import { DatabaseModule } from "../../common/db/database.module";
import { PassengerJwtService } from "../../common/auth/passenger-jwt.service";
import { PassengerAccountController } from "./account/passenger-account.controller";
import { PassengerAccountRepository } from "./account/passenger-account.repository";
import { PassengerAccountService } from "./account/passenger-account.service";

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [PassengerAccountController],
  providers: [
    PassengerJwtService,
    PassengerAccountRepository,
    PassengerAccountService,
  ],
  exports: [PassengerAccountService, PassengerJwtService],
})
export class PassengerAppModule {}
