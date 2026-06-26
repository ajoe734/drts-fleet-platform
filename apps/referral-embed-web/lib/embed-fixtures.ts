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
  orderId: "ord_77310",
  statusCode: "en_route",
  etaMin: 6,
  cancelWindowMin: 2,
  driver: "Minghan Wu",
  plate: "BKR-2208",
};

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

export const embedFallbackProgress = [
  { key: "vehicle_change_in_progress", label: "重新安排車輛" },
  { key: "human_fallback_assigned", label: "新車已指派" },
  { key: "service_continuing", label: "行程繼續" },
] as const;

export const embedFallbackStates = {
  fb_vehicle_change: {
    publicState: "vehicle_change_in_progress",
    icon: "refresh",
    tone: "warn",
    title: {
      messageCode: "sandbox_fulfillment.fallback_started.title",
    },
    body: {
      messageCode: "P2_AV_FALLBACK_INITIATED_V1",
    },
    progressState: "vehicle_change_in_progress",
    etaMinutes: null,
    secondaryAction: "support",
  },
  fb_human_assigned: {
    publicState: "human_fallback_assigned",
    icon: "user",
    tone: "success",
    title: {
      messageCode: "sandbox_fulfillment.fallback_assigned.title",
    },
    body: {
      messageCode: "P2_AV_FALLBACK_ASSIGNED_V1",
    },
    progressState: "human_fallback_assigned",
    etaMinutes: 7,
    secondaryAction: "driver",
  },
  fb_service_continuing: {
    publicState: "service_continuing",
    icon: "check",
    tone: "success",
    title: {
      messageCode: "sandbox_fulfillment.mode_changed.title",
    },
    body: {
      messageCode: "sandbox_fulfillment.service_continues_with_human_driver",
    },
    progressState: "service_continuing",
    etaMinutes: 4,
    secondaryAction: null,
  },
  fb_eta_updated: {
    publicState: "eta_updated",
    icon: "clock",
    tone: "warn",
    title: {
      messageCode: "sandbox_fulfillment.eta_updated.title",
    },
    body: {
      messageCode: "sandbox_fulfillment.eta_updated",
    },
    progressState: null,
    etaMinutes: 9,
    secondaryAction: null,
  },
} as const;
