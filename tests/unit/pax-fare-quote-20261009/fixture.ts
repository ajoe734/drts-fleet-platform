import type { FareTariff } from "../../../apps/api/src/modules/passenger-app/fare/fare.types";

/** Finalized rates with SYNTHETIC ceil-delay/total rules; never a seed. */
export const tariff: FareTariff = {
  version: "unit-only-sd-rates",
  effectiveAt: "2026-01-01T00:00:00.000Z",
  effectiveUntil: null,
  baseFare: 85,
  baseDistanceMeters: 1250,
  distanceRate: 5,
  distanceIncrementMeters: 200,
  delayRate: 5,
  delayIncrementSeconds: 60,
  nightSurchargeAmount: 20,
  nightSurchargeWindowStart: "23:00",
  nightSurchargeWindowEnd: "06:00",
  additionalFees: {},
  distanceRounding: "ceil",
  delayRounding: "ceil",
  totalRounding: "ceil",
  totalIncrement: 1,
  nightApplication: "pickup",
  sourceReference:
    "UNIT ONLY: finalized rates; synthetic ceil-delay/total rules",
};

/** Ordinary-day publication rules from SD / official taximeter II(3). */
export const publishedTariff: FareTariff = {
  ...tariff,
  version: "taipei-20230401",
  effectiveAt: "2023-03-31T16:00:00.000Z",
  delayRounding: "floor",
  totalRounding: "floor",
  totalIncrement: 5,
  sourceReference:
    "2026-10-10 user decision; SD 02_content_and_rules.md; https://pto.gov.taipei/News_Content.aspx?n=6B4D38874E971F4B&s=63C0CCF302898D25; https://laws.gov.taipei/Law/File/0000199457 II(3)",
};
