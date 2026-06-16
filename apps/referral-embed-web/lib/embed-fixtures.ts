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
