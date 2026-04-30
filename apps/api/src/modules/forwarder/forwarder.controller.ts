import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  BroadcastForwardedOrderCommand,
  CompleteForwarderReconciliationCommand,
  EngageForwarderManualFallbackCommand,
  IngestExternalOrderCommand,
  ReportForwarderSyncFailureCommand,
  RelayDriverAcceptCommand,
  SyncForwardedOrderStatusCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { ForwarderService } from "./forwarder.service";

@Controller()
export class ForwarderController {
  constructor(private readonly forwarderService: ForwarderService) {}

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
  ingestGrabTaiwanWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.forwarderService.ingestGrabTaiwanWebhook(payload, requestId),
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
