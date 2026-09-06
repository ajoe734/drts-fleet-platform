import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Optional,
  Param,
  Post,
  Put,
  Query,
  Res,
  Sse,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { MessageEvent } from "@nestjs/common";
import type { Observable } from "rxjs";

import type {
  ApplyManualFareOverrideCommand,
  ApproveExceptionOverrideCommand,
  AssignDispatchCommand,
  CancelOwnedOrderCommand,
  CreateCallCenterOrderCommand,
  CreateOwnedOrderCommand,
  CreateTenantBookingCommand,
  DispatchOrderCommand,
  DriverAcceptTaskCommand,
  DriverArrivedPickupCommand,
  DriverCompleteTaskCommand,
  DriverDepartTaskCommand,
  DriverRejectTaskCommand,
  DriverStartTaskCommand,
  QueueCheckInCommand,
  QueueCheckOutCommand,
  ReassignDispatchCommand,
  RedispatchOrderCommand,
  RejectExceptionOverrideCommand,
  RequestExceptionOverrideCommand,
  ResolveExceptionHoldCommand,
  UpdateTenantBookingCommand,
  CancelReferralPassengerTripCommand,
  CreateReferralPassengerBookingCommand,
  SubmitReferralPassengerRatingCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  isDriverIdentityMatching,
  normalizeDriverId,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { IdempotencyService } from "../../common/idempotency";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import type { PassthroughResponseLike } from "../../common/idempotency-http";
import { applyIdempotentResponseHeaders } from "../../common/idempotency-http";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { OwnedMobilityService } from "./owned-mobility.service";

@Controller()
export class OwnedMobilityController {
  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly idempotencyService: IdempotencyService,
    @Optional()
    private readonly tenantPartnerService?: TenantPartnerService,
  ) {}

  private resolveDriverTaskStreamDriverId(
    identity: BootstrapRequestIdentity | null,
    requestedDriverId?: string,
  ) {
    if (identity?.realm === "driver" || identity?.actorType === "driver_user") {
      const actorId = identity.actorId;
      if (!actorId) {
        throw new ApiRequestError(
          HttpStatus.UNAUTHORIZED,
          "DRIVER_IDENTITY_REQUIRED",
          "Driver identity actorId is required.",
        );
      }
      const normalized = requestedDriverId?.trim();
      if (normalized && !isDriverIdentityMatching(actorId, normalized)) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "DRIVER_IDENTITY_MISMATCH",
          "Driver identity may only stream its own task events.",
          { actorId, requestedDriverId: normalized },
        );
      }
      return normalizeDriverId(actorId)!;
    }

    const normalizedDriverId = requestedDriverId?.trim();
    if (normalizedDriverId) {
      return normalizedDriverId;
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "DRIVER_ID_REQUIRED",
      "driverId query is required when the caller is not a driver bootstrap identity.",
    );
  }

  private assertDriverTaskAccess(
    taskId: string,
    identity: BootstrapRequestIdentity | null,
  ) {
    const task = this.ownedMobilityService.getDriverTask(taskId);
    if (identity?.realm === "driver" || identity?.actorType === "driver_user") {
      const actorId = identity.actorId;
      if (actorId && !isDriverIdentityMatching(actorId, task.driverId)) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "DRIVER_IDENTITY_MISMATCH",
          "Driver identity cannot access another driver's task.",
          { taskId, actorId, taskDriverId: task.driverId },
        );
      }
    }
    return task;
  }

  private resolveOpsDispatchStreamActorId(
    identity: BootstrapRequestIdentity | null,
  ) {
    if (identity?.realm === "ops" && identity.actorId) {
      return identity.actorId;
    }

    throw new ApiRequestError(
      403,
      "OPS_IDENTITY_REQUIRED",
      "ops dispatch event stream requires an ops bootstrap identity.",
    );
  }

  private requireTenantId(tenantId?: string) {
    const normalizedTenantId = tenantId?.trim();
    if (!normalizedTenantId) {
      throw new ApiRequestError(
        400,
        "TENANT_ID_REQUIRED",
        "x-tenant-id header is required for tenant booking endpoints.",
      );
    }

    return normalizedTenantId;
  }

  @Post("orders")
  async createOwnedOrder(
    @Body() command: CreateOwnedOrderCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-runtime-profile-code") runtimeProfileCode?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const order = await this.ownedMobilityService.createPassengerOrder(
      command,
      identity,
      requestId,
      runtimeProfileCode,
      idempotencyKey,
      { required: true },
    );
    return toApiSuccessEnvelope(
      {
        orderId: order.orderId,
        orderNo: order.orderNo,
        orderDomain: order.orderDomain,
        serviceBucket: order.serviceBucket,
        dispatchSemantics: order.dispatchSemantics,
        status: order.status,
        etaSnapshot: order.etaSnapshot,
      },
      requestId,
    );
  }

  @Get("orders")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listOrders(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.ownedMobilityService.listOrders(),
      },
      requestId,
    );
  }

  @Get("orders/:orderId")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getOrder(
    @Param("orderId") orderId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.getOrder(orderId),
      requestId,
    );
  }

  @Get("orders/:orderId/dispatch-trace")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listOrderDispatchTrace(
    @Param("orderId") orderId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.ownedMobilityService.listDispatchTrace(orderId),
      },
      requestId,
    );
  }

  @Post("call-center/orders")
  async createCallCenterOrder(
    @Body() command: CreateCallCenterOrderCommand,
    @Res({ passthrough: true }) response: PassthroughResponseLike,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-runtime-profile-code") runtimeProfileCode?: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
  ) {
    const result = await this.idempotencyService.execute({
      scope: `crm:callcenter:session:${command.callId ?? ""}:order_create`,
      idempotencyKey,
      requestPath: "call-center/orders",
      payload: command,
      execute: async () => {
        const order = await this.ownedMobilityService.createCallCenterOrder(
          command,
          requestId,
          runtimeProfileCode,
          identity,
        );
        return {
          data: {
            orderId: order.orderId,
            orderSource: order.orderSource,
            callId: order.callId,
            recordingId: order.recordingId,
            status: order.status,
          },
          statusCode: HttpStatus.CREATED,
        };
      },
    });

    applyIdempotentResponseHeaders(response, result);
    return toApiSuccessEnvelope(result.data, requestId);
  }

  @Post("tenant/bookings")
  async createTenantBooking(
    @Body() command: CreateTenantBookingCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-runtime-profile-code") runtimeProfileCode?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const result = await this.ownedMobilityService.createTenantBooking(
      command,
      this.requireTenantId(tenantId),
      identity,
      requestId,
      runtimeProfileCode,
      idempotencyKey,
      { required: true },
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post("partner/bookings")
  async createPartnerBooking(
    @Body() command: CreateTenantBookingCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-runtime-profile-code") runtimeProfileCode?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const resolvedTenantId = this.requireTenantId(tenantId);
    if (command.eligibilityVerificationId && this.tenantPartnerService) {
      await this.tenantPartnerService.hydratePartnerEligibilityVerification(
        command.eligibilityVerificationId,
        identity,
      );
    }
    const result = await this.ownedMobilityService.createTenantBooking(
      command,
      resolvedTenantId,
      identity,
      requestId,
      runtimeProfileCode,
      idempotencyKey,
      { required: true },
    );
    return toApiSuccessEnvelope(
      {
        ...result,
        booking: this.ownedMobilityService.getTenantBooking(
          resolvedTenantId,
          result.bookingId,
          identity,
        ),
        order: this.ownedMobilityService.getOrder(result.orderId, identity),
      },
      requestId,
    );
  }

  @Get("partner/bookings/:bookingId")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async getPartnerBooking(
    @Param("bookingId") bookingId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.ownedMobilityService.resolvePersistedTenantBooking(
        this.requireTenantId(tenantId),
        bookingId,
        identity,
      ),
      requestId,
    );
  }

  @Get("partner/orders/:orderId")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async getPartnerOrder(
    @Param("orderId") orderId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.ownedMobilityService.resolvePersistedOrder(orderId, identity),
      requestId,
    );
  }

  @Post("partner/referral/passenger/bookings")
  async createReferralPassengerBooking(
    @Body() command: CreateReferralPassengerBookingCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-runtime-profile-code") runtimeProfileCode?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const result =
      await this.ownedMobilityService.createReferralPassengerBooking(
        command,
        identity,
        requestId,
        runtimeProfileCode,
        idempotencyKey,
      );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Get("partner/referral/passenger/active")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getReferralPassengerActiveTrip(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.getReferralPassengerActiveTrip(identity),
      requestId,
    );
  }

  @Get("partner/referral/passenger/history")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listReferralPassengerHistory(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.listReferralPassengerHistory(identity),
      requestId,
    );
  }

  @Get("partner/referral/passenger/orders/:orderId/receipt")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getReferralPassengerReceipt(
    @Param("orderId") orderId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.getReferralPassengerReceipt(orderId, identity),
      requestId,
    );
  }

  @Get("partner/referral/passenger/orders/:orderId/receipt/download")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  downloadReferralPassengerReceipt(
    @Param("orderId") orderId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.getReferralPassengerReceipt(orderId, identity),
      requestId,
    );
  }

  @Post("partner/referral/passenger/orders/:orderId/cancel")
  async cancelReferralPassengerTrip(
    @Param("orderId") orderId: string,
    @Body() command: CancelReferralPassengerTripCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.ownedMobilityService.cancelReferralPassengerTrip(
        orderId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("partner/referral/passenger/orders/:orderId/rating")
  async submitReferralPassengerRating(
    @Param("orderId") orderId: string,
    @Body() command: SubmitReferralPassengerRatingCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.ownedMobilityService.submitReferralPassengerRating(
        orderId,
        command,
        identity,
      ),
      requestId,
    );
  }

  @Get("tenant/bookings")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listTenantBookings(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const bookings = this.ownedMobilityService.listTenantBookings(
      this.requireTenantId(tenantId),
    );
    return toApiSuccessEnvelope(
      toApiListData(bookings.items, bookings.pagination),
      requestId,
    );
  }

  @Get("tenant/bookings/:bookingId")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getTenantBooking(
    @Param("bookingId") bookingId: string,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.getTenantBooking(
        this.requireTenantId(tenantId),
        bookingId,
      ),
      requestId,
    );
  }

  @Put("tenant/bookings/:bookingId")
  async updateTenantBooking(
    @Param("bookingId") bookingId: string,
    @Body() command: UpdateTenantBookingCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.ownedMobilityService.updateTenantBooking(
      this.requireTenantId(tenantId),
      bookingId,
      command,
      identity,
      requestId,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post("orders/:orderId/manual-fare-override")
  applyManualFareOverride(
    @Param("orderId") orderId: string,
    @Body() command: ApplyManualFareOverrideCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.applyManualFareOverride(
        orderId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("tenant/bookings/:bookingId/cancel")
  cancelTenantBooking(
    @Param("bookingId") bookingId: string,
    @Body() command: CancelOwnedOrderCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.cancelTenantBooking(
        this.requireTenantId(tenantId),
        bookingId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("passenger/orders/:orderId/cancel")
  cancelOwnedOrder(
    @Param("orderId") orderId: string,
    @Body() command: CancelOwnedOrderCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.cancelOwnedOrder(orderId, command, requestId),
      requestId,
    );
  }

  @Post("orders/:orderId/dispatch")
  async dispatchOrder(
    @Param("orderId") orderId: string,
    @Body() command: DispatchOrderCommand,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.ownedMobilityService.dispatchOrder(
        orderId,
        command,
        requestId,
        idempotencyKey,
        { required: true },
      ),
      requestId,
    );
  }

  @Post("orders/:orderId/redispatch")
  async redispatchOrder(
    @Param("orderId") orderId: string,
    @Body() command: RedispatchOrderCommand,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.ownedMobilityService.redispatchOrder(
        orderId,
        command,
        requestId,
        idempotencyKey,
        { required: true },
      ),
      requestId,
    );
  }

  @Post("orders/:orderId/resolve-exception-hold")
  resolveExceptionHold(
    @Param("orderId") orderId: string,
    @Body() command: ResolveExceptionHoldCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.resolveExceptionHold(
        orderId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("orders/:orderId/request-override")
  requestExceptionOverride(
    @Param("orderId") orderId: string,
    @Body() command: RequestExceptionOverrideCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.requestExceptionOverride(
        orderId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("orders/:orderId/approve-override")
  approveExceptionOverride(
    @Param("orderId") orderId: string,
    @Body() command: ApproveExceptionOverrideCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.approveExceptionOverride(
        orderId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("orders/:orderId/reject-override")
  rejectExceptionOverride(
    @Param("orderId") orderId: string,
    @Body() command: RejectExceptionOverrideCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.rejectExceptionOverride(
        orderId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("orders/:orderId/dispatch-timeout")
  async handleDispatchTimeout(
    @Param("orderId") orderId: string,
    @Body()
    command: {
      timeoutReasonCode: "acceptance_timeout" | "matching_timeout";
      assignmentId?: string;
    },
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.ownedMobilityService.handleDispatchTimeout(
        orderId,
        command.timeoutReasonCode,
        requestId,
        command.assignmentId
          ? { targetAssignmentId: command.assignmentId }
          : undefined,
      ),
      requestId,
    );
  }

  @Post("orders/:orderId/resolve-no-supply")
  resolveNoSupply(
    @Param("orderId") orderId: string,
    @Body()
    command: {
      resolution: "retry_dispatch" | "cancel_with_notification";
      operatorId?: string;
    },
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.resolveNoSupplyOrder(
        orderId,
        command.resolution,
        command.operatorId ?? identity?.actorId ?? undefined,
        requestId,
      ),
      requestId,
    );
  }

  @Get("dispatch/tasks")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listDispatchJobs(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.ownedMobilityService.listDispatchJobs(),
      },
      requestId,
    );
  }

  @Get("dispatch/tasks/:dispatchJobId/candidates")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async listDispatchCandidates(
    @Param("dispatchJobId") dispatchJobId: string,
    @Query("includeIneligible") includeIneligible?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: await this.ownedMobilityService.listDispatchCandidates(
          dispatchJobId,
          includeIneligible === "true",
        ),
      },
      requestId,
    );
  }

  @Post("dispatch/assign")
  async assignDispatch(
    @Body() command: AssignDispatchCommand,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.ownedMobilityService.assignDispatch(
        command,
        requestId,
        idempotencyKey,
        { required: true },
      ),
      requestId,
    );
  }

  @Post("dispatch/reassign")
  async reassignDispatch(
    @Body() command: ReassignDispatchCommand,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.ownedMobilityService.reassignDispatch(
        command,
        requestId,
        idempotencyKey,
        { required: true },
      ),
      requestId,
    );
  }

  @Get("dispatch/queue")
  @RequireRealms("ops")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listQueueEntries(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      toApiListData(this.ownedMobilityService.listQueueEntries()),
      requestId,
    );
  }

  @Get("dispatch/queue/:queueEntryId")
  @RequireRealms("ops")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getQueueEntry(
    @Param("queueEntryId") queueEntryId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.getQueueEntry(queueEntryId),
      requestId,
    );
  }

  @Post("dispatch/queue/check-in")
  queueCheckIn(
    @Body() command: QueueCheckInCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.queueCheckIn(command, requestId),
      requestId,
    );
  }

  @Post("dispatch/queue/check-out")
  queueCheckOut(
    @Body() command: QueueCheckOutCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.queueCheckOut(command, requestId),
      requestId,
    );
  }

  @Get("driver/tasks")
  @RequireRealms("system", "ops", "driver")
  @RequireScopes("driver:read")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listDriverTasks(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Query("driverId") requestedDriverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (identity?.realm === "driver" || identity?.actorType === "driver_user") {
      const actorId = identity.actorId;
      if (
        requestedDriverId &&
        actorId &&
        !isDriverIdentityMatching(actorId, requestedDriverId)
      ) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "DRIVER_IDENTITY_MISMATCH",
          "Driver identity may only view its own tasks.",
          { actorId, requestedDriverId },
        );
      }
      const driverId = normalizeDriverId(actorId) ?? requestedDriverId;
      const allTasks = this.ownedMobilityService.listDriverTasks();
      const items = driverId
        ? allTasks.filter((t) => isDriverIdentityMatching(t.driverId, driverId))
        : allTasks;
      return toApiSuccessEnvelope({ items }, requestId);
    }
    return toApiSuccessEnvelope(
      {
        items: this.ownedMobilityService.listDriverTasks(),
      },
      requestId,
    );
  }

  @Sse("driver/task-events")
  @RequireRealms("system", "ops", "driver")
  @RequireScopes("driver:read")
  streamDriverTaskEvents(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("driverId") requestedDriverId?: string,
  ): Observable<MessageEvent> {
    return this.ownedMobilityService.streamDriverTaskEvents(
      this.resolveDriverTaskStreamDriverId(identity, requestedDriverId),
    );
  }

  @Sse("ops/dispatch-events")
  streamOpsDispatchEvents(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
  ): Observable<MessageEvent> {
    this.resolveOpsDispatchStreamActorId(identity);
    return this.ownedMobilityService.streamOpsDispatchEvents();
  }

  @Get("driver/tasks/:taskId")
  @RequireRealms("system", "ops", "driver")
  @RequireScopes("driver:read")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getDriverTask(
    @Param("taskId") taskId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const task = this.assertDriverTaskAccess(taskId, identity);
    return toApiSuccessEnvelope(
      task,
      requestId,
    );
  }

  @Post("driver/tasks/:taskId/accept")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async acceptDriverTask(
    @Param("taskId") taskId: string,
    @Body() command: DriverAcceptTaskCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertDriverTaskAccess(taskId, identity);
    const task = await this.ownedMobilityService.acceptDriverTask(
      taskId,
      command,
      requestId,
    );
    return toApiSuccessEnvelope(task, requestId);
  }

  @Post("driver/tasks/:taskId/reject")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async rejectDriverTask(
    @Param("taskId") taskId: string,
    @Body() command: DriverRejectTaskCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertDriverTaskAccess(taskId, identity);
    const task = await this.ownedMobilityService.rejectDriverTask(
      taskId,
      command,
      requestId,
    );
    return toApiSuccessEnvelope(task, requestId);
  }

  @Post("driver/tasks/:taskId/depart")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async departDriverTask(
    @Param("taskId") taskId: string,
    @Body() command: DriverDepartTaskCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertDriverTaskAccess(taskId, identity);
    const task = await this.ownedMobilityService.departDriverTask(
      taskId,
      command,
      requestId,
    );
    return toApiSuccessEnvelope(task, requestId);
  }

  @Post("driver/tasks/:taskId/arrived_pickup")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async arrivePickup(
    @Param("taskId") taskId: string,
    @Body() command: DriverArrivedPickupCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertDriverTaskAccess(taskId, identity);
    const task = await this.ownedMobilityService.arrivedPickup(
      taskId,
      command,
      requestId,
    );
    return toApiSuccessEnvelope(task, requestId);
  }

  @Post("driver/tasks/:taskId/start")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async startDriverTask(
    @Param("taskId") taskId: string,
    @Body() command: DriverStartTaskCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertDriverTaskAccess(taskId, identity);
    const task = await this.ownedMobilityService.startDriverTask(
      taskId,
      command,
      requestId,
    );
    return toApiSuccessEnvelope(task, requestId);
  }

  @Post("driver/tasks/:taskId/complete")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async completeDriverTask(
    @Param("taskId") taskId: string,
    @Body() command: DriverCompleteTaskCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertDriverTaskAccess(taskId, identity);
    const completedTask = await this.ownedMobilityService.completeDriverTask(
      taskId,
      command,
      requestId,
    );
    return toApiSuccessEnvelope(completedTask, requestId);
  }
}
