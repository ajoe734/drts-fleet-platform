import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger } from "@nestjs/common";

import type {
  ActionReceipt,
  EtaSnapshot,
  OwnedOrderRecord,
  RocFallbackToHumanCommand,
  RocFallbackToHumanReport,
  RocIntervention,
} from "@drts/contracts";
import { PHASE2_AUDIT_EVENT_CATALOG } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import {
  emitPhase2AuditRecord,
  emitPhase2AuditedAction,
} from "../../common/phase2-audit";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { SandboxDispatchGateService } from "../sandbox-dispatch-gate/sandbox-dispatch-gate.service";

/**
 * RocOperationsService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the Remote Operations Center surface (remote assist,
 * minimal-risk stop, reroute, ODD recovery interventions and live-board feed)
 * for the phase2-tesla-fsd-sandbox-202606 phase. Concrete intervention logic
 * and persistence against av_sandbox.roc_interventions (V0037) land in
 * downstream waves.
 */
@Injectable()
export class RocOperationsService {
  private readonly logger = new Logger(RocOperationsService.name);

  private interventions: RocIntervention[] = [];

  private fallbackReports: RocFallbackToHumanReport[] = [];

  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly sandboxDispatchGateService: SandboxDispatchGateService,
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  async fallbackTripToHuman(
    tripId: string,
    command: RocFallbackToHumanCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<{
    tripId: string;
    orderId: string;
    bookingId: string | null;
    dispatchJobId: string;
    status: OwnedOrderRecord["status"];
    etaSnapshot: EtaSnapshot | null;
    assignmentId: string;
    taskId: string;
    intervention: RocIntervention;
    report: RocFallbackToHumanReport;
    receipt: ActionReceipt;
  }> {
    const order = this.resolveTripOrder(tripId);
    const rocOperatorId = this.resolveRocOperatorId(identity, command.rocOperatorId);
    const trigger = command.trigger ?? "roc_manual_intervention";
    const sandboxDecision = await this.sandboxDispatchGateService.findDecisionForOrder(
      order.orderId,
      command.sandboxDecisionId ?? null,
    );

    if (trigger === "gate_fallback_required" && !sandboxDecision) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SANDBOX_FALLBACK_DECISION_REQUIRED",
        "Gate-triggered human fallback requires a sandbox dispatch decision.",
        {
          tripId,
          orderId: order.orderId,
          sandboxDecisionId: command.sandboxDecisionId ?? null,
        },
      );
    }

    const reportId = `report-${randomUUID()}`;
    const reportArtifactId = `ART-${randomUUID()}`;
    const fallbackResult = await this.ownedMobilityService.fallbackTripToHuman(
      order.orderId,
      command,
      {
        reportId,
        reportArtifactId,
        rocOperatorId,
        trigger,
        sandboxDecision,
      },
      requestId,
    );

    const startedAt = new Date().toISOString();
    const resolvedAt = new Date().toISOString();
    const intervention = this.buildFallbackIntervention({
      orderId: order.orderId,
      rocOperatorId,
      trigger,
      avVehicleId:
        fallbackResult.avVehicleId ??
        command.avVehicleId?.trim() ??
        sandboxDecision?.vehicleId ??
        null,
      triggeredByEventId: command.triggeredByEventId ?? null,
      startedAt,
      resolvedAt,
      humanVehicleId: command.humanVehicleId,
      humanDriverId: command.humanDriverId,
      fallbackAssignmentId: fallbackResult.assignmentId,
      reportId,
      ...(requestId ? { requestId } : {}),
    });
    this.interventions = [intervention, ...this.interventions];

