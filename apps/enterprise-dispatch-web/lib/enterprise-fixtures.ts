import type { ResourceActionDescriptor } from "@drts/contracts";

export type BookingState = "assigned" | "approval" | "reserved" | "completed";

export type EnterpriseAction = ResourceActionDescriptor & {
  label: string;
  href?: string;
};

export type EnterpriseProgressStep = {
  key: string;
  label: string;
  at?: string;
  status: "done" | "current" | "upcoming";
};

export type EnterpriseBooking = {
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
  dateLabel: string;
  benefitLabel: string;
  totalLabel: string;
  summary: string;
  availableActions: EnterpriseAction[];
  driver?: {
    name: string;
    rating: string;
    vehicle: string;
    initials: string;
    phoneAction: EnterpriseAction;
  };
  progress?: EnterpriseProgressStep[];
  receipt?: {
    departedAt: string;
    arrivedAt: string;
    duration: string;
    distance: string;
    lineItems: Array<{ label: string; value: string }>;
    paymentItems: Array<{ label: string; value: string }>;
  };
};

export const enterpriseTenant = {
  name: "鴻碩科技",
  department: "產品部",
  supportPhone: "0800-200-118",
};

export const enterpriseUser = {
  name: "林宜君",
  role: "行政祕書",
};

export const enterpriseQuota = {
  year: "2026",
  remaining: 9,
  total: 12,
  used: 3,
  annualSummary: "本年度已完成 3 趟，另有 1 趟進行中。",
};

export const enterpriseBookings: EnterpriseBooking[] = [
  {
    id: "EB-7K2C44",
    passenger: "Sato Kenji",
    bookedBy: "林宜君",
    self: false,
    from: "桃園機場 T1 · 入境大廳",
    to: "君悅酒店 · 信義區松壽路 2 號",
    window: "06/13 15:20",
    state: "assigned",
    costCenter: "CC-PRD-07",
    etaMinutes: 8,
    dateLabel: "今天 15:20",
    benefitLabel: "訪客接待 · 額度 #4",
    totalLabel: "月結",
    summary: "接待日本客戶到市區飯店，司機已派車。",
    availableActions: [
      {
        action: "view_detail",
        label: "預約詳情",
        href: "/detail",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "contact_driver",
        label: "聯絡司機",
        href: "/trip",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "contact_support",
        label: "企業客服",
        href: "/help",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "cancel_booking",
        label: "取消行程",
        enabled: false,
        disabledReasonCode: "driver_assigned",
        requiresReason: true,
        riskLevel: "high",
      },
    ],
    driver: {
      name: "陳俊宏",
      rating: "1,243 趟 · 4.86 ★",
      vehicle: "Toyota Prius α · ARJ-3120",
      initials: "陳",
      phoneAction: {
        action: "call_driver",
        label: "致電司機",
        enabled: true,
        riskLevel: "low",
      },
    },
    progress: [
      { key: "accepted", label: "預約成立", at: "14:58", status: "done" },
      { key: "assigned", label: "已派車", at: "15:05", status: "done" },
      {
        key: "arriving",
        label: "司機前往上車點",
        at: "ETA 8 分鐘",
        status: "current",
      },
      { key: "pickup", label: "乘客上車", status: "upcoming" },
      { key: "dropoff", label: "送達目的地", status: "upcoming" },
    ],
  },
  {
    id: "EB-6ND812",
    passenger: "陳冠宇",
    bookedBy: "陳冠宇",
    self: true,
    from: "南港軟體園區",
    to: "松山機場",
    window: "06/14 08:40",
    state: "approval",
    costCenter: "CC-SLS-02",
    etaMinutes: null,
    dateLabel: "明天 08:40",
    benefitLabel: "主管審批中",
    totalLabel: "待核定",
    summary: "超過部門單趟門檻，等待主管審批。",
    availableActions: [
      {
        action: "view_detail",
        label: "預約詳情",
        href: "/detail",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "edit_booking",
        label: "修改時間",
        enabled: true,
        riskLevel: "medium",
      },
      {
        action: "cancel_booking",
        label: "撤回申請",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      },
    ],
  },
  {
    id: "EB-2FY101",
    passenger: "王珮珊",
    bookedBy: "林宜君",
    self: false,
    from: "台北君悅酒店",
    to: "高鐵台中站",
    window: "06/16 09:00",
    state: "reserved",
    costCenter: "CC-PRD-07",
    etaMinutes: null,
    dateLabel: "06/16 09:00",
    benefitLabel: "已預約 · 待派車",
    totalLabel: "月結",
    summary: "高鐵接送已排入車隊池，將於出發前派車。",
    availableActions: [
      {
        action: "view_detail",
        label: "預約詳情",
        href: "/detail",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "contact_support",
        label: "企業客服",
        href: "/help",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "cancel_booking",
        label: "取消行程",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      },
    ],
  },
  {
    id: "EB-1AL992",
    passenger: "林宜君",
    bookedBy: "林宜君",
    self: true,
    from: "台北車站",
    to: "內湖科技園區",
    window: "06/11 09:12",
    state: "completed",
    costCenter: "CC-OPS-01",
    etaMinutes: null,
    dateLabel: "昨天 09:12",
    benefitLabel: "月結完成",
    totalLabel: "NT$ 0",
    summary: "已完成並入帳，收據可下載 PDF。",
    availableActions: [
      {
        action: "view_receipt",
        label: "查看收據",
        href: "/receipt",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "download_receipt",
        label: "下載 PDF",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "contact_support",
        label: "聯絡客服",
        href: "/help",
        enabled: true,
        riskLevel: "low",
      },
    ],
    receipt: {
      departedAt: "09:12:11",
      arrivedAt: "09:46:27",
      duration: "34 分鐘",
      distance: "12.8 km",
      lineItems: [
        { label: "車資 (基本)", value: "NT$ 420" },
        { label: "尖峰加成", value: "NT$ 80" },
        { label: "小計", value: "NT$ 500" },
        { label: "企業月結", value: "−NT$ 500" },
        { label: "您支付", value: "NT$ 0" },
      ],
      paymentItems: [
        { label: "付款方式", value: "鴻碩科技月結" },
        { label: "成本中心", value: "CC-OPS-01" },
        { label: "收據編號", value: "rcp_ent_8821a912" },
        { label: "帳務月份", value: "2026-06" },
      ],
    },
  },
];

