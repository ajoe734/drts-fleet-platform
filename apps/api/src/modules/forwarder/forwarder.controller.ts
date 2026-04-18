import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  BroadcastForwardedOrderCommand,
  IngestExternalOrderCommand,
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
  relayDriverAccept(
    @Param("orderId") orderId: string,
    @Body() command: RelayDriverAcceptCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.forwarderService.relayDriverAccept(orderId, command, requestId),
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
}
