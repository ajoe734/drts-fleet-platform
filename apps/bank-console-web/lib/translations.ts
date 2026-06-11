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
