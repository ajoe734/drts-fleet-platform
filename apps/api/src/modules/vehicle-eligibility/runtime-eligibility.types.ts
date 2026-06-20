import type { ServiceProductType } from "@drts/contracts";

export type EligibilityDecision =
  | "eligible"
  | "conditionally_eligible"
  | "ineligible";

export type RuntimeEligibilityLocationState =
  | "fresh"
  | "stale"
  | "low_accuracy"
  | "missing";

export type RuntimeEligibilityDecisionRecord = {
  decisionId: string;
  orderId: string;
  dispatchJobId: string;
  driverId: string;
  vehicleId: string;
  serviceProductId: string;
  serviceProductCode: ServiceProductType;
  policyVersion: string;
  decision: EligibilityDecision;
  hardReasonCodes: string[];
  softReasonCodes: string[];
  missingRequirements: string[];
  locationState: RuntimeEligibilityLocationState;
  evaluatedAt: string;
};
