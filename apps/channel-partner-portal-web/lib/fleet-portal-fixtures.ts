// Design fixtures for the Fleet Partner Portal (大都會車隊 example), ported
// from the design canvas `fleet-data.jsx`.
//
// DATA SOURCE SEAM: these are static design fixtures. The portal API
// (`/api/fleet-partner/{dashboard,drivers,vehicles,trips,statements,
// quality-metrics}`) is only partially implemented on the backend today
// (only `fleet-partner/statements` exists). When those endpoints ship,
// replace each `getFleet*()` accessor below with a call through a
// fleet-partner-scoped api-client (x-fleet-partner-id header), keeping the
// same return shapes so the pages do not change.

import type { CanvasTone } from "@drts/ui-web";

export type ServiceKey =
  | "realtime"
  | "business"
  | "airport"
  | "insurance"
  | "travel";

// Service-product display text lives in translations.ts (`service.<key>`); only
// the per-service chip tone is carried here as design metadata.
export const SVC_LABELS: Record<ServiceKey, { tone: CanvasTone }> = {
  realtime: { tone: "success" },
  business: { tone: "accent" },
  airport: { tone: "info" },
  insurance: { tone: "warn" },
  travel: { tone: "accent" },
};

export const FLEET_SELF = {
  id: "flp_002",
  name: "大都會車隊",
  code: "METRO_FLEET",
  drivers: 128,
  dispatchable: 96,
  qualityScore: 4.86,
};

export type FleetDriver = {
  id: string;
  name: string;
  plate: string;
  status: "available" | "on_trip" | "break" | "offline";
  license: "valid" | "expires_30d";
  docs: "complete" | "missing_1" | "missing_2";
  training: "complete" | "pending";
  trips30: number;
  rating: number;
  svc: ServiceKey[];
};

export const FX_FLEET_DRIVERS: FleetDriver[] = [
  {
    id: "d_8821",
    name: "林志偉",
    plate: "ARJ-2891",
    status: "available",
    license: "valid",
    docs: "complete",
    training: "complete",
    trips30: 412,
    rating: 4.91,
    svc: ["realtime", "business", "airport"],
  },
  {
    id: "d_8843",
    name: "陳俊宏",
    plate: "ARJ-3120",
    status: "on_trip",
    license: "valid",
    docs: "complete",
    training: "complete",
    trips30: 386,
    rating: 4.86,
    svc: ["realtime", "business", "airport", "insurance"],
  },
  {
    id: "d_8851",
    name: "黃文豪",
    plate: "ARJ-3308",
    status: "break",
    license: "expires_30d",
    docs: "missing_1",
    training: "complete",
    trips30: 298,
    rating: 4.78,
    svc: ["realtime", "business"],
  },
  {
    id: "d_8862",
    name: "王建民",
    plate: "ARJ-2710",
    status: "offline",
    license: "valid",
    docs: "complete",
    training: "pending",
    trips30: 0,
    rating: 4.92,
    svc: ["realtime"],
  },
  {
    id: "d_8870",
    name: "張育成",
    plate: "ARJ-3401",
    status: "available",
    license: "valid",
    docs: "complete",
    training: "complete",
    trips30: 351,
    rating: 4.83,
    svc: ["realtime", "business", "travel"],
  },
  {
    id: "d_8881",
    name: "吳鎮宇",
    plate: "ARJ-3502",
    status: "available",
    license: "valid",
    docs: "missing_2",
    training: "complete",
    trips30: 274,
    rating: 4.95,
    svc: ["realtime", "airport"],
  },
];

export type FleetVehicle = {
  plate: string;
  model: string;
  year: number;
  driver: string;
  svc: ServiceKey[];
  insurance: string;
  inspection: "ok" | "due_30d";
  status: "active" | "maintenance";
};

export const FX_FLEET_VEHICLES: FleetVehicle[] = [
  {
    plate: "ARJ-2891",
    model: "Toyota Prius α",
    year: 2023,
    driver: "林志偉",
    svc: ["realtime", "business", "airport"],
    insurance: "2026-08-14",
    inspection: "ok",
    status: "active",
  },
  {
    plate: "ARJ-3120",
    model: "Hyundai Custo",
    year: 2024,
    driver: "陳俊宏",
    svc: ["realtime", "business", "airport", "insurance"],
    insurance: "2027-01-05",
    inspection: "ok",
    status: "active",
  },
  {
    plate: "ARJ-3308",
    model: "Toyota Sienta",
    year: 2022,
    driver: "黃文豪",
    svc: ["realtime", "business"],
    insurance: "2026-05-22",
    inspection: "due_30d",
    status: "active",
  },
  {
    plate: "ARJ-2710",
    model: "Toyota Prius α",
    year: 2023,
    driver: "王建民",
    svc: ["realtime"],
    insurance: "2026-12-30",
    inspection: "ok",
    status: "maintenance",
  },
  {
    plate: "ARJ-3401",
    model: "Hyundai Custo",
    year: 2024,
    driver: "張育成",
    svc: ["realtime", "business", "travel"],
    insurance: "2027-02-11",
    inspection: "ok",
    status: "active",
  },
];

