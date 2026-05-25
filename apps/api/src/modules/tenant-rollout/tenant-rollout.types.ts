import type { TenantRolloutGateStatus } from "@drts/contracts";

export interface UpdateTenantRolloutGateStatusCommand {
  gateStatus: TenantRolloutGateStatus;
  reason?: string | null;
}

export interface TenantRolloutReasonCommand {
  reason?: string | null;
}
