import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateSafetyOperatorAssignmentCommand,
  CreateSafetyOperatorTripCloseoutCommand,
  EndSafetyOperatorShiftCommand,
  EngageSafetyOperatorAssignmentCommand,
  ReleaseSafetyOperatorAssignmentCommand,
  SafetyOperatorAssignment,
  SafetyOperatorAssignmentStatus,
  SafetyOperatorPreTripChecklist,
  SafetyOperatorQualificationCheckCommand,
  SafetyOperatorQualificationCheckResult,
  SafetyOperatorQualificationRecord,
  SafetyOperatorShift,
  SafetyOperatorTakeoverReport,
  SafetyOperatorTakeoverReportReceipt,
  SafetyOperatorTripCloseout,
  StartSafetyOperatorShiftCommand,
  SubmitSafetyOperatorPreTripChecklistCommand,
  SubmitSafetyOperatorTakeoverReportCommand,
  SubmitSafetyOperatorTakeoverReportResult,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { SandboxGovernanceService } from "../sandbox-governance/sandbox-governance.service";
import {
  type SafetyOperatorRepositoryState,
  SafetyOperatorRepository,
} from "./safety-operator.repository";

export interface SafetyOperatorAssignmentQuery {
  safetyOperatorId?: string;
  vehicleId?: string;
  status?: SafetyOperatorAssignmentStatus;
}

export interface SafetyOperatorShiftQuery {
  safetyOperatorId?: string;
  deviceId?: string;
  status?: SafetyOperatorShift["status"];
}

export interface SafetyOperatorPreTripChecklistQuery {
  safetyOperatorId?: string;
  vehicleId?: string;
  shiftId?: string;
}

export interface SafetyOperatorTakeoverReportQuery {
  safetyOperatorId?: string;
  vehicleId?: string;
  correlationId?: string;
  clientGeneratedReportId?: string;
}

export interface SafetyOperatorTripCloseoutQuery {
  safetyOperatorId?: string;
  vehicleId?: string;
  assignmentId?: string;
}

type AccessAction = "read" | "write";

