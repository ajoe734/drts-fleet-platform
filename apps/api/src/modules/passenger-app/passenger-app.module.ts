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

@Global()
@Module({
  imports: [DatabaseModule, GeoModule, ServiceAreaModule],
  controllers: [PassengerAccountController, PassengerFareController],
  providers: [
    PassengerJwtService,
    PassengerAccountRepository,
    PassengerAccountService,
    PassengerFareRepository,
    PassengerFareService,
  ],
  exports: [
    PassengerAccountService,
    PassengerJwtService,
    PassengerFareRepository,
    PassengerFareService,
  ],
})
export class PassengerAppModule {}
