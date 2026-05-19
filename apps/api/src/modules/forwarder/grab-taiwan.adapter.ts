import { Injectable, Logger } from "@nestjs/common";
import {
  PLATFORM_CODE_GRAB_TAIWAN,
  type ForwarderAdapterCapabilitySummary,
} from "@drts/contracts";

import type {
  ForwarderAdapterAcceptInput,
  ForwarderAdapterActionResult,
  ForwarderAdapterCompleteInput,
  ForwarderAdapterEarningsResult,
  ForwarderAdapterFetchEarningsInput,
  ForwarderAdapterHealthSnapshot,
  ForwarderAdapterHeartbeatInput,
  ForwarderAdapterHeartbeatResult,
  ForwarderAdapterInterface,
  ForwarderAdapterRejectInput,
  ForwarderAdapterWebhookVerificationResult,
} from "./forwarder-adapter.interface";

export const GRAB_TAIWAN_PLATFORM_CODE = PLATFORM_CODE_GRAB_TAIWAN;

@Injectable()
export class GrabTaiwanAdapter implements ForwarderAdapterInterface {
  readonly platformCode = GRAB_TAIWAN_PLATFORM_CODE;
  readonly capabilitySummary: ForwarderAdapterCapabilitySummary = {
    mode: "stub",
    productionStatus: "stub",
    supportsInboundWebhook: true,
    supportsOutboundActions: true,
    supportedWebhookEvents: [
      "forwarder.order.received",
      "forwarder.order.accept_pending",
      "forwarder.order.confirmed_by_platform",
      "forwarder.order.sync_failed",
    ],
    notes: [
      "Stub-only adapter for local integration scaffolding.",
      "Not approved for production auth, webhook verification, or rate-limit governance.",
    ],
  };

  private readonly logger = new Logger(GrabTaiwanAdapter.name);

  async accept(
    input: ForwarderAdapterAcceptInput,
  ): Promise<ForwarderAdapterActionResult> {
    this.logger.log(
      `Stub accept for ${input.externalOrderId} by driver ${input.driverId}.`,
    );
    return {
      acknowledged: true,
      platformCode: this.platformCode,
      externalOrderId: input.externalOrderId,
      detail: "grab_taiwan_accept_stub",
    };
  }

  async reject(
    input: ForwarderAdapterRejectInput,
  ): Promise<ForwarderAdapterActionResult> {
    this.logger.log(
      `Stub reject for ${input.externalOrderId} with reason ${input.reason}.`,
    );
    return {
      acknowledged: true,
      platformCode: this.platformCode,
      externalOrderId: input.externalOrderId,
      detail: "grab_taiwan_reject_stub",
    };
  }

  async complete(
    input: ForwarderAdapterCompleteInput,
  ): Promise<ForwarderAdapterActionResult> {
    this.logger.log(`Stub complete for ${input.externalOrderId}.`);
    return {
      acknowledged: true,
      platformCode: this.platformCode,
      externalOrderId: input.externalOrderId,
      detail: "grab_taiwan_complete_stub",
    };
  }

  async heartbeat(
    input?: ForwarderAdapterHeartbeatInput,
  ): Promise<ForwarderAdapterHeartbeatResult> {
    this.logger.log(
      `Stub heartbeat for ${this.platformCode}${input ? " with payload" : ""}.`,
    );
    return {
      acknowledged: true,
      platformCode: this.platformCode,
      checkedAt: new Date().toISOString(),
    };
  }

  async fetchEarnings(
    input?: ForwarderAdapterFetchEarningsInput,
  ): Promise<ForwarderAdapterEarningsResult> {
    this.logger.log(
      `Stub fetchEarnings for ${this.platformCode}${input?.driverId ? ` driver ${input.driverId}` : ""}.`,
    );
    return {
      platformCode: this.platformCode,
      currency: "TWD",
      totalAmount: 0,
      asOf: new Date().toISOString(),
    };
  }

  async verifyWebhook(): Promise<ForwarderAdapterWebhookVerificationResult> {
    return {
      accepted: true,
      detail: "grab_taiwan_webhook_stub",
      credentialStatus: "stub",
      authStatus: "stub",
      webhookStatus: "stub",
    };
  }

  async getHealthSnapshot(): Promise<ForwarderAdapterHealthSnapshot> {
    return {
      status: "healthy",
      reason: "stub",
      credentialStatus: "stub",
      authStatus: "stub",
      webhookStatus: "stub",
      rateLimitStatus: "stub",
      message: "Grab Taiwan adapter is stub-only and not production approved.",
      checkedAt: new Date().toISOString(),
    };
  }
}
