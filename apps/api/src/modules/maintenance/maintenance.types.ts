import { MAINTENANCE_STATUSES, MAINTENANCE_TYPES } from "@drts/contracts";
import type {
  CreateMaintenanceRecordCommand,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
  UpdateMaintenanceRecordCommand,
} from "@drts/contracts";

export const MAINTENANCE_STATUS_VALUES = [...MAINTENANCE_STATUSES] as const;
export const MAINTENANCE_TYPE_VALUES = [...MAINTENANCE_TYPES] as const;

export type MaintenanceLogRecord = MaintenanceRecord;
export type CreateMaintenanceLogCommand = CreateMaintenanceRecordCommand;
export type UpdateMaintenanceLogCommand = UpdateMaintenanceRecordCommand;
export type { MaintenanceStatus, MaintenanceType };
