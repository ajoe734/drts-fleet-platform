import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Optional,
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
  CreateMultiTaxiTripOperationalExportJobCommand,
  InvalidatePassengerTripRatingCommand,
  PassengerRatingReviewQuery,
  MultiTaxiTripOperationalRecordQuery,
  QueueCheckInCommand,
  QueueCheckOutCommand,
  SubmitPassengerTripRatingCommand,
  UpdateMultiTaxiOperatingAuthorizationCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  OpenRoute,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { Throttle } from "@nestjs/throttler";
import { OPEN_ROUTE_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { ReportingFilingService } from "../reporting-filing/reporting-filing.service";
import { MultiTaxiService } from "./multi-taxi.service";

@Controller()
export class MultiTaxiController {
  constructor(
    private readonly multiTaxiService: MultiTaxiService,
    @Optional()
    private readonly reportingFilingService?: ReportingFilingService,
  ) {}

  @Post("multi-taxi/rides")
  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
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
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
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
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  streamPassengerRide(
    @Param("accessToken") accessToken: string,
  ): Observable<MessageEvent> {
    return this.multiTaxiService.streamPassengerRide(accessToken);
  }

  @Post("passenger-rides/:accessToken/cancel")
  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
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
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
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
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  async getPassengerContact(
    @Param("accessToken") accessToken: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.getPassengerContact(accessToken, requestId),
      requestId,
    );
  }

  @Get("passenger-rides/:accessToken/receipt")
  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
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

  @Get("platform-admin/multi-taxi/authorizations/:authorizationId/vehicles")
  @RequireRealms("platform")
  listAuthorizedVehicles(
    @Param("authorizationId") authorizationId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.multiTaxiService.listAuthorizedVehicles(authorizationId);
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

  @Post("platform-admin/multi-taxi-ratings/:ratingId/invalidate")
  @RequireRealms("platform")
  @RequireScopes("multi_taxi_ratings:moderate")
  async invalidatePassengerRating(
    @Param("ratingId") ratingId: string,
    @Body() command: InvalidatePassengerTripRatingCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.invalidatePassengerRating(
        ratingId,
        command,
        this.requireActorId(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Get("platform-admin/multi-taxi-ratings")
  @RequireRealms("platform")
  @RequireScopes("multi_taxi_ratings:read")
  async listPassengerRatingReviews(
    @Query() query: PassengerRatingReviewQuery,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.listPassengerRatingReviews(query),
      requestId,
    );
  }

  @Get("platform-admin/multi-taxi-ratings/:ratingId")
  @RequireRealms("platform")
  @RequireScopes("multi_taxi_ratings:read")
  async getPassengerRatingReview(
    @Param("ratingId") ratingId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.getPassengerRatingReview(
        ratingId,
        identity?.scopes.includes("multi_taxi_ratings:moderate") ?? false,
      ),
      requestId,
    );
  }

  @Get("platform-admin/multi-taxi-rating-authorities/:driverId")
  @RequireRealms("platform")
  @RequireScopes("multi_taxi_ratings:read")
  async getDriverRatingAuthority(
    @Param("driverId") driverId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.multiTaxiService.getDriverRatingAuthority(driverId),
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

  private requireActorId(identity: BootstrapRequestIdentity | null) {
    const actorId = identity?.actorId?.trim();
    if (!actorId) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "RATING_MODERATION_ACTOR_REQUIRED",
        "An authenticated actor is required to moderate passenger ratings.",
      );
    }
    return actorId;
  }

  @Post("platform-admin/multi-taxi-trip-records/export-jobs/preview")
  @RequireRealms("platform")
  @RequireScopes("multi_taxi_records:export")
  async previewTripOperationalExport(
    @Body() query: MultiTaxiTripOperationalRecordQuery,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const scope = query ?? {};
    const payload =
      await this.multiTaxiService.exportTripOperationalRecords(scope);
    return toApiSuccessEnvelope(
      this.requireReportingFilingService().previewMultiTaxiTripExport(
        scope,
        payload.rows.length,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("platform-admin/multi-taxi-trip-records/export-jobs")
  @RequireRealms("platform")
  @RequireScopes("multi_taxi_records:export")
  async createTripOperationalExportJob(
    @Body() command: CreateMultiTaxiTripOperationalExportJobCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const payload = await this.multiTaxiService.exportTripOperationalRecords(
      command.scope ?? {},
    );
    return toApiSuccessEnvelope(
      this.requireReportingFilingService().createMultiTaxiTripExportJob(
        command,
        payload.rows,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("platform-admin/multi-taxi-trip-records/export-jobs/:jobId")
  @RequireRealms("platform")
  @RequireScopes("multi_taxi_records:export")
  getTripOperationalExportJob(
    @Param("jobId") jobId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.requireReportingFilingService().getMultiTaxiTripExportJob(
        jobId,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("platform-admin/multi-taxi-trip-records/export-jobs/:jobId/download")
  @RequireRealms("platform")
  @RequireScopes("multi_taxi_records:export")
  downloadTripOperationalExport(
    @Param("jobId") jobId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.requireReportingFilingService().issueMultiTaxiTripExportDownload(
        jobId,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  private requireReportingFilingService() {
    if (!this.reportingFilingService) {
      throw new Error("ReportingFilingService is required for export jobs.");
    }
    return this.reportingFilingService;
  }
}
