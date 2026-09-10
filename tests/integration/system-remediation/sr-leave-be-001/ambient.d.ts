// Ambient type declarations for candidate runtime modules.
// When running in the acceptance workflow, the real candidate modules are checked out and executed.
// These ambient declarations allow static typechecking on branches where candidate sources are not yet merged.

declare module "*/apps/api/src/modules/driver-leave" {
  export const DriverLeaveRepository: any;
  export const DriverLeaveService: any;
  export const DriverLeaveController: any;
  export const DriverLeaveModule: any;
  export const DRIVER_LEAVE_ERROR_CODES: Record<string, string>;
  export const DRIVER_LEAVE_TYPES: readonly string[];
  export const DRIVER_LEAVE_STATUSES: readonly string[];
  export const MAX_PAST_APPLICATION_GRACE_MS: number;
}

declare module "*/apps/api/src/modules/driver-leave/driver-leave.module" {
  export const DriverLeaveModule: any;
}

declare module "*/apps/api/src/modules/driver-leave/driver-leave.repository" {
  export const DriverLeaveRepository: any;
  export interface ShiftSummaryForLeave {
    shiftId: string;
    driverId: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    clockInAt: string;
    clockOutAt: string | null;
    record: Record<string, unknown>;
  }
  export interface MatchingSuppressionRecord {
    sourceIncidentId: string;
    driverId: string;
    active: boolean;
    reasonCode: string;
    expiresAt: string;
    liftedAt: string | null;
    record: Record<string, unknown>;
  }
}

declare module "*/apps/api/src/modules/driver-leave/driver-leave.service" {
  export const DriverLeaveService: any;
}

declare module "*/apps/api/src/modules/driver-leave/driver-leave.constants" {
  export const DRIVER_LEAVE_ERROR_CODES: Record<string, string>;
  export const DRIVER_LEAVE_TYPES: readonly string[];
  export const DRIVER_LEAVE_STATUSES: readonly string[];
  export const MAX_PAST_APPLICATION_GRACE_MS: number;
  export interface DriverLeaveRecord {
    leaveId: string;
    driverId: string;
    leaveType: string;
    startTime: string;
    endTime: string;
    reason: string;
    status: "pending" | "approved" | "rejected" | "withdrawn";
    reviewedByPrincipalId: string | null;
    reviewedAt: string | null;
    reviewNotes: string | null;
    impactedShiftIds: string[];
    createdAt: string;
    updatedAt: string;
  }
  export interface CreateDriverLeaveCommand {
    leaveType: string;
    startTime: string;
    endTime: string;
    reason: string;
  }
  export interface ReviewDriverLeaveCommand {
    decision: "approve" | "reject";
    reviewNotes?: string;
  }
  export interface WithdrawDriverLeaveCommand {
    reason?: string;
  }
  export interface DriverLeaveQueryFilter {
    driverId?: string;
    status?: string;
    startTimeFrom?: string;
    endTimeTo?: string;
    page?: number;
    pageSize?: number;
  }
}

declare module "*/apps/api/src/modules/driver-leave/driver-leave.controller" {
  export const DriverLeaveController: any;
}
