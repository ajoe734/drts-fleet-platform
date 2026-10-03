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
      "Honest unavailable posture: this adapter lacks real upstream contracts.",
      "Not approved for production auth, webhook verification, or rate-limit governance.",
    ],
  };

  private readonly logger = new Logger(GrabTaiwanAdapter.name);

  async accept(
    input: ForwarderAdapterAcceptInput,
  ): Promise<ForwarderAdapterActionResult> {
    this.logger.error(
      `Rejecting accept for ${input.externalOrderId}: MISSING_PROVIDER_CONTRACT`,
    );
    return {
      acknowledged: false,
      platformCode: this.platformCode,
      externalOrderId: input.externalOrderId,
      detail: "MISSING_PROVIDER_CONTRACT: Real Grab Taiwan transport is not wired.",
    };
  }

  async reject(
    input: ForwarderAdapterRejectInput,
  ): Promise<ForwarderAdapterActionResult> {
    this.logger.error(
      `Rejecting reject for ${input.externalOrderId}: MISSING_PROVIDER_CONTRACT`,
    );
    return {
      acknowledged: false,
      platformCode: this.platformCode,
      externalOrderId: input.externalOrderId,
      detail: "MISSING_PROVIDER_CONTRACT: Real Grab Taiwan transport is not wired.",
    };
  }

  async complete(
    input: ForwarderAdapterCompleteInput,
  ): Promise<ForwarderAdapterActionResult> {
    this.logger.error(`Rejecting complete for ${input.externalOrderId}: MISSING_PROVIDER_CONTRACT`);
    return {
      acknowledged: false,
      platformCode: this.platformCode,
      externalOrderId: input.externalOrderId,
      detail: "MISSING_PROVIDER_CONTRACT: Real Grab Taiwan transport is not wired.",
    };
  }

  async heartbeat(
    input?: ForwarderAdapterHeartbeatInput,
  ): Promise<ForwarderAdapterHeartbeatResult> {
    this.logger.error(
      `Rejecting heartbeat for ${this.platformCode}: MISSING_PROVIDER_CONTRACT`,
    );
    return {
      acknowledged: false,
      platformCode: this.platformCode,
      checkedAt: new Date().toISOString(),
    };
  }

  async fetchEarnings(
    input?: ForwarderAdapterFetchEarningsInput,
  ): Promise<ForwarderAdapterEarningsResult> {
    this.logger.error(
      `Rejecting fetchEarnings for ${this.platformCode}: MISSING_PROVIDER_CONTRACT`,
    );
    throw new Error("MISSING_PROVIDER_CONTRACT: Real Grab Taiwan transport is not wired.");
  }

  async verifyWebhook(
    input: { headers: Record<string, string | string[] | undefined>; payload: Record<string, unknown> }
  ): Promise<ForwarderAdapterWebhookVerificationResult> {
    this.logger.error(
      `Rejecting verifyWebhook for ${this.platformCode}: MISSING_PROVIDER_CONTRACT`,
    );
    return {
      accepted: false,
      detail: "MISSING_PROVIDER_CONTRACT: Real Grab Taiwan transport is not wired.",
      credentialStatus: "missing",
      authStatus: "unauthenticated",
      webhookStatus: "unverified",
    };
  }

  async getHealthSnapshot(): Promise<ForwarderAdapterHealthSnapshot> {
    return {
      status: "degraded",
      reason: "MISSING_PROVIDER_CONTRACT",
      credentialStatus: "missing",
      authStatus: "unauthenticated",
      webhookStatus: "unverified",
      rateLimitStatus: "unknown",
      message: "Grab Taiwan adapter is unavailable (missing real upstream contracts).",
      checkedAt: new Date().toISOString(),
    };
  }
}
