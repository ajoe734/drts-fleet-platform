import type { SandboxFulfillmentProjectionView } from "@drts/contracts";
import type { PassengerFallbackScreen } from "./passenger-fallback";

export const embedResident = {
  name: "L. Tsai",
  unit: "Tower A 12F-3",
  maskedPhone: "0912-***-820",
  ref: "res_••••_4A2",
};

export const embedVehicles = [
  { id: "standard" },
  { id: "comfort" },
  { id: "xl" },
] as const;

export const embedSavedPlaces = ["lobby", "station", "hospital"] as const;

export const embedTrip = {
  id: "PT-9F20K7",
  bookingId: "booking-embed-001",
  orderId: "ord_77310",
  statusCode: "en_route",
  etaMin: 6,
  cancelWindowMin: 2,
  driver: "Minghan Wu",
  plate: "BKR-2208",
};

export const embedFallbackTripProjections = {
  fb_vehicle_change: {
    bookingId: embedTrip.bookingId,
    orderId: embedTrip.orderId,
    sandboxTripId: null,
    audience: "passenger",
    fulfillmentMode: "hidden",
    state: "pending_dispatch",
    statusCode: "redispatch_required",
    messages: [
      {
        messageCode: "sandbox_fulfillment.status_update_available",
        category: "info",
      },
    ],
    etaMinutes: null,
    extraChargeDisclosed: false,
    providerBrandDisclosed: false,
    updatedAt: "2026-06-26T14:04:00.000Z",
  },
  fb_human_assigned: {
    bookingId: embedTrip.bookingId,
    orderId: embedTrip.orderId,
    sandboxTripId: "assignment-human-001",
    audience: "passenger",
    fulfillmentMode: "human_fallback",
    state: "assigned",
    statusCode: "assigned",
    messages: [
      {
        messageCode: "sandbox_fulfillment.status_update_available",
        category: "info",
      },
    ],
    etaMinutes: 7,
    extraChargeDisclosed: false,
    providerBrandDisclosed: false,
    updatedAt: "2026-06-26T14:06:00.000Z",
  },
  fb_service_continuing: {
    bookingId: embedTrip.bookingId,
    orderId: embedTrip.orderId,
    sandboxTripId: "assignment-human-001",
    audience: "passenger",
    fulfillmentMode: "human_fallback",
    state: "en_route_pickup",
    statusCode: "assigned",
    messages: [
      {
        messageCode: "sandbox_fulfillment.service_continues_with_human_driver",
        category: "warning",
      },
    ],
    etaMinutes: 4,
    extraChargeDisclosed: false,
    providerBrandDisclosed: false,
    updatedAt: "2026-06-26T14:08:00.000Z",
  },
  fb_eta_updated: {
    bookingId: embedTrip.bookingId,
    orderId: embedTrip.orderId,
    sandboxTripId: "assignment-human-001",
    audience: "passenger",
    fulfillmentMode: "human_fallback",
    state: "assigned",
    statusCode: "assigned",
    messages: [
      {
        messageCode: "sandbox_fulfillment.status_update_available",
        category: "info",
      },
    ],
    etaMinutes: 9,
    extraChargeDisclosed: false,
    providerBrandDisclosed: false,
    updatedAt: "2026-06-26T14:09:00.000Z",
  },
} as const satisfies Record<PassengerFallbackScreen, SandboxFulfillmentProjectionView>;

export const embedTripHistory = [
  {
    id: "PT-9F20K7",
    date: "06-14 09:20",
    from: "lobby",
    to: "hospital",
    status: "inProgress",
    fare: "—",
  },
  {
    id: "PT-9E11A3",
    date: "06-12 14:05",
    from: "station",
    to: "lobby",
    status: "completed",
    fare: "NT$ 285",
  },
  {
    id: "PT-9C77B9",
    date: "06-05 19:40",
    from: "station",
    to: "lobby",
    status: "cancelled",
    fare: "NT$ 0",
  },
] as const;

export const embedReceipt = {
  id: "PT-9E11A3",
  completedAt: "2026-06-12 14:41",
  passenger: "L. Tsai",
  maskedPhone: "0912-***-820",
  driver: "Minghan Wu",
  plate: "BKR-2208",
  total: "NT$ 285",
};
