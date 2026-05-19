import { Logger } from "@nestjs/common";
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
  ForwarderAdapterWebhookVerificationInput,
  ForwarderAdapterWebhookVerificationResult,
} from "./forwarder-adapter.interface";
import {
  FORWARDER_SANDBOX_SUPPORTED_WEBHOOK_EVENTS,
  type ForwarderSandboxFixtures,
} from "./sandbox.fixtures";

export class ForwarderSandboxAdapter implements ForwarderAdapterInterface {
  readonly platformCode: PlatformCode;
  readonly capabilitySummary: ForwarderAdapterCapabilitySummary;

  private readonly logger = new Logger(ForwarderSandboxAdapter.name);

  constructor(protected readonly fixtures: ForwarderSandboxFixtures) {
    this.platformCode = fixtures.platformCode;
    this.capabilitySummary = {
      mode: "hybrid",
      productionStatus: "stub",
      supportsInboundWebhook: true,
      supportsOutboundActions: true,
      supportedWebhookEvents: [...FORWARDER_SANDBOX_SUPPORTED_WEBHOOK_EVENTS],
      notes: [
        `${fixtures.providerDisplayName} is backed by a deterministic sandbox harness for non-production forwarder verification.`,
        "Broadcast remains a local DRTS action; accept, lost_race, cancel, complete, and settlement sample flows come from sandbox fixtures.",
      ],
    };
  }

  async accept(
    input: ForwarderAdapterAcceptInput,
  ): Promise<ForwarderAdapterActionResult> {
    this.logger.log(
      `Sandbox accept for ${input.externalOrderId} by driver ${input.driverId}.`,
    );
    return this.buildActionResult("sandbox_accept_ack", input.externalOrderId);
  }

  async reject(
    input: ForwarderAdapterRejectInput,
  ): Promise<ForwarderAdapterActionResult> {
    this.logger.log(
      `Sandbox reject for ${input.externalOrderId} with reason ${input.reason}.`,
    );
    return this.buildActionResult("sandbox_reject_ack", input.externalOrderId);
  }

  async complete(
    input: ForwarderAdapterCompleteInput,
  ): Promise<ForwarderAdapterActionResult> {
    this.logger.log(`Sandbox complete for ${input.externalOrderId}.`);
    return this.buildActionResult(
      "sandbox_complete_ack",
      input.externalOrderId,
    );
  }

  async heartbeat(
    input?: ForwarderAdapterHeartbeatInput,
  ): Promise<ForwarderAdapterHeartbeatResult> {
    this.logger.log(
      `Sandbox heartbeat for ${this.platformCode}${input ? " with payload" : ""}.`,
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
    const rows = this.fixtures.settlementSample.rows.filter(
      (row) => !input?.driverId || row.driverId === input.driverId,
    );
    return {
      platformCode: this.platformCode,
      currency: this.fixtures.settlementSample.currency,
      totalAmount: rows.reduce((sum, row) => sum + row.totalAmount, 0),
      asOf: this.fixtures.settlementSample.generatedAt,
    };
  }

  async verifyWebhook(
    input: ForwarderAdapterWebhookVerificationInput,
  ): Promise<ForwarderAdapterWebhookVerificationResult> {
    const signature = this.readHeader(
      input.headers,
      this.fixtures.signatureHeaderName,
    );
    const providerKey = this.readPayloadString(input.payload, [
      "sandboxProviderKey",
      "sandboxProvider",
      "providerKey",
    ]);
    const platformCode = this.readPayloadString(input.payload, [
      "platformCode",
    ]);

    if (!signature) {
      return {
        accepted: false,
        detail: `Missing sandbox signature header ${this.fixtures.signatureHeaderName}.`,
        credentialStatus: "stub",
        authStatus: "stub",
        webhookStatus: "failing",
      };
    }

    if (providerKey && providerKey !== this.fixtures.providerKey) {
      return {
        accepted: false,
        detail: `Sandbox provider mismatch: expected ${this.fixtures.providerKey}, got ${providerKey}.`,
        credentialStatus: "stub",
        authStatus: "stub",
        webhookStatus: "failing",
      };
    }

    if (platformCode && platformCode !== this.platformCode) {
      return {
        accepted: false,
        detail: `Sandbox platform mismatch: expected ${this.platformCode}, got ${platformCode}.`,
        credentialStatus: "stub",
        authStatus: "stub",
        webhookStatus: "failing",
      };
    }

    return {
      accepted: true,
      detail: `sandbox webhook accepted (${this.fixtures.providerKey})`,
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
      message: `${this.fixtures.providerDisplayName} sandbox adapter is enabled for non-production verification only.`,
      checkedAt: new Date().toISOString(),
    };
  }

  private buildActionResult(
    detail: string,
    externalOrderId: string,
  ): ForwarderAdapterActionResult {
    return {
      acknowledged: true,
      platformCode: this.platformCode,
      externalOrderId,
      detail,
    };
  }

  private readHeader(
    headers: ForwarderAdapterWebhookVerificationInput["headers"],
    headerName: string,
  ) {
    const value = headers[headerName];
    if (Array.isArray(value)) {
      return value.find(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.trim().length > 0,
      );
    }
    return typeof value === "string" && value.trim() ? value : null;
  }

  private readPayloadString(
    payload: Record<string, unknown>,
    keys: readonly string[],
  ) {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }
}
