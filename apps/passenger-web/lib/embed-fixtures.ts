export const embedResident = {
  name: "李采縈",
  unit: "A 棟 12F-3",
  maskedPhone: "0912-***-820",
  ref: "res_••••_4A2",
};

export const embedVehicles = [
  { id: "standard", name: "標準車", note: "1-4 人" },
  { id: "comfort", name: "舒適車", note: "1-4 人 · 大空間" },
  { id: "xl", name: "六人座", note: "5-6 人 · 行李多" },
] as const;

export const embedSavedPlaces = ["社區大廳", "台北車站", "榮總醫院"] as const;

export const embedTrip = {
  id: "PT-9F20K7",
  orderId: "ord_77310",
  status: "前往上車",
  statusCode: "en_route",
  from: "御和雲峰 A 棟 1F 大廳",
  to: "台北榮民總醫院 · 門診大樓",
  etaMin: 6,
  cancelWindowMin: 2,
  vehicle: "舒適車",
  driver: "吳明翰",
  plate: "BKR-2208",
};

export const embedTripHistory = [
  {
    id: "PT-9F20K7",
    date: "06-14 09:20",
    from: "社區大廳",
    to: "台北榮總",
    status: "進行中",
    fare: "—",
  },
  {
    id: "PT-9E11A3",
    date: "06-12 14:05",
    from: "台北車站",
    to: "社區大廳",
    status: "已完成",
    fare: "NT$ 285",
  },
  {
    id: "PT-9C77B9",
    date: "06-05 19:40",
    from: "信義威秀",
    to: "社區大廳",
    status: "已取消",
    fare: "NT$ 0",
  },
];

export const embedReceipt = {
  id: "PT-9E11A3",
  completedAt: "2026-06-12 14:41",
  from: "台北車站 · 東三門",
  to: "御和雲峰 A 棟 1F 大廳",
  passenger: "李采縈",
  maskedPhone: "0912-***-820",
  vehicle: "標準車",
  driver: "吳明翰",
  plate: "BKR-2208",
  total: "NT$ 285",
  pay: "社區月結 · 綁定住戶帳號",
};
