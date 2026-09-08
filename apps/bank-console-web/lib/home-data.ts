// Bank-console home / overview (BK_Home) read model.
//
// Canvas authority: docs/05-ui/drts-design-canvas/bank-screens-1.jsx (BK_Home) +
// bank-data.jsx fixtures; behaviour/API authority: screen-requirements §5 +
// SD §3. This surface is READ-ONLY. The figures below mirror the canvas fixtures
// so the overview reconciles with the per-detail screens once the CCAT-API-*
// endpoints (GET /api/tenant/orders | program-usage | settlement-statements |
// contracts) are wired in — every reference is PII-masked, never a raw card no.
//
// Locale: all *display* copy is resolved through lib/translations `t()` (enum
// keys here, no inline locale strings). Numbers, masked refs, flight codes and
// dates are data and render verbatim.

export type BankRole = "admin" | "ops" | "finance";
export type BankPersona =
  | "bank_program_admin"
  | "bank_ops_viewer"
  | "bank_finance";

export type OrderState =
  | "reserved"
  | "assigned"
  | "live"
  | "completed"
  | "cancelled";
export type OrderDirection = "outbound" | "inbound";
export type ExceptionKind = "manual_review" | "no_supply" | "sla_breach";
export type ExceptionTone = "warning" | "danger";

export const PERIOD = "2026-06";
export const TODAY = "2026-06-17 (週三)";

export const BANK_ACTORS: Record<
  BankRole,
  { display: string; persona: BankPersona }
> = {
  admin: { display: "周敬文", persona: "bank_program_admin" },
  ops: { display: "黃怡安", persona: "bank_ops_viewer" },
  finance: { display: "湯立群", persona: "bank_finance" },
};

const ROLE_VALUES: readonly BankRole[] = ["admin", "ops", "finance"];

// Default actor = program-admin (full overview). `?role=ops|finance` cuts the
// view to the matching persona so the role-gating is verifiable in preview.
export function resolveRole(raw: string | string[] | undefined): BankRole {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return ROLE_VALUES.find((role) => role === value) ?? "admin";
}

export function roleView(role: BankRole) {
  return {
    // 配額 / SLA 為發卡行頭號指標，全角色可見；訂單與財務依角色裁切。
    seeOrders: role === "admin" || role === "ops",
    seeFinance: role === "admin" || role === "finance",
    seeQuota: true,
    seeSla: true,
  };
}

export type BankOrder = {
  id: string;
  program: "worldElite" | "signature";
  programCode: string;
  direction: OrderDirection;
  flight: string;
  terminal: string;
  window: string;
  state: OrderState;
  cardholderRef: string;
  benefitRef: string;
};

// Masked cardholder/benefit refs only (Q: 一律 **** 4821 / BNF-••••-7A2).
export const ORDERS: BankOrder[] = [
  {
    id: "BK-2K7F31",
    program: "worldElite",
    programCode: "CTB-AIR-WE",
    direction: "outbound",
    flight: "BR198",
    terminal: "桃園 T2",
    window: "06/18 05:30",
    state: "assigned",
    cardholderRef: "**** 4821",
    benefitRef: "BNF-••••-7A2",
  },
  {
    id: "BK-2K7F2D",
    program: "worldElite",
    programCode: "CTB-AIR-WE",
    direction: "inbound",
    flight: "JL809",
    terminal: "桃園 T1",
    window: "06/17 21:40",
    state: "live",
    cardholderRef: "**** 6310",
    benefitRef: "BNF-••••-3F8",
  },
  {
    id: "BK-2K7EX9",
    program: "signature",
    programCode: "CTB-AIR-SG",
    direction: "outbound",
    flight: "CI103",
    terminal: "松山 TSA",
    window: "06/18 09:15",
    state: "reserved",
    cardholderRef: "**** 2204",
    benefitRef: "BNF-••••-9C1",
  },
  {
    id: "BK-2K7EM4",
    program: "worldElite",
    programCode: "CTB-AIR-WE",
    direction: "outbound",
    flight: "BR226",
    terminal: "桃園 T1",
    window: "06/16 04:00",
    state: "completed",
    cardholderRef: "**** 8842",
    benefitRef: "BNF-••••-5D6",
  },
  {
    id: "BK-2K7DA1",
    program: "worldElite",
    programCode: "CTB-AIR-WE",
    direction: "outbound",
    flight: "BR852",
    terminal: "桃園 T2",
    window: "06/14 13:25",
    state: "cancelled",
    cardholderRef: "**** 7788",
    benefitRef: "BNF-••••-8E0",
  },
];

