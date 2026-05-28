import type { DriverOpsInstruction, UiRefreshMetadata } from "./ui-runtime";

export interface DriverWorkspaceTaskStateSummary {
  total: number;
  actionRequired: number;
  awaitingPlatform: number;
  inProgress: number;
  blocked: number;
  completed: number;
  readOnly: number;
}

export interface DriverWorkspaceActiveTripRef {
  taskId: string;
  orderId: string;
  sourcePlatform:
    | "drts"
    | "uber"
    | "grab"
    | "line-taxi"
    | "grab_taiwan"
    | "indriver"
    | "forwarder_sandbox";
  platformDisplayName: string;
}

export interface DriverWorkspaceStateCountRecord {
  state:
    | "action_required"
    | "awaiting_platform"
    | "in_progress"
    | "blocked"
    | "completed"
    | "read_only";
  count: number;
}

export interface DriverWorkspaceSummary {
  driverId: string;
  taskCounts: DriverWorkspaceTaskStateSummary;
  taskCountsByState: DriverWorkspaceStateCountRecord[];
  activeTrip: DriverWorkspaceActiveTripRef | null;
  outstandingInstructionCount: number;
  instructions: DriverOpsInstruction[];
  refresh: UiRefreshMetadata;
}
