export const MAINTENANCE_STATUS_VALUES = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUS_VALUES)[number];

export const MAINTENANCE_TYPE_VALUES = [
  "routine",
  "repair",
  "inspection",
  "tire_replacement",
  "oil_change",
  "brake_service",
  "engine",
  "electrical",
  "body_work",
  "other",
] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPE_VALUES)[number];

export interface MaintenanceLogRecord {
  logId: string;
  vehicleId: string;
  vehicleRegNo: string | null;
  status: MaintenanceStatus;
  maintenanceType: MaintenanceType;
  description: string;
  scheduledDate: string | null;
  completedDate: string | null;
  nextMaintenanceDate: string | null;
  costAmount: number | null;
  currencyCode: string;
  attachmentUrls: string[];
  recordedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaintenanceLogCommand {
  vehicleId: string;
  vehicleRegNo?: string;
  maintenanceType: MaintenanceType;
  description: string;
  scheduledDate?: string;
  costAmount?: number;
  attachmentUrls?: string[];
  recordedBy?: string;
  notes?: string;
}

export interface UpdateMaintenanceLogCommand {
  status?: MaintenanceStatus;
  completedDate?: string;
  nextMaintenanceDate?: string;
  costAmount?: number;
  notes?: string;
  attachmentUrls?: string[];
}
