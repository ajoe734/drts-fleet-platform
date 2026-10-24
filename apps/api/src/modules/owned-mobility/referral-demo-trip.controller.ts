import { Controller, Headers, Param, Post } from "@nestjs/common";
import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth/auth.decorators";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { ReferralDemoTripService } from "./referral-demo-trip.service";

/**
 * Dev-only demo routes under the referral passenger prefix, so the same
 * partner realm + partner:book route policy applies. They return 404 unless
 * REFERRAL_DEMO_TRIP_ENABLED=true in a development/test environment.
 */
@Controller("partner/referral/passenger/orders/:orderId/demo-trip")
export class ReferralDemoTripController {
  constructor(private readonly demoTrips: ReferralDemoTripService) {}

  @Post("assign")
  async assign(
    @Param("orderId") orderId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.demoTrips.assign(orderId, identity, requestId),
      requestId,
    );
  }

  @Post("heartbeat")
  async heartbeat(
    @Param("orderId") orderId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.demoTrips.heartbeat(orderId, identity, requestId),
      requestId,
    );
  }

  @Post("arrive")
  async arrive(
    @Param("orderId") orderId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.demoTrips.arrive(orderId, identity, requestId),
      requestId,
    );
  }

  @Post("board")
  async board(
    @Param("orderId") orderId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.demoTrips.board(orderId, identity, requestId),
      requestId,
    );
  }

  @Post("complete")
  async complete(
    @Param("orderId") orderId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.demoTrips.complete(orderId, identity, requestId),
      requestId,
    );
  }
}
