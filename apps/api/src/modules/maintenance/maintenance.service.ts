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
    this.assertValidType(command.type);
    this.assertNonBlank(command.vehicleId, "vehicleId");
    this.assertNonBlank(command.description, "description");

    const now = new Date().toISOString();
    const maintenanceId = `MNT-${String(this.sequence++).padStart(6, "0")}`;
    const record: MaintenanceLogRecord = {
      maintenanceId,
      vehicleId: command.vehicleId,
      type: command.type,
      description: command.description,
      status: this.resolveInitialStatus(command),
      scheduledAt: command.scheduledAt ?? null,
      completedAt: command.completedAt ?? null,
      technician: command.technician ?? null,
      cost: command.cost ?? null,
      notes: command.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.records = [record, ...this.records];
    this.persist({ records: [record] }, "create_maintenance");
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "maintenance",
        actionName: "create_maintenance_log",
        resourceType: "maintenance_log",
        resourceId: maintenanceId,
        newValuesSummary: {
          vehicleId: command.vehicleId,
          maintenanceType: command.type,
          status: record.status,
        },
      },
      requestId,
    );

    return { ...record };
  }

  listMaintenanceLogs(vehicleId?: string) {
    let result = this.records.map((r) => this.normalizeStatus(r));
    if (vehicleId) {
      result = result.filter((r) => r.vehicleId === vehicleId);
    }
    return result;
  }

  getMaintenanceLog(maintenanceId: string) {
    return this.normalizeStatus(this.require(maintenanceId));
  }

  updateMaintenanceLog(
    maintenanceId: string,
    command: UpdateMaintenanceLogCommand,
    requestId?: string,
  ) {
    const record = this.require(maintenanceId);
    const updated: MaintenanceLogRecord = {
      ...record,
      status: command.status ?? record.status,
      completedAt: command.completedAt ?? record.completedAt,
      technician: command.technician ?? record.technician,
      cost: command.cost ?? record.cost,
      notes: command.notes ?? record.notes,
      updatedAt: new Date().toISOString(),
    };

    if (command.status !== undefined) {
      this.assertValidStatus(command.status);
    }
    if (command.status === "completed" && updated.completedAt === null) {
      updated.completedAt = updated.updatedAt;
    }
    if (command.completedAt !== undefined && command.status === undefined) {
      updated.status = "completed";
    }

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
        resourceId: maintenanceId,
        newValuesSummary: {
          status: updated.status,
          completedAt: updated.completedAt,
        },
      },
      requestId,
    );

    return this.normalizeStatus(updated);
  }

  deleteMaintenanceLog(maintenanceId: string, requestId?: string) {
    const record = this.require(maintenanceId);
    this.records = this.records.filter(
      (candidate) => candidate.maintenanceId !== maintenanceId,
    );
    this.persist({ deletedIds: [maintenanceId] }, "delete_maintenance");
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "maintenance",
        actionName: "delete_maintenance_log",
        resourceType: "maintenance_log",
        resourceId: maintenanceId,
        newValuesSummary: {
          vehicleId: record.vehicleId,
          status: record.status,
        },
      },
      requestId,
    );

    return { deleted: true, maintenanceId };
  }

  private require(maintenanceId: string) {
    const record = this.records.find(
      (candidate) => candidate.maintenanceId === maintenanceId,
    );
    if (!record) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Maintenance record not found.",
        { maintenanceId },
      );
    }
    return record;
  }

  private replace(updated: MaintenanceLogRecord) {
    this.records = this.records.map((r) =>
      r.maintenanceId === updated.maintenanceId ? updated : r,
    );
  }

  private deriveNextSequence(records: readonly MaintenanceLogRecord[]) {
    const maxSeq = records.reduce((max, r) => {
      const num = parseInt(r.maintenanceId.replace("MNT-", ""), 10);
      return Number.isInteger(num) ? Math.max(max, num) : max;
    }, 0);
    return maxSeq + 1;
  }

  private persist(
    changes: {
      records?: readonly MaintenanceLogRecord[];
      deletedIds?: readonly string[];
    },
    context: string,
  ) {
    if (!this.repository) return;
    const payload: {
      records?: MaintenanceLogRecord[];
      deletedIds?: string[];
    } = {};
    if (changes.records) {
      payload.records = changes.records.map((r) => ({ ...r }));
    }
    if (changes.deletedIds) {
      payload.deletedIds = [...changes.deletedIds];
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

  private resolveInitialStatus(
    command: CreateMaintenanceLogCommand,
  ): MaintenanceStatus {
    if (command.completedAt) {
      return "completed";
    }
    if (command.scheduledAt) {
      return new Date(command.scheduledAt).getTime() < Date.now()
        ? "overdue"
        : "scheduled";
    }
    return "in_progress";
  }

  private normalizeStatus(record: MaintenanceLogRecord): MaintenanceLogRecord {
    if (record.status === "completed" || record.status === "cancelled") {
      return { ...record };
    }

    if (!record.scheduledAt) {
      return { ...record };
    }

    const overdue = new Date(record.scheduledAt).getTime() < Date.now();
    const nextStatus =
      overdue && (record.status === "scheduled" || record.status === "overdue")
        ? "overdue"
        : !overdue && record.status === "overdue"
          ? "scheduled"
          : record.status;

    return {
      ...record,
      status: nextStatus,
    };
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
