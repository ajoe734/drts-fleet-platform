import type { ResourceActionDescriptor } from "@drts/contracts";

export type BookingState = "assigned" | "approval" | "reserved" | "completed";
export type GateState =
  | "auth"
  | "suspended"
  | "approval"
  | "quota"
  | "no_supply"
  | "degraded";
export type EmbedState =
  | "handoff"
  | "reauth"
  | "unsupported"
  | "consent"
  | "fallback";

export type SubmittedBookingState = "accepted" | "pending";

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
] as const;

export const gateStateFixtures: Record<
  GateState,
  {
    title: string;
    code: string;
    tone: "success" | "warn" | "danger" | "info" | "neutral";
    summary: string;
    body: string;
    facts: ReadonlyArray<{ k: string; v: string; mono?: boolean }>;
    actions: ReadonlyArray<string>;
  }
> = {
  auth: {
    title: "需要企業身分驗證",
    code: "auth_required",
    tone: "info",
    summary: "目前工作階段未帶入有效的企業帳號與成本中心範圍。",
    body: "請回企業入口重新開啟派車服務，或由行政同仁代訂。此頁不提供管理員憑證輸入。",
    facts: [
      { k: "登入來源", v: "enterprise_sso", mono: true },
      { k: "狀態", v: "session_missing", mono: true },
      { k: "安全限制", v: "僅接受 tenant-scoped identity handoff" },
    ],
    actions: ["回企業入口登入", "聯絡行政窗口"],
  },
  suspended: {
    title: "帳號已暫停派車",
    code: "user_suspended",
    tone: "danger",
    summary: "此員工帳號暫停使用企業派車，無法建立或修改預約。",
    body: "若為人資或合規處置，需由公司窗口解除後才能恢復；客服僅能提供狀態說明。",
    facts: [
      { k: "帳號狀態", v: "suspended", mono: true },
      { k: "影響範圍", v: "新建、改派、取消皆鎖定" },
      { k: "支援策略", v: "只揭露結果，不揭露內部治理細節" },
    ],
    actions: ["查看支援說明", "聯絡企業窗口"],
  },
  approval: {
    title: "等待主管審批",
    code: "approval_required",
    tone: "warn",
    summary: "本次用車超出既有規則，已送交主管簽核。",
    body: "在審批完成前，前台僅保留訂單資訊與支援說明，不暴露後台 approval queue。",
    facts: [
      { k: "訂單", v: "EB-6ND812", mono: true },
      { k: "原因", v: "跨夜 + 高額用車" },
      { k: "下一步", v: "主管核准後自動續派" },
    ],
    actions: ["查看預約詳情", "通知乘車人等待"],
  },
  quota: {
    title: "本月額度不足",
    code: "quota_exhausted",
    tone: "warn",
    summary: "部門或成本中心本月可用額度不足，暫時無法再派車。",
    body: "可改用其他有效成本中心，或由企業窗口申請追加額度。前台不提供治理設定入口。",
    facts: [
      { k: "成本中心", v: "CC-PRD-07", mono: true },
      { k: "剩餘額度", v: "NT$ 0 / NT$ 60,000", mono: true },
      { k: "建議", v: "改用其他成本中心或申請補額" },
    ],
    actions: ["改用其他成本中心", "聯絡部門窗口"],
  },
  no_supply: {
    title: "目前無可派車輛",
    code: "no_supply",
    tone: "neutral",
    summary: "已在安全搜尋範圍內嘗試派車，但暫時沒有合格供給。",
    body: "支援文案只說明結果與替代建議，不揭露候選司機、gate 規則或內部營運資訊。",
    facts: [
      { k: "服務需求", v: "桃園機場接送" },
      { k: "搜尋結果", v: "0 名候選可接單", mono: true },
      { k: "替代方案", v: "改時段、改車型或人工協調" },
    ],
    actions: ["調整用車時間", "聯絡客服人工協調"],
  },
  degraded: {
    title: "服務暫時降級",
    code: "dispatch_degraded",
    tone: "warn",
    summary: "派車服務仍可讀取既有資料，但新建或更新預約可能延遲。",
    body: "系統已切換為 support-safe 模式，只顯示對員工安全的摘要，不暴露 adapter、credential 或治理細節。",
    facts: [
      { k: "影響", v: "建立 / 異動回應較慢" },
      { k: "目前模式", v: "support_safe_gate", mono: true },
      { k: "建議", v: "保留訂單編號並等候通知" },
    ],
    actions: ["查看既有預約", "聯絡 24h 客服"],
  },
};

