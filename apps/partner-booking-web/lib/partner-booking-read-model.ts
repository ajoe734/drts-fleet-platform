import type { BookingRecord, PartnerBookingDetails } from "@drts/contracts";
import {
  createPartnerIngressHandoff,
  createPartnerSessionFromIngressHandoff,
  getPartnerConfirmation,
  getPartnerPrincipalReadback,
  getPartnerReceipt,
  getPartnerTrip,
  getPartnerRouteContext,
  listPartnerBookings,
  listAllPartnerBookings,
  PartnerAuthorityError,
  type PartnerBookingCollection,
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
  includeReceipt = false,
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
    (order.progress && order.progress.orderId !== order.orderId) ||
    (orderId && orderId !== order.orderId)
  )
    throw new PartnerAuthorityError(
      409,
      "PARTNER_BOOKING_READBACK_MISMATCH",
      "Booking and order references do not match.",
    );
  const receipt = includeReceipt
    ? await getPartnerReceipt(session, order.orderId)
    : null;
  if (
    includeReceipt &&
    (!receipt ||
      receipt.orderId !== order.orderId ||
      receipt.bookingId !== booking.bookingId)
  )
    throw new PartnerAuthorityError(
      409,
      "PARTNER_BOOKING_READBACK_MISMATCH",
      "Receipt, booking and order references do not match.",
    );
  const principal = await getPartnerPrincipalReadback(session);
  // Session/key never leaves this server helper.
  return {
    entry: context.entry!,
    brand: context.brand,
    booking,
    order,
    receipt,
    principal,
    partnerUserRef: partnerUserRef!,
  };
}

type TravelDetails = Extract<
  PartnerBookingDetails,
  { subtype: "travel_agency_transfer" }
>;

export type PartnerTravelBookingSlot = {
  key: string;
  legId: string;
  legLabel: string;
  batchId: string;
  batchLabel: string;
  vehicleId: string;
  vehicleLabel: string;
  bookings: BookingRecord[];
  missing: boolean;
  duplicate: boolean;
  completed: boolean;
};

export type PartnerTravelBookingGroup = {
  key: string;
  sourceKind: string;
  sourceId: string;
  sourceRevision: string;
  sourceLabel: string;
  groupCode: string;
  slots: PartnerTravelBookingSlot[];
  missingLegCount: number;
  missingBatchCount: number;
  missingVehicleCount: number;
  metadataConsistent: boolean;
  completed: boolean;
};

