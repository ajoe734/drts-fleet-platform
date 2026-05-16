import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type {
  BroadcastForwardedOrderCommand,
  CompleteForwarderReconciliationCommand,
  DriverForwardedOrderAcceptCommand,
  DriverForwardedOrderRejectCommand,
  EngageForwarderManualFallbackCommand,
  IngestExternalOrderCommand,
  ReportForwarderSyncFailureCommand,
  RelayDriverAcceptCommand,
  SyncForwardedOrderStatusCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { ForwarderService } from "./forwarder.service";

@Controller()
export class ForwarderController {
  constructor(private readonly forwarderService: ForwarderService) {}

  private resolveDriverId(
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
      HttpStatus.BAD_REQUEST,
      "DRIVER_ID_REQUIRED",
      "driverId query is required when the caller is not a driver bootstrap identity.",
    );
  }

  @Post("forwarder/orders/inbound")
  ingestInboundOrder(
    @Body() command: IngestExternalOrderCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.forwarderService.ingestExternalOrder(command, requestId),
      requestId,
    );
  }

  @Post("forwarder/webhooks/grab-taiwan")
  async ingestGrabTaiwanWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.forwarderService.ingestGrabTaiwanWebhook(
        payload,
        headers,
        requestId,
      ),
      requestId,
    );
  }

  @Get("forwarder/orders")
  listForwardedOrders(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.forwarderService.listOrders(),
      },
      requestId,
    );
  }

  @Get("driver/task-views")
  listDriverTaskViews(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("driverId") requestedDriverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity, requestedDriverId);
    return toApiSuccessEnvelope(
      {
        items: this.forwarderService.listDriverTaskViews(driverId),
      },
      requestId,
    );
  }

  @Get("driver/task-views/:taskId")
  getDriverTaskView(
    @Param("taskId") taskId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("driverId") requestedDriverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity, requestedDriverId);
    return toApiSuccessEnvelope(
      this.forwarderService.getDriverTaskView(driverId, taskId),
      requestId,
    );
  }

  @Post("driver/forwarded-orders/:taskId/accept")
  async acceptForwardedOrder(
    @Param("taskId") taskId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: DriverForwardedOrderAcceptCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity, command.driverId);
    return toApiSuccessEnvelope(
      await this.forwarderService.acceptForwardedOrder(
        taskId,
        driverId,
        requestId,
      ),
      requestId,
    );
  }

  @Post("driver/forwarded-orders/:taskId/reject")
  rejectForwardedOrder(
    @Param("taskId") taskId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: DriverForwardedOrderRejectCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity, command.driverId);
    return toApiSuccessEnvelope(
      this.forwarderService.rejectForwardedOrder(
        taskId,
        driverId,
        command.reason,
        requestId,
      ),
      requestId,
    );
  }

  @Post("forwarder/orders/:orderId/broadcast")
  broadcastOrder(
    @Param("orderId") orderId: string,
    @Body() command: BroadcastForwardedOrderCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.forwarderService.broadcastOrder(orderId, command, requestId),
      requestId,
    );
  }

  @Post("forwarder/orders/:orderId/accept")
  async relayDriverAccept(
    @Param("orderId") orderId: string,
    @Body() command: RelayDriverAcceptCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.forwarderService.relayDriverAccept(
        orderId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("forwarder/orders/:orderId/sync-failed")
  reportSyncFailure(
    @Param("orderId") orderId: string,
    @Body() command: ReportForwarderSyncFailureCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.forwarderService.reportSyncFailure(orderId, command, requestId),
      requestId,
    );
  }

  @Post("forwarder/orders/:orderId/manual-fallback")
  engageManualFallback(
    @Param("orderId") orderId: string,
    @Body() command: EngageForwarderManualFallbackCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.forwarderService.engageManualFallback(orderId, command, requestId),
      requestId,
    );
  }

  @Post("forwarder/orders/:orderId/reconciliation/complete")
  completeReconciliation(
    @Param("orderId") orderId: string,
    @Body() command: CompleteForwarderReconciliationCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.forwarderService.completeReconciliation(orderId, command, requestId),
      requestId,
    );
  }

  @Post("forwarder/orders/:orderId/sync-status")
  syncNativeStatus(
    @Param("orderId") orderId: string,
    @Body() command: SyncForwardedOrderStatusCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.forwarderService.syncNativeStatus(orderId, command, requestId),
      requestId,
    );
  }

  @Get("forwarder/adapters/health")
  listAdapterHealth(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.forwarderService.listAdapterHealth(),
      },
      requestId,
    );
  }

  @Get("forwarder/orders/sync-errors")
  listSyncErrors(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.forwarderService.listSyncErrors(),
      },
      requestId,
    );
  }

  @Get("forwarder/reconciliation-jobs")
  listReconciliationJobs(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.forwarderService.listReconciliationJobs(),
      },
      requestId,
    );
  }

  @Get("forwarder/reconciliation-issues")
  listReconciliationIssues(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.forwarderService.listReconciliationIssues(),
      },
      requestId,
    );
  }
}
