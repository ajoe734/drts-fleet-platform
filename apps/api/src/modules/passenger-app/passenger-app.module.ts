import { Module } from "@nestjs/common";
import { PassengerAccountController } from "./account/passenger-account.controller";
import { PassengerAccountService } from "./account/passenger-account.service";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../../common/db/database.module";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [PassengerAccountController],
  providers: [PassengerAccountService],
  exports: [PassengerAccountService],
})
export class PassengerAppModule {}
