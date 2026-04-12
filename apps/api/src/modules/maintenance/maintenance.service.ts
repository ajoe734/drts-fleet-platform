import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type { AuditLogRecord } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { MaintenanceRepository } from "./maintenance.repository";
import type {
  CreateMaintenanceLogCommand,
  MaintenanceLogRecord,
  MaintenanceStatus,
  MaintenanceType,
  UpdateMaintenanceLogCommand,
} from "./maintenance.types";
import {
  MAINTENANCE_STATUS_VALUES,
  MAINTENANCE_TYPE_VALUES,
} from "./maintenance.types";

@Injectable()
export class MaintenanceService implements OnModuleInit {
  private sequence = 1;
  private records: MaintenanceLogRecord[] = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly repository?: MaintenanceRepository,
  ) {}

  async onModuleInit() {
    if (!this.repository) return;
    try {
      const state = await this.repository.loadState();
      if (state.records.length === 0) return;
      this.records = state.records.map((r) => ({ ...r }));
      this.sequence = this.deriveNextSequence(state.records);
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  createMaintenanceLog(
    command: CreateMaintenanceLogCommand,
    requestId?: string,
  ) {
    this.assertValidType(command.maintenanceType);
    this.assertNonBlank(command.vehicleId, "vehicleId");
    this.assertNonBlank(command.description, "description");

    const now = new Date().toISOString();
    const logId = `MNT-${String(this.sequence++).padStart(6, "0")}`;
    const record: MaintenanceLogRecord = {
      logId,
      vehicleId: command.vehicleId,
      vehicleRegNo: command.vehicleRegNo ?? null,
      status: command.scheduledDate ? "scheduled" : "in_progress",
      maintenanceType: command.maintenanceType,
      description: command.description,
      scheduledDate: command.scheduledDate ?? null,
      completedDate: null,
      nextMaintenanceDate: null,
      costAmount: command.costAmount ?? null,
      currencyCode: "TWD",
      attachmentUrls: command.attachmentUrls ?? [],
      recordedBy: command.recordedBy ?? null,
      notes: command.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.records = [record, ...this.records];
    this.persist({ records: [record] }, "create_maintenance");
    this.recordAudit(
      {
        actorId: command.recordedBy ?? null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "maintenance",
        actionName: "create_maintenance_log",
        resourceType: "maintenance_log",
        resourceId: logId,
        newValuesSummary: {
          vehicleId: command.vehicleId,
          maintenanceType: command.maintenanceType,
          status: record.status,
        },
      },
      requestId,
    );

    return { ...record };
  }

  listMaintenanceLogs(vehicleId?: string) {
    let result = this.records.map((r) => ({ ...r }));
    if (vehicleId) {
      result = result.filter((r) => r.vehicleId === vehicleId);
    }
    return result;
  }

  getMaintenanceLog(logId: string) {
    return { ...this.require(logId) };
  }

  updateMaintenanceLog(
    logId: string,
    command: UpdateMaintenanceLogCommand,
    requestId?: string,
  ) {
    const record = this.require(logId);
    const updated: MaintenanceLogRecord = {
      ...record,
      status: command.status ?? record.status,
      completedDate: command.completedDate ?? record.completedDate,
      nextMaintenanceDate:
        command.nextMaintenanceDate ?? record.nextMaintenanceDate,
      costAmount: command.costAmount ?? record.costAmount,
      notes: command.notes ?? record.notes,
      attachmentUrls: command.attachmentUrls ?? record.attachmentUrls,
      updatedAt: new Date().toISOString(),
    };

    this.replace(updated);
    this.persist({ records: [updated] }, "update_maintenance");
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "maintenance",
        actionName: "update_maintenance_log",
        resourceType: "maintenance_log",
        resourceId: logId,
        newValuesSummary: {
          status: updated.status,
          completedDate: updated.completedDate,
        },
      },
      requestId,
    );

    return { ...updated };
  }

  private require(logId: string) {
    const record = this.records.find((r) => r.logId === logId);
    if (!record) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Maintenance record not found.",
        { logId },
      );
    }
    return record;
  }

  private replace(updated: MaintenanceLogRecord) {
    this.records = this.records.map((r) =>
      r.logId === updated.logId ? updated : r,
    );
  }

  private deriveNextSequence(records: readonly MaintenanceLogRecord[]) {
    const maxSeq = records.reduce((max, r) => {
      const num = parseInt(r.logId.replace("MNT-", ""), 10);
      return Number.isInteger(num) ? Math.max(max, num) : max;
    }, 0);
    return maxSeq + 1;
  }

  private persist(
    changes: { records?: readonly MaintenanceLogRecord[] },
    context: string,
  ) {
    if (!this.repository) return;
    const payload: { records?: MaintenanceLogRecord[] } = {};
    if (changes.records) {
      payload.records = changes.records.map((r) => ({ ...r }));
    }
    void this.repository.persistChanges(payload).catch((error: unknown) => {
      this.repository!.reportPersistenceFailure(error, context);
    });
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const log = { ...input };
    if (requestId) (log as any).requestId = requestId;
    this.auditNotificationService.recordAuditLog(log);
  }

  private assertValidType(type: string): asserts type is MaintenanceType {
    if (!MAINTENANCE_TYPE_VALUES.includes(type as MaintenanceType)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid maintenance type.",
        { type },
      );
    }
  }

  private assertValidStatus(
    status: string,
  ): asserts status is MaintenanceStatus {
    if (!MAINTENANCE_STATUS_VALUES.includes(status as MaintenanceStatus)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid maintenance status.",
        { status },
      );
    }
  }

  private assertNonBlank(value: string, fieldName: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} is required.`,
        { field: fieldName },
      );
    }
  }
}
