import { Controller, Headers, Param, Post } from "@nestjs/common";
import { toApiSuccessEnvelope } from "../../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
} from "../../../common/auth/auth.decorators";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { PassengerTrialTripService } from "./passenger-trial-trip.service";

/**
 * The self-serve trial's test driver, for the passenger's own taxi
 * reservation. Returns 404 unless the review demo is enabled in a
 * nonproduction environment.
 */
@Controller("passenger-app/review-demo/rides/:id/trial")
export class PassengerTrialTripController {
  constructor(private readonly trialTrips: PassengerTrialTripService) {}

  @Post("assign")
  @RequireRealms("passenger")
  async assign(
    @Param("id") id: string,
    @CurrentIdentity() identity: RequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.trialTrips.assign(id, identity, requestId),
      requestId,
    );
  }

  @Post("heartbeat")
  @RequireRealms("passenger")
  async heartbeat(
    @Param("id") id: string,
    @CurrentIdentity() identity: RequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.trialTrips.heartbeat(id, identity, requestId),
      requestId,
    );
  }

  @Post("arrive")
  @RequireRealms("passenger")
  async arrive(
    @Param("id") id: string,
    @CurrentIdentity() identity: RequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.trialTrips.arrive(id, identity, requestId),
      requestId,
    );
  }

  @Post("board")
  @RequireRealms("passenger")
  async board(
    @Param("id") id: string,
    @CurrentIdentity() identity: RequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.trialTrips.board(id, identity, requestId),
      requestId,
    );
  }

  @Post("complete")
  @RequireRealms("passenger")
  async complete(
    @Param("id") id: string,
    @CurrentIdentity() identity: RequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.trialTrips.complete(id, identity, requestId),
      requestId,
    );
  }
}
