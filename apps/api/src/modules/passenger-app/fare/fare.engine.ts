import type { FareEstimate, FareTariff } from "./fare.types";

const DAY_MS = 86_400_000;
// Taiwan has no daylight-saving transitions; all passenger tariffs are Taipei tariffs.
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function nonnegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)
    throw new RangeError(`${field} must be finite, nonnegative and safe.`);
}
function integer(value: number, field: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new RangeError(`${field} must be a safe integer >= ${minimum}.`);
}
function minute(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new RangeError("Night window must use HH:mm.");
  const [hour, minutes] = value.split(":").map(Number);
  return hour! * 60 + minutes!;
}

export function validateFareTariff(t: FareTariff): void {
  if (!t.version?.trim() || !t.sourceReference?.trim())
    throw new RangeError("Tariff version and approved source are required.");
  const from = Date.parse(t.effectiveAt);
  const until =
    t.effectiveUntil === null ? Infinity : Date.parse(t.effectiveUntil);
  if (!Number.isFinite(from) || Number.isNaN(until) || until <= from)
    throw new RangeError("Invalid tariff effective window.");
  for (const [key, value] of Object.entries({
    baseFare: t.baseFare,
    distanceRate: t.distanceRate,
    delayRate: t.delayRate,
    nightSurchargeAmount: t.nightSurchargeAmount,
  }))
    integer(value, key);
  for (const [key, value] of Object.entries({
    baseDistanceMeters: t.baseDistanceMeters,
    distanceIncrementMeters: t.distanceIncrementMeters,
    delayIncrementSeconds: t.delayIncrementSeconds,
    totalIncrement: t.totalIncrement,
  }))
    integer(value, key, 1);
  if (!t.additionalFees || Array.isArray(t.additionalFees))
    throw new RangeError("Additional fees must be a map.");
  for (const [key, value] of Object.entries(t.additionalFees))
    integer(value, key);
  if (
    !["ceil", "floor"].includes(t.distanceRounding) ||
    !["ceil", "floor"].includes(t.delayRounding) ||
    !["ceil", "floor", "nearest"].includes(t.totalRounding) ||
    !["pickup", "any_overlap"].includes(t.nightApplication)
  )
    throw new RangeError(
      "Approved rounding and night application rules are required.",
    );
  if (minute(t.nightSurchargeWindowStart) === minute(t.nightSurchargeWindowEnd))
    throw new RangeError("Night window must not be empty.");
}

function nightApplies(
  t: FareTariff,
  pickupMs: number,
  durationSeconds: number,
) {
  const start = minute(t.nightSurchargeWindowStart) * 60_000;
  const end = minute(t.nightSurchargeWindowEnd) * 60_000;
  const local = pickupMs + TAIPEI_OFFSET_MS;
  const time = ((local % DAY_MS) + DAY_MS) % DAY_MS;
  const atPickup =
    start < end ? time >= start && time < end : time >= start || time < end;
  if (atPickup || t.nightApplication === "pickup" || durationSeconds === 0)
    return atPickup;
  // [pickup, arrival): arrival exactly at night start has no night overlap.
  const untilNextStart = (start - time + DAY_MS) % DAY_MS;
  return durationSeconds * 1000 > untilNextStart;
}

function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError("Fare exceeds safe monetary range.");
  return Number(value);
}
function total(amount: bigint, t: FareTariff, night: boolean): number {
  // The night fee is fixed per trip, independent of distance, delay and other fees.
  const numerator = amount + BigInt(night ? t.nightSurchargeAmount : 0);
  const denominator = BigInt(t.totalIncrement);
  let units = numerator / denominator;
  const remainder = numerator % denominator;
  if (
    (t.totalRounding === "ceil" && remainder > 0n) ||
    (t.totalRounding === "nearest" && remainder * 2n >= denominator)
  )
    units += 1n;
  return safeNumber(units * BigInt(t.totalIncrement));
}

/** Conservative range, not a guaranteed price or a prediction of low-speed time.
 * Minimum has no delay ticks; maximum treats the entire route duration as delay.
 * Unquoted tolls/cleaning/return trips are excluded. Fixed approved fees are included.
 */
export function estimateFare(
  t: FareTariff,
  input: {
    distanceMeters: number;
    durationSeconds: number;
    scheduledAt: string;
  },
): FareEstimate {
  validateFareTariff(t);
  nonnegative(input.distanceMeters, "distanceMeters");
  nonnegative(input.durationSeconds, "durationSeconds");
  const pickupMs = Date.parse(input.scheduledAt);
  if (!Number.isFinite(pickupMs))
    throw new RangeError("Invalid pickup timestamp.");
  const distanceUnits = Math[t.distanceRounding](
    Math.max(0, input.distanceMeters - t.baseDistanceMeters) /
      t.distanceIncrementMeters,
  );
  const delayUnits = Math[t.delayRounding](
    input.durationSeconds / t.delayIncrementSeconds,
  );
  integer(distanceUnits, "distanceUnits");
  integer(delayUnits, "delayUnits");
  const distanceFare = BigInt(distanceUnits) * BigInt(t.distanceRate);
  const delayFare = BigInt(delayUnits) * BigInt(t.delayRate);
  const extras = Object.values(t.additionalFees).reduce(
    (sum, fee) => sum + BigInt(fee),
    0n,
  );
  const base = BigInt(t.baseFare) + distanceFare + extras;
  const night = nightApplies(t, pickupMs, input.durationSeconds);
  return {
    estimatedMin: total(base, t, night),
    estimatedMax: total(base + delayFare, t, night),
    fareVersion: t.version,
    breakdown: {
      baseFare: t.baseFare,
      distanceUnits,
      distanceFare: safeNumber(distanceFare),
      delayUnits: { min: 0, max: delayUnits },
      delayFare: { min: 0, max: safeNumber(delayFare) },
      nightApplies: night,
      nightSurchargeAmount: night ? t.nightSurchargeAmount : 0,
      additionalFees: { ...t.additionalFees },
      totalIncrement: t.totalIncrement,
      totalRounding: t.totalRounding,
      rangeBasis: "zero_to_full_route_duration_delay",
    },
  };
}
