import type { NativeBookingMapAvailability } from "./native-booking-screen";

/** Browser builds retain address search; no native map module enters this bundle. */
export function createNativePassengerBookingMap(): NativeBookingMapAvailability {
  return { status: "unavailable" };
}
