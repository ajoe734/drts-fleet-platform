import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpStatus,
  Headers,
  Sse,
} from "@nestjs/common";
import { PassengerBookingService } from "./passenger-booking.service";
import {
  CurrentIdentity,
  RequireRealms,
} from "../../../common/auth/auth.decorators";
import type {
  RequestIdentity,
  PassengerRequestIdentity,
} from "../../../common/auth/auth.types";
import { MultiTaxiService } from "../../multi-taxi/multi-taxi.service";
import { from, map, Observable, mergeMap } from "rxjs";
import { ApiRequestError } from "../../../common/api-envelope";

@Controller("passenger-app/rides")
@RequireRealms("passenger")
export class PassengerBookingController {
  constructor(
    private readonly service: PassengerBookingService,
    private readonly multiTaxiService: MultiTaxiService,
  ) {}

  @Post()
  async createRide(
    @CurrentIdentity() identity: RequestIdentity,
    @Headers("x-request-id") requestId: string,
    @Body() body: any,
  ) {
    if (identity.realm !== "passenger") {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Not a passenger",
      );
    }
    const paxIdentity = identity as PassengerRequestIdentity;
    const passengerId = paxIdentity.drtsPassengerId;
    const { fareSnapshotId, passengerConfirmedAt, paymentMethodTokenRef } =
      body;

    return this.service.createRide(
      passengerId,
      fareSnapshotId,
      passengerConfirmedAt,
      paymentMethodTokenRef || null,
      requestId,
    );
  }

  @Get()
  async listRides(
    @CurrentIdentity() identity: RequestIdentity,
    @Query("limit") limit: string = "10",
    @Query("offset") offset: string = "0",
  ) {
    if (identity.realm !== "passenger")
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Not a passenger",
      );
    const passengerId = (identity as PassengerRequestIdentity).drtsPassengerId;
    return this.service.getRideList(
      passengerId,
      parseInt(limit, 10),
      parseInt(offset, 10),
    );
  }

  @Get("active")
  async getActiveRides(@CurrentIdentity() identity: RequestIdentity) {
    if (identity.realm !== "passenger")
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Not a passenger",
      );
    return this.service.getActiveRides(
      (identity as PassengerRequestIdentity).drtsPassengerId,
    );
  }

  @Get(":id")
  async getRide(
    @CurrentIdentity() identity: RequestIdentity,
    @Param("id") orderId: string,
  ) {
    if (identity.realm !== "passenger")
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Not a passenger",
      );
    return this.service.getRide(
      (identity as PassengerRequestIdentity).drtsPassengerId,
      orderId,
    );
  }

  @Sse(":id/events")
  getRideEvents(
    @CurrentIdentity() identity: RequestIdentity,
    @Param("id") orderId: string,
  ): Observable<any> {
    if (identity.realm !== "passenger")
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Not a passenger",
      );
    const passengerId = (identity as PassengerRequestIdentity).drtsPassengerId;

    return from(this.service.getRide(passengerId, orderId)).pipe(
      map(() =>
        this.multiTaxiService.streamTrustedPassengerEvents(
          orderId,
          passengerId,
        ),
      ),
      mergeMap((obs: any) => obs),
    );
  }

  @Post(":id/cancel")
  async cancelRide(
    @CurrentIdentity() identity: RequestIdentity,
    @Param("id") orderId: string,
    @Headers("x-request-id") requestId: string,
  ) {
    if (identity.realm !== "passenger")
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Not a passenger",
      );
    const passengerId = (identity as PassengerRequestIdentity).drtsPassengerId;
    await this.service.getRide(passengerId, orderId);
    return this.multiTaxiService.cancelTrustedPassengerRide(
      orderId,
      passengerId,
      requestId,
    );
  }

  @Post(":id/ratings")
  async rateRide(
    @CurrentIdentity() identity: RequestIdentity,
    @Param("id") orderId: string,
    @Body() body: any,
  ) {
    if (identity.realm !== "passenger")
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Not a passenger",
      );
    const passengerId = (identity as PassengerRequestIdentity).drtsPassengerId;
    await this.service.getRide(passengerId, orderId);

    const command = {
      score: body.score,
      tags: body.tags || [],
      comment: body.comment || null,
    };
    return this.multiTaxiService.submitTrustedPassengerRating(
      orderId,
      command,
      passengerId,
    );
  }

  @Get(":id/receipt")
  async getReceipt(
    @CurrentIdentity() identity: RequestIdentity,
    @Param("id") orderId: string,
  ) {
    if (identity.realm !== "passenger")
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Not a passenger",
      );
    const passengerId = (identity as PassengerRequestIdentity).drtsPassengerId;
    await this.service.getRide(passengerId, orderId);
    return this.multiTaxiService.getTrustedPassengerReceipt(
      orderId,
      passengerId,
    );
  }
}