const UPCOMING_STATES: ReadonlySet<OrderState> = new Set<OrderState>([
  "reserved",
  "assigned",
  "live",
]);

export const UPCOMING_ORDERS = ORDERS.filter((order) =>
  UPCOMING_STATES.has(order.state),
);

export function orderStateTone(state: OrderState): string {
  switch (state) {
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    case "live":
      return "info";
    case "assigned":
      return "accent";
    case "reserved":
    default:
      return "neutral";
  }
}

// ── Period order tallies (KPI). Sum reconciles with the orders dimension. ──
export const ORDER_TALLIES = {
  total: 1182,
  reserved: 312,
  live: 6,
  completed: 842,
  cancelled: 22,
};

// ── Benefit quota — per program + reconciled aggregate (= sum of programs). ──
export type QuotaRow = {
  program: "all" | "worldElite" | "signature";
  used: number;
  total: number;
};

export const QUOTA_PROGRAMS: QuotaRow[] = [
  { program: "worldElite", used: 9840, total: 14400 },
  { program: "signature", used: 3110, total: 5400 },
];

export const QUOTA_ALL: QuotaRow = {
  program: "all",
  used: QUOTA_PROGRAMS.reduce((sum, row) => sum + row.used, 0),
  total: QUOTA_PROGRAMS.reduce((sum, row) => sum + row.total, 0),
};

export function quotaPct(row: QuotaRow): number | null {
  if (row.total <= 0) {
    return null;
  }
  return Math.round((row.used / row.total) * 100);
}

export function toHomeRole(role: string): BankRole {
  if (role === "bank_ops_viewer" || role === "ops") return "ops";
  if (role === "bank_finance" || role === "finance") return "finance";
  return "admin";
}

// ── SLA attainment vs contract target (DRTS authoritative). ──
export type SlaMetric = {
  key: "onTime" | "completion" | "response";
  value: number;
  target: number;
  unit: "%" | "s";
  invert: boolean;
};

// On-time is the headline SLA (also surfaced in the KPI strip), so it is named
// explicitly — avoids an unchecked `SLA_METRICS[0]` index access.
const ON_TIME: SlaMetric = {
  key: "onTime",
  value: 98.7,
  target: 95,
  unit: "%",
  invert: false,
};

export const SLA_METRICS: SlaMetric[] = [
  ON_TIME,
  { key: "completion", value: 99.6, target: 99, unit: "%", invert: false },
  { key: "response", value: 42, target: 60, unit: "s", invert: true },
];

export const ON_TIME_SLA: SlaMetric = ON_TIME;

export function slaMet(metric: SlaMetric): boolean {
  return metric.invert
    ? metric.value <= metric.target
    : metric.value >= metric.target;
}

// ── Current settlement statement (issuer-pays-DRTS). ──
export const STATEMENT = {
  period: "2026-05",
  status: "due" as const,
  trips: 812,
  totalCompact: "NT$ 1.28M",
  totalFull: "NT$ 1,284,600",
  issued: "2026-06-01",
  due: "2026-06-15",
};

// ── Recent exceptions (drill into the order / contract). ──
export type BankException = {
  kind: ExceptionKind;
  tone: ExceptionTone;
  entity: string;
};

export const EXCEPTIONS: BankException[] = [
  { kind: "manual_review", tone: "warning", entity: "BK-2K7EX9" },
  { kind: "no_supply", tone: "danger", entity: "BK-2K7EM4" },
  { kind: "sla_breach", tone: "warning", entity: "CTR-CTB-WE-2026" },
];
