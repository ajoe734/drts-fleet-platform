export type Locale = "en" | "zh";

// Bank / issuer back-office console (S3). This is a SHELL scaffold: the
// card-benefit data IA (卡友 / 機場 / 趟次配額 / 合約 / 對帳) has no design canvas
// yet (design hand-off pending — see
// docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md), so
// every route renders a pending-design placeholder rather than an invented screen.
const en = {
  "app.title": "Bank Console",
  "app.description":
    "Issuer / card-benefit back-office console for DRTS Phase 1 (credit-card airport transfer).",

  "shell.breadcrumb.home": "Overview",
  "shell.search": "Search bookings, contracts, statements...",

  "nav.section.workspace": "Workspace",
  "nav.section.finance": "Contracts & settlement",
  "nav.section.governance": "Governance",

  "nav.home": "Overview",
  "nav.bookings": "Card bookings",
  "nav.contracts": "Contracts & SLA",
  "nav.statements": "Settlement statements",
  "nav.programs": "Programs & quota",
  "nav.users": "People & roles",
  "nav.audit": "Audit",

  "pending.badge": "Pending design",
  "pending.eyebrow": "Card-benefit back-office",
  "pending.heading": "Awaiting design canvas",
  "pending.lead":
    "This screen is part of the new bank / issuer console. Its visual design has not been delivered yet, so the route is a functional placeholder rather than an invented final screen.",
  "pending.authorityTitle": "Design authority",
  "pending.authorityBody":
    "The card-benefit data IA has no canvas to extend (the corporate tenant-console canvas is for YAMATO / cost-centre commute and must not be reused). Screens land once the visual design team delivers the canvas.",
  "pending.referenceTitle": "Behaviour & API authority",
  "pending.referenceBody":
    "Behaviour, data, and API mapping live in the screen-requirements hand-off and the System Design. This shell only wires the tenant-realm chrome, navigation, and routes.",

  "home.eyebrow": "Issuer workspace",
  "home.title": "Bank / issuer console",
  "home.lead":
    "Issuer-tenant back-office for the credit-card airport-transfer benefit: card bookings, contract & SLA posture, settlement statements, and program quota — all read from the shared tenant plane.",
  "home.purpose":
    "Home / overview will surface today's bookings, quota burn, and SLA posture once the design canvas is delivered.",

  // Home / overview (BK_Home) — role-cut posture dashboard.
  "home.greeting": "Welcome, {name}",
  "home.subtitle": "{date} · Period {period} · Transfers operated by DRTS",
  "home.readonly": "Read-only overview · role-scoped",
  "home.help": "Help center",
  "home.role.bank_program_admin": "Program admin",
  "home.role.bank_ops_viewer": "Ops viewer",
  "home.role.bank_finance": "Finance",

  "home.kpi.orders": "Period orders",
  "home.kpi.orders.sub":
    "Reserved {reserved} · Live {live} · Done {done} · Cancelled {cancelled}",
  "home.kpi.quota": "Benefit quota",
  "home.kpi.quota.sub": "{used} / {total} trips · all programs",
  "home.kpi.onTime": "On-time rate",
  "home.kpi.onTime.delta": "Target {target}%",
  "home.kpi.statement": "Current statement",
  "home.kpi.statement.delta": "{period} · due {due}",
  "home.kpi.exceptions": "Open exceptions",
  "home.kpi.exceptions.delta":
    "Manual {manual} · No-supply {supply} · SLA {sla}",

  "home.upcoming.title": "Upcoming airport transfers",
  "home.upcoming.subtitle": "Next {n} · flight / terminal / window",
  "home.upcoming.cta": "Bookings",
  "home.upcoming.empty": "No upcoming transfers in this period.",
  "home.col.id": "Booking",
  "home.col.direction": "Direction",
  "home.col.flight": "Flight / terminal",
  "home.col.window": "Window",
  "home.col.cardholder": "Cardholder",
  "home.col.state": "State",
  "home.direction.outbound": "Outbound",
  "home.direction.inbound": "Inbound",
  "home.state.reserved": "Reserved",
  "home.state.assigned": "Assigned",
  "home.state.live": "En route",
  "home.state.completed": "Completed",
  "home.state.cancelled": "Cancelled",

  "home.exceptions.title": "Recent exceptions",
  "home.exceptions.subtitle":
    "Manual review · no-supply · SLA breach · drill into the order",
  "home.exceptions.badge": "{n} open",
  "home.ex.manual_review.title": "Manual review · {entity}",
  "home.ex.manual_review.body":
    "Signature card · quota near limit (1 trip left); confirm with support before dispatch.",
  "home.ex.no_supply.title": "No supply · 04:00 Taoyuan T1",
  "home.ex.no_supply.body":
    "{entity} briefly had no fleet at the pre-dawn window; re-dispatched after 6 minutes.",
  "home.ex.sla_breach.title": "SLA breach · World Elite program",
  "home.ex.sla_breach.body":
    "World Elite on-time 94.2% below the 95% contract; linked alert on contract {entity}.",

  "home.quota.title": "Benefit quota · all programs",
  "home.quota.subtitle": "Annual complimentary transfer trips",
  "home.quota.used": "{pct}% used",
  "home.quota.totalUnit": "/ {total} trips",
  "home.quota.remaining": "{remaining} trips remaining · annual benefit pool",
  "home.program.all": "All programs",
  "home.program.worldElite": "World Elite airport",
  "home.program.signature": "Signature airport",

  "home.sla.title": "SLA attainment · current",
  "home.sla.subtitle": "vs contract target · DRTS authoritative",
  "home.sla.onTime": "On-time rate",
  "home.sla.completion": "Completion rate",
  "home.sla.response": "Response time",
  "home.sla.target": "Target {target}{unit}",
  "home.sla.met": "met",
  "home.sla.breach": "breach",
  "home.sla.note": "Health / warning / breach aggregated per SLA metric.",

  "home.settlement.title": "Settlement · current statement",
  "home.settlement.subtitle": "Issuer pays DRTS",
  "home.statement.title": "Current statement · {period}",
  "home.statement.subtitle":
    "Per-trip reconciliation · money flow = issuer pays DRTS",
  "home.settlement.cta": "Statements",
  "home.settlement.period": "Period",
  "home.settlement.status": "Status",
  "home.settlement.trips": "Trips",
  "home.settlement.total": "Total",
  "home.settlement.issued": "Issued",
  "home.settlement.due": "Due",
  "home.settlement.dueBadge": "due",
  "home.settlement.tripsUnit": "{trips} trips",
  "home.settlement.denied":
    "Settlement amounts are visible to the finance role (bank_finance) only.",

  "bookings.title": "Card bookings",
  "bookings.purpose":
    "Cardholder / program / flight / direction / dispatch-state list (card-airport dimension, not corporate cost-centre). Cardholder references stay PII-masked.",

  "contracts.title": "Contracts & SLA",
  "contracts.purpose":
    "Service-contract posture between the program and DRTS: term, SLA targets, current-period attainment, and exception list.",

  "statements.title": "Settlement statements",
  "statements.purpose":
    "Period and per-trip settlement reconciliation (issuer-pays-DRTS), with masked references and signed downloadable artifacts.",

  "programs.title": "Programs & quota",
  "programs.purpose":
    "Benefit consumption per program / period: cardholders served and 趟次 consumed vs quota (禮遇趟次 remaining).",

  "users.title": "People & roles",
  "users.purpose":
    "Bank back-office roles: program-admin, ops-viewer, and finance.",

  "audit.title": "Audit",
  "audit.purpose":
    "Eligibility, dispatch, and settlement trail scoped to the issuer tenant.",
} as const;

