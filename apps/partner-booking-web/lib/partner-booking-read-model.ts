import {
  createPartnerIngressHandoff,
  createPartnerSessionFromIngressHandoff,
  getPartnerConfirmation,
  getPartnerTrip,
  getPartnerRouteContext,
  listPartnerBookings,
  PartnerAuthorityError,
} from "./api-client";

export type PartnerReadSearch = Record<string, string | string[] | undefined>;
export function partnerReadValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || null;
}

async function partnerReadSession(
  entrySlug: string,
  partnerUserRef: string | null,
) {
  if (!partnerUserRef)
    throw new PartnerAuthorityError(
      400,
      "PARTNER_USER_REF_REQUIRED",
      "The original partner ingress identity is required.",
    );
  const context = await getPartnerRouteContext(entrySlug);
  const entry = context.entry;
  if (!entry || entry.status !== "active" || !entry.activeFlag) {
    throw new PartnerAuthorityError(
      409,
      "PARTNER_ENTRY_INACTIVE",
      "Partner entry is unavailable.",
    );
  }
  const handoff = await createPartnerIngressHandoff({
    entrySlug: entry.entrySlug,
    partnerUserRef,
  });
  return {
    context,
    session: createPartnerSessionFromIngressHandoff(handoff, entry),
  };
}

export async function loadPartnerBookingRecord(
  entrySlug: string,
  query: PartnerReadSearch,
) {
  const partnerUserRef = partnerReadValue(query.partnerUserRef);
  const bookingId = partnerReadValue(query.bookingId);
  const orderId = partnerReadValue(query.orderId);
  if (!bookingId && !orderId)
    throw new PartnerAuthorityError(
      400,
      "PARTNER_BOOKING_REFERENCE_REQUIRED",
      "A booking or order reference is required.",
    );
  const { context, session } = await partnerReadSession(
    entrySlug,
    partnerUserRef,
  );
  let order =
    orderId && !bookingId ? await getPartnerTrip(session, orderId) : null;
  const actualBookingId = bookingId ?? order?.bookingId;
  if (!actualBookingId)
    throw new PartnerAuthorityError(
      404,
      "BOOKING_NOT_FOUND",
      "Booking was not found.",
    );
  const booking = await getPartnerConfirmation(session, actualBookingId);
  order = order ?? (await getPartnerTrip(session, booking.orderId));
  if (
    booking.bookingId !== actualBookingId ||
    order.orderId !== booking.orderId ||
    order.bookingId !== booking.bookingId ||
    (orderId && orderId !== order.orderId)
  )
    throw new PartnerAuthorityError(
      409,
      "PARTNER_BOOKING_READBACK_MISMATCH",
      "Booking and order references do not match.",
    );
  // Session/key never leaves this server helper.
  return {
    entry: context.entry!,
    brand: context.brand,
    booking,
    order,
    partnerUserRef: partnerUserRef!,
  };
}

export async function loadPartnerBookingHistory(
  entrySlug: string,
  query: PartnerReadSearch,
) {
  const partnerUserRef = partnerReadValue(query.partnerUserRef);
  const { context, session } = await partnerReadSession(
    entrySlug,
    partnerUserRef,
  );
  const page = partnerReadValue(query.page) ?? "1";
  const bookings = await listPartnerBookings(session, { page, pageSize: 20 });
  return {
    entry: context.entry!,
    brand: context.brand,
    bookings,
    partnerUserRef: partnerUserRef!,
  };
}
