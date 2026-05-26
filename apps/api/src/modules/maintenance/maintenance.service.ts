import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  ActionReceipt,
  AuditLogRecord,
  EmptyStateEnvelope,
  MaintenanceDeleteResult,
  MaintenanceListView,
  MaintenanceMutationResult,
  MaintenanceRuntimeRecord,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import { UI_REFRESH_INTERVAL_MS } from "@drts/contracts";

import type { AuditedActionResult } from "../../common/action-receipt";
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

const MAINTENANCE_STALE_AFTER_MS = UI_REFRESH_INTERVAL_MS.medium;

function createActionDescriptor(input: {
  action: string;
  enabled: boolean;
  riskLevel: ResourceActionDescriptor["riskLevel"];
  disabledReasonCode?: string;
  requiresReason?: boolean;
}): ResourceActionDescriptor {
  return {
    action: input.action,
    enabled: input.enabled,
    riskLevel: input.riskLevel,
    ...(input.disabledReasonCode
      ? { disabledReasonCode: input.disabledReasonCode }
      : {}),
    ...(input.requiresReason ? { requiresReason: input.requiresReason } : {}),
  };
}

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
    requestId: string | undefined,
    options: { captureAudit: true },
  ): AuditedActionResult<MaintenanceLogRecord>;
  createMaintenanceLog(
    command: CreateMaintenanceLogCommand,
    requestId?: string,
  ): MaintenanceMutationResult {
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
    const auditLog = this.recordAudit(
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

    return {
      record: this.toRuntimeRecord(record),
      receipt: this.buildReceipt(
        "create_maintenance_log",
        maintenanceId,
        auditLog.auditId,
      ),
    };
  }

  listMaintenanceLogs(vehicleId?: string): MaintenanceListView {
    let result = this.records.map((r) => this.toRuntimeRecord(r));
    if (vehicleId) {
      result = result.filter((r) => r.vehicleId === vehicleId);
    }

    const availableActions = this.buildListActions();
    const response: MaintenanceListView = {
      items: result,
      availableActions,
      refresh: this.buildRefreshMetadata(),
      ...(result.length === 0
        ? {
            emptyState: this.buildEmptyState(availableActions),
          }
        : {}),
    };

    return response;
  }

  getMaintenanceLog(maintenanceId: string) {
    return this.toRuntimeRecord(this.require(maintenanceId));
  }

  updateMaintenanceLog(
    maintenanceId: string,
    command: UpdateMaintenanceLogCommand,
    requestId: string | undefined,
    options: { captureAudit: true },
  ): AuditedActionResult<MaintenanceLogRecord>;
  updateMaintenanceLog(
    maintenanceId: string,
    command: UpdateMaintenanceLogCommand,
    requestId?: string,
  ): MaintenanceMutationResult {
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
    const auditLog = this.recordAudit(
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

    return {
      record: this.toRuntimeRecord(updated),
      receipt: this.buildReceipt(
        "update_maintenance_log",
        maintenanceId,
        auditLog.auditId,
      ),
    };
  }

  deleteMaintenanceLog(
    maintenanceId: string,
    requestId?: string,
  ): MaintenanceDeleteResult {
    const record = this.require(maintenanceId);
    this.records = this.records.filter(
      (candidate) => candidate.maintenanceId !== maintenanceId,
    );
    this.persist({ deletedIds: [maintenanceId] }, "delete_maintenance");
    const auditLog = this.recordAudit(
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

    return {
      deleted: true,
      maintenanceId,
      receipt: this.buildReceipt(
        "delete_maintenance_log",
        maintenanceId,
        auditLog.auditId,
      ),
    };
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
    return this.auditNotificationService.recordAuditLog(log);
  }

  private buildReceipt(
    actionName:
      | "create_maintenance_log"
      | "update_maintenance_log"
      | "delete_maintenance_log",
    maintenanceId: string,
    auditId: string,
  ): ActionReceipt {
    return {
      actionId: `maintenance-${randomUUID()}`,
      auditId,
      resourceType: "maintenance_log",
      resourceId: maintenanceId,
      status: "completed",
      message:
        actionName === "create_maintenance_log"
          ? "Maintenance record created."
          : actionName === "delete_maintenance_log"
            ? "Maintenance record deleted."
            : "Maintenance record updated.",
    };
  }

  private buildListActions(): ResourceActionDescriptor[] {
    return [
      createActionDescriptor({
        action: "create_record",
        enabled: true,
        riskLevel: "medium",
      }),
      createActionDescriptor({
        action: "search",
        enabled: true,
        riskLevel: "low",
      }),
      createActionDescriptor({
        action: "filter",
        enabled: true,
        riskLevel: "low",
      }),
      createActionDescriptor({
        action: "refresh",
        enabled: true,
        riskLevel: "low",
      }),
    ];
  }

  private buildRecordActions(
    record: MaintenanceLogRecord,
  ): ResourceActionDescriptor[] {
    const editEnabled =
      record.status !== "completed" && record.status !== "cancelled";
    const completeEnabled = record.status === "in_progress";

    return [
      createActionDescriptor({
        action: "edit_record",
        enabled: editEnabled,
        riskLevel: "medium",
        ...(editEnabled ? {} : { disabledReasonCode: "completed" }),
      }),
      createActionDescriptor({
        action: "complete_record",
        enabled: completeEnabled,
        riskLevel: "medium",
        ...(completeEnabled
          ? {}
          : { disabledReasonCode: "not_in_progress" }),
      }),
    ];
  }

  private buildRefreshMetadata(): UiRefreshMetadata {
    return {
      generatedAt: new Date().toISOString(),
      staleAfterMs: MAINTENANCE_STALE_AFTER_MS,
      dataFreshness: "fresh",
      source: "live",
    };
  }

  private buildEmptyState(
    availableActions: readonly ResourceActionDescriptor[],
  ): EmptyStateEnvelope {
    const createAction = availableActions.find(
      (action) => action.action === "create_record",
    );

    return {
      reason: "no_data",
      messageCode: "maintenance.empty.no_data",
      ...(createAction ? { nextAction: createAction } : {}),
    };
  }

  private toRuntimeRecord(record: MaintenanceLogRecord): MaintenanceRuntimeRecord {
    const normalized = this.normalizeStatus(record);
    return {
      ...normalized,
      availableActions: this.buildRecordActions(normalized),
    };
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