@Injectable()
export class SafetyOperatorService implements OnModuleInit {
  private assignments: SafetyOperatorAssignment[] = [];
  private shifts: SafetyOperatorShift[] = [];
  private checklists: SafetyOperatorPreTripChecklist[] = [];
  private takeoverReports: SafetyOperatorTakeoverReport[] = [];
  private tripCloseouts: SafetyOperatorTripCloseout[] = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly repository?: SafetyOperatorRepository,
    @Optional()
    private readonly sandboxGovernanceService?: SandboxGovernanceService,
  ) {}

  async onModuleInit() {
    if (!this.repository) {
      return;
    }

    try {
      const state = await this.repository.loadState();
      this.hydrateState(state);
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  listAssignments(
    query: SafetyOperatorAssignmentQuery,
    identity: BootstrapRequestIdentity | null,
  ) {
    const scopedOperatorId = this.resolveRequestedSafetyOperatorId(
      identity,
      query.safetyOperatorId,
      "read",
      false,
    );

    return this.assignments
      .filter((assignment) => {
        if (
          scopedOperatorId &&
          assignment.safetyOperatorId !== scopedOperatorId
        ) {
          return false;
        }
        if (query.vehicleId && assignment.vehicleId !== query.vehicleId) {
          return false;
        }
        if (query.status && assignment.status !== query.status) {
          return false;
        }
        return true;
      })
      .map((assignment) => this.cloneAssignment(assignment));
  }

  async createAssignment(
    command: CreateSafetyOperatorAssignmentCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const safetyOperatorId = this.normalizeRequired(
      command.safetyOperatorId,
      "safetyOperatorId",
    );
    this.assertWriteAccess(identity, safetyOperatorId);

    const vehicleId = this.normalizeRequired(command.vehicleId, "vehicleId");
    const sandboxProgramId = this.normalizeRequired(
      command.sandboxProgramId,
      "sandboxProgramId",
    );
    const orderId = this.normalizeNullable(command.orderId);

    const existingEquivalent = this.assignments.find(
      (assignment) =>
        this.isAssignmentActive(assignment.status) &&
        assignment.safetyOperatorId === safetyOperatorId &&
        assignment.vehicleId === vehicleId &&
        assignment.orderId === orderId &&
        assignment.sandboxProgramId === sandboxProgramId,
    );
    if (existingEquivalent) {
      return this.cloneAssignment(existingEquivalent);
    }

    this.assertQualificationReady({
      safetyOperatorId,
      sandboxProgramId,
      vehicleId,
      asOf: null,
    });

    const vehicleConflict = this.assignments.find(
      (assignment) =>
        this.isAssignmentActive(assignment.status) &&
        assignment.vehicleId === vehicleId,
    );
    if (vehicleConflict) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "VEHICLE_ALREADY_ASSIGNED",
        "Vehicle already has an active safety-operator assignment.",
        {
          vehicleId,
          assignmentId: vehicleConflict.assignmentId,
          safetyOperatorId: vehicleConflict.safetyOperatorId,
        },
      );
    }

    const operatorConflict = this.assignments.find(
      (assignment) =>
        this.isAssignmentActive(assignment.status) &&
        assignment.safetyOperatorId === safetyOperatorId,
    );
    if (operatorConflict) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SAFETY_OPERATOR_ALREADY_ASSIGNED",
        "Safety operator already has an active vehicle assignment.",
        {
          safetyOperatorId,
          assignmentId: operatorConflict.assignmentId,
          vehicleId: operatorConflict.vehicleId,
        },
      );
    }

    const assignment: SafetyOperatorAssignment = {
      assignmentId: randomUUID(),
      safetyOperatorId,
      vehicleId,
      orderId,
      status: "assigned",
      assignedAt: new Date().toISOString(),
      releasedAt: null,
      sandboxProgramId,
    };

    const persisted = await this.repository?.saveAssignment(assignment);
    this.assignments = [
      this.cloneAssignment(persisted ?? assignment),
      ...this.assignments,
    ];
    this.recordAudit(
      {
        actorId: identity?.actorId ?? safetyOperatorId,
        actorType: this.toAuditActorType(identity),
        tenantId: identity?.tenantId ?? null,
        moduleName: "safety-operator",
        actionName: "assignment_create",
        resourceType: "safety_operator_assignment",
        resourceId: assignment.assignmentId,
        newValuesSummary: {
          safetyOperatorId,
          vehicleId,
          orderId,
          sandboxProgramId,
        },
      },
      requestId,
    );

    return this.cloneAssignment(this.assignments[0]!);
  }

  async engageAssignment(
    assignmentId: string,
    command: EngageSafetyOperatorAssignmentCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const assignment = this.requireAssignment(assignmentId);
    const safetyOperatorId = this.normalizeRequired(
      command.safetyOperatorId,
      "safetyOperatorId",
    );
    this.assertWriteAccess(identity, safetyOperatorId);
    this.assertOperatorMatches(
      assignment.safetyOperatorId,
      safetyOperatorId,
      "assignment",
      assignmentId,
    );

    if (assignment.status === "engaged") {
      return this.cloneAssignment(assignment);
    }
    if (assignment.status !== "assigned") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ASSIGNMENT_NOT_ASSIGNABLE",
        "Only assigned safety-operator records can move to engaged.",
        {
          assignmentId,
          currentStatus: assignment.status,
        },
      );
    }

    const updated: SafetyOperatorAssignment = {
      ...assignment,
      status: "engaged",
    };
    const persisted = await this.repository?.saveAssignment(updated);
    this.replaceAssignment(persisted ?? updated);
    this.recordAudit(
      {
        actorId: identity?.actorId ?? safetyOperatorId,
        actorType: this.toAuditActorType(identity),
        tenantId: identity?.tenantId ?? null,
        moduleName: "safety-operator",
        actionName: "assignment_engage",
        resourceType: "safety_operator_assignment",
        resourceId: assignmentId,
        newValuesSummary: {
          safetyOperatorId,
          status: "engaged",
        },
      },
      requestId,
    );

    return this.cloneAssignment(this.requireAssignment(assignmentId));
  }

  async releaseAssignment(
    assignmentId: string,
    command: ReleaseSafetyOperatorAssignmentCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const assignment = this.requireAssignment(assignmentId);
    const safetyOperatorId = this.normalizeRequired(
      command.safetyOperatorId,
      "safetyOperatorId",
    );
    this.assertWriteAccess(identity, safetyOperatorId);
    this.assertOperatorMatches(
      assignment.safetyOperatorId,
      safetyOperatorId,
      "assignment",
      assignmentId,
    );

    if (assignment.status === "released") {
      return this.cloneAssignment(assignment);
    }
    if (assignment.status === "expired") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ASSIGNMENT_EXPIRED",
        "Expired assignments cannot be released again.",
        {
          assignmentId,
        },
      );
    }

    const updated: SafetyOperatorAssignment = {
      ...assignment,
      status: "released",
      releasedAt: new Date().toISOString(),
    };
    const persisted = await this.repository?.saveAssignment(updated);
    this.replaceAssignment(persisted ?? updated);
    this.recordAudit(
      {
        actorId: identity?.actorId ?? safetyOperatorId,
        actorType: this.toAuditActorType(identity),
        tenantId: identity?.tenantId ?? null,
        moduleName: "safety-operator",
        actionName: "assignment_release",
        resourceType: "safety_operator_assignment",
        resourceId: assignmentId,
        newValuesSummary: {
          safetyOperatorId,
          releasedAt: updated.releasedAt,
        },
      },
      requestId,
    );

    return this.cloneAssignment(this.requireAssignment(assignmentId));
  }

  listShifts(
    query: SafetyOperatorShiftQuery,
    identity: BootstrapRequestIdentity | null,
  ) {
    const scopedOperatorId = this.resolveRequestedSafetyOperatorId(
      identity,
      query.safetyOperatorId,
      "read",
      false,
    );

    return this.shifts
      .filter((shift) => {
        if (scopedOperatorId && shift.safetyOperatorId !== scopedOperatorId) {
          return false;
        }
        if (query.deviceId && shift.deviceId !== query.deviceId) {
          return false;
        }
        if (query.status && shift.status !== query.status) {
          return false;
        }
        return true;
      })
      .map((shift) => this.cloneShift(shift));
  }

  async startShift(
    command: StartSafetyOperatorShiftCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const safetyOperatorId = this.normalizeRequired(
      command.safetyOperatorId,
      "safetyOperatorId",
    );
    const sandboxProgramId = this.normalizeRequired(
      command.sandboxProgramId,
      "sandboxProgramId",
    );
    const deviceId = this.normalizeRequired(command.deviceId, "deviceId");
    this.assertWriteAccess(identity, safetyOperatorId);

    const assignmentId = this.normalizeNullable(command.assignmentId);
    const vehicleId = this.normalizeNullable(command.vehicleId);
    const notes = this.normalizeNullable(command.notes);

    const activeShift = this.shifts.find(
      (shift) =>
        shift.status === "active" &&
        shift.safetyOperatorId === safetyOperatorId &&
        shift.deviceId === deviceId,
    );
    if (activeShift) {
      if (
        activeShift.vehicleId === vehicleId &&
        activeShift.assignmentId === assignmentId
      ) {
        return this.cloneShift(activeShift);
      }

      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ACTIVE_SHIFT_EXISTS",
        "Safety operator already has an active shift on this device.",
        {
          shiftId: activeShift.shiftId,
          safetyOperatorId,
          deviceId,
        },
      );
    }

    if (assignmentId) {
      const assignment = this.requireAssignment(assignmentId);
      this.assertOperatorMatches(
        assignment.safetyOperatorId,
        safetyOperatorId,
        "assignment",
        assignment.assignmentId,
      );
      if (!this.isAssignmentActive(assignment.status)) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "ASSIGNMENT_NOT_ACTIVE",
          "Shift start requires an assigned or engaged assignment.",
          {
            assignmentId,
            currentStatus: assignment.status,
          },
        );
      }
    }

    const shift: SafetyOperatorShift = {
      shiftId: randomUUID(),
      safetyOperatorId,
      sandboxProgramId,
      deviceId,
      vehicleId,
      assignmentId,
      status: "active",
      startedAt: new Date().toISOString(),
      endedAt: null,
      startLocation: this.cloneGeoPoint(command.startLocation),
      endLocation: null,
      notes,
    };

    const persisted = await this.repository?.saveShift(shift);
    this.shifts = [this.cloneShift(persisted ?? shift), ...this.shifts];
    this.recordAudit(
      {
        actorId: identity?.actorId ?? safetyOperatorId,
        actorType: this.toAuditActorType(identity),
        tenantId: identity?.tenantId ?? null,
        moduleName: "safety-operator",
        actionName: "shift_start",
        resourceType: "safety_operator_shift",
        resourceId: shift.shiftId,
        newValuesSummary: {
          safetyOperatorId,
          sandboxProgramId,
          deviceId,
          vehicleId,
          assignmentId,
        },
      },
      requestId,
    );

    return this.cloneShift(this.shifts[0]!);
  }

  async endShift(
    shiftId: string,
    command: EndSafetyOperatorShiftCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const shift = this.requireShift(shiftId);
    const safetyOperatorId = this.normalizeRequired(
      command.safetyOperatorId,
      "safetyOperatorId",
    );
    const deviceId = this.normalizeRequired(command.deviceId, "deviceId");
    this.assertWriteAccess(identity, safetyOperatorId);
    this.assertOperatorMatches(
      shift.safetyOperatorId,
      safetyOperatorId,
      "shift",
      shiftId,
    );
    if (shift.deviceId !== deviceId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "SHIFT_DEVICE_MISMATCH",
        "Shift can only be ended from the bound operator device.",
        {
          shiftId,
          expectedDeviceId: shift.deviceId,
          providedDeviceId: deviceId,
        },
      );
    }

    if (shift.status === "completed") {
      return this.cloneShift(shift);
    }
    if (shift.status !== "active") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SHIFT_NOT_ACTIVE",
        "Only active shifts can be ended.",
        {
          shiftId,
          currentStatus: shift.status,
        },
      );
    }

    const updated: SafetyOperatorShift = {
      ...shift,
      status: "completed",
      endedAt: new Date().toISOString(),
      endLocation: this.cloneGeoPoint(command.endLocation),
      notes: this.normalizeNullable(command.notes) ?? shift.notes,
    };
    const persisted = await this.repository?.saveShift(updated);
    this.replaceShift(persisted ?? updated);
    this.recordAudit(
      {
        actorId: identity?.actorId ?? safetyOperatorId,
        actorType: this.toAuditActorType(identity),
        tenantId: identity?.tenantId ?? null,
        moduleName: "safety-operator",
        actionName: "shift_end",
        resourceType: "safety_operator_shift",
        resourceId: shiftId,
        newValuesSummary: {
          safetyOperatorId,
          deviceId,
          endedAt: updated.endedAt,
        },
      },
      requestId,
    );

    return this.cloneShift(this.requireShift(shiftId));
  }

  checkQualification(
    command: SafetyOperatorQualificationCheckCommand,
    identity: BootstrapRequestIdentity | null,
  ): SafetyOperatorQualificationCheckResult {
    const safetyOperatorId = this.resolveRequestedSafetyOperatorId(
      identity,
      command.safetyOperatorId,
      "read",
      true,
    )!;
    const sandboxProgramId = this.normalizeRequired(
      command.sandboxProgramId,
      "sandboxProgramId",
    );
    const vehicleId = this.normalizeNullable(command.vehicleId);
    const asOf = this.resolveAsOf(command.asOf);
    const matches = this.findQualifiedRecords(
      safetyOperatorId,
      sandboxProgramId,
      asOf,
    );
    const activeAssignment = this.assignments.find(
      (assignment) =>
        this.isAssignmentActive(assignment.status) &&
        assignment.safetyOperatorId === safetyOperatorId &&
        (!vehicleId || assignment.vehicleId === vehicleId),
    );

    return {
      safetyOperatorId,
      sandboxProgramId,
      vehicleId,
      asOf,
      qualified: matches.length > 0,
      matchedQualificationIds: matches.map(
        (qualification) => qualification.qualificationId,
      ),
      activeAssignmentId: activeAssignment?.assignmentId ?? null,
      reasons: matches.length > 0 ? [] : ["NO_ACTIVE_QUALIFICATION"],
    };
  }

  listPreTripChecklists(
    query: SafetyOperatorPreTripChecklistQuery,
    identity: BootstrapRequestIdentity | null,
  ) {
    const scopedOperatorId = this.resolveRequestedSafetyOperatorId(
      identity,
      query.safetyOperatorId,
      "read",
      false,
    );

    return this.checklists
      .filter((checklist) => {
        if (
          scopedOperatorId &&
          checklist.safetyOperatorId !== scopedOperatorId
        ) {
          return false;
        }
        if (query.vehicleId && checklist.vehicleId !== query.vehicleId) {
          return false;
        }
        if (query.shiftId && checklist.shiftId !== query.shiftId) {
          return false;
        }
        return true;
      })
      .map((checklist) => this.cloneChecklist(checklist));
  }

  async submitPreTripChecklist(
    command: SubmitSafetyOperatorPreTripChecklistCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const safetyOperatorId = this.normalizeRequired(
      command.safetyOperatorId,
      "safetyOperatorId",
    );
    this.assertWriteAccess(identity, safetyOperatorId);

    const shiftId = this.normalizeRequired(command.shiftId, "shiftId");
    const shift = this.requireShift(shiftId);
    this.assertOperatorMatches(
      shift.safetyOperatorId,
      safetyOperatorId,
      "shift",
      shiftId,
    );

    const assignmentId = this.normalizeNullable(command.assignmentId);
    if (assignmentId) {
      const assignment = this.requireAssignment(assignmentId);
      this.assertOperatorMatches(
        assignment.safetyOperatorId,
        safetyOperatorId,
        "assignment",
        assignmentId,
      );
    }

    const items = command.items.map((item) => ({
      itemKey: item.itemKey,
      status: item.status,
      note: this.normalizeNullable(item.note),
    }));
    if (items.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CHECKLIST_ITEMS_REQUIRED",
        "Pre-trip checklist must contain at least one item.",
      );
    }

    const checklist: SafetyOperatorPreTripChecklist = {
      checklistId: randomUUID(),
      shiftId,
      assignmentId,
      safetyOperatorId,
      vehicleId: this.normalizeRequired(command.vehicleId, "vehicleId"),
      completedAt: new Date().toISOString(),
      allPassed:
        items.every((item) => item.status === "pass" || item.status === "na") &&
        command.blockerCodes.length === 0,
      blockerCodes: command.blockerCodes.map((code) =>
        this.normalizeRequired(code, "blockerCodes[]"),
      ),
      items,
      notes: this.normalizeNullable(command.notes),
    };

    const persisted = await this.repository?.savePreTripChecklist(checklist);
    this.checklists = [
      this.cloneChecklist(persisted ?? checklist),
      ...this.checklists,
    ];
    this.recordAudit(
      {
        actorId: identity?.actorId ?? safetyOperatorId,
        actorType: this.toAuditActorType(identity),
        tenantId: identity?.tenantId ?? null,
        moduleName: "safety-operator",
        actionName: "pre_trip_checklist_submit",
        resourceType: "safety_operator_checklist",
        resourceId: checklist.checklistId,
        newValuesSummary: {
          safetyOperatorId,
          shiftId,
          assignmentId,
          allPassed: checklist.allPassed,
          blockerCodes: checklist.blockerCodes,
        },
      },
      requestId,
    );

    return this.cloneChecklist(this.checklists[0]!);
  }

  listTakeoverReports(
    query: SafetyOperatorTakeoverReportQuery,
    identity: BootstrapRequestIdentity | null,
  ) {
    const scopedOperatorId = this.resolveRequestedSafetyOperatorId(
      identity,
      query.safetyOperatorId,
      "read",
      false,
    );

    return this.takeoverReports
      .filter((report) => {
        if (scopedOperatorId && report.safetyOperatorId !== scopedOperatorId) {
          return false;
        }
        if (query.vehicleId && report.vehicleId !== query.vehicleId) {
          return false;
        }
        if (
          query.correlationId &&
          report.correlationId !== query.correlationId
        ) {
          return false;
        }
        if (
          query.clientGeneratedReportId &&
          report.clientGeneratedReportId !== query.clientGeneratedReportId
        ) {
          return false;
        }
        return true;
      })
      .map((report) => this.cloneTakeoverReport(report));
  }

  async submitTakeoverReport(
    command: SubmitSafetyOperatorTakeoverReportCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<SubmitSafetyOperatorTakeoverReportResult> {
    const safetyOperatorId = this.normalizeRequired(
      command.safetyOperatorId,
      "safetyOperatorId",
    );
    this.assertWriteAccess(identity, safetyOperatorId);

    const clientGeneratedReportId = this.normalizeRequired(
      command.clientGeneratedReportId,
      "clientGeneratedReportId",
    );
    const existing = this.takeoverReports.find(
      (report) => report.clientGeneratedReportId === clientGeneratedReportId,
    );
    if (existing) {
      this.assertOperatorMatches(
        existing.safetyOperatorId,
        safetyOperatorId,
        "takeover report",
        existing.reportId,
      );
      return {
        report: this.cloneTakeoverReport(existing),
        receipt: this.buildReceipt(existing, true),
      };
    }

    const shiftId = this.normalizeNullable(command.shiftId);
    if (shiftId) {
      const shift = this.requireShift(shiftId);
      this.assertOperatorMatches(
        shift.safetyOperatorId,
        safetyOperatorId,
        "shift",
        shiftId,
      );
    }

    const assignmentId = this.normalizeNullable(command.assignmentId);
    if (assignmentId) {
      const assignment = this.requireAssignment(assignmentId);
      this.assertOperatorMatches(
        assignment.safetyOperatorId,
        safetyOperatorId,
        "assignment",
        assignmentId,
      );
    }

    const report: SafetyOperatorTakeoverReport = {
      reportId: randomUUID(),
      clientGeneratedReportId,
      safetyOperatorId,
      vehicleId: this.normalizeRequired(command.vehicleId, "vehicleId"),
      orderId: this.normalizeNullable(command.orderId),
      sandboxProgramId: this.normalizeRequired(
        command.sandboxProgramId,
        "sandboxProgramId",
      ),
      shiftId,
      assignmentId,
      correlationId: this.normalizeRequired(
        command.correlationId,
        "correlationId",
      ),
      trigger: command.trigger,
      reasonCode: command.reasonCode,
      disposition: command.disposition,
      fsdResumed: command.fsdResumed,
      bookmarkId: this.normalizeNullable(command.bookmarkId),
      incidentId: this.normalizeNullable(command.incidentId),
      evidenceArtifactIds: command.evidenceArtifactIds.map((artifactId) =>
        this.normalizeRequired(artifactId, "evidenceArtifactIds[]"),
      ),
      notes: this.normalizeNullable(command.notes),
      occurredAt: this.resolveOccurredAt(command.occurredAt),
      serverReceivedAt: new Date().toISOString(),
    };

    const persisted = await this.repository?.saveTakeoverReport(report);
    this.takeoverReports = [
      this.cloneTakeoverReport(persisted ?? report),
      ...this.takeoverReports,
    ];
    this.recordAudit(
      {
        actorId: identity?.actorId ?? safetyOperatorId,
        actorType: this.toAuditActorType(identity),
        tenantId: identity?.tenantId ?? null,
        moduleName: "safety-operator",
        actionName: "takeover_report_submit",
        resourceType: "safety_operator_takeover_report",
        resourceId: report.reportId,
        newValuesSummary: {
          safetyOperatorId,
          vehicleId: report.vehicleId,
          correlationId: report.correlationId,
          clientGeneratedReportId,
          disposition: report.disposition,
          fsdResumed: report.fsdResumed,
        },
      },
      requestId,
    );

    const stored = this.takeoverReports[0]!;
    return {
      report: this.cloneTakeoverReport(stored),
      receipt: this.buildReceipt(stored, false),
    };
  }

  listTripCloseouts(
    query: SafetyOperatorTripCloseoutQuery,
    identity: BootstrapRequestIdentity | null,
  ) {
    const scopedOperatorId = this.resolveRequestedSafetyOperatorId(
      identity,
      query.safetyOperatorId,
      "read",
      false,
    );

    return this.tripCloseouts
      .filter((closeout) => {
        if (
          scopedOperatorId &&
          closeout.safetyOperatorId !== scopedOperatorId
        ) {
          return false;
        }
        if (query.vehicleId && closeout.vehicleId !== query.vehicleId) {
          return false;
        }
        if (
          query.assignmentId &&
          closeout.assignmentId !== query.assignmentId
        ) {
          return false;
        }
        return true;
      })
      .map((closeout) => this.cloneTripCloseout(closeout));
  }

  async createTripCloseout(
    command: CreateSafetyOperatorTripCloseoutCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const safetyOperatorId = this.normalizeRequired(
      command.safetyOperatorId,
      "safetyOperatorId",
    );
    this.assertWriteAccess(identity, safetyOperatorId);

    const assignmentId = this.normalizeNullable(command.assignmentId);
    if (assignmentId) {
      const assignment = this.requireAssignment(assignmentId);
      this.assertOperatorMatches(
        assignment.safetyOperatorId,
        safetyOperatorId,
        "assignment",
        assignmentId,
      );
    }

    const shiftId = this.normalizeNullable(command.shiftId);
    if (shiftId) {
      const shift = this.requireShift(shiftId);
      this.assertOperatorMatches(
        shift.safetyOperatorId,
        safetyOperatorId,
        "shift",
        shiftId,
      );
    }

    const takeoverReportIds = command.takeoverReportIds.map((reportId) =>
      this.normalizeRequired(reportId, "takeoverReportIds[]"),
    );
    for (const reportId of takeoverReportIds) {
      const report = this.requireTakeoverReport(reportId);
      this.assertOperatorMatches(
        report.safetyOperatorId,
        safetyOperatorId,
        "takeover report",
        reportId,
      );
    }

    const closeout: SafetyOperatorTripCloseout = {
      closeoutId: randomUUID(),
      assignmentId,
      shiftId,
      safetyOperatorId,
      vehicleId: this.normalizeRequired(command.vehicleId, "vehicleId"),
      orderId: this.normalizeNullable(command.orderId),
      closeoutStatus: command.closeoutStatus,
      closeoutAt: new Date().toISOString(),
      takeoverReportIds,
      incidentId: this.normalizeNullable(command.incidentId),
      evidenceArtifactIds: command.evidenceArtifactIds.map((artifactId) =>
        this.normalizeRequired(artifactId, "evidenceArtifactIds[]"),
      ),
      notes: this.normalizeNullable(command.notes),
    };

    const persisted = await this.repository?.saveTripCloseout(closeout);
    this.tripCloseouts = [
      this.cloneTripCloseout(persisted ?? closeout),
      ...this.tripCloseouts,
    ];
    this.recordAudit(
      {
        actorId: identity?.actorId ?? safetyOperatorId,
        actorType: this.toAuditActorType(identity),
        tenantId: identity?.tenantId ?? null,
        moduleName: "safety-operator",
        actionName: "trip_closeout_create",
        resourceType: "safety_operator_trip_closeout",
        resourceId: closeout.closeoutId,
        newValuesSummary: {
          safetyOperatorId,
          vehicleId: closeout.vehicleId,
          assignmentId,
          shiftId,
          closeoutStatus: closeout.closeoutStatus,
        },
      },
      requestId,
    );

    return this.cloneTripCloseout(this.tripCloseouts[0]!);
  }

  private hydrateState(state: SafetyOperatorRepositoryState) {
    this.assignments = state.assignments.map((assignment) =>
      this.cloneAssignment(assignment),
    );
    this.shifts = state.shifts.map((shift) => this.cloneShift(shift));
    this.checklists = state.checklists.map((checklist) =>
      this.cloneChecklist(checklist),
    );
    this.takeoverReports = state.takeoverReports.map((report) =>
      this.cloneTakeoverReport(report),
    );
    this.tripCloseouts = state.tripCloseouts.map((closeout) =>
      this.cloneTripCloseout(closeout),
    );
  }

  private requireAssignment(assignmentId: string) {
    const assignment = this.assignments.find(
      (candidate) => candidate.assignmentId === assignmentId,
    );
    if (!assignment) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ASSIGNMENT_NOT_FOUND",
        "Safety-operator assignment not found.",
        { assignmentId },
      );
    }
    return assignment;
  }

  private requireShift(shiftId: string) {
    const shift = this.shifts.find(
      (candidate) => candidate.shiftId === shiftId,
    );
    if (!shift) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "SHIFT_NOT_FOUND",
        "Safety-operator shift not found.",
        { shiftId },
      );
    }
    return shift;
  }

  private requireTakeoverReport(reportId: string) {
    const report = this.takeoverReports.find(
      (candidate) => candidate.reportId === reportId,
    );
    if (!report) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TAKEOVER_REPORT_NOT_FOUND",
        "Safety-operator takeover report not found.",
        { reportId },
      );
    }
    return report;
  }

  private replaceAssignment(updated: SafetyOperatorAssignment) {
    this.assignments = this.assignments.map((assignment) =>
      assignment.assignmentId === updated.assignmentId
        ? this.cloneAssignment(updated)
        : assignment,
    );
  }

  private replaceShift(updated: SafetyOperatorShift) {
    this.shifts = this.shifts.map((shift) =>
      shift.shiftId === updated.shiftId ? this.cloneShift(updated) : shift,
    );
  }

  private assertWriteAccess(
    identity: BootstrapRequestIdentity | null,
    safetyOperatorId: string,
  ) {
    this.assertAccess(identity, "write");
    if (identity?.realm === "driver" && identity.actorId !== safetyOperatorId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "SAFETY_OPERATOR_IDENTITY_MISMATCH",
        "Driver device identity may only mutate its own safety-operator records.",
        {
          actorId: identity.actorId,
          requestedSafetyOperatorId: safetyOperatorId,
        },
      );
    }
  }

  private assertAccess(
    identity: BootstrapRequestIdentity | null,
    action: AccessAction,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTH_REQUIRED",
        "Authenticated safety-operator identity is required.",
      );
    }

    if (identity.realm === "system") {
      return;
    }

    if (identity.realm === "driver") {
      this.assertScope(
        identity,
        action === "read" ? ["driver:read"] : ["driver:write"],
      );
      return;
    }

    if (identity.realm === "ops") {
      this.assertAnyScope(
        identity,
        action === "read"
          ? ["dispatch:read", "driver:read", "audit:read"]
          : ["dispatch:write", "driver:write"],
      );
      return;
    }

    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "AUTH_REALM_DENIED",
      "Identity realm is not allowed to access safety-operator routes.",
      {
        realm: identity.realm,
        action,
      },
    );
  }

  private resolveRequestedSafetyOperatorId(
    identity: BootstrapRequestIdentity | null,
    requestedId: string | undefined,
    action: AccessAction,
    required: boolean,
  ) {
    this.assertAccess(identity, action);
    const normalizedRequestedId = this.normalizeOptional(requestedId);
    if (identity?.realm !== "driver") {
      if (required && !normalizedRequestedId) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "SAFETY_OPERATOR_ID_REQUIRED",
          "safetyOperatorId is required for non-driver safety-operator queries.",
        );
      }
      return normalizedRequestedId;
    }

    if (!identity.actorId) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTH_ACTOR_REQUIRED",
        "Driver safety-operator identity is missing actorId.",
      );
    }

    if (normalizedRequestedId && normalizedRequestedId !== identity.actorId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "SAFETY_OPERATOR_IDENTITY_MISMATCH",
        "Driver device identity may only read its own safety-operator records.",
        {
          actorId: identity.actorId,
          requestedSafetyOperatorId: normalizedRequestedId,
        },
      );
    }

    return identity.actorId;
  }

  private assertScope(
    identity: BootstrapRequestIdentity,
    requiredScopes: readonly string[],
  ) {
    const missingScopes = requiredScopes.filter(
      (scope) => !identity.scopes.includes(scope),
    );
    if (missingScopes.length === 0) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "AUTH_SCOPE_DENIED",
      "Identity is missing required safety-operator scope.",
      {
        missingScopes,
        realm: identity.realm,
      },
    );
  }

  private assertAnyScope(
    identity: BootstrapRequestIdentity,
    allowedScopes: readonly string[],
  ) {
    if (allowedScopes.some((scope) => identity.scopes.includes(scope))) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "AUTH_SCOPE_DENIED",
      "Identity is missing any allowed safety-operator scope.",
      {
        allowedScopes,
        realm: identity.realm,
      },
    );
  }

  private assertOperatorMatches(
    actualSafetyOperatorId: string,
    requestedSafetyOperatorId: string,
    resourceType: string,
    resourceId: string,
  ) {
    if (actualSafetyOperatorId === requestedSafetyOperatorId) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "SAFETY_OPERATOR_MISMATCH",
      `Safety operator does not own this ${resourceType}.`,
      {
        resourceId,
        expectedSafetyOperatorId: actualSafetyOperatorId,
        providedSafetyOperatorId: requestedSafetyOperatorId,
      },
    );
  }

  private assertQualificationReady(
    command: SafetyOperatorQualificationCheckCommand,
  ) {
    if (!this.sandboxGovernanceService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "QUALIFICATION_SOURCE_UNAVAILABLE",
        "Safety-operator qualification source is unavailable.",
        undefined,
        true,
      );
    }

    const result = this.checkQualification(command, {
      authMode: "bootstrap_headers",
      actorId: command.safetyOperatorId,
      actorType: "driver_user",
      realm: "driver",
      tenantId: null,
      roleFamilies: ["driver"],
      roles: [],
      scopes: ["driver:read"],
      requestId: null,
    });
    if (result.qualified) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "SAFETY_OPERATOR_NOT_QUALIFIED",
      "Safety operator is not qualified for the sandbox program.",
      {
        safetyOperatorId: command.safetyOperatorId,
        sandboxProgramId: command.sandboxProgramId,
        reasons: result.reasons,
      },
    );
  }

  private findQualifiedRecords(
    safetyOperatorId: string,
    sandboxProgramId: string,
    asOf: string,
  ) {
    if (!this.sandboxGovernanceService) {
      return [] as SafetyOperatorQualificationRecord[];
    }

    const asOfMs = Date.parse(asOf);
    return this.sandboxGovernanceService
      .listSafetyOperatorQualifications()
      .filter((qualification) => {
        if (qualification.safetyOperatorId !== safetyOperatorId) {
          return false;
        }
        if (qualification.sandboxProgramId !== sandboxProgramId) {
          return false;
        }
        if (qualification.status !== "qualified") {
          return false;
        }
        const effectiveFromMs = Date.parse(qualification.effectiveFrom);
        const effectiveUntilMs = qualification.effectiveUntil
          ? Date.parse(qualification.effectiveUntil)
          : Number.POSITIVE_INFINITY;
        return effectiveFromMs <= asOfMs && effectiveUntilMs >= asOfMs;
      });
  }

  private buildReceipt(
    report: SafetyOperatorTakeoverReport,
    duplicate: boolean,
  ): SafetyOperatorTakeoverReportReceipt {
    return {
      reportId: report.reportId,
      clientGeneratedReportId: report.clientGeneratedReportId,
      correlationId: report.correlationId,
      duplicate,
      serverReceivedAt: report.serverReceivedAt,
    };
  }

  private cloneAssignment(
    assignment: SafetyOperatorAssignment,
  ): SafetyOperatorAssignment {
    return { ...assignment };
  }

  private cloneShift(shift: SafetyOperatorShift): SafetyOperatorShift {
    return {
      ...shift,
      startLocation: this.cloneGeoPoint(shift.startLocation),
      endLocation: this.cloneGeoPoint(shift.endLocation),
    };
  }

  private cloneChecklist(
    checklist: SafetyOperatorPreTripChecklist,
  ): SafetyOperatorPreTripChecklist {
    return {
      ...checklist,
      blockerCodes: [...checklist.blockerCodes],
      items: checklist.items.map((item) => ({ ...item })),
    };
  }

  private cloneTakeoverReport(
    report: SafetyOperatorTakeoverReport,
  ): SafetyOperatorTakeoverReport {
    return {
      ...report,
      evidenceArtifactIds: [...report.evidenceArtifactIds],
    };
  }

  private cloneTripCloseout(
    closeout: SafetyOperatorTripCloseout,
  ): SafetyOperatorTripCloseout {
    return {
      ...closeout,
      takeoverReportIds: [...closeout.takeoverReportIds],
      evidenceArtifactIds: [...closeout.evidenceArtifactIds],
    };
  }

  private cloneGeoPoint(point: { lat: number; lng: number } | null) {
    return point ? { ...point } : null;
  }

  private normalizeRequired(
    value: string | null | undefined,
    fieldName: string,
  ) {
    if (value == null) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} is required.`,
        { field: fieldName },
      );
    }
    const normalized = value.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} is required.`,
        { field: fieldName },
      );
    }
    return normalized;
  }

  private normalizeNullable(value: string | null | undefined) {
    if (value == null) {
      return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private normalizeOptional(value: string | undefined) {
    if (value == null) {
      return undefined;
    }
    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  private resolveOccurredAt(value: string) {
    const occurredAt = this.normalizeRequired(value, "occurredAt");
    if (Number.isNaN(Date.parse(occurredAt))) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "occurredAt must be a valid ISO timestamp.",
        { field: "occurredAt" },
      );
    }
    return new Date(occurredAt).toISOString();
  }

  private resolveAsOf(value: string | null) {
    if (!value) {
      return new Date().toISOString();
    }
    if (Number.isNaN(Date.parse(value))) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "asOf must be a valid ISO timestamp.",
        { field: "asOf" },
      );
    }
    return new Date(value).toISOString();
  }

  private isAssignmentActive(status: SafetyOperatorAssignment["status"]) {
    return status === "assigned" || status === "engaged";
  }

  private toAuditActorType(
    identity: BootstrapRequestIdentity | null,
  ): AuditLogRecord["actorType"] {
    if (!identity) {
      return "system";
    }

    if (identity.actorType === "platform_admin") {
      return "platform_admin";
    }
    if (identity.actorType === "tenant_admin") {
      return "tenant_admin";
    }
    if (identity.actorType === "ops_user") {
      return "ops_user";
    }

    return "system";
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const log = { ...input };
    if (requestId) {
      (log as AuditLogRecord & { requestId?: string }).requestId = requestId;
    }
    this.auditNotificationService.recordAuditLog(log);
  }
}
