export type BookingState =
  | "assigned"
  | "approval"
  | "reserved"
  | "enroute"
  | "completed"
  | "cancelled"
  | "nosupply";

export type AvailableAction =
  | "view"
  | "cancel"
  | "contact_support"
  | "view_receipt"
  | "track_trip";

export interface EnterpriseBooking {
  id: string;
  passenger: string;
  bookedBy: string;
  self: boolean;
  from: string;
  to: string;
  window: string;
  state: BookingState;
  costCenter: string;
  etaMinutes: number | null;
  vehicle: string;
  approval: string;
  receiptReady: boolean;
  fare?: string;
  flight?: string;
  terminal?: string;
  luggage?: string;
  onsiteContact?: string;
  availableActions: AvailableAction[];
}

export const enterpriseTenant = {
  name: "鴻碩科技",
  department: "產品部",
  supportPhone: "0800-200-118",
  supportEmail: "dispatch-support@hongshuo.example",
};

export const enterpriseUser = {
  name: "林宜君",
  role: "行政祕書",
  dept: "營運支援",
};

export const enterprisePassengers = [
  "林宜君",
  "林冠廷",
  "陳思妤",
  "訪客 · Sato Kenji",
] as const;

export const enterpriseCostCenters = [
  "CC-PRD-01 · 產品部一般差旅",
  "CC-PRD-07 · 產品部客戶接待",
  "CC-OPS-03 · 營運支援行政",
] as const;

export const enterpriseAddresses = [
  "台北總部 · 台北市信義區松高路 19 號",
  "南港研發中心 · 台北市南港區三重路 19-2 號",
  "桃園機場 T2 · 桃園市大園區航站南路 9 號",
  "君悅酒店 · 台北市信義區松壽路 2 號",
] as const;

export const enterpriseQuotaSummary = {
  rides: "23 / 40 趟",
  amount: "NT$ 84,200 / 120,000",
  availableAmount: "NT$ 35,800",
};

export const enterpriseBookingDraft = {
  passenger: "訪客 · Sato Kenji",
  bookedBy: "林宜君",
  pickup: "桃園機場 T2 · 桃園市大園區航站南路 9 號",
  dropoff: "君悅酒店 · 台北市信義區松壽路 2 號",
  reservationWindow: "06/13 15:20",
  costCenter: "CC-PRD-07 · 產品部客戶接待",
  approval: "超過 NT$ 1,500，需主管審批",
  quotaImpact: "預估佔用 NT$ 1,980 與 1 趟額度",
  vehicle: "商務車",
  flight: "JL809",
  terminal: "T1",
  luggage: "3 件",
  onsiteContact: "周敏 · #1180",
  notes: "外賓接待，需於接機大廳舉牌。",
};

export const enterpriseReviewChecklist = [
  "乘客與下單人不同，現場聯絡與費用歸屬已分開顯示。",
  "成本中心與 quota impact 已確認，提交後可能先進入 accepted + pending。",
  "若主管審批尚未完成，booking detail 會以 availableActions 控制下一步。",
] as const;

export const enterpriseTripProgress = [
  "預約已建立",
  "主管已核准",
  "已派車",
  "司機前往上車點",
  "行程完成",
] as const;

export const enterpriseSupportFaq = [
  {
    q: "為什麼送出後會先看到待審批？",
    a: "企業派車採 command pattern，系統先接受請求，再等待審批或派車結果。",
  },
  {
    q: "可以在前台直接改派司機嗎？",
    a: "不行。前台只顯示 booking / trip 狀態，不做 dispatch 決策。",
  },
  {
    q: "沒有收據的行程要怎麼處理？",
    a: "若這個渠道未提供 receipt，請改由企業報帳或客服支援處理。",
  },
] as const;

export const policyNotes = [
  "單趟超過 NT$ 1,500 需部門主管審批。",
  "所有用車須指定有效成本中心。",
  "用車前 1 小時內取消計入額度。",
] as const;

export const enterpriseBookings: EnterpriseBooking[] = [
  {
    id: "EB-7K2E1D",
    passenger: "訪客 · Sato Kenji",
    bookedBy: "林宜君",
    self: false,
    from: "桃園機場 T1 · 入境大廳",
    to: "君悅酒店 · 信義區松壽路 2 號",
    window: "06/13 15:20",
    state: "enroute",
    costCenter: "CC-PRD-07",
    etaMinutes: 9,
    vehicle: "商務車",
    approval: "approved",
    receiptReady: false,
    flight: "JL809",
    terminal: "T1",
    luggage: "3 件",
    onsiteContact: "周敏 · #1180",
    availableActions: ["view", "track_trip", "contact_support"],
  },
  {
    id: "EB-7K2F90",
    passenger: "林冠廷",
    bookedBy: "林冠廷",
    self: true,
    from: "台北總部",
    to: "桃園機場 T2",
    window: "06/14 07:30",
    state: "assigned",
    costCenter: "CC-PRD-01",
    etaMinutes: 18,
    vehicle: "商務車",
    approval: "auto",
    receiptReady: false,
    flight: "BR198",
    terminal: "T2",
    luggage: "2 件",
    onsiteContact: "林冠廷 · #2204",
    availableActions: ["view", "cancel", "track_trip"],
  },
  {
    id: "EB-7K2C44",
    passenger: "陳思妤",
    bookedBy: "林宜君",
    self: false,
    from: "南港研發中心",
    to: "台北總部",
    window: "06/13 09:00",
    state: "approval",
    costCenter: "CC-PRD-01",
    etaMinutes: null,
    vehicle: "一般轎車",
    approval: "pending",
    receiptReady: false,
    onsiteContact: "陳思妤 · #2231",
    availableActions: ["view", "contact_support"],
  },
  {
    id: "EB-7K28Z2",
    passenger: "黃柏睿",
    bookedBy: "林宜君",
    self: false,
    from: "台北總部",
    to: "新竹科學園區",
    window: "06/11 08:00",
    state: "completed",
    costCenter: "CC-PRD-07",
    etaMinutes: null,
    vehicle: "商務車",
    approval: "approved",
    receiptReady: true,
    fare: "NT$ 2,180",
    onsiteContact: "黃柏睿 · #3310",
    availableActions: ["view", "view_receipt"],
  },
  {
    id: "EB-7K2701",
    passenger: "林宜君",
    bookedBy: "林宜君",
    self: true,
    from: "君悅酒店",
    to: "桃園機場 T2",
    window: "06/10 05:00",
    state: "cancelled",
    costCenter: "CC-PRD-01",
    etaMinutes: null,
    vehicle: "一般轎車",
    approval: "auto",
    receiptReady: false,
    flight: "CI103",
    terminal: "T2",
    luggage: "1 件",
    onsiteContact: "林宜君 · #1180",
    availableActions: ["view"],
  },
];

export const bookingStateMeta: Record<
  BookingState,
  { label: string; tone: "success" | "warn" | "info" | "neutral" | "danger" }
> = {
  assigned: { label: "已派車", tone: "info" },
  approval: { label: "待審批", tone: "warn" },
  reserved: { label: "已受理", tone: "info" },
  enroute: { label: "前往上車", tone: "success" },
  completed: { label: "已完成", tone: "neutral" },
  cancelled: { label: "已取消", tone: "neutral" },
  nosupply: { label: "無法派車", tone: "danger" },
};

export function getEnterpriseBooking(bookingId: string) {
  return enterpriseBookings.find((booking) => booking.id === bookingId);
}
