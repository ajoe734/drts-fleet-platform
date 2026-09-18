import type {
  BookingQualification,
  BookingRequirements,
  OwnedOrderRecord,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import { assertAutonomousServiceArea } from "../service-area/autonomous-service-area";
import { validateBookingRequirements } from "../vehicle-eligibility/booking-requirements";

export interface QualifiedVoiceBookingSnapshot {
  bookingRequirements: BookingRequirements;
  bookingQualification: BookingQualification;
}

/** Pure mapping for the shared voice UoW/receipt writer (UV-EXEC-015).
 * Consume only the server's current, confirmed draft snapshot; this is not a
 * public command or an alternative order-creation transaction. */
export function applyVoiceBookingQualification(
  order: OwnedOrderRecord,
  snapshot: QualifiedVoiceBookingSnapshot,
): OwnedOrderRecord {
  const qualification = snapshot.bookingQualification;
  if (
    order.orderDomain !== "owned" ||
    order.orderSource !== "phone" ||
    order.serviceBucket !== "standard_taxi" ||
    order.dispatchSemantics !== "realtime" ||
    order.reservationWindowStart ||
    order.reservationWindowEnd ||
    order.operatingAuthorizationId ||
    (order.runtimeProfileCode &&
      order.runtimeProfileCode !== "ordinary_taxi") ||
    (order.serviceProductCode &&
      order.serviceProductCode !== "taxi_realtime") ||
    qualification.runtimeProfileCode !== "ordinary_taxi" ||
    qualification.serviceProductCode !== "taxi_realtime" ||
    qualification.timingMode !== "on_demand"
  ) {
    throw new ApiRequestError(
      409,
      "VOICE_PRODUCT_HANDOFF_REQUIRED",
      "Qualification cannot convert another product or reservation to immediate taxi.",
    );
  }
  if (
    !Number.isFinite(Date.parse(qualification.validUntil)) ||
    Date.parse(qualification.validUntil) <= Date.now()
  )
    throw new ApiRequestError(
      409,
      "VOICE_QUALIFICATION_STALE",
      "Revalidate the booking draft before creating an order.",
    );
  assertAutonomousServiceArea(qualification.serviceArea);
  const bookingRequirements = validateBookingRequirements(
    snapshot.bookingRequirements,
  );
  return {
    ...structuredClone(order),
    bookingRequirements,
    bookingQualification: structuredClone(qualification),
    runtimeProfileCode: "ordinary_taxi",
    serviceProductCode: "taxi_realtime",
    timingMode: "on_demand",
    pickup: structuredClone(qualification.pickup.address),
    dropoff: structuredClone(qualification.dropoff.address),
    passenger: { ...bookingRequirements.passengerContact },
    luggageCount: bookingRequirements.luggageCount,
  };
}
