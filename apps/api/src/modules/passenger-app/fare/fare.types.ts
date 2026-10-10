import type {
  FareQuoteResponse,
  FareVersion,
  FaresResponse,
  GeoPoint,
  GeoRouteResponse,
  ServiceAreaEvaluationResult,
} from "@drts/contracts";

/** No implicit meter rules: publication requires an approved rule set. Amounts are whole TWD. */
export interface FareTariff extends Omit<FareVersion, "nightSurcharge"> {
  effectiveUntil: string | null;
  /** Fixed whole TWD per trip, added only when the night window applies. */
  nightSurchargeAmount: number;
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
  /** Actual whole TWD charged in this estimate: zero during the day. */
  nightSurchargeAmount: number;
  additionalFees: Record<string, number>;
  totalIncrement: number;
  totalRounding: FareTariff["totalRounding"];
  rangeBasis: "zero_to_full_route_duration_delay";
}

/** Explicit units on the public wire; never encode a fixed fee as a ratio. */
export interface PassengerFaresResponse extends FaresResponse {
  currentVersion: FareVersion & {
    nightSurchargeUnit: "TWD_per_trip";
    nightApplication: FareTariff["nightApplication"];
  };
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
