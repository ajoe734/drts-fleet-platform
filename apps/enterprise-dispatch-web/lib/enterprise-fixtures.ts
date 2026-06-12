export type BookingState = "assigned" | "approval" | "reserved" | "completed";

export const enterpriseTenant = {
  name: "鴻碩科技",
  department: "產品部",
  supportPhone: "0800-200-118",
};

export const enterpriseUser = {
  name: "林宜君",
  role: "行政祕書",
};

export const enterpriseBookings = [
  {
    id: "EB-7K2C44",
    passenger: "Sato Kenji",
    bookedBy: "林宜君",
    self: false,
    from: "桃園機場 T1 · 入境大廳",
    to: "君悅酒店 · 信義區松壽路 2 號",
    window: "06/13 15:20",
    state: "assigned" as BookingState,
    costCenter: "CC-PRD-07",
    etaMinutes: 9,
  },
  {
    id: "EB-6ND812",
    passenger: "陳冠宇",
    bookedBy: "陳冠宇",
    self: true,
    from: "南港軟體園區",
    to: "松山機場",
    window: "06/14 08:40",
    state: "approval" as BookingState,
    costCenter: "CC-SLS-02",
    etaMinutes: null,
  },
  {
    id: "EB-2FY101",
    passenger: "王珮珊",
    bookedBy: "林宜君",
    self: false,
    from: "台北君悅酒店",
    to: "高鐵台中站",
    window: "06/16 09:00",
    state: "reserved" as BookingState,
    costCenter: "CC-PRD-07",
    etaMinutes: null,
  },
] as const;

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
  "單趟超過 NT$ 1,500 需部門主管審批",
  "所有用車須指定有效成本中心",
  "用車前 1 小時內取消計入額度",
] as const;
