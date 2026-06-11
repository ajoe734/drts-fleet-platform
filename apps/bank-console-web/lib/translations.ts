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
  "audit.eyebrow": "Issuer audit trail",
  "audit.description":
    "Read-only trail for eligibility decisions, dispatch visibility, settlement closeout, and statement access. Cardholder and card references remain masked throughout.",
  "audit.readOnly": "Read-only",
  "audit.issuerBadge": "CTBC issuer tenant",
  "audit.summary.events": "events",
  "audit.summary.eligibilityKicker": "Eligibility",
  "audit.summary.eligibilityBody":
    "Card-benefit decisions and manual-review routing, always retaining masked cardholder and card references.",
  "audit.summary.dispatchKicker": "Dispatch visibility",
  "audit.summary.dispatchBody":
    "Read-only issuer view of assignment outcomes and fulfilment milestones for booking-linked trips.",
  "audit.summary.settlementKicker": "Settlement & access",
  "audit.summary.settlementBody":
    "Statement publication, artifact access, and issuer-pays-DRTS closeout events by period.",
  "audit.callout.title": "Masking and scope",
  "audit.callout.bodyMasked":
    "Every subject preview in this audit list is already masked. The bank console never reveals raw cardholder identity or full card references.",
  "audit.callout.bodyFallback":
    "This view should only surface masked previews. Any unmasked reference is a defect that must be remediated before release.",
  "audit.filters.kicker": "Filters",
  "audit.filters.title": "Refine the issuer audit feed",
  "audit.filters.description":
    "Filter by event type, operator, settlement period, or masked subject reference.",
  "audit.filters.reset": "Clear filters",
  "audit.filters.type": "Event type",
  "audit.filters.actor": "Operator",
  "audit.filters.period": "Period",
  "audit.filters.subject": "Subject",
  "audit.filters.subjectPlaceholder":
    "Masked subject, booking, statement, or reason code",
  "audit.filters.apply": "Apply",
  "audit.filters.allTypes": "All event types",
  "audit.filters.allActors": "All operators",
  "audit.filters.allPeriods": "All periods",
  "audit.list.kicker": "Audit list",
  "audit.list.title": "{count} audit events",
  "audit.list.description":
    "Each row records timestamp, actor, type, masked subject, reason code, and the linked booking or settlement statement.",
  "audit.empty.title": "No events match these filters",
  "audit.empty.body":
    "Try clearing one or more filters to restore the issuer audit trail.",
  "audit.column.actor": "Actor",
  "audit.column.subject": "Masked subject",
  "audit.column.reasonCode": "Reason code",
  "audit.column.related": "Related entity",
  "audit.mask.ok": "Masked preview confirmed",
  "audit.mask.needsReview": "Masking review required",
  "audit.related.booking": "Booking",
  "audit.related.statement": "Statement",
  "audit.actor.bank_ops_viewer": "Ops viewer",
  "audit.actor.bank_program_admin": "Program admin",
  "audit.actor.bank_finance": "Finance",
  "audit.actor.system": "System",
  "audit.type.eligibility_decision": "Eligibility decision",
  "audit.type.dispatch_assignment": "Dispatch assignment",
  "audit.type.settlement_close": "Settlement close",
  "audit.type.access": "Access",
  "audit.reason.ELIGIBLE_APPROVED": "Eligibility approved",
  "audit.reason.MANUAL_REVIEW_REQUIRED": "Manual review required",
  "audit.reason.DRIVER_ASSIGNED": "Driver assigned",
  "audit.reason.STATEMENT_PUBLISHED": "Statement published",
  "audit.reason.ACCESS_GRANTED": "Access granted",
  "audit.reason.ACCESS_DENIED": "Access denied",
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
  "audit.eyebrow": "發卡行稽核軌跡",
  "audit.description":
    "唯讀檢視資格決策、派遣可見性、結算關帳與對帳單存取事件。所有卡友與卡片參考在此畫面皆維持遮罩。",
  "audit.readOnly": "唯讀",
  "audit.issuerBadge": "CTBC 發卡行租戶",
  "audit.summary.events": "筆事件",
  "audit.summary.eligibilityKicker": "資格決策",
  "audit.summary.eligibilityBody":
    "記錄卡權益判定與人工覆核分流，卡友與卡片參考一律只顯示 masked preview。",
  "audit.summary.dispatchKicker": "派遣可見性",
  "audit.summary.dispatchBody":
    "銀行側唯讀查看 booking 關聯趟次的指派結果與履約節點，不提供派遣修改。",
  "audit.summary.settlementKicker": "結算與存取",
  "audit.summary.settlementBody":
    "按期別追蹤對帳單發布、artifact 存取，以及 issuer-pays-DRTS 的關帳事件。",
  "audit.callout.title": "遮罩與範圍",
  "audit.callout.bodyMasked":
    "目前清單中的 subject preview 均已遮罩。銀行後台不會揭露原始卡友身分或完整卡號參考。",
  "audit.callout.bodyFallback":
    "此畫面只應呈現遮罩 preview。若出現未遮罩參考，屬於 release 前必須修復的缺陷。",
  "audit.filters.kicker": "篩選",
  "audit.filters.title": "收斂發卡行稽核事件",
  "audit.filters.description": "可依事件類型、操作者、期別或遮罩主體參考篩選。",
  "audit.filters.reset": "清除篩選",
  "audit.filters.type": "事件類型",
  "audit.filters.actor": "操作者",
  "audit.filters.period": "期別",
  "audit.filters.subject": "主體",
  "audit.filters.subjectPlaceholder":
    "輸入遮罩主體、booking、statement 或原因碼",
  "audit.filters.apply": "套用篩選",
  "audit.filters.allTypes": "全部事件類型",
  "audit.filters.allActors": "全部操作者",
  "audit.filters.allPeriods": "全部期別",
  "audit.list.kicker": "事件清單",
  "audit.list.title": "{count} 筆稽核事件",
  "audit.list.description":
    "每列顯示時間、操作者、事件類型、遮罩主體、原因碼，以及對應 booking 或結算對帳單連結。",
  "audit.empty.title": "目前沒有符合篩選條件的事件",
  "audit.empty.body": "可清除一或多個篩選條件，恢復發卡行稽核軌跡。",
  "audit.column.actor": "操作者",
  "audit.column.subject": "遮罩主體",
  "audit.column.reasonCode": "原因碼",
  "audit.column.related": "關聯實體",
  "audit.mask.ok": "已確認為遮罩 preview",
  "audit.mask.needsReview": "需補做遮罩檢查",
  "audit.related.booking": "Booking",
  "audit.related.statement": "Statement",
  "audit.actor.bank_ops_viewer": "營運查看",
  "audit.actor.bank_program_admin": "方案管理員",
  "audit.actor.bank_finance": "財務",
  "audit.actor.system": "系統",
  "audit.type.eligibility_decision": "資格決策",
  "audit.type.dispatch_assignment": "派遣",
  "audit.type.settlement_close": "結算關帳",
  "audit.type.access": "存取",
  "audit.reason.ELIGIBLE_APPROVED": "資格核准",
  "audit.reason.MANUAL_REVIEW_REQUIRED": "需人工覆核",
  "audit.reason.DRIVER_ASSIGNED": "已指派司機",
  "audit.reason.STATEMENT_PUBLISHED": "對帳單已發布",
  "audit.reason.ACCESS_GRANTED": "允許存取",
  "audit.reason.ACCESS_DENIED": "拒絕存取",
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
