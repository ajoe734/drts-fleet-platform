import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import type { AuditLogRecord } from "@drts/contracts";

import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import type {
  ResolveRuntimeEligibilityContextCommand,
  ResolvedRuntimeEligibilityContext,
} from "./eligibility-context-resolver.service";
import { EligibilityContextResolver } from "./eligibility-context-resolver.service";
import type {
  EligibilityDecision,
  RuntimeEligibilityDecisionRecord,
} from "./runtime-eligibility.types";
import { VehicleEligibilityRepository } from "./vehicle-eligibility.repository";

export type OverrideSoftEligibilityCommand = {
  actorId: string;
  actorType?: AuditLogRecord["actorType"];
  tenantId?: string | null;
  reasonCode: string;
  reasonNote?: string;
  requestId?: string;
};

export type EvaluateRuntimeEligibilityCommand =
  ResolveRuntimeEligibilityContextCommand & {
    softReasonCodes?: string[];
    missingRequirements?: string[];
    overrideSoftEligibility?: OverrideSoftEligibilityCommand;
    resolvedContext?: ResolvedRuntimeEligibilityContext;
    requestId?: string;
  };

export type EvaluateRuntimeEligibilityResult =
  RuntimeEligibilityDecisionRecord & {
    softOverrideApplied: boolean;
  };

const LOCATION_FRESHNESS_WINDOW_MS = 90 * 1000;
const LOCATION_LOW_ACCURACY_THRESHOLD_M = 100;

/**
 * Evaluates runtime eligibility for a candidate against the exact service
 * product, producing eligible / conditionally_eligible / ineligible decisions
 * with hard/soft reason codes.
 *
 * Scaffold only — wired into VehicleEligibilityModule by P1D-WP0. Decision
 * logic, candidate filtering, and assignment recheck are implemented by the
 * downstream eligibility execution wave.
 *
 * Source of truth:
 *   docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md §1.3, §2.8, §5.2
 */
@Injectable()
export class RuntimeEligibilityEvaluator {
  constructor(
    private readonly eligibilityContextResolver: EligibilityContextResolver,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
    @Optional() private readonly repository?: VehicleEligibilityRepository,
  ) {}