    emitPhase2AuditRecord(this.auditNotificationService, {
      actorId: rocOperatorId,
      actorType: "ops_user",
      tenantId: fallbackResult.order.tenantId,
      moduleName: "roc-operations",
      eventName: PHASE2_AUDIT_EVENT_CATALOG.roc.interventionStarted,
      resourceType: "roc_intervention",
      resourceId: intervention.interventionId,
      summary: {
        orderId: intervention.orderId,
        vehicleId: intervention.vehicleId,
        interventionType: intervention.interventionType,
        trigger,
      },
      ...(requestId ? { requestId } : {}),
      sourceSystem: intervention.source.sourceSystem,
      sourceRef: intervention.source.sourceRef,
      occurredAt: startedAt,
    });
    emitPhase2AuditRecord(this.auditNotificationService, {
      actorId: rocOperatorId,
      actorType: "ops_user",
      tenantId: fallbackResult.order.tenantId,
      moduleName: "roc-operations",
      eventName: PHASE2_AUDIT_EVENT_CATALOG.roc.interventionResolved,
      resourceType: "roc_intervention",
      resourceId: intervention.interventionId,
      summary: {
        orderId: intervention.orderId,
        vehicleId: intervention.vehicleId,
        interventionType: intervention.interventionType,
        outcomeNote: intervention.outcomeNote,
        reportId,
      },
      ...(requestId ? { requestId } : {}),
      sourceSystem: intervention.source.sourceSystem,
      sourceRef: intervention.source.sourceRef,
      occurredAt: resolvedAt,
    });

    const report = this.buildFallbackReport({
      order: fallbackResult.order,
      dispatchJobId: fallbackResult.dispatchJobId,
      assignmentId: fallbackResult.assignmentId,
      taskId: fallbackResult.taskId,
      previousAssignmentId: fallbackResult.previousAssignmentId,
      avVehicleId:
        fallbackResult.avVehicleId ??
        command.avVehicleId?.trim() ??
        sandboxDecision?.vehicleId ??
        null,
      avDriverId:
        fallbackResult.avDriverId ?? command.avDriverId?.trim() ?? null,
      command,
      trigger,
      sandboxDecision,
      reportId,
      reportArtifactId,
      interventionId: intervention.interventionId,
    });
    const reportResult = emitPhase2AuditedAction({
      sink: this.auditNotificationService,
      audit: {
        actorId: rocOperatorId,
        actorType: "ops_user",
        tenantId: fallbackResult.order.tenantId,
        moduleName: "roc-operations",
        eventName: PHASE2_AUDIT_EVENT_CATALOG.roc.fallbackToHumanReported,
        resourceType: "sandbox_exception_report",
        resourceId: report.reportId,
        summary: {
          tripId: report.tripId,
          orderId: report.orderId,
          bookingId: report.bookingId,
          dispatchJobId: report.dispatchJobId,
          trigger: report.trigger,
          sandboxDecisionId: report.sandboxDecisionId,
          sandboxProgramId: report.sandboxProgramId,
          avVehicleId: report.avVehicleId,
          avDriverId: report.avDriverId,
          previousAssignmentId: report.previousAssignmentId,
          fallbackAssignmentId: report.fallbackAssignmentId,
          fallbackTaskId: report.fallbackTaskId,
          humanVehicleId: report.humanVehicleId,
          humanDriverId: report.humanDriverId,
          revisedEtaMinutes: report.revisedEtaMinutes,
          hardReasonCodes: report.hardReasonCodes,
          softReasonCodes: report.softReasonCodes,
          reportArtifactId: report.reportArtifactId,
        },
        ...(requestId ? { requestId } : {}),
        sourceSystem: "roc_operator",
        sourceRef: intervention.interventionId,
        occurredAt: report.generatedAt,
      },
      data: report,
      message: "ROC fallback to human completed and report generated.",
    });
    this.fallbackReports = [reportResult.data, ...this.fallbackReports];

    this.logger.debug(
      `ROC fallback completed for ${order.orderId}: ${fallbackResult.assignmentId}`,
    );

