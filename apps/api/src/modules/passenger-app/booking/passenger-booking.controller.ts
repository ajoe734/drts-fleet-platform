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
import {
  CreatePassengerRideCommand,
  RatePassengerRideCommand,
} from "@drts/contracts";

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
    @Headers("x-request-id") idempotencyKey: string,
    @Body() body: CreatePassengerRideCommand,
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

    return this.service.createRide(passengerId, body, idempotencyKey);
  }

  @Get()
  async listRides(
    @CurrentIdentity() identity: RequestIdentity,
    @Query("limit") limit: string = "10",
    @Query("cursor") cursor?: string,
    @Query("status") status?: "active" | "completed" | "cancelled",
  ) {
    if (identity.realm !== "passenger")
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Not a passenger",
      );

    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_PAGINATION",
        "Limit must be between 1 and 100",
      );
    }

    const passengerId = (identity as PassengerRequestIdentity).drtsPassengerId;
    return this.service.getRideList(
      passengerId,
      parsedLimit,
      cursor,
      status,
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
    const passengerId = (identity as PassengerRequestIdentity).drtsPassengerId;
    const ride = await this.service.getRide(passengerId, orderId);
    return { ride };
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
    @Headers("x-request-id") idempotencyKey: string,
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
    await this.multiTaxiService.cancelTrustedPassengerRide(
      orderId,
      passengerId,
      idempotencyKey,
    );
    return { success: true };
  }

  @Post(":id/ratings")
  async rateRide(
    @CurrentIdentity() identity: RequestIdentity,
    @Param("id") orderId: string,
    @Body() body: RatePassengerRideCommand,
  ) {
    // idempotencyKey check bypass
    if (identity.realm !== "passenger")
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Not a passenger",
      );
    const passengerId = (identity as PassengerRequestIdentity).drtsPassengerId;
    await this.service.getRide(passengerId, orderId);

    if (![1, 2, 3, 4, 5].includes(body.rating)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PASSENGER_RATING_SCORE_INVALID",
        "Rating must be between 1 and 5",
      );
    }

    const command = {
      score: body.rating as 1 | 2 | 3 | 4 | 5,
      tags: body.tags || [],
      comment: body.comments || null,
    };
    await this.multiTaxiService.submitTrustedPassengerRating(
      orderId,
      command,
      passengerId,
    );
    return { success: true };
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
    
    const receipt = await this.multiTaxiService.getTrustedPassengerReceipt(
      orderId,
      passengerId,
    );
    return { receiptUrl: receipt.htmlUrl };
  }
}
