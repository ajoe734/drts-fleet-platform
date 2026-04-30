import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Sse,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { MessageEvent } from "@nestjs/common";
import type { Observable } from "rxjs";

import type {
  ApplyManualFareOverrideCommand,
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
  ResolveExceptionHoldCommand,
  UpdateTenantBookingCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { OwnedMobilityService } from "./owned-mobility.service";

@Controller()
export class OwnedMobilityController {
  constructor(private readonly ownedMobilityService: OwnedMobilityService) {}

  private resolveDriverTaskStreamDriverId(
    identity: BootstrapRequestIdentity | null,
    requestedDriverId?: string,
  ) {
    if (identity?.actorType === "driver_user" && identity.actorId) {
      return identity.actorId;
    }

    const normalizedDriverId = requestedDriverId?.trim();
    if (normalizedDriverId) {
      return normalizedDriverId;
    }

    throw new ApiRequestError(
      400,
      "DRIVER_ID_REQUIRED",
      "driverId query is required when the caller is not a driver bootstrap identity.",
    );
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
  createOwnedOrder(
    @Body() command: CreateOwnedOrderCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const order = this.ownedMobilityService.createPassengerOrder(
      command,
      requestId,
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
  createCallCenterOrder(
    @Body() command: CreateCallCenterOrderCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const order = this.ownedMobilityService.createCallCenterOrder(
      command,
      requestId,
    );
    return toApiSuccessEnvelope(
      {
        orderId: order.orderId,
        orderSource: order.orderSource,
        callId: order.callId,
        recordingId: order.recordingId,
        status: order.status,
      },
      requestId,
    );
  }

  @Post("tenant/bookings")
  createTenantBooking(
    @Body() command: CreateTenantBookingCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.createTenantBooking(
        command,
        this.requireTenantId(tenantId),
        identity,
        requestId,
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
  updateTenantBooking(
    @Param("bookingId") bookingId: string,
    @Body() command: UpdateTenantBookingCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.updateTenantBooking(
        this.requireTenantId(tenantId),
        bookingId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
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
  dispatchOrder(
    @Param("orderId") orderId: string,
    @Body() command: DispatchOrderCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.dispatchOrder(orderId, command, requestId),
      requestId,
    );
  }

  @Post("orders/:orderId/redispatch")
  redispatchOrder(
    @Param("orderId") orderId: string,
    @Body() command: RedispatchOrderCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.redispatchOrder(orderId, command, requestId),
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

  @Post("orders/:orderId/dispatch-timeout")
  handleDispatchTimeout(
    @Param("orderId") orderId: string,
    @Body()
    command: { timeoutReasonCode: "acceptance_timeout" | "matching_timeout" },
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.handleDispatchTimeout(
        orderId,
        command.timeoutReasonCode,
        requestId,
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
  listDispatchCandidates(
    @Param("dispatchJobId") dispatchJobId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.ownedMobilityService.listDispatchCandidates(dispatchJobId),
      },
      requestId,
    );
  }

  @Post("dispatch/assign")
  assignDispatch(
    @Body() command: AssignDispatchCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.assignDispatch(command, requestId),
      requestId,
    );
  }

  @Post("dispatch/reassign")
  reassignDispatch(
    @Body() command: ReassignDispatchCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.reassignDispatch(command, requestId),
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
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listDriverTasks(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.ownedMobilityService.listDriverTasks(),
      },
      requestId,
    );
  }

  @Sse("driver/task-events")
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
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getDriverTask(
    @Param("taskId") taskId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.getDriverTask(taskId),
      requestId,
    );
  }

  @Post("driver/tasks/:taskId/accept")
  acceptDriverTask(
    @Param("taskId") taskId: string,
    @Body() command: DriverAcceptTaskCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.acceptDriverTask(taskId, command, requestId),
      requestId,
    );
  }

  @Post("driver/tasks/:taskId/reject")
  rejectDriverTask(
    @Param("taskId") taskId: string,
    @Body() command: DriverRejectTaskCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.rejectDriverTask(taskId, command, requestId),
      requestId,
    );
  }

  @Post("driver/tasks/:taskId/depart")
  departDriverTask(
    @Param("taskId") taskId: string,
    @Body() command: DriverDepartTaskCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.departDriverTask(taskId, command, requestId),
      requestId,
    );
  }

  @Post("driver/tasks/:taskId/arrived_pickup")
  arrivePickup(
    @Param("taskId") taskId: string,
    @Body() command: DriverArrivedPickupCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.arrivedPickup(taskId, command, requestId),
      requestId,
    );
  }

  @Post("driver/tasks/:taskId/start")
  startDriverTask(
    @Param("taskId") taskId: string,
    @Body() command: DriverStartTaskCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.startDriverTask(taskId, command, requestId),
      requestId,
    );
  }

  @Post("driver/tasks/:taskId/complete")
  completeDriverTask(
    @Param("taskId") taskId: string,
    @Body() command: DriverCompleteTaskCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.completeDriverTask(taskId, command, requestId),
      requestId,
    );
  }
}