export const embedStateFixtures: Record<
  EmbedState,
  {
    title: string;
    code: string;
    tone: "success" | "warn" | "danger" | "info" | "neutral";
    host: string;
    shellState: "live" | "warn" | "err" | "neutral";
    summary: string;
    body: string;
    facts: ReadonlyArray<{ k: string; v: string; mono?: boolean }>;
    actions: ReadonlyArray<string>;
  }
> = {
  handoff: {
    title: "企業 App 已交付登入身分",
    code: "handoff_ok",
    tone: "success",
    host: "hongshuo-workspace",
    shellState: "live",
    summary: "已接收 tenant-scoped session，可直接進入員工自助派車。",
    body: "沿用企業 App 身分，不要求再次輸入企業帳密，也不顯示任何後台治理導覽。",
    facts: [
      { k: "來源", v: "enterprise_app", mono: true },
      { k: "工作階段", v: "tenant session accepted" },
      { k: "可見範圍", v: "self-service booking only" },
    ],
    actions: ["繼續建立預約", "查看我的預約"],
  },
  reauth: {
    title: "企業登入已逾時",
    code: "reauth_required",
    tone: "warn",
    host: "hongshuo-workspace",
    shellState: "warn",
    summary: "內嵌工作階段過期，必須回企業 App 完成重新驗證。",
    body: "此頁不接受獨立帳密輸入。為了維持身分來源一致，請由 host App 重新帶入有效 session。",
    facts: [
      { k: "來源", v: "enterprise_app", mono: true },
      { k: "session", v: "expired", mono: true },
      { k: "處理方式", v: "回 host app reauth" },
    ],
    actions: ["回企業 App 重新驗證", "稍後再試"],
  },
  unsupported: {
    title: "不支援的內嵌環境",
    code: "unsupported_host",
    tone: "danger",
    host: "unknown-host.example",
    shellState: "err",
    summary: "目前來源不是受信任的企業 host，已封鎖載入。",
    body: "基於安全與資料隔離，此頁只允許授權的企業 App 內嵌，不接受任意 webview 或外部入口。",
    facts: [
      { k: "來源 host", v: "unknown-host.example", mono: true },
      { k: "驗證", v: "host signature missing" },
      { k: "替代方案", v: "改用企業網站版或受信任 App" },
    ],
    actions: ["回企業入口", "改用網站版"],
  },
  consent: {
    title: "首次使用需確認授權",
    code: "consent_required",
    tone: "info",
    host: "hongshuo-workspace",
    shellState: "live",
    summary: "首次從企業 App 帶入身分時，需確認會共享哪些派車必要資料。",
    body: "僅揭露員工姓名、部門、成本中心與行程資料等必要 scope，不要求管理憑證，也不開放額外治理權限。",
    facts: [
      { k: "scope", v: "identity.read + booking.create", mono: true },
      { k: "資料", v: "姓名、部門、成本中心、行程" },
      { k: "撤回", v: "可於企業 App 設定撤回授權" },
    ],
    actions: ["同意並繼續", "暫不使用"],
  },
  fallback: {
    title: "改走企業網站版",
    code: "fallback_to_web",
    tone: "neutral",
    host: "hongshuo-workspace",
    shellState: "neutral",
    summary: "目前沒有可用的內嵌 session，改導向企業網站版繼續。",
    body: "保留安全限制，只引導到正式網站入口，不在此頁要求輸入治理憑證或管理型密碼。",
    facts: [
      { k: "embed session", v: "missing", mono: true },
      { k: "網站入口", v: "dispatch.hongshuo.example", mono: true },
      { k: "驗證方式", v: "企業 SSO / 代訂流程" },
    ],
    actions: ["前往企業網站版", "回企業 App"],
  },
};

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