export const bookingStateMeta: Record<
  BookingState,
  { label: string; tone: "success" | "warn" | "info" | "neutral" }
> = {
  assigned: { label: "已派車", tone: "success" },
  approval: { label: "待審批", tone: "warn" },
  reserved: { label: "已預約", tone: "info" },
  completed: { label: "已完成", tone: "neutral" },
};

export const policyNotes = [
  "單趟超過 NT$ 1,500 需部門主管審批。",
  "所有用車須指定有效成本中心，收據與對帳會沿用該編碼。",
  "用車前 1 小時內取消將轉為客服處理，availableActions 會同步更新。",
];

export const helpFaqs = [
  {
    q: "待審批多久會更新？",
    a: "通常 5 分鐘內完成主管審批；超過 15 分鐘仍未更新請聯絡企業客服。",
  },
  {
    q: "可以替同事或訪客代訂嗎？",
    a: "可以，但乘客姓名、手機與現場聯絡人必須完整，避免司機無法接到人。",
  },
  {
    q: "何時可以取消？",
    a: "若 availableActions 顯示可取消即可自助操作；一旦顯示 driver_assigned 代表需改由客服協助。",
  },
  {
    q: "收據與對帳在哪裡看？",
    a: "完成行程後可在收據頁查看明細，正式月結檔仍以企業帳務匯出為準。",
  },
];

export const activeTrip = enterpriseBookings[0]!;
export const detailBooking = enterpriseBookings[1]!;
export const receiptBooking = enterpriseBookings[3]!;
