import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type { RocFallbackToHumanCommand } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { RocOperationsService } from "./roc-operations.service";

@Controller("roc")
export class RocOperationsController {
  constructor(private readonly rocOperationsService: RocOperationsService) {}

  @Get("bookings/:bookingId/fallback-reports")
  listFallbackReports(
    @Param("bookingId") bookingId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.rocOperationsService.listFallbackReportsForBooking(
          bookingId,
        ),
      },
      requestId,
    );
  }

  @Post("trips/:tripId/fallback-to-human")
  async fallbackToHuman(
    @Param("tripId") tripId: string,
    @Body() command: RocFallbackToHumanCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.rocOperationsService.fallbackTripToHuman(
        tripId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }
}