    return {
      tripId: order.orderId,
      orderId: order.orderId,
      bookingId: fallbackResult.order.bookingId,
      dispatchJobId: fallbackResult.dispatchJobId,
      status: fallbackResult.order.status,
      etaSnapshot: fallbackResult.order.etaSnapshot,
      assignmentId: fallbackResult.assignmentId,
      taskId: fallbackResult.taskId,
      intervention,
      report: reportResult.data,
      receipt: reportResult.receipt,
    };
  }

  listInterventions() {
    return this.interventions.map((intervention) => ({
      ...intervention,
      source: { ...intervention.source },
    }));
  }

  listFallbackReports() {
    return this.fallbackReports.map((report) => ({
      ...report,
      hardReasonCodes: [...report.hardReasonCodes],
      softReasonCodes: [...report.softReasonCodes],
    }));
  }

  private resolveTripOrder(tripId: string) {
    const normalizedTripId = tripId.trim();
    if (!normalizedTripId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TRIP_ID_REQUIRED",
        "tripId is required.",
      );
    }

    try {
      return this.ownedMobilityService.getOrder(normalizedTripId);
    } catch (error) {
      const match = this.ownedMobilityService
        .listOrders()
        .find((candidate) => candidate.bookingId === normalizedTripId);
      if (match) {
        return this.ownedMobilityService.getOrder(match.orderId);
      }
      throw error;
    }
  }

  private resolveRocOperatorId(
    identity: BootstrapRequestIdentity | null | undefined,
    fallbackOperatorId?: string | null,
  ) {
    const fromIdentity =
      identity?.actorId &&
      (identity.actorType === "ops_user" || identity.realm === "ops")
        ? identity.actorId
        : null;
    const fromCommand = fallbackOperatorId?.trim() ?? null;
    const operatorId = fromIdentity ?? fromCommand;
    if (!operatorId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ROC_OPERATOR_REQUIRED",
        "ROC fallback-to-human requires an operator identity.",
      );
    }
    return operatorId;
  }

  private buildFallbackIntervention(input: {
    orderId: string;
    rocOperatorId: string;
    trigger: RocFallbackToHumanCommand["trigger"];
    avVehicleId: string | null;
    triggeredByEventId: string | null;
    startedAt: string;
    resolvedAt: string;
    humanVehicleId: string;
    humanDriverId: string;
    fallbackAssignmentId: string;
    reportId: string;
    requestId?: string;
  }): RocIntervention {
    return {
      interventionId: randomUUID(),
      rocOperatorId: input.rocOperatorId,
      vehicleId: input.avVehicleId ?? input.humanVehicleId,
      orderId: input.orderId,
      interventionType: "fallback_to_human",
      triggeredByEventId: input.triggeredByEventId,
      startedAt: input.startedAt,
      resolvedAt: input.resolvedAt,
      outcomeNote:
        `Trigger=${input.trigger ?? "roc_manual_intervention"}; ` +
        `human=${input.humanDriverId}/${input.humanVehicleId}; ` +
        `assignment=${input.fallbackAssignmentId}; report=${input.reportId}`,
      source: {
        sourceSystem: "roc_operator",
        sourceRef: input.requestId ?? input.reportId,
        ingestedAt: input.resolvedAt,
        recordedAt: input.startedAt,
        signatureRef: null,
        schemaVersion: "2026-06-26",
      },
    };
  }

  private buildFallbackReport(input: {
    order: OwnedOrderRecord;
    dispatchJobId: string;
    assignmentId: string;
    taskId: string;
    previousAssignmentId: string | null;
    avVehicleId: string | null;
    avDriverId: string | null;
    command: RocFallbackToHumanCommand;
    trigger: NonNullable<RocFallbackToHumanCommand["trigger"]>;
    sandboxDecision: Awaited<
      ReturnType<SandboxDispatchGateService["findDecisionForOrder"]>
    >;
    reportId: string;
    reportArtifactId: string;
    interventionId: string;
  }): RocFallbackToHumanReport {
    return {
      reportId: input.reportId,
      interventionId: input.interventionId,
      tripId: input.order.orderId,
      orderId: input.order.orderId,
      bookingId: input.order.bookingId,
      dispatchJobId: input.dispatchJobId,
      trigger: input.trigger,
      sandboxDecisionId: input.sandboxDecision?.decisionId ?? null,
      sandboxProgramId: input.sandboxDecision?.sandboxProgramId ?? null,
      avVehicleId: input.avVehicleId,
      avDriverId: input.avDriverId,
      previousAssignmentId: input.previousAssignmentId,
      fallbackAssignmentId: input.assignmentId,
      fallbackTaskId: input.taskId,
      humanVehicleId: input.command.humanVehicleId.trim(),
      humanDriverId: input.command.humanDriverId.trim(),
      revisedEtaMinutes: input.command.revisedEtaMinutes,
      hardReasonCodes: [...(input.sandboxDecision?.hardReasonCodes ?? [])],
      softReasonCodes: [...(input.sandboxDecision?.softReasonCodes ?? [])],
      reportArtifactId: input.reportArtifactId,
      generatedAt: new Date().toISOString(),
    };
  }
}
