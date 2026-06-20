import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Optional } from "@nestjs/common";

import type {
  DispatchCandidate,
  OwnedOrderRecord,
  RuntimeEligibilityDecisionRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  EligibilityContextResolver,
  type EligibilityResolvedContext,
} from "./eligibility-context-resolver.service";
import { VehicleEligibilityRepository } from "./vehicle-eligibility.repository";

export type RuntimeEvaluatedCandidate = DispatchCandidate & {
  eligibilityDecision: RuntimeEligibilityDecisionRecord["decision"];
  hardReasonCodes: string[];
  softReasonCodes: string[];
  missingRequirements: string[];
  locationState: RuntimeEligibilityDecisionRecord["locationState"];
};

@Injectable()
export class RuntimeEligibilityEvaluator {
  constructor(
    private readonly contextResolver: EligibilityContextResolver,
    private readonly repository: VehicleEligibilityRepository,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
  ) {}

  evaluateOrderCandidates(
    order: Pick<
      OwnedOrderRecord,
      | "orderId"
      | "orderSource"
      | "serviceProductCode"
      | "serviceProductId"
      | "serviceProductVersion"
      | "eligibilityPolicyVersion"
      | "serviceBucket"
      | "dispatchSemantics"
    >,
    dispatchJobId: string,
    candidates: readonly DispatchCandidate[],
    sourcePlatform?: string | null,
  ): RuntimeEvaluatedCandidate[] {
    const evaluated = candidates.map((candidate) => {
      const context = this.contextResolver.resolveCandidateContextFromOrder(
        order,
        dispatchJobId,
        candidate,
        sourcePlatform,
      );
      return this.evaluateCandidate(candidate, order, dispatchJobId, context);
    });

    return [...evaluated].sort((left, right) => {
      const decisionScore = this.scoreDecision(left.eligibilityDecision);
      const otherDecisionScore = this.scoreDecision(right.eligibilityDecision);
      if (decisionScore !== otherDecisionScore) {
        return decisionScore - otherDecisionScore;
      }

      return left.etaMinutes - right.etaMinutes;
    });
  }

