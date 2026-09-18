import type { ServiceAreaEvaluationResult } from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";

export function assertAutonomousServiceArea(
  result: ServiceAreaEvaluationResult,
): void {
  if (
    result.decision !== "serviceable" ||
    result.stops.length === 0 ||
    result.stops.some((stop) => stop.decision !== "serviceable")
  ) {
    throw new ApiRequestError(
      409,
      "VOICE_SERVICE_AREA_REVIEW_REQUIRED",
      "Service-area review must be resolved before autonomous booking or dispatch.",
      { decision: result.decision, reasonCodes: result.reasonCodes },
    );
  }
}
