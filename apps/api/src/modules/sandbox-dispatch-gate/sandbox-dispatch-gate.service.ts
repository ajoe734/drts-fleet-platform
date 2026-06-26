import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  SandboxDispatchDecision,
  SandboxDispatchReasonCode,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { SandboxGovernanceService } from "../sandbox-governance/sandbox-governance.service";
import { VehicleEvidenceService } from "../vehicle-evidence/vehicle-evidence.service";
import { SandboxDispatchGateRepository } from "./sandbox-dispatch-gate.repository";
import type {
  SandboxDispatchGateInput,
  SandboxDispatchManualReleaseCommand,
} from "./sandbox-dispatch-gate.types";
import { SANDBOX_DISPATCH_ERROR_CODE_MAP } from "./sandbox-dispatch-gate.types";

const DEFAULT_MIN_SOC_PERCENT = 20;
const DEFAULT_MAX_ODOMETER_KM = 250_000;

@Injectable()
export class SandboxDispatchGateService {
  private readonly logger = new Logger(SandboxDispatchGateService.name);

  private lastDecision: SandboxDispatchDecision | null = null;

  constructor(
    @Optional()
    private readonly vehicleEvidenceService?: VehicleEvidenceService,
    @Optional()
    private readonly sandboxGovernanceService?: SandboxGovernanceService,
    @Optional()
    private readonly repository?: SandboxDispatchGateRepository,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
  ) {}

  async evaluateDispatch(
    input: SandboxDispatchGateInput,
    requestId?: string,
  ): Promise<SandboxDispatchDecision> {
    const evaluatedAt = input.requestedAt ?? new Date().toISOString();
    const normalized = this.normalizeInput(input, evaluatedAt);
    const hardReasonCodes = this.collectHardReasons(normalized);
    const softReasonCodes = this.collectSoftReasons(normalized);

    let decision: SandboxDispatchDecision["decision"] = "allow";
    let requiredSafetyOperatorId: string | null = null;
    if (hardReasonCodes.length > 0) {
      decision = "block";
    } else if (normalized.safetyOperator.required) {
      decision =
        normalized.safetyOperator.available &&
        normalized.safetyOperator.qualificationStatus === "qualified"
          ? "allow_with_safety_operator"
          : "defer";
      requiredSafetyOperatorId =
        normalized.safetyOperator.safetyOperatorId ?? null;
    } else if (softReasonCodes.length > 0) {
      decision = "defer";
    }

    const result: SandboxDispatchDecision = {
      decisionId: randomUUID(),
      orderId: normalized.orderId,
      dispatchJobId: normalized.dispatchJobId,
      vehicleId: normalized.vehicleId,
      sandboxProgramId: normalized.sandboxProgramId,
      decision,
      oddInBounds: normalized.operatingArea.inBounds,
      hardReasonCodes,
      softReasonCodes,
      requiredSafetyOperatorId,
      policyVersion: normalized.policyVersion,
      evaluatedAt,
    };

    this.lastDecision = result;
    this.persistEvaluation(
      { decision: result, evaluationSnapshot: normalized },
      "evaluate_dispatch",
    );
    this.logger.debug(
      `Sandbox dispatch evaluated ${result.orderId}/${result.vehicleId}: ${result.decision}`,
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "sandbox-dispatch-gate",
        actionName: "evaluate_dispatch",
        resourceType: "sandbox_dispatch_decision",
        resourceId: result.decisionId,
        newValuesSummary: {
          orderId: result.orderId,
          dispatchJobId: result.dispatchJobId,
          vehicleId: result.vehicleId,
          sandboxProgramId: result.sandboxProgramId,
          decision: result.decision,
          hardReasonCodes: result.hardReasonCodes,
          softReasonCodes: result.softReasonCodes,
          policyVersion: result.policyVersion,
          errorCodes: result.hardReasonCodes.map(
            (code) => SANDBOX_DISPATCH_ERROR_CODE_MAP[code],
          ),
        },
      },
      requestId,
    );

