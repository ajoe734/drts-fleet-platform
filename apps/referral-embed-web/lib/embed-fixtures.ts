export const embedResident = {
  name: "李采縈",
  unit: "A 棟 12F-3",
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
  orderId: "ord_77310",
  statusCode: "en_route",
  etaMin: 6,
  cancelWindowMin: 2,
  driver: "吳明翰",
  plate: "BKR-2208",
};

export const EMBED_TRIP_FALLBACK_SCREENS = [
  "vehicle_change_in_progress",
  "human_fallback_assigned",
  "service_continuing",
  "eta_updated",
] as const;

export type EmbedTripFallbackScreen =
  (typeof EMBED_TRIP_FALLBACK_SCREENS)[number];

export const EMBED_TRIP_FALLBACK_PROGRESS = [
  "vehicle_change_in_progress",
  "human_fallback_assigned",
  "service_continuing",
] as const;

export type EmbedTripFallbackProgressStage =
  (typeof EMBED_TRIP_FALLBACK_PROGRESS)[number];

export const embedTripFallbackStates = {
  vehicle_change_in_progress: {
    passengerMessageCode: "pax.fallback.vehicle_change_in_progress",
    icon: "refresh",
    tone: "warn",
    progressStage: "vehicle_change_in_progress",
    etaMin: null,
  },
  human_fallback_assigned: {
    passengerMessageCode: "pax.fallback.human_fallback_assigned",
    icon: "user",
    tone: "success",
    progressStage: "human_fallback_assigned",
    etaMin: 7,
  },
  service_continuing: {
    passengerMessageCode: "pax.fallback.service_continuing",
    icon: "check",
    tone: "success",
    progressStage: "service_continuing",
    etaMin: 4,
  },
  eta_updated: {
    passengerMessageCode: "pax.fallback.eta_updated",
    icon: "clock",
    tone: "warn",
    progressStage: null,
    etaMin: 9,
  },
} as const satisfies Record<
  EmbedTripFallbackScreen,
  {
    passengerMessageCode: string;
    icon: string;
    tone: "success" | "warn";
    progressStage: EmbedTripFallbackProgressStage | null;
    etaMin: number | null;
  }
>;

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
    id: "PT-9D08F1",
    date: "06-09 08:30",
    from: "lobby",
    to: "station",
    status: "completed",
    fare: "NT$ 410",
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
  completedAt: "2026-06-12 14:05",
  passenger: "李采縈",
  maskedPhone: "0912-***-820",
  driver: "吳明翰",
  plate: "BKR-2208",
  total: "NT$ 285",
};
