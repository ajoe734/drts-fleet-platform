import type {
  FareQuoteResponse,
  FareVersion,
  GeoPoint,
  GeoRouteResponse,
  ServiceAreaEvaluationResult,
} from "@drts/contracts";

/** No implicit meter rules: publication requires an approved rule set. Amounts are whole TWD. */
export interface FareTariff extends Omit<FareVersion, "nightSurcharge"> {
  effectiveUntil: string | null;
  nightSurchargeBps: number;
  distanceRounding: "ceil" | "floor";
  delayRounding: "ceil" | "floor";
  totalRounding: "ceil" | "floor" | "nearest";
  totalIncrement: number;
  nightApplication: "pickup" | "any_overlap";
  sourceReference: string;
}

export interface FareBreakdown {
  baseFare: number;
  distanceUnits: number;
  distanceFare: number;
  delayUnits: { min: number; max: number };
  delayFare: { min: number; max: number };
  nightApplies: boolean;
  nightSurchargeBps: number;
  additionalFees: Record<string, number>;
  totalIncrement: number;
  totalRounding: FareTariff["totalRounding"];
  rangeBasis: "zero_to_full_route_duration_delay";
}

export interface FareEstimate {
  estimatedMin: number;
  estimatedMax: number;
  fareVersion: string;
  breakdown: FareBreakdown;
}

export interface FareQuoteSnapshot extends FareEstimate {
  fareSnapshotId: string;
  drtsPassengerId: string;
  origin: GeoPoint;
  destination: GeoPoint;
  scheduledAt: string;
  route: GeoRouteResponse;
  tariffSnapshot: FareTariff;
  serviceAreaEvaluation: ServiceAreaEvaluationResult;
  createdAt: string;
  expiresAt: string;
}

export type PassengerFareQuoteResponse = FareQuoteResponse & {
  serviceAreaEvaluation: ServiceAreaEvaluationResult;
  isGuaranteed: false;
  route?: GeoRouteResponse;
  breakdown?: FareBreakdown;
};