export type FleetTrip = {
  id: string;
  svc: ServiceKey;
  driver: string;
  tenant: string;
  sponsorFunded?: boolean;
  benefitReference?: string | null;
  pickup: string;
  fare: string;
  commission: string;
  reimbursement?: string | null;
  status: "completed" | "in_progress" | "cancelled";
  date: string;
};

export const FX_FLEET_TRIPS: FleetTrip[] = [
  {
    id: "ord_8232",
    svc: "airport",
    driver: "陳俊宏",
    tenant: "YAMATO",
    pickup: "台北信義 松仁路 100 號",
    fare: "NT$ 1,580",
    commission: "NT$ 474",
    status: "completed",
    date: "06-04 14:30",
  },
  {
    id: "ord_8231",
    svc: "business",
    driver: "林志偉",
    tenant: "TSMC_FAB18",
    pickup: "新竹科學園區 力行六路",
    fare: "NT$ 3,420",
    commission: "NT$ 1,026",
    status: "completed",
    date: "06-04 15:30",
  },
  {
    id: "ord_8245",
    svc: "realtime",
    driver: "張育成",
    tenant: "—",
    pickup: "台北中山 民生東路",
    fare: "NT$ 285",
    commission: "NT$ 86",
    status: "completed",
    date: "06-04 16:02",
  },
  {
    id: "ord_8211",
    svc: "insurance",
    driver: "陳俊宏",
    tenant: "CATHAY_LIFE",
    pickup: "台大醫院 西址",
    fare: "NT$ 640",
    commission: "NT$ 192",
    status: "completed",
    date: "06-04 11:20",
  },
  {
    id: "ord_8260",
    svc: "travel",
    driver: "張育成",
    tenant: "TPE_HOTEL_GRP",
    pickup: "凱撒飯店 台北館",
    fare: "NT$ 2,100",
    commission: "NT$ 630",
    status: "in_progress",
    date: "06-05 09:15",
  },
  {
    id: "ord_8198",
    svc: "business",
    driver: "黃文豪",
    tenant: "YAMATO",
    pickup: "台北信義 松仁路",
    fare: "—",
    commission: "—",
    status: "cancelled",
    date: "06-04 10:05",
  },
];

// `key` maps to a central `revenue.line.<key>` translation; the row carries no
// inline copy of its own.
export type StatementLine = {
  key: string;
  v: string;
  sign: "+" | "−";
  reimbursement?: string | null;
};

export const FX_FLEET_STATEMENT: {
  period: string;
  status: string;
  payable: string;
  lines: StatementLine[];
} = {
  period: "2026-05",
  status: "pending_confirm",
  payable: "NT$ 642,000",
  lines: [
    { key: "per_trip", v: "NT$ 598,400", sign: "+" },
    { key: "recruitment", v: "NT$ 24,000", sign: "+" },
    { key: "mgmt_fee", v: "NT$ 36,000", sign: "+" },
    { key: "performance", v: "NT$ 12,000", sign: "+" },
    { key: "clawback", v: "NT$ 28,400", sign: "−" },
  ],
};

export type FleetStatement = {
  id: string;
  period: string;
  trips: number;
  sponsorFundedTrips?: number;
  payable: string;
  reimbursement?: string | null;
  status: "pending_confirm" | "paid";
  issued: string;
};

export const FX_FLEET_STATEMENTS: FleetStatement[] = [
  {
    id: "fst_2026_05",
    period: "2026-05",
    trips: 14280,
    payable: "NT$ 642,000",
    status: "pending_confirm",
    issued: "2026-06-01",
  },
  {
    id: "fst_2026_04",
    period: "2026-04",
    trips: 13120,
    payable: "NT$ 588,400",
    status: "paid",
    issued: "2026-05-01",
  },
  {
    id: "fst_2026_03",
    period: "2026-03",
    trips: 12740,
    payable: "NT$ 561,200",
    status: "paid",
    issued: "2026-04-01",
  },
];

export type FleetDoc = {
  driver: string;
  id: string;
  doc: string;
  en: string;
  status: "expires_30d" | "expires_60d" | "missing" | "pending_signature";
  due: string;
  owner: "fleet" | "driver";
};

export const FX_FLEET_DOCS: FleetDoc[] = [
  {
    driver: "黃文豪",
    id: "d_8851",
    doc: "職業駕照",
    en: "pro_license",
    status: "expires_30d",
    due: "2026-07-04",
    owner: "fleet",
  },
  {
    driver: "吳鎮宇",
    id: "d_8881",
    doc: "機場接送資格證",
    en: "airport_permit",
    status: "missing",
    due: "—",
    owner: "fleet",
  },
  {
    driver: "吳鎮宇",
    id: "d_8881",
    doc: "車輛保險",
    en: "vehicle_insurance",
    status: "expires_60d",
    due: "2026-08-02",
    owner: "fleet",
  },
  {
    driver: "陳俊宏",
    id: "d_8843",
    doc: "保險代步服務同意書",
    en: "insurance_consent",
    status: "pending_signature",
    due: "2026-06-10",
    owner: "driver",
  },
];