    return this.cloneDecision(result);
  }

  async assertAssignmentEligible(
    input: SandboxDispatchGateInput,
    requestId?: string,
  ) {
    const decision = await this.evaluateDispatch(input, requestId);
    if (decision.decision === "allow" || decision.decision === "allow_with_safety_operator") {
      return decision;
    }

    const primaryReason = decision.hardReasonCodes[0] ?? decision.softReasonCodes[0];
    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      primaryReason ? SANDBOX_DISPATCH_ERROR_CODE_MAP[primaryReason] : "SANDBOX_DISPATCH_BLOCKED",
      "Sandbox dispatch gate did not approve this assignment.",
      {
        orderId: decision.orderId,
        dispatchJobId: decision.dispatchJobId,
        vehicleId: decision.vehicleId,
        sandboxProgramId: decision.sandboxProgramId,
        decision: decision.decision,
        hardReasonCodes: decision.hardReasonCodes,
        softReasonCodes: decision.softReasonCodes,
        policyVersion: decision.policyVersion,
      },
    );
  }

  async recordManualRelease(
    input: SandboxDispatchGateInput,
    command: SandboxDispatchManualReleaseCommand,
    requestId?: string,
  ) {
    const decision = await this.evaluateDispatch(input, requestId);
    const releaseAudit = {
      actorId: command.actorId,
      actorType: command.actorType ?? "ops_user",
      reason: command.reason,
      decisionId: command.decisionId ?? decision.decisionId,
      releasedAt: new Date().toISOString(),
    };

    this.persistEvaluation(
      {
        decision,
        evaluationSnapshot: this.normalizeInput(input, decision.evaluatedAt),
        releaseAudit,
      },
      "manual_release",
    );
    this.recordAudit(
      {
        actorId: command.actorId,
        actorType: command.actorType ?? "ops_user",
        tenantId: null,
        moduleName: "sandbox-dispatch-gate",
        actionName: "manual_release",
        resourceType: "sandbox_dispatch_decision",
        resourceId: command.decisionId ?? decision.decisionId,
        newValuesSummary: {
          orderId: decision.orderId,
          dispatchJobId: decision.dispatchJobId,
          vehicleId: decision.vehicleId,
          sandboxProgramId: decision.sandboxProgramId,
          reason: command.reason,
          decision: decision.decision,
        },
      },
      requestId,
    );

    return {
      decision: this.cloneDecision(decision),
      manualReleaseRecorded: true,
      releaseAudit,
    };
  }

  shouldEvaluateSandboxAssignment(vehicleId: string) {
    return vehicleId.startsWith("veh-av");
  }

  buildAssignmentGateInput(input: {
    orderId: string;
    dispatchJobId: string;
    vehicleId: string;
    sandboxProgramId?: string | null;
    policyVersion?: string | null;
    pickup?: { lat?: number | null; lng?: number | null } | null;
    dropoff?: { lat?: number | null; lng?: number | null } | null;
  }): SandboxDispatchGateInput {
    const recorderSignal = this.vehicleEvidenceService?.getNoNewDispatchSignal(
      input.vehicleId,
    );
    const pickup =
      Number.isFinite(input.pickup?.lat) && Number.isFinite(input.pickup?.lng)
        ? { lat: input.pickup!.lat as number, lng: input.pickup!.lng as number }
        : null;
    const dropoff =
      Number.isFinite(input.dropoff?.lat) && Number.isFinite(input.dropoff?.lng)
        ? { lat: input.dropoff!.lat as number, lng: input.dropoff!.lng as number }
        : null;
    return {
      orderId: input.orderId,
      dispatchJobId: input.dispatchJobId,
      vehicleId: input.vehicleId,
      sandboxProgramId:
        input.sandboxProgramId ?? "phase2-tesla-fsd-sandbox-202606",
      policyVersion: input.policyVersion ?? "sandbox-dispatch-gate.v1",
      pickup,
      dropoff,
      recorder: {
        healthy: recorderSignal ? false : null,
      },
      operatingArea: {
        inBounds: null,
        boundaryRisk: false,
      },
    };
  }

  getLastDecision() {
    return this.lastDecision ? this.cloneDecision(this.lastDecision) : null;
  }

  private normalizeInput(
    input: SandboxDispatchGateInput,
    evaluatedAt: string,
  ): SandboxDispatchGateInput & {
    dispatchJobId: string | null;
    operatingArea: { inBounds: boolean; boundaryRisk: boolean };
    safetyOperator: {
      required: boolean;
      available: boolean;
      safetyOperatorId: string | null;
      qualificationStatus: "pending" | "qualified" | "suspended" | "revoked" | "expired" | null;
      approvedAreaIds: string[];
      approvedRouteIds: string[];
    };
    telemetry: {
      stale: boolean;
      minimalRiskConditionActive: boolean;
      socPercent: number | null;
      currentTripCount: number | null;
      odometerKm: number | null;
    };
    regulatory: {
      approvalFresh: boolean;
      vehicleCertified: boolean;
    };
    recorder: { healthy: boolean };
    entitlement: { active: boolean };
    vehicleEnrollment: {
      status: "pending" | "active" | "suspended" | "revoked" | "expired" | null;
      approvedAreaIds: string[];
      approvedRouteIds: string[];
      maxConcurrentTrips: number | null;
    };
    routeContainment: { contained: boolean | null };
    holdState: {
      activeSafetyIncident: boolean;
      programSuspended: boolean;
      vehicleHold: boolean;
    };
    providerCapabilities: Record<string, boolean | null>;
    limits: {
      minSocPercent: number;
      maxConcurrentTrips: number | null;
      maxOdometerKm: number;
    };
    requestedAt: string;
  } {
    return {
      ...input,
      dispatchJobId: input.dispatchJobId ?? null,
      requestedAt: evaluatedAt,
      operatingArea: {
        inBounds: input.operatingArea?.inBounds === true,
        boundaryRisk: input.operatingArea?.boundaryRisk === true,
      },
      safetyOperator: {
        required: input.safetyOperator?.required === true,
        available: input.safetyOperator?.available === true,
        safetyOperatorId: input.safetyOperator?.safetyOperatorId ?? null,
        qualificationStatus: input.safetyOperator?.qualificationStatus ?? null,
        approvedAreaIds: [...(input.safetyOperator?.approvedAreaIds ?? [])],
        approvedRouteIds: [...(input.safetyOperator?.approvedRouteIds ?? [])],
      },
      telemetry: {
        stale: input.telemetry?.stale !== false,
        minimalRiskConditionActive:
          input.telemetry?.minimalRiskConditionActive === true,
        socPercent: input.telemetry?.socPercent ?? null,
        currentTripCount: input.telemetry?.currentTripCount ?? null,
        odometerKm: input.telemetry?.odometerKm ?? null,
      },
      regulatory: {
        approvalFresh: input.regulatory?.approvalFresh === true,
        vehicleCertified: input.regulatory?.vehicleCertified === true,
      },
      recorder: {
        healthy: input.recorder?.healthy === true,
      },
      entitlement: {
        active: input.entitlement?.active === true,
      },
      vehicleEnrollment: {
        status: input.vehicleEnrollment?.status ?? null,
        approvedAreaIds: [...(input.vehicleEnrollment?.approvedAreaIds ?? [])],
        approvedRouteIds: [...(input.vehicleEnrollment?.approvedRouteIds ?? [])],
        maxConcurrentTrips: input.vehicleEnrollment?.maxConcurrentTrips ?? null,
      },
      routeContainment: {
        contained: input.routeContainment?.contained ?? null,
      },
      holdState: {
        activeSafetyIncident: input.holdState?.activeSafetyIncident === true,
        programSuspended: input.holdState?.programSuspended === true,
        vehicleHold: input.holdState?.vehicleHold === true,
      },
      providerCapabilities: {
        av_dispatch: input.providerCapabilities?.av_dispatch ?? null,
        remote_command: input.providerCapabilities?.remote_command ?? null,
        telemetry_stream: input.providerCapabilities?.telemetry_stream ?? null,
        regulatory_event_feed:
          input.providerCapabilities?.regulatory_event_feed ?? null,
        evidence_recorder: input.providerCapabilities?.evidence_recorder ?? null,
        odd_geofence: input.providerCapabilities?.odd_geofence ?? null,
        minimal_risk_condition:
          input.providerCapabilities?.minimal_risk_condition ?? null,
      },
      limits: {
        minSocPercent: input.limits?.minSocPercent ?? DEFAULT_MIN_SOC_PERCENT,
        maxConcurrentTrips: input.limits?.maxConcurrentTrips ?? null,
        maxOdometerKm: input.limits?.maxOdometerKm ?? DEFAULT_MAX_ODOMETER_KM,
      },
    };
  }

  private collectHardReasons(
    input: ReturnType<SandboxDispatchGateService["normalizeInput"]>,
  ) {
    const reasons: SandboxDispatchReasonCode[] = [];

    if (!input.entitlement.active) {
      reasons.push("REGULATORY_APPROVAL_MISSING");
    }
    if (!input.operatingArea.inBounds || input.routeContainment.contained === false) {
      reasons.push("ODD_OUT_OF_BOUNDS");
    }
    if (input.holdState.programSuspended || input.holdState.vehicleHold) {
      reasons.push("SANDBOX_PROGRAM_SUSPENDED");
    }
    if (input.holdState.activeSafetyIncident) {
      reasons.push("ACTIVE_SAFETY_INCIDENT");
    }
    if (input.vehicleEnrollment.status !== "active") {
      reasons.push("REGULATORY_APPROVAL_MISSING");
    }
    if (!input.regulatory.approvalFresh) {
      reasons.push("REGULATORY_APPROVAL_MISSING");
    }
    if (!input.regulatory.vehicleCertified) {
      reasons.push("VEHICLE_NOT_CERTIFIED");
    }
    if (!input.recorder.healthy) {
      reasons.push("RECORDER_UNHEALTHY");
    }
    if (input.telemetry.stale) {
      reasons.push("TELEMETRY_STALE");
    }
    if (input.telemetry.minimalRiskConditionActive) {
      reasons.push("MINIMAL_RISK_CONDITION_ACTIVE");
    }
    if (
      input.telemetry.socPercent === null ||
      input.telemetry.socPercent < input.limits.minSocPercent
    ) {
      reasons.push("TELEMETRY_STALE");
    }
    if (
      input.limits.maxConcurrentTrips !== null &&
      (input.telemetry.currentTripCount === null ||
        input.telemetry.currentTripCount >= input.limits.maxConcurrentTrips)
    ) {
      reasons.push("REGULATORY_APPROVAL_MISSING");
    }
    if (
      input.telemetry.odometerKm !== null &&
      input.telemetry.odometerKm > input.limits.maxOdometerKm
    ) {
      reasons.push("VEHICLE_NOT_CERTIFIED");
    }
    for (const capability of [
      "av_dispatch",
      "telemetry_stream",
      "regulatory_event_feed",
      "evidence_recorder",
      "odd_geofence",
      "minimal_risk_condition",
    ]) {
      if (input.providerCapabilities[capability] !== true) {
        reasons.push("PROVIDER_CAPABILITY_MISSING");
        break;
      }
    }

    return [...new Set(reasons)];
  }

  private collectSoftReasons(
    input: ReturnType<SandboxDispatchGateService["normalizeInput"]>,
  ) {
    const reasons: SandboxDispatchReasonCode[] = [];
    if (input.operatingArea.boundaryRisk) {
      reasons.push("ODD_BOUNDARY_RISK");
    }
    if (input.safetyOperator.required) {
      reasons.push(
        input.safetyOperator.available
          ? "SAFETY_OPERATOR_REQUIRED"
          : "SAFETY_OPERATOR_UNAVAILABLE",
      );
    }
    return [...new Set(reasons)];
  }

  private cloneDecision(decision: SandboxDispatchDecision) {
    return {
      ...decision,
      hardReasonCodes: [...decision.hardReasonCodes],
      softReasonCodes: [...decision.softReasonCodes],
    };
  }

  private persistEvaluation(
    record: Parameters<SandboxDispatchGateRepository["persistEvaluation"]>[0],
    context: string,
  ) {
    if (!this.repository) {
      return;
    }

    void this.repository.persistEvaluation(record).catch((error) =>
      this.repository!.reportPersistenceFailure(error, context),
    );
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "requestId" | "auditId" | "createdAt">,
    requestId?: string,
  ) {
    const payload = requestId ? { ...input, requestId } : input;
    this.auditNotificationService?.recordAuditLog(payload);
  }
}
