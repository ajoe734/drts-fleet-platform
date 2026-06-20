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
    return "missing";
  }
  return isFreshLocation(candidate.currentLocation.recordedAt, nowMs)
    ? "fresh"
    : "stale";
}

export function getCandidateLocationTone(
  locationState: DispatchCandidateLocationState,
): string {
  switch (locationState) {
    case "fresh":
      return "candidate-location-live";
    case "stale":
    case "low_accuracy":
      return "candidate-location-stale";
    case "missing":
      return "candidate-location-no-location";
    default:
      return "candidate-location-no-location";
  }
}