export type FleetTraining = {
  course: string;
  en: string;
  completed: number;
  total: number;
  pct: number;
};

export const FX_FLEET_TRAINING: FleetTraining[] = [
  {
    course: "平台合作基礎",
    en: "platform_basics",
    completed: 126,
    total: 128,
    pct: 98,
  },
  {
    course: "商務派車服務",
    en: "business_service",
    completed: 92,
    total: 110,
    pct: 84,
  },
  {
    course: "機場接送 SOP",
    en: "airport_sop",
    completed: 48,
    total: 60,
    pct: 80,
  },
  {
    course: "保險代步流程",
    en: "insurance_flow",
    completed: 22,
    total: 40,
    pct: 55,
  },
  {
    course: "安全與事故處理",
    en: "safety_incident",
    completed: 121,
    total: 128,
    pct: 95,
  },
];

// Overdue-incomplete training headcount. No fleet-partner training endpoint
// surfaces an "overdue" flag yet, so this stays a supplemental design value
// behind the seam rather than a literal in the training page render path.
export const FX_TRAINING_OVERDUE_INCOMPLETE = "6";

export type FleetCase = {
  id: string;
  type: "complaint" | "incident";
  cat: string;
  driver: string;
  severity: "high" | "medium" | "low";
  responsibility: "fleet" | "shared" | "platform";
  status: "in_review" | "open" | "pending";
  sla: "breached" | "on_track";
  date: string;
};

export const FX_FLEET_CASES: FleetCase[] = [
  {
    id: "cmp_0908",
    type: "complaint",
    cat: "driver_conduct",
    driver: "黃文豪",
    severity: "high",
    responsibility: "fleet",
    status: "in_review",
    sla: "breached",
    date: "2026-05-20",
  },
  {
    id: "inc_0213",
    type: "incident",
    cat: "collision",
    driver: "張育成",
    severity: "medium",
    responsibility: "shared",
    status: "open",
    sla: "on_track",
    date: "2026-05-08",
  },
  {
    id: "cmp_0912",
    type: "complaint",
    cat: "pricing_dispute",
    driver: "林志偉",
    severity: "low",
    responsibility: "platform",
    status: "pending",
    sla: "on_track",
    date: "2026-05-18",
  },
];

// `key` maps to a central `quality.metric.<key>` translation; the row carries
// no inline copy of its own.
export type FleetQuality = {
  key: string;
  v: string;
  tone: "success" | "warn" | "neutral";
  delta: string;
};

export const FX_FLEET_QUALITY: FleetQuality[] = [
  {
    key: "avg_rating",
    v: "4.86",
    tone: "success",
    delta: "↑ 0.02",
  },
  {
    key: "completion_rate",
    v: "97.4%",
    tone: "success",
    delta: "↑ 0.6pp",
  },
  {
    key: "cancel_rate",
    v: "1.8%",
    tone: "neutral",
    delta: "↓ 0.2pp",
  },
  {
    key: "no_show_rate",
    v: "0.8%",
    tone: "neutral",
    delta: "—",
  },
  {
    key: "complaint_rate",
    v: "0.12%",
    tone: "warn",
    delta: "↑ 0.01pp",
  },
  {
    key: "on_time_rate",
    v: "94.2%",
    tone: "success",
    delta: "↑ 1.1pp",
  },
];

export const FX_DASHBOARD_SUPPLY: {
  svc: ServiceKey;
  n: number;
  pct: number;
}[] = [
  { svc: "realtime", n: 96, pct: 100 },
  { svc: "business", n: 64, pct: 67 },
  { svc: "airport", n: 38, pct: 40 },
  { svc: "insurance", n: 22, pct: 23 },
  { svc: "travel", n: 18, pct: 19 },
];

// Supplemental dashboard KPIs (compliance / cases / training) have no
// fleet-partner endpoint yet, so they live behind the seam as design data
// rather than hardcoded in the dashboard page.
export type FleetDashboardSupplemental = {
  missingDocsDrivers: string;
  openCases: string;
  trainingCompletion: string;
};

export const FX_DASHBOARD_SUPPLEMENTAL: FleetDashboardSupplemental = {
  missingDocsDrivers: "7",
  openCases: "3",
  trainingCompletion: "92%",
};

// `titleKey` / `bodyKey` map to central `dashboard.attention.*` translations;
// the banner carries no inline bilingual copy of its own.
export type FleetAttentionBanner = {
  tone: "warn" | "danger";
  titleKey: string;
  bodyKey: string;
};

export const FX_DASHBOARD_ATTENTION: FleetAttentionBanner[] = [
  {
    tone: "warn",
    titleKey: "dashboard.attention.permit.title",
    bodyKey: "dashboard.attention.permit.body",
  },
  {
    tone: "danger",
    titleKey: "dashboard.attention.sla.title",
    bodyKey: "dashboard.attention.sla.body",
  },
  {
    tone: "warn",
    titleKey: "dashboard.attention.training.title",
    bodyKey: "dashboard.attention.training.body",
  },
];
