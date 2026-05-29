import type {
  PlatformAdminTenantRecord,
  TenantRolloutGateStatus,
  TenantRolloutStage,
  TenantRolloutStateMachineRecord,
} from "@drts/contracts";

export interface TenantRolloutStateMachineMeta {
  previousStage: Exclude<TenantRolloutStage, "rollback_hold"> | null;
  previousTenantStatus:
    | Exclude<PlatformAdminTenantRecord["status"], "rollback_hold">
    | null;
}

export type PersistedTenantRolloutRecord = PlatformAdminTenantRecord & {
  rolloutStateMachine?: TenantRolloutStateMachineRecord;
  rolloutStateMachineMeta?: TenantRolloutStateMachineMeta;
};

export interface UpdateTenantRolloutGateStatusCommand {
  gateStatus: TenantRolloutGateStatus;
  reason?: string | null;
}