function travelPlanText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function travelPlanCount(value: number | undefined) {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

/** Aggregate persisted identities, never labels or a single completed vehicle. */
export function groupPartnerTravelBookings(
  collection: PartnerBookingCollection,
) {
  const groups = new Map<
    string,
    {
      group: PartnerTravelBookingGroup;
      records: Array<{ booking: BookingRecord; details: TravelDetails }>;
    }
  >();
  let ungroupedTravelBookings = 0;
  for (const booking of collection.items) {
    const details = booking.partnerBookingDetails;
    if (
      booking.businessDispatchSubtype !== "travel_agency_transfer" ||
      details?.subtype !== "travel_agency_transfer"
    )
      continue;
    if (
      !travelPlanText(details.planSourceKind) ||
      !travelPlanText(details.planSourceId) ||
      !travelPlanText(details.planSourceRevision) ||
      !travelPlanText(details.groupCode) ||
      !travelPlanText(details.planLegId) ||
      !travelPlanText(details.planBatchId) ||
      !travelPlanText(details.planVehicleId)
    ) {
      ungroupedTravelBookings += 1;
      continue;
    }
    const key = JSON.stringify([
      booking.tenantId,
      booking.partnerId,
      booking.partnerProgramId,
      booking.partnerEntrySlug,
      details.planSourceKind,
      details.planSourceId,
      details.planSourceRevision,
    ]);
    let entry = groups.get(key);
    if (!entry) {
      entry = {
        group: {
          key,
          sourceKind: details.planSourceKind,
          sourceId: details.planSourceId,
          sourceRevision: details.planSourceRevision,
          sourceLabel: details.planSourceLabel ?? details.planSourceId,
          groupCode: details.groupCode,
          slots: [],
          missingLegCount: 0,
          missingBatchCount: 0,
          missingVehicleCount: 0,
          metadataConsistent: true,
          completed: false,
        },
        records: [],
      };
      groups.set(key, entry);
    }
    if (entry.group.groupCode !== details.groupCode)
      entry.group.metadataConsistent = false;
    entry.records.push({ booking, details });
    const slotKey = JSON.stringify([
      details.planLegId,
      details.planBatchId,
      details.planVehicleId,
    ]);
    let slot = entry.group.slots.find((value) => value.key === slotKey);
    if (!slot) {
      slot = {
        key: slotKey,
        legId: details.planLegId,
        legLabel: details.planLegLabel ?? details.planLegId,
        batchId: details.planBatchId,
        batchLabel: details.planBatchLabel ?? details.planBatchId,
        vehicleId: details.planVehicleId,
        vehicleLabel: details.planVehicleLabel ?? details.planVehicleId,
        bookings: [],
        missing: false,
        duplicate: false,
        completed: false,
      };
      entry.group.slots.push(slot);
    }
    slot.bookings.push(booking);
  }

  for (const { group, records } of groups.values()) {
    // Validate declared cardinalities at each original leg/batch boundary.
    const coverage = (
      rows: typeof records,
      id: (details: TravelDetails) => string | undefined,
      count: (details: TravelDetails) => number | undefined,
      index?: (details: TravelDetails) => number | undefined,
    ) => {
      const expected = new Set(
        rows.map(({ details }) => travelPlanCount(count(details))),
      );
      const identities = new Map<string, Set<number | null>>();
      for (const { details } of rows) {
        const identity = id(details)!;
        const indices = identities.get(identity) ?? new Set<number | null>();
        if (index) indices.add(travelPlanCount(index(details)));
        identities.set(identity, indices);
      }
      const declared = [...expected].reduce<number>(
        (maximum, value) => Math.max(maximum, value ?? 0),
        0,
      );
      const observedIndices = [...identities.values()].flatMap((values) => [
        ...values,
      ]);
      if (
        expected.has(null) ||
        expected.size !== 1 ||
        identities.size > declared ||
        (index &&
          (observedIndices.some(
            (value) => value === null || value > declared,
          ) ||
            [...identities.values()].some((values) => values.size !== 1) ||
            new Set(observedIndices).size !== identities.size))
      ) {
        group.metadataConsistent = false;
      }
      return Math.max(0, declared - identities.size);
    };
    group.missingLegCount = coverage(
      records,
      (details) => details.planLegId,
      (details) => details.planLegCount,
      (details) => details.planLegIndex,
    );
    const legs = new Set(records.map(({ details }) => details.planLegId));
    for (const legId of legs) {
      const legRecords = records.filter(
        ({ details }) => details.planLegId === legId,
      );
      group.missingBatchCount += coverage(
        legRecords,
        (details) => details.planBatchId,
        (details) => details.planBatchCount,
        (details) => details.planBatchIndex,
      );
      const batches = new Set(
        legRecords.map(({ details }) => details.planBatchId),
      );
      for (const batchId of batches) {
        const batchRecords = legRecords.filter(
          ({ details }) => details.planBatchId === batchId,
        );
        group.missingVehicleCount += coverage(
          batchRecords,
          (details) => details.planVehicleId,
          (details) => details.planVehicleCount,
        );
      }
    }
    const orderSlots = new Map<string, string>();
    for (const slot of group.slots) {
      const active = slot.bookings.filter(
        (booking) =>
          booking.status !== "cancelled" && booking.orderStatus !== "cancelled",
      );
      const orders = new Set(active.map((booking) => booking.orderId));
      for (const booking of active) {
        const previousSlot = orderSlots.get(booking.orderId);
        if (previousSlot && previousSlot !== slot.key)
          group.metadataConsistent = false;
        orderSlots.set(booking.orderId, slot.key);
      }
      slot.missing = orders.size === 0;
      slot.duplicate = active.length > 1;
      slot.completed =
        active.length === 1 &&
        active.every((booking) => booking.orderStatus === "completed");
      if (slot.missing) group.missingVehicleCount += 1;
    }
    group.completed =
      collection.complete &&
      group.metadataConsistent &&
      group.missingLegCount === 0 &&
      group.missingBatchCount === 0 &&
      group.missingVehicleCount === 0 &&
      group.slots.every((slot) => slot.completed && !slot.duplicate);
  }
  return {
    groups: [...groups.values()].map(({ group }) => group),
    ungroupedTravelBookings,
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
  const collection =
    context.entry?.businessDispatchSubtype === "travel_agency_transfer"
      ? await listAllPartnerBookings(session, bookings)
      : null;
  const travel = collection ? groupPartnerTravelBookings(collection) : null;
  const principal = await getPartnerPrincipalReadback(session);
  return {
    entry: context.entry!,
    brand: context.brand,
    bookings,
    travel:
      travel && collection
        ? { ...travel, complete: collection.complete }
        : null,
    principal,
    partnerUserRef: partnerUserRef!,
  };
}
