import { bookingRequirementsSchema, type BookingRequirements, type VehicleEligibilityMatrixRecord } from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";

export function validateBookingRequirements(value: unknown): BookingRequirements {
  const parsed = bookingRequirementsSchema.safeParse(value);
  if (!parsed.success) throw new ApiRequestError(400, "BOOKING_REQUIREMENTS_INVALID", "Booking requirements are invalid.");
  const requirements = parsed.data;
  // Current capabilities are license-class defaults, not verified equipment or
  // actual large-vehicle seating. SD §6.4 keeps these requests in human handling.
  if (requirements.passengerCount > 4 || requirements.luggageSize !== "standard" || requirements.requiredCapabilities.length) {
    throw new ApiRequestError(409, "BOOKING_REQUIREMENTS_UNSUPPORTED", "These requirements need verified vehicle capabilities and human handling.");
  }
  return requirements;
}

export function bookingRequirementFailures(requirements: BookingRequirements, capability: VehicleEligibilityMatrixRecord | null): string[] {
  try { validateBookingRequirements(requirements); } catch { return ["BOOKING_REQUIREMENTS_UNSUPPORTED"]; }
  if (!capability || !capability.active) return ["BOOKING_CAPABILITY_UNVERIFIED"];
  const reasons: string[] = [];
  if (!Number.isInteger(capability.seatCount) || capability.seatCount < requirements.passengerCount) reasons.push("BOOKING_PASSENGER_CAPACITY_EXCEEDED");
  if (!Number.isInteger(capability.luggageCapacity) || capability.luggageCapacity < requirements.luggageCount) reasons.push("BOOKING_LUGGAGE_CAPACITY_EXCEEDED");
  if (capability.conditionallyAllowed) reasons.push("BOOKING_CAPABILITY_REVIEW_REQUIRED");
  return reasons;
}
