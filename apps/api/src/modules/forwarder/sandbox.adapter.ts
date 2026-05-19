import { Injectable, Logger } from "@nestjs/common";

import type {
  ForwarderAdapterCapabilitySummary,
  PlatformCode,
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
import {
  FORWARDER_SANDBOX_CAPABILITY_SUMMARY,
  FORWARDER_SANDBOX_FIXTURES,
  FORWARDER_SANDBOX_PLATFORM_CODE,
} from "./sandbox.fixtures";

export { FORWARDER_SANDBOX_PLATFORM_CODE } from "./sandbox.fixtures";

@Injectable()
export class SandboxAdapter implements ForwarderAdapterInterface {
  readonly platformCode: PlatformCode = FORWARDER_SANDBOX_PLATFORM_CODE;
  readonly capabilitySummary: ForwarderAdapterCapabilitySummary =
    FORWARDER_SANDBOX_CAPABILITY_SUMMARY;

  private readonly logger = new Logger(SandboxAdapter.name);

  async accept(
    input: ForwarderAdapterAcceptInput,
  ): Promise<ForwarderAdapterActionResult> {
    this.logger.log(
      `Sandbox accept for ${input.externalOrderId} by ${input.driverId}.`,
    );
    return {
      acknowledged: true,
      platformCode: this.platformCode,
      externalOrderId: input.externalOrderId,
      detail: "forwarder_sandbox_accept_stub",
    };
  }

  async reject(
    input: ForwarderAdapterRejectInput,
  ): Promise<ForwarderAdapterActionResult> {
    this.logger.log(
      `Sandbox reject for ${input.externalOrderId} with reason ${input.reason}.`,
    );
    return {
      acknowledged: true,
      platformCode: this.platformCode,
      externalOrderId: input.externalOrderId,
      detail: "forwarder_sandbox_reject_stub",
    };
  }

  async complete(
    input: ForwarderAdapterCompleteInput,
  ): Promise<ForwarderAdapterActionResult> {
    this.logger.log(`Sandbox complete for ${input.externalOrderId}.`);
    return {
      acknowledged: true,
      platformCode: this.platformCode,
      externalOrderId: input.externalOrderId,
      detail: "forwarder_sandbox_complete_stub",
    };
  }

  async heartbeat(
    input?: ForwarderAdapterHeartbeatInput,
  ): Promise<ForwarderAdapterHeartbeatResult> {
    this.logger.log(
      `Sandbox heartbeat${input?.payload ? " with payload" : ""}.`,
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
      `Sandbox fetchEarnings${input?.driverId ? ` for driver ${input.driverId}` : ""}.`,
    );
    return {
      ...FORWARDER_SANDBOX_FIXTURES.settlementSample,
      asOf: new Date().toISOString(),
    };
  }

  async verifyWebhook(): Promise<ForwarderAdapterWebhookVerificationResult> {
    return {
      accepted: true,
      detail: "forwarder_sandbox_webhook_stub",
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
      message:
        "Forwarder sandbox adapter is stub-only and must never be treated as production partner evidence.",
      checkedAt: new Date().toISOString(),
    };
  }
}
