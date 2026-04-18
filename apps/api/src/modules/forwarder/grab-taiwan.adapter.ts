import { Injectable, Logger } from "@nestjs/common";

import type {
  ForwarderAdapterAcceptInput,
  ForwarderAdapterActionResult,
  ForwarderAdapterCompleteInput,
  ForwarderAdapterEarningsResult,
  ForwarderAdapterFetchEarningsInput,
  ForwarderAdapterHeartbeatInput,
  ForwarderAdapterHeartbeatResult,
  ForwarderAdapterInterface,
  ForwarderAdapterRejectInput,
} from "./forwarder-adapter.interface";

export const GRAB_TAIWAN_PLATFORM_CODE = "grab_taiwan";

@Injectable()
export class GrabTaiwanAdapter implements ForwarderAdapterInterface {
  readonly platformCode = GRAB_TAIWAN_PLATFORM_CODE;

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
}