const zh: Record<keyof typeof en, string> = {
  "app.title": "銀行卡友後台",
  "app.description":
    "DRTS Phase 1 信用卡卡友機場接送的發卡行／卡權益後台主控台。",

  "shell.breadcrumb.home": "總覽",
  "shell.search": "搜尋訂單、合約、對帳單…",

  "nav.section.workspace": "工作面",
  "nav.section.finance": "合約與帳務",
  "nav.section.governance": "治理",

  "nav.home": "總覽",
  "nav.bookings": "卡友訂單",
  "nav.contracts": "合約與 SLA",
  "nav.statements": "結算對帳單",
  "nav.programs": "方案與配額",
  "nav.users": "使用者與角色",
  "nav.audit": "稽核",

  "pending.badge": "畫面待設計",
  "pending.eyebrow": "卡權益後台",
  "pending.heading": "等待設計稿",
  "pending.lead":
    "本畫面屬於全新的銀行／發卡行後台。視覺設計稿尚未交付，因此此路由先以功能占位呈現，不會自行發明最終畫面。",
  "pending.authorityTitle": "設計授權",
  "pending.authorityBody":
    "卡權益資料 IA 沒有可延伸的既有 canvas（企業版 tenant-console canvas 是 YAMATO／成本中心通勤用，不可重用）。畫面待視覺設計團隊交付 canvas 後再落地。",
  "pending.referenceTitle": "行為與 API 授權",
  "pending.referenceBody":
    "行為、資料與 API 對應以 screen-requirements 交接稿與 System Design 為準。此殼只負責 tenant realm chrome、導覽與路由骨架。",

  "home.eyebrow": "發卡行工作面",
  "home.title": "銀行／發卡行主控台",
  "home.lead":
    "信用卡卡友機場接送權益的發卡行後台：卡友訂單、合約與 SLA 狀態、結算對帳單、方案配額，皆讀取共用的 tenant plane。",
  "home.purpose": "總覽將在設計稿交付後呈現今日訂單、配額消耗與 SLA 狀態。",

  // 首頁總覽（BK_Home）— 依角色裁切的狀態儀表板。
  "home.greeting": "您好，{name}",
  "home.subtitle":
    "{date} · 期別 {period} · 接送服務由智慧運輸科技 (DRTS) 營運",
  "home.readonly": "唯讀總覽 · 依角色顯示",
  "home.help": "幫助中心",
  "home.role.bank_program_admin": "方案管理員",
  "home.role.bank_ops_viewer": "營運檢視",
  "home.role.bank_finance": "財務",

  "home.kpi.orders": "本期訂單",
  "home.kpi.orders.sub":
    "預約 {reserved} · 進行 {live} · 完成 {done} · 取消 {cancelled}",
  "home.kpi.quota": "禮遇配額",
  "home.kpi.quota.sub": "{used} / {total} 趟 · 全方案",
  "home.kpi.onTime": "準點率",
  "home.kpi.onTime.delta": "目標 {target}%",
  "home.kpi.statement": "當期對帳單",
  "home.kpi.statement.delta": "{period} · {due} 到期",
  "home.kpi.exceptions": "待處理例外",
  "home.kpi.exceptions.delta":
    "人工審查 {manual} · 無供給 {supply} · SLA {sla}",

  "home.upcoming.title": "即將到來的機場接送",
  "home.upcoming.subtitle": "未來 {n} 筆 · 航班 / 航廈 / 時段",
  "home.upcoming.cta": "訂單列表",
  "home.upcoming.empty": "本期暫無即將到來的接送。",
  "home.col.id": "BK",
  "home.col.direction": "方向",
  "home.col.flight": "航班 / 航廈",
  "home.col.window": "時段",
  "home.col.cardholder": "卡友",
  "home.col.state": "狀態",
  "home.direction.outbound": "出境去程",
  "home.direction.inbound": "入境回程",
  "home.state.reserved": "預約",
  "home.state.assigned": "已指派",
  "home.state.live": "進行中",
  "home.state.completed": "已完成",
  "home.state.cancelled": "取消",

  "home.exceptions.title": "近期例外",
  "home.exceptions.subtitle": "人工審查 · 無供給 · SLA 未達 · 點擊深入訂單",
  "home.exceptions.badge": "{n} 筆未結",
  "home.ex.manual_review.title": "人工審查 · {entity}",
  "home.ex.manual_review.body":
    "商旅御璽卡 · 配額臨界（剩餘 1 趟），建議客服確認後派車。",
  "home.ex.no_supply.title": "無供給 · 04:00 桃園 T1",
  "home.ex.no_supply.body":
    "{entity} 凌晨時段一度無可派車隊，已於 6 分鐘後補派。",
  "home.ex.sla_breach.title": "SLA 未達 · 世界卡方案",
  "home.ex.sla_breach.body":
    "世界卡準點率 94.2% 低於合約 95%，連動合約 {entity} 警示。",

  "home.quota.title": "禮遇配額 · 全方案",
  "home.quota.subtitle": "本年度免費接送趟次",
  "home.quota.used": "{pct}% 已用",
  "home.quota.totalUnit": "/ {total} 趟",
  "home.quota.remaining": "剩餘 {remaining} 趟 · 本年度權益池",
  "home.program.all": "全方案",
  "home.program.worldElite": "世界卡機場",
  "home.program.signature": "商旅御璽卡機場",

  "home.sla.title": "SLA 達成 · 當期",
  "home.sla.subtitle": "vs 合約目標 · DRTS 為權威來源",
  "home.sla.onTime": "準點率",
  "home.sla.completion": "完成率",
  "home.sla.response": "回應時間",
  "home.sla.target": "目標 {target}{unit}",
  "home.sla.met": "達標",
  "home.sla.breach": "未達",
  "home.sla.note": "健康／警示／違反 依各 SLA 指標彙總。",

  "home.settlement.title": "結算 · 當期對帳單",
  "home.settlement.subtitle": "發卡行付 DRTS",
  "home.statement.title": "當期對帳單 · {period}",
  "home.statement.subtitle": "逐趟對帳 · 金流方向＝發卡行付 DRTS",
  "home.settlement.cta": "對帳單",
  "home.settlement.period": "期別",
  "home.settlement.status": "狀態",
  "home.settlement.trips": "趟次",
  "home.settlement.total": "總額",
  "home.settlement.issued": "開立",
  "home.settlement.due": "到期",
  "home.settlement.dueBadge": "待繳",
  "home.settlement.tripsUnit": "{trips} 趟",
  "home.settlement.denied": "結算金額僅財務角色 (bank_finance) 可檢視。",

  "bookings.title": "卡友訂單",
  "bookings.purpose":
    "卡友／方案／航班／去回程／派遣狀態清單（卡友—機場維度，非企業成本中心）。卡友參考一律 PII 遮罩。",

  "contracts.title": "合約與 SLA",
  "contracts.purpose":
    "方案與 DRTS 之間的服務合約狀態：合約期、SLA 目標、當期達成率與例外清單。",

  "statements.title": "結算對帳單",
  "statements.purpose":
    "期別與逐趟結算對帳（發卡行付款給 DRTS），含遮罩參考與可下載的簽名 artifact。",

  "programs.title": "方案與配額",
  "programs.purpose":
    "各方案／期別的權益消耗：服務卡友數、趟次消耗 vs 配額（禮遇趟次剩餘）。",

  "users.title": "使用者與角色",
  "users.purpose": "銀行後台角色：方案管理員、客服／營運、財務。",

  "audit.title": "稽核",
  "audit.purpose": "範圍限發卡行租戶的資格、派遣與結算軌跡。",
};

export const translations = { en, zh } as const;
export type TranslationKey = keyof typeof en;

export function t(
  key: TranslationKey,
  locale: Locale = "zh",
  params?: Record<string, string | number>,
): string {
  const template = translations[locale][key] ?? en[key];
  if (!params) {
    return template;
  }

  return Object.entries(params).reduce((result, [name, value]) => {
    return result.replaceAll(`{${name}}`, String(value));
  }, template);
}
