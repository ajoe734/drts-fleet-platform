import type {
  DispatchCandidate,
  DispatchCandidateLocationState,
} from "@drts/contracts";

export const LOCATION_STALE_MS = 10 * 60 * 1000;

export function isFreshLocation(
  recordedAt?: string | null,
  nowMs: number = Date.now(),
) {
  if (!recordedAt) {
    return false;
  }
  const recordedMs = new Date(recordedAt).getTime();
  if (Number.isNaN(recordedMs)) {
    return false;
  }
  return nowMs - recordedMs <= LOCATION_STALE_MS;
}

export function getCandidateLocationState(
  candidate: DispatchCandidate,
  nowMs: number = Date.now(),
): DispatchCandidateLocationState {
  if (candidate.locationState) {
    return candidate.locationState;
  }
  if (!candidate.currentLocation) {
    return "no_location";
  }
  return isFreshLocation(candidate.currentLocation.recordedAt, nowMs)
    ? "live"
    : "stale";
}

export function getCandidateLocationTone(
  locationState: DispatchCandidateLocationState,
): string {
  switch (locationState) {
    case "live":
      return "candidate-location-live";
    case "stale":
      return "candidate-location-stale";
    case "no_location":
      return "candidate-location-no-location";
  }
}
