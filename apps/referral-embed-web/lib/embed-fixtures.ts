export const embedResident = {
  name: "李采縈",
  en: "T.Y. Lee",
  unit: "A 棟 12F-3",
  maskedPhone: "0912-***-820",
  ref: "res_••••_4A2",
};

export const embedVehicles = [
  { id: "standard", name: "標準車", sub: "1–4 人", code: "standard" },
  { id: "comfort", name: "舒適車", sub: "1–4 人 · 大空間", code: "comfort" },
  { id: "xl", name: "六人座", sub: "5–6 人 · 行李多", code: "xl" },
] as const;

export const embedSavedPlaces = [
  { label: "社區大廳", addr: "御和雲峰 A 棟 1F 大廳", tag: "住家" },
  { label: "台北車站", addr: "台北市中正區忠孝西路一段", tag: "常用" },
  { label: "榮總醫院", addr: "台北市北投區石牌路二段201號", tag: "就醫" },
] as const;

export const embedTrip = {
  id: "PT-9F20K7",
  orderId: "ord_77310",
  state: "enroute",
  from: "御和雲峰 A 棟 1F 大廳",
  to: "台北榮民總醫院 · 門診大樓",
  win: "今日 09:20",
  vehicle: "舒適車",
  driver: "吳明翰",
  plate: "BKR-2208",
  rating: 4.9,
  etaMin: 6,
  cancelWindowMin: 2,
};

export const embedTripHistory = [
  {
    id: "PT-9F20K7",
    date: "06-14 09:20",
    from: "社區大廳",
    to: "台北榮總",
    state: "enroute",
    fare: "—",
  },
  {
    id: "PT-9E11A3",
    date: "06-12 14:05",
    from: "台北車站",
    to: "社區大廳",
    state: "completed",
    fare: "NT$ 285",
  },
  {
    id: "PT-9D08F1",
    date: "06-09 08:30",
    from: "社區大廳",
    to: "內湖科技園區",
    state: "completed",
    fare: "NT$ 410",
  },
  {
    id: "PT-9C77B9",
    date: "06-05 19:40",
    from: "信義威秀",
    to: "社區大廳",
    state: "cancelled",
    fare: "NT$ 0",
  },
] as const;

export const embedReceipt = {
  id: "PT-9E11A3",
  orderId: "ord_77120",
  date: "2026-06-12 14:05",
  completedAt: "14:41",
  from: "台北車站 · 東三門",
  to: "御和雲峰 A 棟 1F 大廳",
  vehicle: "標準車",
  driver: "吳明翰",
  plate: "BKR-2208",
  passenger: "李采縈",
  maskedPhone: "0912-***-820",
  fareBase: "NT$ 85",
  fareDistance: "NT$ 168",
  fareTime: "NT$ 32",
  total: "NT$ 285",
  payment: "社區月結 · 綁定住戶帳號",
  channel: "社區 App",
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
    icon: "refresh",
    tone: "warn",
    titleCode: "pax.fallback.vehicle_change.title",
    titleSample: "正在為您重新安排車輛",
    bodyCode: "pax.fallback.vehicle_change.body",
    bodySample:
      "您的車輛正在重新安排，我們會盡快為您指派新車，行程目的地不變。",
    progressStage: "vehicle_change_in_progress",
    etaMin: null,
  },
  human_fallback_assigned: {
    icon: "user",
    tone: "success",
    titleCode: "pax.fallback.human_assigned.title",
    titleSample: "新車已為您指派",
    bodyCode: "pax.fallback.human_assigned.body",
    bodySample: "已為您指派新的車輛前往接您，請於原上車點稍候。",
    progressStage: "human_fallback_assigned",
    etaMin: 7,
  },
  service_continuing: {
    icon: "check",
    tone: "success",
    titleCode: "pax.fallback.service_continuing.title",
    titleSample: "行程繼續進行",
    bodyCode: "pax.fallback.service_continuing.body",
    bodySample: "您的行程正常進行中，感謝耐心等候。",
    progressStage: "service_continuing",
    etaMin: 4,
  },
  eta_updated: {
    icon: "clock",
    tone: "warn",
    titleCode: "pax.fallback.eta_updated.title",
    titleSample: "預計時間已更新",
    bodyCode: "pax.fallback.eta_updated.body",
    bodySample: "因重新安排車輛，預計上車時間已更新，造成不便敬請見諒。",
    progressStage: null,
    etaMin: 9,
  },
} as const satisfies Record<
  EmbedTripFallbackScreen,
  {
    icon: string;
    tone: "success" | "warn";
    titleCode: string;
    titleSample: string;
    bodyCode: string;
    bodySample: string;
    progressStage: EmbedTripFallbackProgressStage | null;
    etaMin: number | null;
  }
>;
