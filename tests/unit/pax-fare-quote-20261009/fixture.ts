import type { FareTariff } from "../../../apps/api/src/modules/passenger-app/fare/fare.types";

/** SD rates with SYNTHETIC publication/rounding rules, for tests only; never a seed. */
export const tariff: FareTariff = {
  version: "unit-only-sd-rates",
  effectiveAt: "2026-01-01T00:00:00.000Z",
  effectiveUntil: null,
  baseFare: 85,
  baseDistanceMeters: 1250,
  distanceRate: 5,
  distanceIncrementMeters: 200,
  delayRate: 5,
  delayIncrementSeconds: 80,
  nightSurchargeBps: 2000,
  nightSurchargeWindowStart: "23:00",
  nightSurchargeWindowEnd: "06:00",
  additionalFees: {},
  distanceRounding: "ceil",
  delayRounding: "ceil",
  totalRounding: "ceil",
  totalIncrement: 1,
  nightApplication: "pickup",
  sourceReference: "UNIT ONLY: SD numbers; unapproved rounding/effective date",
};
