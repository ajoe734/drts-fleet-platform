import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Put,
  Sse,
} from "@nestjs/common";
import type { MessageEvent } from "@nestjs/common";
import type { Observable } from "rxjs";

import type {
  AddMultiTaxiAuthorizedVehicleCommand,
  CreateCallCenterMultiTaxiRideCommand,
  CreateMultiTaxiOperatingAuthorizationCommand,
  CreateMultiTaxiRideCommand,
  MultiTaxiTripOperationalRecordQuery,
  QueueCheckInCommand,
  QueueCheckOutCommand,
  SubmitPassengerTripRatingCommand,
  UpdateMultiTaxiOperatingAuthorizationCommand,
} from "@drts/contracts";

import { toApiListData, toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  OpenRoute,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { MultiTaxiService } from "./multi-taxi.service";

@Controller()
export class MultiTaxiController {
  constructor(private readonly multiTaxiService: MultiTaxiService) {}

  @Post("multi-taxi/rides")
  @OpenRoute()
  async createRide(
    @Body() command: CreateMultiTaxiRideCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.createRide(command, identity, requestId),
      requestId,
    );
  }

  @Post("call-center/multi-taxi/rides")
  @RequireRealms("ops")
  async createCallCenterRide(
    @Body() command: CreateCallCenterMultiTaxiRideCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.createCallCenterRide(command, requestId),
      requestId,
    );
  }

  @Get("passenger-rides/:accessToken")
  @OpenRoute()
  async getPassengerRide(
    @Param("accessToken") accessToken: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.getPassengerRide(accessToken),
      requestId,
    );
  }

  @Sse("passenger-rides/:accessToken/events")
  @OpenRoute()
  streamPassengerRide(
    @Param("accessToken") accessToken: string,
  ): Observable<MessageEvent> {
    return this.multiTaxiService.streamPassengerRide(accessToken);
  }

  @Post("passenger-rides/:accessToken/cancel")
  @OpenRoute()
  async cancelPassengerRide(
    @Param("accessToken") accessToken: string,
    @Body() command: { reason?: string },
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.cancelPassengerRide(
        accessToken,
        command.reason,
        requestId,
      ),
      requestId,
    );
  }

  @Post("passenger-rides/:accessToken/ratings")
  @OpenRoute()
  async submitPassengerRating(
    @Param("accessToken") accessToken: string,
    @Body() command: SubmitPassengerTripRatingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.submitPassengerRating(accessToken, command),
      requestId,
    );
  }

  @Post("passenger-rides/:accessToken/contact")
  @OpenRoute()
  async getPassengerContact(
    @Param("accessToken") accessToken: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.getPassengerContact(accessToken),
      requestId,
    );
  }

  @Get("passenger-rides/:accessToken/receipt")
  @OpenRoute()
  async getPassengerReceipt(
    @Param("accessToken") accessToken: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.getPassengerReceipt(accessToken),
      requestId,
    );
  }

  @Post("multi-taxi/dispatch/queue/check-in")
  @RequireRealms("ops")
  queueCheckIn(
    @Body() command: QueueCheckInCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.multiTaxiService.queueCheckIn(command, requestId),
      requestId,
    );
  }

  @Post("multi-taxi/dispatch/queue/check-out")
  @RequireRealms("ops")
  queueCheckOut(
    @Body() command: QueueCheckOutCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.multiTaxiService.queueCheckOut(command, requestId),
      requestId,
    );
  }

  @Get("platform-admin/multi-taxi/authorizations")
  @RequireRealms("platform")
  listAuthorizations(@Headers("x-request-id") requestId?: string) {
    const items = this.multiTaxiService.listAuthorizations();
    return toApiSuccessEnvelope(
      toApiListData(items, {
        page: 1,
        pageSize: items.length,
        totalItems: items.length,
        totalPages: items.length === 0 ? 0 : 1,
      }),
      requestId,
    );
  }

  @Get("platform-admin/multi-taxi/authorizations/:authorizationId")
  @RequireRealms("platform")
  getAuthorization(
    @Param("authorizationId") authorizationId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.multiTaxiService.getAuthorization(authorizationId),
      requestId,
    );
  }

  @Post("platform-admin/multi-taxi/authorizations")
  @RequireRealms("platform")
  createAuthorization(
    @Body() command: CreateMultiTaxiOperatingAuthorizationCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.multiTaxiService.createAuthorization(command),
      requestId,
    );
  }

  @Put("platform-admin/multi-taxi/authorizations/:authorizationId")
  @RequireRealms("platform")
  updateAuthorization(
    @Param("authorizationId") authorizationId: string,
    @Body() command: UpdateMultiTaxiOperatingAuthorizationCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.multiTaxiService.updateAuthorization(authorizationId, command),
      requestId,
    );
  }

  @Post("platform-admin/multi-taxi/authorizations/:authorizationId/activate")
  @RequireRealms("platform")
  activateAuthorization(
    @Param("authorizationId") authorizationId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.multiTaxiService.activateAuthorization(authorizationId),
      requestId,
    );
  }

  @Post("platform-admin/multi-taxi/authorizations/:authorizationId/suspend")
  @RequireRealms("platform")
  suspendAuthorization(
    @Param("authorizationId") authorizationId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.multiTaxiService.suspendAuthorization(authorizationId),
      requestId,
    );
  }

  @Post("platform-admin/multi-taxi/authorizations/:authorizationId/vehicles")
  @RequireRealms("platform")
  addAuthorizedVehicle(
    @Param("authorizationId") authorizationId: string,
    @Body() command: AddMultiTaxiAuthorizedVehicleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.multiTaxiService.addAuthorizedVehicle(authorizationId, command),
      requestId,
    );
  }

  @Get("platform-admin/multi-taxi-trip-records")
  @RequireRealms("platform")
  @RequireScopes("multi_taxi_records:read")
  async listTripOperationalRecords(
    @Query() query: MultiTaxiTripOperationalRecordQuery,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = await this.multiTaxiService.listTripOperationalRecords(query);
    return toApiSuccessEnvelope(
      toApiListData(items, {
        page: 1,
        pageSize: items.length,
        totalItems: items.length,
        totalPages: items.length === 0 ? 0 : 1,
      }),
      requestId,
    );
  }

  @Get("platform-admin/multi-taxi-trip-records/export")
  @RequireRealms("platform")
  @RequireScopes("multi_taxi_records:export")
  async exportTripOperationalRecords(
    @Query() query: MultiTaxiTripOperationalRecordQuery,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.exportTripOperationalRecords(query),
      requestId,
    );
  }
}
