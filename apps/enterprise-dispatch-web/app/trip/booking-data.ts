import type { BookingRecord } from "@drts/contracts";

// Booking lifecycle is authoritative. Assignment/ETA/contact fields are not
// published by this contract and must never be filled from demo fixtures.
export function tripStage(booking: BookingRecord): number | null {
  if (booking.status === "cancelled" || booking.orderStatus === "cancelled") return null;
  if (booking.status === "completed") return 4;
  switch (booking.orderStatus) {
    case "assigned":
    case "driver_accepted": return 0;
    case "enroute_pickup": return 1;
    case "arrived_pickup": return 2;
    case "on_trip":
    case "proof_pending": return 3;
    case "completed": return 4;
    default: return null;
  }
}

export function isActiveTrip(booking: BookingRecord): boolean {
  const stage = tripStage(booking);
  return booking.status === "active" && stage !== null && stage < 4;
}

export function homeBookings(bookings: BookingRecord[]) {
  const upcoming = bookings.filter((b) => b.status === "active" &&
    b.orderStatus !== "cancelled" && b.orderStatus !== "completed")
    .sort((a, b) => a.reservationWindowStart.localeCompare(b.reservationWindowStart) || a.bookingId.localeCompare(b.bookingId));
  return { active: upcoming.find(isActiveTrip), upcoming: upcoming.slice(0, 3) };
}

export function bookingHref(id: string) {
  return `/bookings/${encodeURIComponent(id)}`;
}

export function tripHref(id: string) {
  return `/trip?bookingId=${encodeURIComponent(id)}`;
}

export type BookingReadError = "not-found" | "unauthorized" | "forbidden" | "unavailable" | "rejected";
export function bookingReadError(error: unknown): BookingReadError {
  const status = typeof error === "object" && error !== null && "statusCode" in error ? error.statusCode : null;
  if (status === 404) return "not-found";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (typeof status === "number" && status < 500 && status !== 429) return "rejected";
  return "unavailable";
}

export interface BookingReader {
  listBookings(): Promise<BookingRecord[]>;
  getBooking(id: string): Promise<BookingRecord>;
}

export async function readTrip(client: BookingReader, bookingId?: string): Promise<BookingRecord | null> {
  // An explicit ID must never fall back to another passenger's active trip.
  if (bookingId !== undefined) return client.getBooking(bookingId);
  return homeBookings(await client.listBookings()).active ?? null;
}