  async evaluate(
    command: EvaluateRuntimeEligibilityCommand,
  ): Promise<EvaluateRuntimeEligibilityResult> {
    const context =
      command.resolvedContext ??
      this.eligibilityContextResolver.resolve(command);
    const hardReasonCodes = this.collectHardReasonCodes(context);
    const locationState = this.classifyLocationState(context);
    const softReasonCodes = this.collectSoftReasonCodes(
      context,
      locationState,
      command.softReasonCodes ?? [],
    );
    const missingRequirements = this.collectMissingRequirements(
      context,
      command.missingRequirements ?? [],
    );

    let decision: EligibilityDecision = "eligible";
    if (hardReasonCodes.length > 0) {
      decision = "ineligible";
    } else if (
      softReasonCodes.length > 0 ||
      missingRequirements.length > 0 ||
      context.vehicleCapability.conditionallyAllowed
    ) {
      decision = "conditionally_eligible";
    }

    let softOverrideApplied = false;
    if (
      decision === "conditionally_eligible" &&
      command.overrideSoftEligibility &&
      hardReasonCodes.length === 0
    ) {
      softOverrideApplied = true;
      decision = "eligible";
      this.recordAudit(
        {
          actorId: command.overrideSoftEligibility.actorId,
          actorType: command.overrideSoftEligibility.actorType ?? "ops_user",
          tenantId: command.overrideSoftEligibility.tenantId ?? null,
          moduleName: "vehicle-eligibility",
          actionName: "override_soft_eligibility",
          resourceType: "runtime_eligibility_decision",
          resourceId: null,
          newValuesSummary: {
            orderId: context.orderId,
            dispatchJobId: context.dispatchJobId,
            driverId: context.driverId,
            vehicleId: context.vehicleId,
            serviceProductCode: context.serviceProductCode,
            softReasonCodes,
            missingRequirements,
            reasonCode: command.overrideSoftEligibility.reasonCode,
            reasonNote: command.overrideSoftEligibility.reasonNote ?? null,
          },
        },
        command.overrideSoftEligibility.requestId ?? command.requestId,
      );
    }

    const result: EvaluateRuntimeEligibilityResult = {
      decisionId: randomUUID(),
      orderId: context.orderId,
      dispatchJobId: context.dispatchJobId,
      driverId: context.driverId,
      vehicleId: context.vehicleId,
      serviceProductId: context.serviceProductId,
      serviceProductCode: context.serviceProductCode,
      policyVersion: context.policyVersion,
      decision,
      hardReasonCodes,
      softReasonCodes,
      missingRequirements,
      locationState,
      evaluatedAt: context.evaluatedAt,
      softOverrideApplied,
    };

    await this.persist(result);
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "vehicle-eligibility",
        actionName: "evaluate_runtime_eligibility",
        resourceType: "runtime_eligibility_decision",
        resourceId: result.decisionId,
        newValuesSummary: {
          orderId: result.orderId,
          dispatchJobId: result.dispatchJobId,
          driverId: result.driverId,
          vehicleId: result.vehicleId,
          serviceProductCode: result.serviceProductCode,
          decision: result.decision,
          hardReasonCodes: result.hardReasonCodes,
          softReasonCodes: result.softReasonCodes,
          missingRequirements: result.missingRequirements,
          locationState: result.locationState,
          policyVersion: result.policyVersion,
          softOverrideApplied,
        },
      },
      command.requestId,
    );

    return result;
  }

  private collectHardReasonCodes(context: ResolvedRuntimeEligibilityContext) {
    const hardReasonCodes: string[] = [];
    if (!context.driverReadiness.ready) {
      hardReasonCodes.push(
        ...this.normalizeReasons(context.driverReadiness.reasonCodes, "DRIVER_NOT_READY"),
      );
    }
    if (!context.vehicleReadiness.ready) {
      hardReasonCodes.push(
        ...this.normalizeReasons(
          context.vehicleReadiness.reasonCodes,
          "VEHICLE_NOT_READY",
        ),
      );
    }
    if (!context.vehicleCapability.active) {
      hardReasonCodes.push("VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT");
    }
    if (
      !context.vehicleCapability.supportedProducts.includes(
        context.serviceProductCode,
      ) ||
      !context.serviceProduct.allowedLicenseTypes.includes(
        context.vehicleCapability.licenseType,
      )
    ) {
      hardReasonCodes.push("VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT");
    }
    if (
      context.serviceProduct.requiresBusinessDispatchEligible &&
      !context.vehicleCapability.businessDispatchEligible
    ) {
      hardReasonCodes.push("BUSINESS_DISPATCH_ELIGIBILITY_REQUIRED");
    }
    if (
      context.serviceProduct.requiresAirportPermit &&
      !context.vehicleCapability.airportPermit
    ) {
      hardReasonCodes.push("MISSING_AIRPORT_ELIGIBILITY");
    }
    if (
      context.serviceProduct.meterRequired &&
      !context.vehicleCapability.taxiMeterRequired
    ) {
      hardReasonCodes.push("TAXI_METER_REQUIRED");
    }
    if (
      context.serviceProduct.fixedFareAllowed &&
      !context.vehicleCapability.fixedFareAllowed
    ) {
      hardReasonCodes.push("FIXED_FARE_NOT_ALLOWED");
    }
    if (
      context.serviceProduct.requiresPlatformForwardingAllowed &&
      !context.vehicleCapability.platformForwardingAllowed
    ) {
      hardReasonCodes.push("PLATFORM_FORWARDING_NOT_ALLOWED");
    }
    if (
      context.sourcePlatform &&
      !context.platformBindings.includes(context.sourcePlatform)
    ) {
      hardReasonCodes.push("PLATFORM_BINDING_REQUIRED");
    }

    return [...new Set(hardReasonCodes)];
  }

  private classifyLocationState(
    context: ResolvedRuntimeEligibilityContext,
  ): RuntimeEligibilityDecisionRecord["locationState"] {
    const location = context.currentLocation;
    if (!location) {
      return "missing";
    }

    if (
      location.accuracyM !== null &&
      location.accuracyM > LOCATION_LOW_ACCURACY_THRESHOLD_M
    ) {
      return "low_accuracy";
    }

    const ageMs =
      Date.parse(context.evaluatedAt) - Date.parse(location.recordedAt);
    return ageMs > LOCATION_FRESHNESS_WINDOW_MS ? "stale" : "fresh";
  }

  private collectSoftReasonCodes(
    context: ResolvedRuntimeEligibilityContext,
    locationState: RuntimeEligibilityDecisionRecord["locationState"],
    extraSoftReasonCodes: string[],
  ) {
    const softReasonCodes = [...extraSoftReasonCodes];

    switch (locationState) {
      case "stale":
        softReasonCodes.push("STALE_LOCATION");
        break;
      case "low_accuracy":
        softReasonCodes.push("LOW_ACCURACY_LOCATION");
        break;
      case "missing":
        softReasonCodes.push("MISSING_LOCATION");
        break;
      default:
        break;
    }

    if (context.vehicleCapability.conditionallyAllowed) {
      softReasonCodes.push("CONDITIONAL_CAPABILITY");
    }

    return [...new Set(softReasonCodes)];
  }

  private collectMissingRequirements(
    context: ResolvedRuntimeEligibilityContext,
    extraMissingRequirements: string[],
  ) {
    const missingRequirements = [...extraMissingRequirements];

    missingRequirements.push(...context.vehicleCapability.requiredDocuments);
    if (context.vehicleCapability.trainingRequired) {
      missingRequirements.push("training");
    }
    if (context.vehicleCapability.permitRequired) {
      missingRequirements.push("permit");
    }

    return [...new Set(missingRequirements.map((item) => item.trim()).filter(Boolean))];
  }

  private normalizeReasons(reasons: string[], fallback: string) {
    return reasons.length > 0 ? reasons : [fallback];
  }

  private async persist(record: RuntimeEligibilityDecisionRecord) {
    if (!this.repository) {
      return;
    }

    try {
      await this.repository.insertRuntimeEligibilityDecision(record);
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "runtime_evaluation");
    }
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    if (!this.auditNotificationService) {
      return;
    }

    const log = { ...input };
    if (requestId) {
      (log as AuditLogRecord & { requestId?: string }).requestId = requestId;
    }
    this.auditNotificationService.recordAuditLog(log);
  }
}
