export type BookingState = "assigned" | "approval" | "reserved" | "completed";

export type SubmittedBookingState = "accepted" | "pending";

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

export const enterpriseBookingDraft = {
  passenger: "Sato Kenji",
  passengerPhone: "0900-112-338",
  bookedBy: "林宜君",
  bookedByEmail: "yijun.lin@hstech.example",
  relation: "行政祕書代訂訪客接送",
  from: "桃園機場 T1 · 入境大廳 5 號柱",
  to: "君悅酒店 · 信義區松壽路 2 號",
  date: "2026-06-13",
  pickupTime: "15:20",
  flightNo: "JL-802",
  vehiclePreference: "五人座商務車",
  onsiteContact: "Kenji Host · 0911-580-421",
  note: "外賓首次來訪，需要英文司機備註。",
  costCenter: "CC-PRD-07",
  costCenterName: "產品部 · 海外合作專案",
  estimatedFare: "NT$ 1,980",
  quotaBefore: "NT$ 31,000 / 60,000",
  quotaAfter: "NT$ 29,020 / 60,000",
  quotaImpact: "本趟送出後將預占 NT$ 1,980",
  approvalThreshold: "NT$ 1,500",
  approver: "產品部主管 · 蔡宜廷",
  approvalEta: "預計 15 分鐘內完成",
} as const;

export const enterpriseReviewChecklist = [
  "我確認乘客與下單人資訊正確，並知悉到車通知會同步發給乘客與代訂人。",
  "我確認本趟費用歸屬於 CC-PRD-07，如需改掛成本中心將由下單人負責修正。",
  "我理解本趟超過免審門檻，送出後會先進入主管審批；未核准前不保證派車。",
] as const;

export const enterpriseSubmittedStates: Record<
  SubmittedBookingState,
  {
    title: string;
    tone: "success" | "warn";
    bookingId: string;
    summary: string;
    body: string;
    nextStep: string;
    actionLabel: string;
  }
> = {
  accepted: {
    title: "已受理",
    tone: "success",
    bookingId: "EB-9QX221",
    summary: "訂單已建立並進入調度，系統會持續更新派車結果。",
    body: "成本中心與額度已鎖定，本趟不需額外人工確認；若司機指派完成，首頁與我的預約都會同步顯示。",
    nextStep: "下一步：等待派車，必要時可回首頁查看進行中的行程。",
    actionLabel: "回首頁看目前狀態",
  },
  pending: {
    title: "待審批",
    tone: "warn",
    bookingId: "EB-6ND812",
    summary: "訂單已收件，正在等待主管核准，審批完成前不會正式派車。",
    body: "系統已先保留行程資料與成本中心，但額度尚未實際扣用；若主管拒絕，該筆預約會自動失效。",
    nextStep:
      "下一步：等待產品部主管核准，或由下單人改掛其他可用成本中心後重新送出。",
    actionLabel: "查看審批中的預約",
  },
} as const;
