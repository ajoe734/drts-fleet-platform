import type { CommandReceipt, TeslaRemoteCommandType } from "@drts/contracts";

// Phase 2 scaffold: Tesla Fleet API remote-command bridge port.
//
// Interface-only. A concrete adapter (Tesla Fleet API client / mock) is wired
// by a downstream Phase 2 execution wave. Commands are idempotent on
// idempotencyKey so retries never double-issue against the vehicle.

export interface IssueTeslaCommandInput {
  vehicleId: string;
  externalVehicleRef: string;
  commandType: TeslaRemoteCommandType;
  idempotencyKey: string;
  issuedBy: string;
  params?: Record<string, unknown>;
}

export interface TeslaRemoteCommandPort {
  issueCommand(input: IssueTeslaCommandInput): Promise<CommandReceipt>;
  getReceipt(commandId: string): Promise<CommandReceipt | null>;
}
