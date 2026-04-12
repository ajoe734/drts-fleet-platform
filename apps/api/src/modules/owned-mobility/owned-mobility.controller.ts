import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
} from "@nestjs/common";

import type {
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
  RedispatchOrderCommand,
  UpdateTenantBookingCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { OwnedMobilityService } from "./owned-mobility.service";

@Controller()
export class OwnedMobilityController {
  constructor(private readonly ownedMobilityService: OwnedMobilityService) {}

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
  listOrders(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.ownedMobilityService.listOrders(),
      },
      requestId,
    );
  }

  @Get("orders/:orderId")
  getOrder(
    @Param("orderId") orderId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.getOrder(orderId),
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
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.createTenantBooking(command, requestId),
      requestId,
    );
  }

  @Get("tenant/bookings")
  listTenantBookings(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.listTenantBookings(),
      requestId,
    );
  }

  @Get("tenant/bookings/:bookingId")
  getTenantBooking(
    @Param("bookingId") bookingId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.getTenantBooking(bookingId),
      requestId,
    );
  }

  @Put("tenant/bookings/:bookingId")
  updateTenantBooking(
    @Param("bookingId") bookingId: string,
    @Body() command: UpdateTenantBookingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.updateTenantBooking(
        bookingId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("tenant/bookings/:bookingId/cancel")
  cancelTenantBooking(
    @Param("bookingId") bookingId: string,
    @Body() command: CancelOwnedOrderCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.ownedMobilityService.cancelTenantBooking(
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

  @Get("dispatch/tasks")
  listDispatchJobs(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.ownedMobilityService.listDispatchJobs(),
      },
      requestId,
    );
  }

  @Get("dispatch/tasks/:dispatchJobId/candidates")
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
  listDriverTasks(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.ownedMobilityService.listDriverTasks(),
      },
      requestId,
    );
  }

  @Get("driver/tasks/:taskId")
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
