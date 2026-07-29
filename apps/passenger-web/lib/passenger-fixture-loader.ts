import {
  resolvePassengerScreenId,
  type PassengerRideFixture,
} from "./passenger-view-model";

export const PASSENGER_PRODUCTION_FIXTURE_FORBIDDEN =
  "PASSENGER_PRODUCTION_FIXTURE_FORBIDDEN";

/**
 * Sole entry point to the fixture payloads.
 *
 * The `import()` is guarded by a `NODE_ENV` check the bundler can evaluate at
 * build time, so `passenger-fixtures.ts` is emitted as a separate async chunk
 * and is dropped entirely from a production build. Returning `null` instead of
 * throwing lets the caller keep showing the live/error state rather than a
 * demo ride.
 */
export async function loadPassengerRideFixture(
  token: string,
  kind: "ride" | "fares" | "receipt",
  screenParam: string | string[] | undefined,
): Promise<PassengerRideFixture | null> {
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  const screenId = resolvePassengerScreenId(screenParam, kind);
  const { getPassengerRideFixture } = await import("./passenger-fixtures");
  return getPassengerRideFixture(screenId, token);
}