  assertAssignmentEligible(
    order: Pick<
      OwnedOrderRecord,
      | "orderId"
      | "orderSource"
      | "serviceProductCode"
      | "serviceProductId"
      | "serviceProductVersion"
      | "eligibilityPolicyVersion"
      | "serviceBucket"
      | "dispatchSemantics"
    >,
    dispatchJobId: string,
    driverId: string,
    vehicleId: string,
    sourcePlatform?: string | null,
  ) {
    const evaluated = this.evaluateOrderCandidates(
      order,
      dispatchJobId,
      [
        {
          driverId,
          vehicleId,
          etaMinutes: 0,
          operatingArea: "runtime_recheck",
          serviceBuckets: [order.serviceBucket],
        },
      ],
      sourcePlatform,
    )[0];

    if (!evaluated || evaluated.eligibilityDecision !== "eligible") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
        "The candidate is no longer fully eligible for assignment.",
        {
          driverId,
          vehicleId,
          decision: evaluated?.eligibilityDecision ?? "ineligible",
          hardReasonCodes: evaluated?.hardReasonCodes ?? [],
          softReasonCodes: evaluated?.softReasonCodes ?? [],
          missingRequirements: evaluated?.missingRequirements ?? [],
          locationState: evaluated?.locationState ?? "missing",
        },
      );
    }
  }

  private evaluateCandidate(
    candidate: DispatchCandidate,
    order: Pick<OwnedOrderRecord, "orderId" | "dispatchSemantics">,
    dispatchJobId: string,
    context: EligibilityResolvedContext,
  ): RuntimeEvaluatedCandidate {
    const hardReasonCodes: string[] = [];
    const softReasonCodes: string[] = [];
    const missingRequirements = new Set<string>();

    if (
      !context.driver.dispatchEligible ||
      context.driver.eligibilityBlockedReasons.length > 0
    ) {
      hardReasonCodes.push("DRIVER_NOT_READY");
      missingRequirements.add("driver_readiness");
    }

    if (
      !context.vehicle.supplyLifecycle.dispatch.eligible ||
      context.vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0
    ) {
      hardReasonCodes.push("VEHICLE_NOT_READY");
      missingRequirements.add("vehicle_readiness");
    }

    if (!context.capability.active) {
      hardReasonCodes.push("VEHICLE_CAPABILITY_INACTIVE");
    }

    if (
      !context.capability.supportedProducts.includes(
        context.serviceProductContext.serviceProductCode,
      )
    ) {
      hardReasonCodes.push("VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT");
    }

    if (
      !context.serviceProduct.allowedLicenseTypes.includes(
        context.capability.licenseType,
      )
    ) {
      hardReasonCodes.push("VEHICLE_LICENSE_TYPE_NOT_ALLOWED");
    }

    if (
      context.serviceProduct.requiresBusinessDispatchEligible &&
      !context.capability.businessDispatchEligible
    ) {
      hardReasonCodes.push("BUSINESS_DISPATCH_ELIGIBILITY_REQUIRED");
    }

    if (
      context.serviceProduct.meterRequired &&
      !context.capability.taxiMeterRequired
    ) {
      hardReasonCodes.push("TAXI_METER_REQUIRED");
      missingRequirements.add("taxi_meter");
    }

    if (
      context.serviceProduct.fixedFareAllowed &&
      !context.capability.fixedFareAllowed
    ) {
      hardReasonCodes.push("FIXED_FARE_NOT_ALLOWED");
    }

    if (
      context.serviceProduct.serviceProduct ===
        "credit_card_airport_transfer" &&
      !context.capability.airportPermit
    ) {
      hardReasonCodes.push("MISSING_AIRPORT_ELIGIBILITY");
      missingRequirements.add("airport_transfer_eligibility");
    }

    if (
      context.serviceProduct.requiresPlatformForwardingAllowed &&
      !context.capability.platformForwardingAllowed
    ) {
      hardReasonCodes.push("PLATFORM_FORWARDING_NOT_ALLOWED");
    }

    if (
      context.serviceProductContext.sourcePlatform &&
      !context.driverPlatformBindings.includes(
        context.serviceProductContext.sourcePlatform,
      )
    ) {
      hardReasonCodes.push("PLATFORM_BINDING_REQUIRED");
      missingRequirements.add(
        `platform_binding:${context.serviceProductContext.sourcePlatform}`,
      );
    }

    if (context.locationState === "stale") {
      softReasonCodes.push("STALE_LOCATION");
      missingRequirements.add("fresh_location");
    } else if (context.locationState === "low_accuracy") {
      softReasonCodes.push("LOW_ACCURACY_LOCATION");
      missingRequirements.add("accurate_location");
    } else if (context.locationState === "missing") {
      softReasonCodes.push("MISSING_LOCATION");
      missingRequirements.add("location_signal");
    }

    if (
      order.dispatchSemantics === "realtime" &&
      (context.locationState === "stale" || context.locationState === "missing")
    ) {
      hardReasonCodes.push("REALTIME_LOCATION_NOT_FRESH");
    }

    const decision: RuntimeEligibilityDecisionRecord["decision"] =
      hardReasonCodes.length > 0
        ? "ineligible"
        : softReasonCodes.length > 0
          ? "conditionally_eligible"
          : "eligible";

    const evaluatedAt = new Date().toISOString();
    const decisionRecord: RuntimeEligibilityDecisionRecord = {
      decisionId: randomUUID(),
      orderId: order.orderId,
      dispatchJobId,
      driverId: candidate.driverId,
      vehicleId: candidate.vehicleId,
      serviceProductId: context.serviceProductContext.serviceProductId,
      serviceProductCode: context.serviceProductContext.serviceProductCode,
      policyVersion:
        order.eligibilityPolicyVersion ?? context.capability.updatedAt,
      decision,
      hardReasonCodes: [...hardReasonCodes],
      softReasonCodes: [...softReasonCodes],
      missingRequirements: [...missingRequirements],
      locationState: context.locationState,
      evaluatedAt,
    };

    this.persistDecision(decisionRecord);

    return {
      ...candidate,
      serviceProductId: context.serviceProductContext.serviceProductId,
      serviceProductCode: context.serviceProductContext.serviceProductCode,
      serviceProductVersion:
        context.serviceProductContext.serviceProductVersion,
      eligibilityPolicyVersion: decisionRecord.policyVersion,
      eligibilityDecision: decision,
      hardReasonCodes: [...hardReasonCodes],
      softReasonCodes: [...softReasonCodes],
      missingRequirements: [...missingRequirements],
      locationState: context.locationState,
    };
  }

  private persistDecision(decisionRecord: RuntimeEligibilityDecisionRecord) {
    void this.repository
      .saveRuntimeDecision(decisionRecord)
      .catch((error: unknown) => {
        this.repository.reportPersistenceFailure(error, "runtime eligibility");
      });

    this.auditNotificationService?.recordAuditLog({
      actorId: "system",
      actorType: "system",
      tenantId: null,
      moduleName: "vehicle_eligibility",
      actionName: "evaluate_runtime_eligibility",
      resourceType: "dispatch_job",
      resourceId: decisionRecord.dispatchJobId,
      oldValuesSummary: undefined,
      newValuesSummary: {
        decisionId: decisionRecord.decisionId,
        orderId: decisionRecord.orderId,
        vehicleId: decisionRecord.vehicleId,
        driverId: decisionRecord.driverId,
        decision: decisionRecord.decision,
        hardReasonCodes: [...decisionRecord.hardReasonCodes],
        softReasonCodes: [...decisionRecord.softReasonCodes],
        locationState: decisionRecord.locationState,
      },
    });
  }

  private scoreDecision(
    decision: RuntimeEvaluatedCandidate["eligibilityDecision"],
  ) {
    if (decision === "eligible") {
      return 0;
    }
    if (decision === "conditionally_eligible") {
      return 1;
    }
    return 2;
  }
}
